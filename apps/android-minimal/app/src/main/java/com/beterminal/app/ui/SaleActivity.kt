package com.beterminal.app.ui

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.beterminal.app.databinding.ActivitySaleBinding
import java.text.NumberFormat
import java.util.Locale

class SaleActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySaleBinding
    private val currencyFormat: NumberFormat = NumberFormat.getCurrencyInstance(Locale("es", "MX"))

    // Guardamos el monto como centavos para evitar errores de precisión
    private var amountCents: Long = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        binding = ActivitySaleBinding.inflate(layoutInflater)
        setContentView(binding.root)

        updateAmountText()

        val keys = listOf(
            binding.key1, binding.key2, binding.key3,
            binding.key4, binding.key5, binding.key6,
            binding.key7, binding.key8, binding.key9,
            binding.key00, binding.key0
        )

        keys.forEach { key ->
            key.setOnClickListener { onKeyPressed((it.tag as String)) }
        }

        binding.keyBackspace.setOnClickListener { onBackspace() }

        binding.btnContinuar.setOnClickListener {
            val eventCode = intent.getStringExtra(EXTRA_EVENT_CODE).orEmpty()
            val humanAmount = currencyFormat.format(amountCents / 100.0)
            AlertDialog.Builder(this)
                .setTitle("Próximamente: cobro con Stripe")
                .setMessage("Evento: $eventCode\nMonto: $humanAmount\n\nLa integración de Stripe Terminal se conectará al backend para generar el connection token y el payment intent.")
                .setPositiveButton("OK", null)
                .show()
        }
    }

    private fun onKeyPressed(digits: String) {
        // Aceptamos 0-9 y 00; maximo ~ 9,999,999.99 por simplicidad
        val newCents = when (digits) {
            "00" -> amountCents * 100
            else -> amountCents * 10 + digits.toLong()
        }
        // Evitar overflow y limitar a 9 dígitos en centavos
        if (newCents <= 999_999_999L) {
            amountCents = newCents
            updateAmountText()
        }
    }

    private fun onBackspace() {
        amountCents /= 10
        updateAmountText()
    }

    private fun updateAmountText() {
        binding.tvAmount.text = currencyFormat.format(amountCents / 100.0)
        binding.btnContinuar.isEnabled = amountCents > 0
    }

    companion object {
        const val EXTRA_EVENT_CODE = "extra_event_code"
    }
}

