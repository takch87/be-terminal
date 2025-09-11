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
import android.content.Context
import android.content.SharedPreferences

class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding
    private lateinit var sharedPreferences: SharedPreferences
    private val PREFS_NAME = "BeSeamlessPrefs"
    private val KEY_REMEMBER = "remember_me"
    private val KEY_USERNAME = "saved_username"
    private val KEY_EVENT_CODE = "saved_event_code"
    // Nota: NO guardamos la contraseña por seguridad

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        sharedPreferences = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        loadSavedCredentials()

        binding.btnIngresar.setOnClickListener {
            performLogin()
        }

    // Agregar información de versión (simple)
    binding.tvVersion.text = "Be Seamless"
    }

    private fun performLogin() {
        val username = binding.etUsername.text.toString().trim()
        val password = binding.etPassword.text.toString().trim()
        val eventCode = binding.etEventCode.text.toString().trim()

        if (username.isEmpty() || password.isEmpty() || eventCode.isEmpty()) {
            Toast.makeText(this, "Por favor complete todos los campos", Toast.LENGTH_SHORT).show()
            return
        }

        binding.progressBar.visibility = android.view.View.VISIBLE
        binding.btnIngresar.isEnabled = false

        lifecycleScope.launch {
            try {
                val loginRequest = LoginRequest(username, password, eventCode)
                val response = ApiClient.login(loginRequest)

                binding.progressBar.visibility = android.view.View.GONE
                binding.btnIngresar.isEnabled = true

                if (response.isSuccessful) {
                    val loginResponse = response.body()
                    if (loginResponse?.success == true) {
                        Toast.makeText(this@LoginActivity, "Login exitoso", Toast.LENGTH_SHORT).show()
                        saveCredentials()

                        val intent = Intent(this@LoginActivity, SaleActivity::class.java)
                        intent.putExtra("authToken", loginResponse.token)
                        startActivity(intent)
                        finish()
                    } else {
                        Toast.makeText(this@LoginActivity, "Credenciales inválidas", Toast.LENGTH_LONG).show()
                    }
                } else {
                    Toast.makeText(this@LoginActivity, "Error de conexión", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = android.view.View.GONE
                binding.btnIngresar.isEnabled = true
                Toast.makeText(this@LoginActivity, "Error: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun loadSavedCredentials() {
        val rememberMe = sharedPreferences.getBoolean(KEY_REMEMBER, false)
        binding.cbRememberMe.isChecked = rememberMe
        
        if (rememberMe) {
            binding.etUsername.setText(sharedPreferences.getString(KEY_USERNAME, ""))
            binding.etEventCode.setText(sharedPreferences.getString(KEY_EVENT_CODE, ""))
            // Por seguridad, NO cargamos la contraseña
        }
    }
    
    private fun saveCredentials() {
        val editor = sharedPreferences.edit()
        val rememberMe = binding.cbRememberMe.isChecked
        
        editor.putBoolean(KEY_REMEMBER, rememberMe)
        
        if (rememberMe) {
            // Solo guardamos usuario y evento, NO la contraseña por seguridad
            editor.putString(KEY_USERNAME, binding.etUsername.text.toString())
            editor.putString(KEY_EVENT_CODE, binding.etEventCode.text.toString())
        } else {
            editor.remove(KEY_USERNAME)
            editor.remove(KEY_EVENT_CODE)
        }
        
        editor.apply()
    }
}
