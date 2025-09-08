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
import kotlinx.coroutines.launch

class SaleActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySaleBinding
    private var authToken: String = ""
    private var currentAmount: String = ""
    private val eventCode = "EVT001" // Fixed for now

    private val tapCardLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
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

        setupButtons()
        setupConnectionTest()
        updateDisplay()
    }

    private fun setupButtons() {
        binding.btnContinuar.setOnClickListener {
            processPayment()
        }

        // Setup number buttons (assuming standard IDs)
        setupNumberButton("btn0", "0")
        setupNumberButton("btn1", "1")
        setupNumberButton("btn2", "2")
        setupNumberButton("btn3", "3")
        setupNumberButton("btn4", "4")
        setupNumberButton("btn5", "5")
        setupNumberButton("btn6", "6")
        setupNumberButton("btn7", "7")
        setupNumberButton("btn8", "8")
        setupNumberButton("btn9", "9")
        setupNumberButton("btnDot", ".")
        
        // Try to find clear/delete button
        try {
            val clearButton = findViewById<android.widget.Button>(android.R.id.button1)
            clearButton?.setOnClickListener { clearAmount() }
        } catch (e: Exception) {
            // Button doesn't exist
        }
    }

    private fun setupNumberButton(id: String, value: String) {
        try {
            val resId = resources.getIdentifier(id, "id", packageName)
            if (resId != 0) {
                findViewById<android.widget.Button>(resId)?.setOnClickListener {
                    addToAmount(value)
                }
            }
        } catch (e: Exception) {
            // Button doesn't exist
        }
    }

    private fun addToAmount(digit: String) {
        if (digit == "." && currentAmount.contains(".")) return
        if (currentAmount.length >= 10) return
        
        currentAmount += digit
        updateDisplay()
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

        // Launch TapCardActivity
        val intent = Intent(this, TapCardActivity::class.java).apply {
            putExtra("amount", amountCents)
            putExtra("eventCode", eventCode)
            putExtra("authToken", authToken)
        }
        tapCardLauncher.launch(intent)
    }

    private fun resetAmount() {
        currentAmount = ""
        updateDisplay()
    }
}
