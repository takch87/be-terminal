package com.beterminal.app.ui

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.beterminal.app.R
import com.beterminal.app.databinding.ActivityPaymentResultBinding
import java.text.NumberFormat
import java.util.Locale

class PaymentResultActivity : AppCompatActivity() {

    private lateinit var binding: ActivityPaymentResultBinding
    private val currencyFormat: NumberFormat = NumberFormat.getCurrencyInstance(Locale("es", "MX"))

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPaymentResultBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val isSuccess = intent.getBooleanExtra(EXTRA_IS_SUCCESS, false)
        val amount = intent.getLongExtra(EXTRA_AMOUNT, 0L)
        val transactionId = intent.getStringExtra(EXTRA_TRANSACTION_ID) ?: ""
        val eventCode = intent.getStringExtra(EXTRA_EVENT_CODE) ?: ""

        setupUI(isSuccess, amount, transactionId, eventCode)

        binding.btnNewTransaction.setOnClickListener {
            // Volver a la pantalla de venta
            finish()
        }

        binding.btnBack.setOnClickListener {
            // Volver al login
            val intent = Intent(this, LoginActivity::class.java)
            intent.flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
            startActivity(intent)
            finish()
        }
    }

    private fun setupUI(isSuccess: Boolean, amountCents: Long, transactionId: String, eventCode: String) {
        binding.tvAmount.text = currencyFormat.format(amountCents / 100.0)

        if (isSuccess) {
            binding.ivResultIcon.setImageResource(R.drawable.ic_check_circle)
            binding.tvResultTitle.text = "ACEPTADA"
            binding.tvResultTitle.setTextColor(getColor(R.color.success_green))
        } else {
            binding.ivResultIcon.setImageResource(R.drawable.ic_cancel_circle)
            binding.tvResultTitle.text = "RECHAZADA"
            binding.tvResultTitle.setTextColor(getColor(R.color.error_red))
        }

        if (transactionId.isNotEmpty()) {
            binding.tvTransactionId.text = "ID: $transactionId"
            binding.tvTransactionId.visibility = android.view.View.VISIBLE
        } else {
            binding.tvTransactionId.visibility = android.view.View.GONE
        }
    }

    companion object {
        const val EXTRA_IS_SUCCESS = "extra_is_success"
        const val EXTRA_AMOUNT = "extra_amount"
        const val EXTRA_TRANSACTION_ID = "extra_transaction_id"
        const val EXTRA_EVENT_CODE = "extra_event_code"
    }
}
