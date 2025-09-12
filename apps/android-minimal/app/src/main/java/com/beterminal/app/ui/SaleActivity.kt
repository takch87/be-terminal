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

        // Get event code from Intent if available
        eventCode = intent.getStringExtra("eventCode") ?: "EVT001"

        // Mostrar versión
        try {
            val versionName = packageManager.getPackageInfo(packageName, 0).versionName ?: "?"
            binding.tvSubtitle.text = "Be Seamless v$versionName"
        } catch (_: Throwable) {
            binding.tvSubtitle.text = "Be Seamless"
        }

    setupButtons()
        // Abrir historial/últimas transacciones con un long-press en el monto (rápido y sin romper UI)
        binding.tvAmount.setOnLongClickListener {
            val sheet = TransactionsBottomSheet()
            sheet.arguments = Bundle().apply { putString("authToken", authToken) }
            sheet.show(supportFragmentManager, "tx_sheet")
            true
        }
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
        binding.keyDecimal.setOnClickListener { addToAmount(".") }
        binding.keyBackspace.setOnClickListener { backspaceAmount() }
    }

    private fun addToAmount(digit: String) {
        // Prevent multiple decimal points
        if (digit == "." && currentAmount.contains(".")) return
        
        // Limit length to reasonable amount (e.g., 999999.99)
        if (currentAmount.length >= 10) return
        
        // Don't allow decimal point as first character
        if (digit == "." && currentAmount.isEmpty()) {
            currentAmount = "0."
        } else if (currentAmount.contains(".")) {
            // If there's already a decimal point, only allow 2 digits after it
            val parts = currentAmount.split(".")
            if (parts.size > 1 && parts[1].length >= 2) return
            currentAmount += digit
        } else {
            currentAmount += digit
        }
        
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
        // Sanitizar entrada (remover símbolos como $ y espacios)
        val sanitized = currentAmount.replace("$", "").trim()
        val displayAmount = if (sanitized.isEmpty()) "0.00" else {
            val num = sanitized.toDoubleOrNull()
            if (num == null) "0.00" else String.format("%.2f", num)
        }
        binding.tvAmount.text = "$$displayAmount"
        binding.tvEventInfo.text = "Evento: $eventCode"
        val value = sanitized.toDoubleOrNull() ?: 0.0
        binding.btnContinuar.isEnabled = value > 0
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
        try {
            val amount = currentAmount.replace("$", "").trim().toDoubleOrNull()
            if (amount == null || amount <= 0) {
                Toast.makeText(this, "Monto inválido", Toast.LENGTH_SHORT).show()
                return
            }

            val amountCents = (amount * 100).toLong()

                        // Initialize Terminal SDK when activity starts
            // (application as App).initializeTerminal() - Removed Terminal SDK for now

            // Lanzar flujo 100% Tap to Pay (NFC / SoftPOS), sin formulario
            val intent = Intent(this, TapToPayActivity::class.java).apply {
                putExtra("amount", amountCents)
                putExtra("eventCode", eventCode)
                putExtra("authToken", authToken)
            }
            payLauncher.launch(intent)
        } catch (e: Exception) {
            Toast.makeText(this, "Error procesando pago: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun resetAmount() {
        currentAmount = ""
        updateDisplay()
    }
}
