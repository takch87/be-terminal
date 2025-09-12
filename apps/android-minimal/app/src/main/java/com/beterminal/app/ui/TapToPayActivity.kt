package com.beterminal.app.ui

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.beterminal.app.databinding.ActivityTapToPayBinding
import com.beterminal.app.BuildConfig
import com.beterminal.app.network.ApiClient
import com.beterminal.app.network.PaymentIntentRequest
import com.stripe.stripeterminal.Terminal
import com.stripe.stripeterminal.external.callable.Callback
import com.stripe.stripeterminal.external.callable.Cancelable
import com.stripe.stripeterminal.external.callable.ConnectionTokenCallback
import com.stripe.stripeterminal.external.callable.ConnectionTokenProvider
import com.stripe.stripeterminal.external.callable.DiscoveryListener
import com.stripe.stripeterminal.external.callable.PaymentIntentCallback
import com.stripe.stripeterminal.external.callable.ReaderCallback
import com.stripe.stripeterminal.external.callable.TapToPayReaderListener
import com.stripe.stripeterminal.external.callable.TerminalListener
import com.stripe.stripeterminal.external.models.ConnectionConfiguration.TapToPayConnectionConfiguration
import com.stripe.stripeterminal.external.models.ConnectionTokenException
import com.stripe.stripeterminal.external.models.DiscoveryConfiguration.TapToPayDiscoveryConfiguration
import com.stripe.stripeterminal.log.LogLevel
import com.stripe.stripeterminal.external.models.*
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * TapToPayActivity
 * ---
 * Flujo de cobro usando Stripe Terminal (Tap to Pay on Android):
 * 1) Pide permisos necesarios (ubicación y Bluetooth) para discovery/conexión del lector (phone-as-reader).
 * 2) Inicializa el SDK de Terminal con un ConnectionTokenProvider que llama a nuestro backend de producción
 *    en /api/stripe/connection_token. El backend ya fija la Location de Stripe (USA) para cumplir el requisito.
 * 3) Descubre y se conecta al lector de Tap to Pay (el propio teléfono) con TapToPayDiscovery/ConnectionConfiguration.
 * 4) Crea un PaymentIntent en el backend usando /api/stripe/payment_intent_auto (card_present) y
 *    luego: retrieve -> collectPaymentMethod -> confirmPaymentIntent.
 *
 * Notas importantes:
 * - En Release BuildConfig.SIMULATED=false para usar lector real (Stripe no permite apps debuggables con lector real).
 * - En Debug BuildConfig.SIMULATED=true para trabajar con el simulador.
 * - El backend crea PaymentIntents con payment_method_types=["card_present"], evitando el error
 *   "PaymentMethod provided (card_present) is not allowed for this PaymentIntent".
 */
class TapToPayActivity : AppCompatActivity() {
    private lateinit var binding: ActivityTapToPayBinding
    private var amountCents: Long = 0
    private var eventCode: String = ""
    private var authToken: String = ""

    private var isDiscovering = false
    private var discoverCancelable: Cancelable? = null
    private var locationIdForConnection: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityTapToPayBinding.inflate(layoutInflater)
        setContentView(binding.root)

        amountCents = intent.getLongExtra("amount", 0)
        eventCode = intent.getStringExtra("eventCode") ?: ""
        authToken = intent.getStringExtra("authToken") ?: ""

        binding.tvAmount.text = "$" + String.format("%.2f", amountCents / 100.0)
        binding.tvStatus.text = "Preparando Tap to Pay…"

        binding.btnCancel.setOnClickListener {
            setResult(Activity.RESULT_CANCELED)
            finish()
        }

