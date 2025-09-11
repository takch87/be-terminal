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

class CardPayActivity : AppCompatActivity() {

    private lateinit var binding: ActivityCardPayBinding
    private lateinit var paymentSheet: PaymentSheet
    private var amountCents: Long = 0L
    private var eventCode: String = ""
    private var authToken: String = ""
    private var clientSecret: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityCardPayBinding.inflate(layoutInflater)
        setContentView(binding.root)

        amountCents = intent.getLongExtra("amount", 0L)
        eventCode = intent.getStringExtra("eventCode") ?: "general"
        authToken = intent.getStringExtra("authToken") ?: ""

        binding.tvAmount.text = "$" + String.format("%.2f", amountCents / 100.0)

        // Inicializar PaymentSheet
        paymentSheet = PaymentSheet(this, ::onPaymentSheetResult)

        binding.btnPay.setOnClickListener { startPayment() }
        binding.btnCancel.setOnClickListener {
            setResult(Activity.RESULT_CANCELED)
            finish()
        }

        // Inicializar Stripe (publishable key) desde backend
        tryInitStripe()
    }

    private fun startPayment() {
        setLoading(true)
        lifecycleScope.launch {
            try {
                val req = PaymentIntentRequest(amount = amountCents, eventCode = eventCode)
                val piResp = ApiClient.createPaymentIntent(authToken, req)
                if (!piResp.isSuccessful) {
                    showError("Error creando pago: ${piResp.code()}")
                    return@launch
                }

                val body = piResp.body()
                clientSecret = body?.clientSecret
                if (clientSecret.isNullOrEmpty()) {
                    showError("No se recibió clientSecret")
                    return@launch
                }

                val config = PaymentSheet.Configuration(
                    merchantDisplayName = "Be Seamless"
                )
                paymentSheet.presentWithPaymentIntent(clientSecret!!, config)
            } catch (e: Exception) {
                showError(e.message ?: "Error desconocido")
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
        try { binding.cardInputWidget.isEnabled = !loading } catch (_: Throwable) {}
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
                    PaymentConfiguration.init(applicationContext, pk)
                }
            } catch (_: Exception) { }
        }
    }
}
