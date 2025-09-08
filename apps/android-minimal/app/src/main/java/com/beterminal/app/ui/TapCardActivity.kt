package com.beterminal.app.ui

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.beterminal.app.databinding.ActivityTapCardBinding
import com.beterminal.app.network.ApiClient
import com.beterminal.app.network.PaymentIntentRequest
import kotlinx.coroutines.launch

class TapCardActivity : AppCompatActivity() {

    private lateinit var binding: ActivityTapCardBinding
    private var amountCents: Long = 0L
    private var eventCode: String = ""
    private var authToken: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityTapCardBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Get parameters from intent
        amountCents = intent.getLongExtra("amount", 0L)
        eventCode = intent.getStringExtra("eventCode") ?: ""
        authToken = intent.getStringExtra("authToken") ?: ""

        setupUI()
        simulatePayment()
    }

    private fun setupUI() {
        binding.tvTitle.text = "Procesando Pago"
        binding.tvSubtitle.text = "Monto: $${String.format("%.2f", amountCents / 100.0)}\nEvento: $eventCode\n\nSimulando lectura de tarjeta..."
        
        binding.btnCancelar.setOnClickListener {
            setResult(Activity.RESULT_CANCELED)
            finish()
        }
    }

    private fun simulatePayment() {
        lifecycleScope.launch {
            try {
                binding.tvSubtitle.text = "Procesando pago...\nMonto: $${String.format("%.2f", amountCents / 100.0)}"
                
                val response = ApiClient.createPaymentIntent(
                    authToken,
                    PaymentIntentRequest(amountCents, eventCode)
                )

                if (response.isSuccessful && response.body() != null) {
                    val paymentIntent = response.body()!!
                    if (paymentIntent.success && paymentIntent.paymentIntent != null) {
                        // Simulate successful payment
                        showSuccess("Pago procesado exitosamente\nID: ${paymentIntent.paymentIntent.id}")
                    } else {
                        showError("Error: ${paymentIntent.message ?: "Error desconocido"}")
                    }
                } else {
                    showError("Error de conexión")
                }
            } catch (e: Exception) {
                showError("Error: ${e.message}")
            }
        }
    }

    private fun showSuccess(message: String) {
        binding.tvTitle.text = "¡Pago Exitoso!"
        binding.tvSubtitle.text = message
        binding.progress.visibility = android.view.View.GONE
        
        Toast.makeText(this, "Pago completado", Toast.LENGTH_SHORT).show()
        
        // Return success result after a delay
        binding.root.postDelayed({
            setResult(Activity.RESULT_OK)
            finish()
        }, 2000)
    }

    private fun showError(message: String) {
        binding.tvTitle.text = "Error en el Pago"
        binding.tvSubtitle.text = message
        binding.progress.visibility = android.view.View.GONE
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }
}
