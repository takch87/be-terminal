package com.beterminal.app.ui

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.beterminal.app.databinding.ActivitySaleBinding
import com.beterminal.app.network.ApiClient
import com.beterminal.app.utils.PreferencesManager
import com.beterminal.app.utils.ValidationUtils
import kotlinx.coroutines.launch

class SaleActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySaleBinding
    private var authToken: String = ""
    private var currentAmount: String = ""
    private var eventCode: String = "EVT001" // Default value

    companion object {
        const val EXTRA_AUTH_TOKEN = "auth_token"
        const val EXTRA_EVENT_CODE = "event_code"
    }

    private val payLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            Toast.makeText(this, "¡Pago completado exitosamente!", Toast.LENGTH_LONG).show()
            resetAmount()
        } else {
            Toast.makeText(this, "Pago cancelado", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySaleBinding.inflate(layoutInflater)
        setContentView(binding.root)

        authToken = intent.getStringExtra("authToken") ?: ""
        if (authToken.isEmpty()) {
            Toast.makeText(this, "Error: Token de autenticación no encontrado", Toast.LENGTH_LONG).show()
            finish()
            return
        }

    // Mostrar versión simple
    try { binding.tvSubtitle.text = "Be Seamless" } catch (_: Throwable) {}

    setupButtons()
        setupConnectionTest()
        updateDisplay()
    }

    private fun setupButtons() {
        binding.btnContinuar.setOnClickListener {
            processPayment()
        }

        // Setup number buttons using actual IDs from layout
        binding.key0.setOnClickListener { addToAmount("0") }
        binding.key1.setOnClickListener { addToAmount("1") }
        binding.key2.setOnClickListener { addToAmount("2") }
        binding.key3.setOnClickListener { addToAmount("3") }
        binding.key4.setOnClickListener { addToAmount("4") }
        binding.key5.setOnClickListener { addToAmount("5") }
        binding.key6.setOnClickListener { addToAmount("6") }
        binding.key7.setOnClickListener { addToAmount("7") }
        binding.key8.setOnClickListener { addToAmount("8") }
        binding.key9.setOnClickListener { addToAmount("9") }
        binding.key00.setOnClickListener { addToAmount("00") }
        binding.keyBackspace.setOnClickListener { backspaceAmount() }
    }

    private fun addToAmount(digit: String) {
        if (digit == "." && currentAmount.contains(".")) return
        if (currentAmount.length >= 10) return
        
        currentAmount += digit
        updateDisplay()
    }

    private fun backspaceAmount() {
        if (currentAmount.isNotEmpty()) {
            currentAmount = currentAmount.dropLast(1)
            updateDisplay()
        }
    }

    private fun clearAmount() {
        currentAmount = ""
        updateDisplay()
    }

    private fun updateDisplay() {
        val displayAmount = if (currentAmount.isEmpty()) "0.00" else {
            try {
                val amount = currentAmount.toDoubleOrNull() ?: 0.0
                String.format("%.2f", amount)
            } catch (e: Exception) {
                currentAmount
            }
        }
        
        binding.tvAmount.text = "$$displayAmount"
        binding.tvEventInfo.text = "Evento: $eventCode"
        binding.btnContinuar.isEnabled = currentAmount.isNotEmpty() && currentAmount.toDoubleOrNull() != null && currentAmount.toDouble() > 0
    }

    private fun setupConnectionTest() {
        lifecycleScope.launch {
            try {
                val response = ApiClient.getConnectionToken(authToken)
                if (response.isSuccessful) {
                    binding.tvSubtitle.text = "✅ Conectado al servidor"
                } else {
                    binding.tvSubtitle.text = "❌ Error de conexión"
                }
            } catch (e: Exception) {
                binding.tvSubtitle.text = "❌ Sin conexión"
            }
        }
    }

    private fun processPayment() {
        val amount = currentAmount.toDoubleOrNull()
        if (amount == null || amount <= 0) {
            Toast.makeText(this, "Monto inválido", Toast.LENGTH_SHORT).show()
            return
        }

        val amountCents = (amount * 100).toLong()

    // Launch minimal CardPayActivity
    val intent = Intent(this, CardPayActivity::class.java).apply {
            putExtra("amount", amountCents)
            putExtra("eventCode", eventCode)
            putExtra("authToken", authToken)
        }
    payLauncher.launch(intent)
    }

    private fun resetAmount() {
        currentAmount = ""
        updateDisplay()
    }
}
