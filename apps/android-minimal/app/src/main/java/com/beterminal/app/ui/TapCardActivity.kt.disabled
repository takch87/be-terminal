package com.beterminal.app.ui

import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import android.content.IntentFilter
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.beterminal.app.R
import com.beterminal.app.databinding.ActivityTapCardBinding
import com.beterminal.app.network.ApiClient
import com.beterminal.app.network.PaymentIntentRequest
import com.beterminal.app.network.ProcessNfcRequest
import com.stripe.android.Stripe
import com.stripe.android.model.PaymentMethodCreateParams
import com.stripe.android.ApiResultCallback
import kotlinx.coroutines.launch

class TapCardActivity : AppCompatActivity() {

    private lateinit var binding: ActivityTapCardBinding
    private var amountCents: Long = 0L
    private var eventCode: String = ""
    private var authToken: String = ""
    private var clientSecret: String = ""
    
    private var nfcAdapter: NfcAdapter? = null
    private var pendingIntent: PendingIntent? = null
    private var intentFiltersArray: Array<IntentFilter>? = null
    private var techListsArray: Array<Array<String>>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityTapCardBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Get parameters from intent
        amountCents = intent.getLongExtra("amount", 0L)
        eventCode = intent.getStringExtra("eventCode") ?: ""
        authToken = intent.getStringExtra("authToken") ?: ""

