package com.beterminal.app.ui

import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import android.content.IntentFilter
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.os.Bundle
import android.provider.Settings
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
    
    private var nfcAdapter: NfcAdapter? = null
    private var pendingIntent: PendingIntent? = null
    private var intentFiltersArray: Array<IntentFilter>? = null
    private var techListsArray: Array<Array<String>>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityTapCardBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Get parameters from intent
        amountCents = intent.getLongExtra("amount", 0L)
        eventCode = intent.getStringExtra("eventCode") ?: ""
        authToken = intent.getStringExtra("authToken") ?: ""

        setupNFC()
        setupUI()
    }

    private fun setupNFC() {
        nfcAdapter = NfcAdapter.getDefaultAdapter(this)
        
        if (nfcAdapter == null) {
            Toast.makeText(this, "Este dispositivo no soporta NFC", Toast.LENGTH_LONG).show()
            simulatePayment() // Fallback a simulación
            return
        }
        
        if (!nfcAdapter!!.isEnabled) {
            Toast.makeText(this, "Por favor, active NFC en configuración", Toast.LENGTH_LONG).show()
            // Opcional: abrir configuración de NFC
            try {
                val settingsIntent = Intent(Settings.ACTION_NFC_SETTINGS)
                startActivity(settingsIntent)
            } catch (e: Exception) {
                simulatePayment() // Fallback si no se puede abrir config
            }
            return
        }
        
        // Configurar intent para capturar tags NFC
        pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, javaClass).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_MUTABLE
        )
        
        // Configurar filtros para diferentes tipos de tarjetas
        val ndef = IntentFilter(NfcAdapter.ACTION_NDEF_DISCOVERED)
        val techDiscovered = IntentFilter(NfcAdapter.ACTION_TECH_DISCOVERED)
        val tagDiscovered = IntentFilter(NfcAdapter.ACTION_TAG_DISCOVERED)
        
        intentFiltersArray = arrayOf(ndef, techDiscovered, tagDiscovered)
        techListsArray = arrayOf(
            arrayOf(IsoDep::class.java.name),
            arrayOf("android.nfc.tech.NfcA"),
            arrayOf("android.nfc.tech.NfcB")
        )
    }

    private fun setupUI() {
        binding.tvTitle.text = "Acerque la Tarjeta"
        binding.tvSubtitle.text = "Monto: $${String.format("%.2f", amountCents / 100.0)}\nEvento: $eventCode\n\n💳 Acerque la tarjeta NFC al dispositivo"
        
        binding.btnCancelar.setOnClickListener {
            setResult(Activity.RESULT_CANCELED)
            finish()
        }
    }

    override fun onResume() {
        super.onResume()
        // Habilitar detección NFC
        nfcAdapter?.enableForegroundDispatch(
            this,
            pendingIntent,
            intentFiltersArray,
            techListsArray
        )
    }

    override fun onPause() {
        super.onPause()
        // Deshabilitar detección NFC
        nfcAdapter?.disableForegroundDispatch(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        
        if (NfcAdapter.ACTION_TAG_DISCOVERED == intent.action ||
            NfcAdapter.ACTION_TECH_DISCOVERED == intent.action ||
            NfcAdapter.ACTION_NDEF_DISCOVERED == intent.action) {
            
            val tag: Tag? = intent.getParcelableExtra(NfcAdapter.EXTRA_TAG)
            handleNfcTag(tag)
        }
    }

    private fun handleNfcTag(tag: Tag?) {
        if (tag == null) {
            Toast.makeText(this, "Error al leer la tarjeta", Toast.LENGTH_SHORT).show()
            return
        }

        binding.tvSubtitle.text = "✅ Tarjeta detectada!\nProcesando pago...\nMonto: $${String.format("%.2f", amountCents / 100.0)}"
        
        // Vibrar para confirmar lectura
        try {
            val vibrator = getSystemService(VIBRATOR_SERVICE) as android.os.Vibrator
            vibrator.vibrate(200)
        } catch (e: Exception) {
            // Ignorar si no hay vibrador
        }

        // Procesar pago con los datos de la tarjeta
        processPaymentWithCard(tag)
    }

    private fun processPaymentWithCard(tag: Tag) {
        lifecycleScope.launch {
            try {
                binding.tvSubtitle.text = "🔄 Procesando pago...\nMonto: $${String.format("%.2f", amountCents / 100.0)}\nNo retire la tarjeta..."

                val paymentRequest = PaymentIntentRequest(
                    amount = amountCents,
                    eventCode = eventCode
                )

                val response = ApiClient.createPaymentIntent(authToken, paymentRequest)

                if (response.isSuccessful) {
                    val paymentResponse = response.body()
                    if (paymentResponse?.success == true) {
                        showPaymentSuccess()
                    } else {
                        showPaymentError("Error: ${paymentResponse?.message ?: "Pago rechazado"}")
                    }
                } else {
                    showPaymentError("Error de conexión: ${response.code()}")
                }
            } catch (e: Exception) {
                showPaymentError("Error: ${e.message}")
            }
        }
    }

    private fun simulatePayment() {
        binding.tvSubtitle.text = "⚠️ Modo simulación\nMonto: $${String.format("%.2f", amountCents / 100.0)}\nEsperando..."
        
        lifecycleScope.launch {
            try {
                kotlinx.coroutines.delay(3000) // Simular 3 segundos
                
                val paymentRequest = PaymentIntentRequest(
                    amount = amountCents,
                    eventCode = eventCode
                )

                val response = ApiClient.createPaymentIntent(authToken, paymentRequest)

                if (response.isSuccessful) {
                    val paymentResponse = response.body()
                    if (paymentResponse?.success == true) {
                        showPaymentSuccess()
                    } else {
                        showPaymentError("Error: ${paymentResponse?.message ?: "Pago rechazado"}")
                    }
                } else {
                    showPaymentError("Error de conexión: ${response.code()}")
                }
            } catch (e: Exception) {
                showPaymentError("Error: ${e.message}")
            }
        }
    }

    private fun showPaymentSuccess() {
        binding.tvTitle.text = "✅ ¡Pago Exitoso!"
        binding.tvSubtitle.text = "Monto: $${String.format("%.2f", amountCents / 100.0)}\nEvento: $eventCode\n\n✅ Transacción completada"
        binding.btnCancelar.text = "FINALIZAR"
        
        // Vibrar para confirmar éxito
        try {
            val vibrator = getSystemService(VIBRATOR_SERVICE) as android.os.Vibrator
            vibrator.vibrate(longArrayOf(0, 200, 100, 200), -1)
        } catch (e: Exception) {
            // Ignorar si no hay vibrador
        }

        setResult(Activity.RESULT_OK)
        
        // Auto-cerrar después de 2 segundos
        lifecycleScope.launch {
            kotlinx.coroutines.delay(2000)
            finish()
        }
    }

    private fun showPaymentError(message: String) {
        binding.tvTitle.text = "❌ Error en el Pago"
        binding.tvSubtitle.text = message
        binding.btnCancelar.text = "REINTENTAR"
        
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }
}
