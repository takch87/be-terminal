package com.beterminal.app.ui

import android.app.Activity
import android.content.Intent
import android.nfc.NfcAdapter
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.beterminal.app.network.ApiClient
import com.beterminal.app.network.PaymentIntentRequest
import com.beterminal.app.databinding.ActivityRealPaymentBinding
import com.stripe.android.PaymentConfiguration
import com.stripe.android.paymentsheet.PaymentSheet
import com.stripe.android.paymentsheet.PaymentSheetResult
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import org.json.JSONObject

class RealPaymentActivity : AppCompatActivity() {
    private lateinit var binding: ActivityRealPaymentBinding
    private lateinit var paymentSheet: PaymentSheet
    private var amountCents: Long = 0
    private var eventCode: String = ""
    private var authToken: String = ""
    private var clientSecret: String = ""
    private var paymentIntentId: String = ""
    private var isTestMode: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityRealPaymentBinding.inflate(layoutInflater)
        setContentView(binding.root)

        try {
            // Obtener datos del Intent
            amountCents = intent.getLongExtra("amount", 0)
            eventCode = intent.getStringExtra("eventCode") ?: ""
            authToken = intent.getStringExtra("authToken") ?: ""

            binding.tvAmount.text = "$" + String.format("%.2f", amountCents / 100.0)
            binding.tvStatus.text = "Preparando pago..."

            // Configurar PaymentSheet
            paymentSheet = PaymentSheet(this, ::onPaymentSheetResult)

            setupButtons()
            initializeStripeAndPayment()

        } catch (e: Exception) {
            logMobile("error", "onCreate failed", e.stackTraceToString())
            showError("Error inicializando: ${e.message}")
        }
    }

    private fun initializeStripeAndPayment() {
        binding.tvStatus.text = "🔄 Configurando Stripe..."
        
        lifecycleScope.launch {
            try {
                // Log token info para debugging
                logMobile("info", "Getting Stripe config", "Token length: ${authToken.length}, Token start: ${if(authToken.length > 10) authToken.take(10) else authToken}...")
                
                // Primero obtener la configuración de Stripe
                val configResponse = ApiClient.getStripeConfig(authToken)
                
                if (configResponse.isSuccessful) {
                    val body = configResponse.body()
                    var publishableKey: String? = null
                    var testMode = false
                    
                    // Manejar formato nuevo (con success: true)
                    if (body?.success == true) {
                        publishableKey = body.publishable_key
                        testMode = body.test_mode ?: false
                        logMobile("info", "Stripe config new format", "Success: ${body.success}, TestMode: $testMode")
                    } 
                    // Si no funciona el endpoint config, usar publishable-key
                    else {
                        logMobile("info", "Config failed, trying publishable-key endpoint", "Response: ${configResponse.code()}")
                        try {
                            val keyResponse = ApiClient.getStripePublishableKey()
                            if (keyResponse.isSuccessful && keyResponse.body()?.success == true) {
                                publishableKey = keyResponse.body()?.publishable_key
                                testMode = false // Asumir live mode para el endpoint público
                                logMobile("info", "Publishable key endpoint success", "Key: ${publishableKey?.take(8)}...")
                            }
                        } catch (e: Exception) {
                            logMobile("error", "Publishable key endpoint failed", e.message ?: "Unknown error")
                        }
                    }
                    
                    if (!publishableKey.isNullOrEmpty()) {
                        // Inicializar Stripe con la clave correcta
                        PaymentConfiguration.init(applicationContext, publishableKey)
                        logMobile("info", "Stripe initialized", "Using publishable key: ${publishableKey.take(8)}... TestMode: $testMode")
                        isTestMode = testMode
                        
                        // Actualizar UI según el modo
                        runOnUiThread {
                            binding.btnSimulateNfc.text = if (isTestMode) {
                                "📱 Pago Contactless (Prueba)"
                            } else {
                                "📱 Pago Demo (Live Mode)"
                            }
                        }
                        
                        // Ahora crear el PaymentIntent
                        initializePayment()
                    } else {
                        showError("No se pudo obtener la clave pública de Stripe")
                    }
                } else {
                    logMobile("error", "Stripe config failed", "Response code: ${configResponse.code()}, Success: ${configResponse.body()?.success}, Error: ${configResponse.body()?.error}")
                    showError("Error obteniendo configuración de Stripe: ${configResponse.code()}")
                }
            } catch (e: Exception) {
                logMobile("error", "initializeStripeAndPayment failed", e.stackTraceToString())
                showError("Error configurando Stripe: ${e.message}")
            }
        }
    }

    private fun setupButtons() {
        binding.btnCancel.setOnClickListener {
            setResult(Activity.RESULT_CANCELED)
            finish()
        }

        // Botón para abrir PaymentSheet (tarjeta física/digital)
        binding.btnPayWithCard.setOnClickListener {
            openPaymentSheet()
        }

        // Botón para simular NFC contactless (para testing)
        binding.btnSimulateNfc.setOnClickListener {
            simulateContactlessPayment()
        }
    }

    private fun initializePayment() {
        binding.tvStatus.text = "🔄 Creando PaymentIntent..."
        
        lifecycleScope.launch {
            try {
                createPaymentIntent()
            } catch (e: Exception) {
                logMobile("error", "initializePayment failed", e.stackTraceToString())
                showError("Error creando pago: ${e.message}")
            }
        }
    }

    private suspend fun createPaymentIntent() {
        try {
            val paymentRequest = PaymentIntentRequest(amount = amountCents, eventCode = eventCode)
            val response = ApiClient.createPaymentIntent(authToken, paymentRequest)

            if (response.isSuccessful) {
                val result = response.body()
                if (result?.clientSecret != null) {
                    clientSecret = result.clientSecret
                    paymentIntentId = result.paymentIntentId ?: ""
                    
                    logMobile("info", "PaymentIntent created", "Amount: ${amountCents} cents, ID: $paymentIntentId")
                    
                    runOnUiThread {
                        binding.tvStatus.text = "✅ Listo para pagar - Elige una opción:"
                        binding.btnPayWithCard.isEnabled = true
                        binding.btnSimulateNfc.isEnabled = true
                    }
                } else {
                    showError("Error: No se recibió clientSecret")
                }
            } else {
                showError("Error creando PaymentIntent: ${response.code()}")
            }
        } catch (e: Exception) {
            logMobile("error", "createPaymentIntent failed", e.stackTraceToString())
            showError("Error de conexión: ${e.message}")
        }
    }

    private fun openPaymentSheet() {
        if (clientSecret.isEmpty()) {
            showError("ClientSecret no disponible")
            return
        }

        binding.tvStatus.text = "💳 Abriendo formulario de pago..."

        try {
            // Configurar PaymentSheet para aceptar tarjetas
            val configuration = PaymentSheet.Configuration(
                merchantDisplayName = "Be Terminal",
                allowsDelayedPaymentMethods = true
            )

            paymentSheet.presentWithPaymentIntent(clientSecret, configuration)
            
        } catch (e: Exception) {
            logMobile("error", "openPaymentSheet failed", e.stackTraceToString())
            showError("Error abriendo PaymentSheet: ${e.message}")
        }
    }

    private fun simulateContactlessPayment() {
        binding.tvStatus.text = "📱 Simulando pago contactless..."
        binding.btnPayWithCard.isEnabled = false
        binding.btnSimulateNfc.isEnabled = false

        // Simular el proceso de pago NFC
        Handler(Looper.getMainLooper()).postDelayed({
            binding.tvStatus.text = "💳 Acerca tu tarjeta o dispositivo..."
            
            Handler(Looper.getMainLooper()).postDelayed({
                binding.tvStatus.text = "🔄 Procesando pago contactless..."
                
                // Confirmar el pago usando una tarjeta de prueba
                lifecycleScope.launch {
                    confirmPaymentWithTestCard()
                }
            }, 2000)
        }, 1000)
    }

    private suspend fun confirmPaymentWithTestCard() {
        try {
            if (isTestMode) {
                // En test mode, podemos usar tarjetas de prueba
                val confirmRequest = mapOf(
                    "paymentIntentId" to paymentIntentId,
                    "paymentMethodId" to "pm_card_visa" // Tarjeta de prueba de Stripe
                )

                val response = ApiClient.confirmPayment(authToken, confirmRequest)
                
                if (response.isSuccessful) {
                    val result = response.body()
                    if (result?.success == true) {
                        runOnUiThread {
                            binding.tvStatus.text = "✅ ¡Pago contactless exitoso!"
                            Toast.makeText(this@RealPaymentActivity, "¡Pago completado!", Toast.LENGTH_LONG).show()
                            
                            val resultIntent = Intent().apply {
                                putExtra("paymentIntentId", paymentIntentId)
                                putExtra("amount", amountCents)
                                putExtra("success", true)
                                putExtra("paymentMethod", "contactless_simulation")
                            }
                            setResult(Activity.RESULT_OK, resultIntent)
                            
                            Handler(Looper.getMainLooper()).postDelayed({
                                finish()
                            }, 2000)
                        }
                    } else {
                        showError("Error confirmando pago: ${result?.message}")
                    }
                } else {
                    showError("Error de conexión confirmando pago: ${response.code()}")
                }
            } else {
                // En live mode, no podemos usar tarjetas de prueba
                // Mostrar mensaje explicativo en lugar de intentar procesar
                runOnUiThread {
                    binding.tvStatus.text = "ℹ️ Modo Live: Use 'Pagar con Tarjeta' para pagos reales"
                    Toast.makeText(this@RealPaymentActivity, 
                        "En modo Live, use 'Pagar con Tarjeta' para ingresar datos reales", 
                        Toast.LENGTH_LONG).show()
                    binding.btnPayWithCard.isEnabled = true
                    binding.btnSimulateNfc.isEnabled = true
                }
            }
        } catch (e: Exception) {
            logMobile("error", "confirmPaymentWithTestCard failed", e.stackTraceToString())
            showError("Error confirmando pago: ${e.message}")
        }
    }

    private fun onPaymentSheetResult(paymentSheetResult: PaymentSheetResult) {
        when (paymentSheetResult) {
            is PaymentSheetResult.Canceled -> {
                binding.tvStatus.text = "❌ Pago cancelado"
                binding.btnPayWithCard.isEnabled = true
                binding.btnSimulateNfc.isEnabled = true
                logMobile("info", "PaymentSheet canceled", "User canceled payment")
            }
            is PaymentSheetResult.Failed -> {
                val error = paymentSheetResult.error.localizedMessage ?: "Error desconocido"
                binding.tvStatus.text = "❌ Error: $error"
                binding.btnPayWithCard.isEnabled = true
                binding.btnSimulateNfc.isEnabled = true
                logMobile("error", "PaymentSheet failed", paymentSheetResult.error.stackTraceToString())
                showError("Error en pago: $error")
            }
            is PaymentSheetResult.Completed -> {
                binding.tvStatus.text = "✅ ¡Pago completado exitosamente!"
                logMobile("info", "PaymentSheet completed", "Payment successful")
                
                val resultIntent = Intent().apply {
                    putExtra("paymentIntentId", paymentIntentId)
                    putExtra("amount", amountCents)
                    putExtra("success", true)
                    putExtra("paymentMethod", "card_form")
                }
                setResult(Activity.RESULT_OK, resultIntent)
                
                Handler(Looper.getMainLooper()).postDelayed({
                    finish()
                }, 2000)
            }
        }
    }

    private fun showError(message: String) {
        runOnUiThread {
            binding.tvStatus.text = "❌ $message"
            Toast.makeText(this, message, Toast.LENGTH_LONG).show()
            binding.btnPayWithCard.isEnabled = true
            binding.btnSimulateNfc.isEnabled = true
        }
    }

    private fun logMobile(level: String, message: String, details: String) {
        try {
            val obj = JSONObject()
                .put("level", level)
                .put("message", message)
                .put("stack", details)
                .put("where", "RealPaymentActivity")
                .put("extra", JSONObject().put("amountCents", amountCents).put("eventCode", eventCode))
            val body: RequestBody = RequestBody.create("application/json".toMediaType(), obj.toString())
            val req = Request.Builder()
                .url("https://be.terminal.beticket.net/api/mobile/log")
                .post(body)
                .build()
            OkHttpClient().newCall(req).execute().close()
        } catch (_: Exception) { }
    }
}
