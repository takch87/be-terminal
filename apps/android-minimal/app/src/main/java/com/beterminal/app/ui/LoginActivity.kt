package com.beterminal.app.ui

import android.content.Intent
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import com.beterminal.app.databinding.ActivityLoginBinding

class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.btnIngresar.setOnClickListener {
            val code = binding.etEventCode.text?.toString()?.trim().orEmpty()
            // Por ahora solo navegamos; la validación se hará con backend luego.
            val intent = Intent(this, SaleActivity::class.java).apply {
                putExtra(SaleActivity.EXTRA_EVENT_CODE, code)
            }
            startActivity(intent)
        }
    }
}

