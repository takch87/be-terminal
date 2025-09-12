package com.beterminal.app.ui

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.beterminal.app.databinding.ActivityCardPayBinding
import com.beterminal.app.network.ApiClient
import com.beterminal.app.network.PaymentIntentRequest
import com.stripe.android.PaymentConfiguration
import com.stripe.android.paymentsheet.PaymentSheet
import com.stripe.android.paymentsheet.PaymentSheetResult
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import org.json.JSONObject

class CardPayActivity : AppCompatActivity() {

    private lateinit var binding: ActivityCardPayBinding
    private lateinit var paymentSheet: PaymentSheet
    private var amountCents: Long = 0L
    private var eventCode: String = ""
    private var authToken: String = ""
    private var clientSecret: String? = null
    private var stripeReady: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        try {
            binding = ActivityCardPayBinding.inflate(layoutInflater)
            setContentView(binding.root)

            amountCents = intent.getLongExtra("amount", 0L)
            eventCode = intent.getStringExtra("eventCode") ?: "general"
            authToken = intent.getStringExtra("authToken") ?: ""

            binding.tvAmount.text = "$" + String.format("%.2f", amountCents / 100.0)

            // Inicializar PaymentSheet con manejo de errores
            try {
                paymentSheet = PaymentSheet(this, ::onPaymentSheetResult)
            } catch (e: Exception) {
                logMobile("error", "PaymentSheet init failed", e.stackTraceToString())
                showError("Error inicializando sistema de pago")
                return
            }

            // Deshabilitar pagar hasta inicializar Stripe
            binding.btnPay.isEnabled = false
            binding.btnPay.setOnClickListener { startPayment() }
            binding.btnCancel.setOnClickListener {
                setResult(Activity.RESULT_CANCELED)
                finish()
            }

            // Inicializar Stripe (publishable key) desde backend
            tryInitStripe()
        } catch (e: Exception) {
            logMobile("error", "onCreate failed", e.stackTraceToString())
            Toast.makeText(this, "Error fatal: ${e.message}", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    private fun startPayment() {
        if (!stripeReady) {
            showError("Inicializando Stripe, intenta de nuevo en un momento…")
            return
        }
        setLoading(true)
        lifecycleScope.launch {
            try {
                val req = PaymentIntentRequest(amount = amountCents, eventCode = eventCode)
                val piResp = ApiClient.createPaymentIntent(authToken, req)
                if (!piResp.isSuccessful) {
                    showError("Error creando pago: ${piResp.code()}")
                    logMobile("warn", "createPaymentIntent not successful", "status=${piResp.code()}")
                    return@launch
                }

                val body = piResp.body()
                clientSecret = body?.clientSecret
                if (clientSecret.isNullOrEmpty()) {
                    showError("No se recibió clientSecret")
                    logMobile("error", "clientSecret null/empty", "where=startPayment")
                    return@launch
                }

                val config = PaymentSheet.Configuration(
                    merchantDisplayName = "Be Seamless"
                )
                try {
                    paymentSheet.presentWithPaymentIntent(clientSecret!!, config)
                } catch (e: Exception) {
                    showError(e.message ?: "No se pudo abrir PaymentSheet")
                    logMobile("error", e.message ?: "presentWithPaymentIntent error", e.stackTraceToString())
                }
            } catch (e: Exception) {
                showError(e.message ?: "Error desconocido")
                logMobile("error", e.message ?: "startPayment exception", e.stackTraceToString())
            }
        }
    }

    private fun onPaymentSheetResult(result: PaymentSheetResult) {
        when (result) {
            is PaymentSheetResult.Completed -> {
                setLoading(false)
                Toast.makeText(this, "✅ Pago exitoso", Toast.LENGTH_LONG).show()
                setResult(Activity.RESULT_OK)
                finish()
            }
            is PaymentSheetResult.Canceled -> {
                setLoading(false)
                Toast.makeText(this, "Pago cancelado", Toast.LENGTH_SHORT).show()
            }
            is PaymentSheetResult.Failed -> {
                showError(result.error.message ?: "Pago fallido")
            }
        }
    }

    private fun showError(msg: String) {
        setLoading(false)
        binding.tvStatus.apply {
            visibility = View.VISIBLE
            text = "❌ $msg"
        }
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
    }

    private fun setLoading(loading: Boolean) {
        binding.progressBar.visibility = if (loading) View.VISIBLE else View.GONE
        binding.btnPay.isEnabled = !loading
        binding.btnCancel.isEnabled = !loading
        // No cardInputWidget to disable since we removed it from layout
    }

    private fun tryInitStripe() {
        // Cargar publishable key del backend público
        lifecycleScope.launch {
            try {
                val resp = retrofit2.Retrofit.Builder()
                    .baseUrl("https://be.terminal.beticket.net/")
                    .addConverterFactory(retrofit2.converter.gson.GsonConverterFactory.create())
                    .build()
                    .create(StripePubApi::class.java)
                    .getPublishableKey()
                val pk = resp.body()?.publishable_key
                if (!pk.isNullOrEmpty()) {
                    try {
                        PaymentConfiguration.init(applicationContext, pk)
                        stripeReady = true
                        binding.btnPay.isEnabled = true
                    } catch (e: Exception) {
                        showError("Error inicializando Stripe: ${e.message}")
                        logMobile("error", e.message ?: "PaymentConfiguration.init failed", e.stackTraceToString())
                    }
                } else {
                    showError("No se pudo obtener publishable key")
                    logMobile("warn", "publishable_key empty", "where=tryInitStripe")
                }
            } catch (e: Exception) {
                showError("Sin conexión para obtener publishable key")
                logMobile("error", e.message ?: "getPublishableKey failed", e.stackTraceToString())
            }
        }
    }

    private fun logMobile(level: String, message: String, stack: String) {
        try {
            val obj = JSONObject()
                .put("level", level)
                .put("message", message)
                .put("stack", stack)
                .put("where", "CardPayActivity")
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
