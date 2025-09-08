package com.beterminal.app.ui

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.beterminal.app.databinding.ActivityLoginBinding
import com.beterminal.app.network.ApiClient
import com.beterminal.app.network.LoginRequest
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupVersion()
        setupButtons()
    }

    private fun setupVersion() {
        try {
            val packageInfo = packageManager.getPackageInfo(packageName, 0)
            val versionName = packageInfo.versionName
            binding.tvVersion.text = "Versión $versionName - NFC Ready"
        } catch (e: Exception) {
            binding.tvVersion.text = "Versión 1.2.7 - NFC Ready"
        }
    }

    private fun setupButtons() {
        binding.btnIngresar.setOnClickListener {
            performLogin()
        }
    }

    private fun performLogin() {
        val username = binding.etUsername.text?.toString()?.trim().orEmpty()
        val password = binding.etPassword.text?.toString()?.trim().orEmpty()

        if (username.isEmpty() || password.isEmpty()) {
            Toast.makeText(this, "Por favor completa todos los campos", Toast.LENGTH_SHORT).show()
            return
        }

        binding.btnIngresar.isEnabled = false
        binding.btnIngresar.text = "Iniciando sesión..."

        lifecycleScope.launch {
            try {
                val response = ApiClient.login(LoginRequest(username, password))
                
                if (response.isSuccessful && response.body() != null) {
                    val loginResponse = response.body()!!
                    if (loginResponse.success && loginResponse.token != null) {
                        // Get user info to verify token
                        val userResponse = ApiClient.getUserInfo(loginResponse.token)
                        if (userResponse.isSuccessful) {
                            // Login successful, go to main activity
                            val intent = Intent(this@LoginActivity, SaleActivity::class.java)
                            intent.putExtra("authToken", loginResponse.token)
                            startActivity(intent)
                            finish()
                        } else {
                            showError("Error verificando usuario")
                        }
                    } else {
                        showError(loginResponse.message ?: "Error de autenticación")
                    }
                } else {
                    showError("Error de conexión")
                }
            } catch (e: Exception) {
                showError("Error: ${e.message}")
            } finally {
                binding.btnIngresar.isEnabled = true
                binding.btnIngresar.text = "Ingresar"
            }
        }
    }

    private fun showError(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }
}