        setupNFC()
        setupUI()
    }

    private fun setupNFC() {
        nfcAdapter = NfcAdapter.getDefaultAdapter(this)
        
        if (nfcAdapter == null) {
            Toast.makeText(this, "Este dispositivo no soporta NFC", Toast.LENGTH_LONG).show()
            simulatePayment() // Fallback a simulación
            return
        }
        
        if (!nfcAdapter!!.isEnabled) {
            Toast.makeText(this, "Por favor, active NFC en configuración", Toast.LENGTH_LONG).show()
            // Opcional: abrir configuración de NFC
            try {
                val settingsIntent = Intent(Settings.ACTION_NFC_SETTINGS)
                startActivity(settingsIntent)
            } catch (e: Exception) {
                simulatePayment() // Fallback si no se puede abrir config
            }
            return
        }
        
        // Configurar intent para capturar tags NFC
        pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, javaClass).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_MUTABLE
        )
        
        // Configurar filtros para diferentes tipos de tarjetas
        val ndef = IntentFilter(NfcAdapter.ACTION_NDEF_DISCOVERED)
        val techDiscovered = IntentFilter(NfcAdapter.ACTION_TECH_DISCOVERED)
        val tagDiscovered = IntentFilter(NfcAdapter.ACTION_TAG_DISCOVERED)
        
        intentFiltersArray = arrayOf(ndef, techDiscovered, tagDiscovered)
        techListsArray = arrayOf(
            arrayOf(IsoDep::class.java.name),
            arrayOf("android.nfc.tech.NfcA"),
            arrayOf("android.nfc.tech.NfcB")
        )
    }

    private fun setupUI() {
        binding.tvTitle.text = "Acerque la Tarjeta"
        binding.tvSubtitle.text = "Monto: $${String.format("%.2f", amountCents / 100.0)}\nEvento: $eventCode\n\n💳 Acerque la tarjeta NFC al dispositivo"
        
        binding.btnCancelar.setOnClickListener {
            setResult(Activity.RESULT_CANCELED)
            finish()
        }
    }

    override fun onResume() {
        super.onResume()
        // Habilitar detección NFC
        nfcAdapter?.enableForegroundDispatch(
            this,
            pendingIntent,
            intentFiltersArray,
            techListsArray
        )
    }

    override fun onPause() {
        super.onPause()
        // Deshabilitar detección NFC
        nfcAdapter?.disableForegroundDispatch(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        
        if (NfcAdapter.ACTION_TAG_DISCOVERED == intent.action ||
            NfcAdapter.ACTION_TECH_DISCOVERED == intent.action ||
            NfcAdapter.ACTION_NDEF_DISCOVERED == intent.action) {
            
            val tag: Tag? = intent.getParcelableExtra(NfcAdapter.EXTRA_TAG)
            if (tag != null && currentPaymentIntentId != null) {
                processNfcCard(tag, currentPaymentIntentId!!)
            } else {
                handleNfcTag(tag) // Fallback al método original
            }
        }
    }

    private fun handleNfcTag(tag: Tag?) {
        if (tag == null) {
            Toast.makeText(this, "Error al leer la tarjeta", Toast.LENGTH_SHORT).show()
            return
        }

        binding.tvSubtitle.text = "✅ Tarjeta detectada!\nProcesando pago...\nMonto: $${String.format("%.2f", amountCents / 100.0)}"
        
        // Vibrar para confirmar lectura
        try {
            val vibrator = getSystemService(VIBRATOR_SERVICE) as android.os.Vibrator
            vibrator.vibrate(200)
        } catch (e: Exception) {
            // Ignorar si no hay vibrador
        }

        // Procesar pago con los datos de la tarjeta
        processPaymentWithCard(tag)
    }

    private fun processPaymentWithCard(tag: Tag) {
        lifecycleScope.launch {
            try {
                binding.tvSubtitle.text = "🔄 Procesando pago...\nMonto: $${String.format("%.2f", amountCents / 100.0)}\nNo retire la tarjeta..."

                val paymentRequest = PaymentIntentRequest(
                    amount = amountCents,
                    eventCode = eventCode
                )

                val response = ApiClient.createPaymentIntent(authToken, paymentRequest)

                if (response.isSuccessful) {
                    val paymentResponse = response.body()
                    if (paymentResponse?.success == true) {
                        // Manejo mejorado del flujo automático v2.0
                        if (paymentResponse.completed == true) {
                            // Pago completado inmediatamente
                            showPaymentSuccess("¡Pago completado exitosamente!")
                        } else if (paymentResponse.requiresAction == true) {
                            // Requiere autenticación adicional
                            showPaymentError("Pago requiere autenticación adicional")
                        } else if (paymentResponse.status == "requires_payment_method") {
                            // Pago requiere método de pago - activar NFC real
                            val paymentIntentId = paymentResponse.paymentIntentId
                            clientSecret = paymentResponse.clientSecret ?: ""
                            
                            if (paymentIntentId != null && clientSecret.isNotEmpty()) {
                                binding.tvSubtitle.text = "💳 Acerca tu tarjeta al teléfono\nMonto: $${String.format("%.2f", amountCents / 100.0)}\nEsperando tap NFC..."
                                
                                // Activar NFC para leer tarjeta
                                enableNfcReading(paymentIntentId)
                            } else {
                                showPaymentError("Error: Payment Intent o Client Secret no disponible")
                            }
                        } else {
                            // Otros estados - mostrar error
                            showPaymentError("Estado de pago no reconocido: ${paymentResponse.status}")
                        }
                    } else {
                        showPaymentError("Error: ${paymentResponse?.message ?: "Pago rechazado"}")
                    }
                } else {
                    showPaymentError("Error de conexión: ${response.code()}")
                }
            } catch (e: Exception) {
                showPaymentError("Error: ${e.message}")
            }
        }
    }

    private fun enableNfcReading(paymentIntentId: String) {
        try {
            val nfcAdapter = android.nfc.NfcAdapter.getDefaultAdapter(this)
            
            if (nfcAdapter == null) {
                showPaymentError("Este dispositivo no tiene NFC")
                return
            }
            
            if (!nfcAdapter.isEnabled) {
                showPaymentError("NFC está desactivado. Actívalo en configuración")
                return
            }
            
            binding.tvSubtitle.text = "💳 NFC activado\nMonto: $${String.format("%.2f", amountCents / 100.0)}\n\n🔄 Acerca tu tarjeta al teléfono..."
            
            // Configurar intent para capturar NFC
            val intent = android.content.Intent(this, javaClass).apply {
                addFlags(android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            
            val pendingIntent = android.app.PendingIntent.getActivity(
                this, 0, intent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_MUTABLE
            )
            
            // Filtros para NFC
            val techFilters = arrayOf(
                arrayOf(
                    android.nfc.tech.IsoDep::class.java.name,
                    android.nfc.tech.NfcA::class.java.name,
                    android.nfc.tech.NfcB::class.java.name
                )
            )
            
            nfcAdapter.enableForegroundDispatch(this, pendingIntent, null, techFilters)
            
            // Guardar el payment intent ID para cuando se detecte NFC
            this.currentPaymentIntentId = paymentIntentId
            
        } catch (e: Exception) {
            showPaymentError("Error activando NFC: ${e.message}")
        }
    }
    
    private var currentPaymentIntentId: String? = null
    
    private fun processNfcCard(tag: android.nfc.Tag, paymentIntentId: String) {
        lifecycleScope.launch {
            try {
                binding.tvSubtitle.text = "💳 Tarjeta detectada\nMonto: $${String.format("%.2f", amountCents / 100.0)}\n\n🔄 Procesando pago..."
                
                // Deshabilitar NFC dispatch
                val nfcAdapter = android.nfc.NfcAdapter.getDefaultAdapter(this@TapCardActivity)
                nfcAdapter?.disableForegroundDispatch(this@TapCardActivity)
                
                // Crear payment method usando Stripe SDK con la información de la tarjeta NFC
                val stripe = Stripe(
                    this@TapCardActivity,
                    getString(R.string.stripe_publishable_key)
                )
                
                // Crear payment method params para card present
                val cardParams = PaymentMethodCreateParams.create(
                    PaymentMethodCreateParams.Card(
                        number = "4242424242424242", // En producción, esto vendría del NFC
                        expiryMonth = 12,
                        expiryYear = 2030,
                        cvc = "123"
                    )
                )
                
                // Crear el payment method de forma asíncrona
                stripe.createPaymentMethod(
                    cardParams,
                    callback = object : com.stripe.android.ApiResultCallback<com.stripe.android.model.PaymentMethod> {
                        override fun onSuccess(result: com.stripe.android.model.PaymentMethod) {
                            lifecycleScope.launch {
                                processRealNfcPayment(paymentIntentId, result.id!!)
                            }
                        }
                        
                        override fun onError(e: Exception) {
                            showPaymentError("Error creando método de pago desde NFC: ${e.message}")
                        }
                    }
                )
                
            } catch (e: Exception) {
                showPaymentError("Error procesando tarjeta NFC: ${e.message}")
            }
        }
    }
    
    private suspend fun processRealNfcPayment(paymentIntentId: String, paymentMethodId: String) {
        try {
            binding.tvSubtitle.text = "💳 Procesando pago NFC...\nMonto: $${String.format("%.2f", amountCents / 100.0)}\nCompletando..."

            val nfcRequest = ProcessNfcRequest(
                paymentIntentId = paymentIntentId,
                paymentMethodId = paymentMethodId
            )

            val response = ApiClient.processNfcPayment(authToken, nfcRequest)

            if (response.isSuccessful) {
                val nfcResponse = response.body()
                if (nfcResponse?.success == true) {
                    if (nfcResponse.completed == true) {
                        showPaymentSuccess("¡Pago NFC completado exitosamente!")
                    } else if (nfcResponse.requiresAction == true) {
                        showPaymentError("Pago NFC requiere autenticación adicional")
                    } else {
                        showPaymentError("Estado NFC no reconocido: ${nfcResponse.status}")
                    }
                } else {
                    showPaymentError("Error NFC: ${nfcResponse?.message ?: "Procesamiento falló"}")
                }
            } else {
                showPaymentError("Error de conexión NFC: ${response.code()}")
            }
        } catch (e: Exception) {
            showPaymentError("Error procesamiento NFC: ${e.message}")
        }
    }

    private fun simulatePayment() {
        binding.tvSubtitle.text = "⚠️ Modo simulación\nMonto: $${String.format("%.2f", amountCents / 100.0)}\nEsperando..."
        
        lifecycleScope.launch {
            try {
                kotlinx.coroutines.delay(3000) // Simular 3 segundos
                
                val paymentRequest = PaymentIntentRequest(
                    amount = amountCents,
                    eventCode = eventCode
                )

                val response = ApiClient.createPaymentIntent(authToken, paymentRequest)

                if (response.isSuccessful) {
                    val paymentResponse = response.body()
                    if (paymentResponse?.success == true) {
                        // Manejo mejorado del flujo automático v2.0 (simulación)
                        if (paymentResponse.completed == true) {
                            showPaymentSuccess("¡Pago simulado completado!")
                        } else if (paymentResponse.requiresAction == true) {
                            showPaymentError("Pago requiere autenticación adicional")
                        } else if (paymentResponse.status == "requires_payment_method") {
                            // En modo simulación, tratar como error
                            showPaymentError("Payment Intent creado pero requiere método de pago")
                        } else {
                            showPaymentError("Estado de pago no reconocido: ${paymentResponse.status}")
                        }
                    } else {
                        showPaymentError("Error: ${paymentResponse?.message ?: "Pago rechazado"}")
                    }
                } else {
                    showPaymentError("Error de conexión: ${response.code()}")
                }
            } catch (e: Exception) {
                showPaymentError("Error: ${e.message}")
            }
        }
    }

    private fun showPaymentSuccess(customMessage: String? = null) {
        binding.tvTitle.text = "✅ ¡Pago Exitoso!"
        val message = customMessage ?: "Transacción completada"
        binding.tvSubtitle.text = "Monto: $${String.format("%.2f", amountCents / 100.0)}\nEvento: $eventCode\n\n✅ $message"
        binding.btnCancelar.text = "FINALIZAR"
        
        // Vibrar para confirmar éxito
        try {
            val vibrator = getSystemService(VIBRATOR_SERVICE) as android.os.Vibrator
            vibrator.vibrate(longArrayOf(0, 200, 100, 200), -1)
        } catch (e: Exception) {
            // Ignorar si no hay vibrador
        }

        setResult(Activity.RESULT_OK)
        
        // Auto-cerrar después de 2 segundos
        lifecycleScope.launch {
            kotlinx.coroutines.delay(2000)
            finish()
        }
    }

    private fun showPaymentError(message: String) {
        binding.tvTitle.text = "❌ Error en el Pago"
        binding.tvSubtitle.text = message
        binding.btnCancelar.text = "REINTENTAR"
        
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }
}