        ensurePermissionsAndInit()
    }

    /**
     * Solicita permisos en runtime (ubicación + BT) requeridos por el SDK para discovery Tap to Pay.
     * Una vez otorgados, inicializa el Terminal SDK.
     */
    private fun ensurePermissionsAndInit() {
        val needed = mutableListOf<String>()
        // Location for discovery
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_COARSE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            needed += android.Manifest.permission.ACCESS_FINE_LOCATION
            needed += android.Manifest.permission.ACCESS_COARSE_LOCATION
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.BLUETOOTH_SCAN) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                needed += android.Manifest.permission.BLUETOOTH_SCAN
            }
            if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.BLUETOOTH_CONNECT) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                needed += android.Manifest.permission.BLUETOOTH_CONNECT
            }
        }
        if (needed.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toTypedArray(), 101)
        } else {
            initTerminal()
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 101) initTerminal()
    }

    /**
     * Inicializa Stripe Terminal:
     * - Provee un ConnectionTokenProvider que llama a nuestro backend productivo.
     * - Cachea el locationId recibido (si viene) para usar en la conexión.
     */
    private fun initTerminal() {
        if (Terminal.isInitialized()) {
            startFlow()
            return
        }
        val listener = object : TerminalListener {
            override fun onConnectionStatusChange(status: ConnectionStatus) {}
            override fun onPaymentStatusChange(status: PaymentStatus) {}
        }
    val tokenProvider = object : ConnectionTokenProvider {
            override fun fetchConnectionToken(callback: ConnectionTokenCallback) {
                // Use production backend; the server enforces US location
        val body = "{}".toRequestBody("application/json".toMediaType())
        val req = Request.Builder()
            .url("https://be.terminal.beticket.net/api/stripe/connection_token")
            .header("Authorization", "Bearer $authToken")
            .post(body)
            .build()
                OkHttpClient().newCall(req).enqueue(object : okhttp3.Callback {
                    override fun onFailure(call: okhttp3.Call, e: java.io.IOException) {
                        callback.onFailure(ConnectionTokenException("Fetch token error: ${e.message}", e))
                    }
                    override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
                        response.use {
                            val body = it.body?.string() ?: "{}"
                            if (!it.isSuccessful) {
                                callback.onFailure(ConnectionTokenException("HTTP ${it.code} token body: ${body.take(200)}"))
                                return
                            }
                            val json = try { JSONObject(body) } catch (_: Exception) { JSONObject() }
                            val secret = json.optString("secret")
                // cache location id when present
                locationIdForConnection = json.optString("location", locationIdForConnection)
                            if (secret.isNullOrBlank()) {
                                callback.onFailure(ConnectionTokenException("Missing secret field in response: ${body.take(200)}"))
                            } else {
                                callback.onSuccess(secret)
                            }
                        }
                    }
                })
            }
        }
        try {
            Terminal.initTerminal(applicationContext, LogLevel.VERBOSE, tokenProvider, listener)
            // Prefer BuildConfig location if provided, otherwise will use one cached from token
            locationIdForConnection = BuildConfig.TERMINAL_LOCATION_ID ?: ""
            startFlow()
        } catch (e: Exception) {
            showError("Error iniciando Terminal: ${e.message}")
        }
    }

    /**
     * Descubre y conecta el lector Tap to Pay (phone-as-reader), y dispara el flujo de cobro.
     */
    private fun startFlow() {
        // Discover and connect Tap to Pay reader (phone-as-reader)
        if (isDiscovering) return

        // OPTIMIZACIÓN 1: si ya hay un lector conectado, saltamos discovery
        try {
            val current = Terminal.getInstance().connectedReader
            if (current != null) {
                runOnUiThread { binding.tvStatus.text = "Lector listo (re-uso). Acerca la tarjeta." }
                createAndCharge()
                return
            }
        } catch (_: Exception) {
            // Ignorar si aún no hay instancia/lector
        }
        isDiscovering = true
    val discoveryConfig = TapToPayDiscoveryConfiguration(isSimulated = BuildConfig.SIMULATED)
        discoverCancelable = Terminal.getInstance().discoverReaders(
            discoveryConfig,
            object : DiscoveryListener {
                override fun onUpdateDiscoveredReaders(readers: List<Reader>) {
                    if (readers.isEmpty()) return
                    val reader = readers.first()
                    val loc = if (locationIdForConnection.isNotBlank()) locationIdForConnection else ""
                    val connCfg = TapToPayConnectionConfiguration(loc, BuildConfig.SIMULATED, tapToPayReaderListener)
                    Terminal.getInstance().connectReader(reader, connCfg, object : ReaderCallback {
                        override fun onSuccess(reader: Reader) {
                            runOnUiThread { binding.tvStatus.text = "Lector listo. Acerca la tarjeta." }
                            isDiscovering = false
                            createAndCharge()
                            // OPTIMIZACIÓN 2: cancelar discovery al conectar para no dejar escaneo en background
                            cancelDiscovery()
                        }
                        override fun onFailure(e: TerminalException) {
                            isDiscovering = false
                            showError("Error conectando lector: ${e.message}")
                            cancelDiscovery()
                        }
                    })
                }
            },
            object : Callback {
                override fun onSuccess() { runOnUiThread { binding.tvStatus.text = "Buscando lector…" } }
                override fun onFailure(e: TerminalException) { isDiscovering = false; showError("Error buscando lector: ${e.message}") }
            }
        )

        // OPTIMIZACIÓN 3: seguridad por tiempo límite del discovery
        binding.root.postDelayed({
            if (isDiscovering) {
                cancelDiscovery()
                isDiscovering = false
                runOnUiThread { binding.tvStatus.text = "No se encontró lector. Reintentando…" }
                // Reintento único rápido
                startFlow()
            }
    }, 5_000) // 5s para un inicio más rápido
    }

    private val tapToPayReaderListener = object : TapToPayReaderListener {}

    private fun cancelDiscovery() {
        try {
            discoverCancelable?.cancel(object : Callback {
                override fun onSuccess() {}
                override fun onFailure(e: TerminalException) {}
            })
        } catch (_: Exception) {}
        discoverCancelable = null
    }

    /**
     * Crea el PaymentIntent y procesa el cobro:
     * - Llama al backend /api/stripe/payment_intent_auto (card_present)
     * - retrieve -> collectPaymentMethod -> confirm
     * Si todo sale bien, termina la Activity con RESULT_OK.
     */
    private fun createAndCharge() {
        lifecycleScope.launch {
            try {
                val paymentRequest = PaymentIntentRequest(amount = amountCents, eventCode = eventCode)
                // Usar el endpoint automático que crea PI con card_present
                val response = ApiClient.createPaymentIntentAuto(authToken, paymentRequest)
                val body = response.body()
                val clientSecret = body?.clientSecret
                if (!response.isSuccessful || clientSecret.isNullOrBlank()) {
                    showError("Error creando PaymentIntent: HTTP ${response.code()}")
                    return@launch
                }
                Terminal.getInstance().retrievePaymentIntent(clientSecret, object : PaymentIntentCallback {
                    override fun onSuccess(pi: PaymentIntent) {
                        Terminal.getInstance().collectPaymentMethod(pi, object : PaymentIntentCallback {
                            override fun onSuccess(collected: PaymentIntent) {
                                Terminal.getInstance().confirmPaymentIntent(collected, object : PaymentIntentCallback {
                                    override fun onSuccess(processed: PaymentIntent) {
                                        val approved = processed.status == PaymentIntentStatus.SUCCEEDED
                                        if (approved) {
                                            setResult(Activity.RESULT_OK)
                                            finish()
                                        } else {
                                            showError("Pago no aprobado: ${processed.status}")
                                        }
                                    }
                                    override fun onFailure(e: TerminalException) { showError("Error confirmando: ${e.message}") }
                                })
                            }
                            override fun onFailure(e: TerminalException) { showError("Error al recolectar: ${e.message}") }
                        })
                    }
                    override fun onFailure(e: TerminalException) { showError("Error PI: ${e.message}") }
                })
            } catch (e: Exception) {
                showError("Error creando PI: ${e.message}")
            }
        }
    }

    private fun showError(message: String) {
        runOnUiThread {
            binding.tvStatus.text = "❌ $message"
            Toast.makeText(this, message, Toast.LENGTH_LONG).show()
        }
    }
}
