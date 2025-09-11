package com.datafono.terminal

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Button
import com.google.android.material.appbar.MaterialToolbar
import android.widget.TextView
import android.os.Build
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AlertDialog
import android.view.Menu
import android.view.MenuItem
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import android.widget.Toast
// Adyen NFC flow removed: no PendingIntent/Intent/NFC imports needed
import com.stripe.stripeterminal.Terminal
import com.stripe.stripeterminal.external.callable.DiscoveryListener
import com.stripe.stripeterminal.external.callable.Callback
import com.stripe.stripeterminal.external.callable.Cancelable
import com.stripe.stripeterminal.external.callable.ConnectionTokenCallback
import com.stripe.stripeterminal.external.models.ConnectionTokenException
import com.stripe.stripeterminal.external.callable.ConnectionTokenProvider
import com.stripe.stripeterminal.external.callable.ReaderCallback
import com.stripe.stripeterminal.external.callable.TerminalListener
import com.stripe.stripeterminal.external.callable.TapToPayReaderListener
import com.stripe.stripeterminal.external.models.ConnectionConfiguration
import com.stripe.stripeterminal.external.models.ConnectionStatus
import com.stripe.stripeterminal.external.models.DiscoveryConfiguration
import com.stripe.stripeterminal.external.models.DiscoveryConfiguration.TapToPayDiscoveryConfiguration
import com.stripe.stripeterminal.external.models.ConnectionConfiguration.TapToPayConnectionConfiguration
// PaymentIntent not directly used; using backend-confirm flow
import com.stripe.stripeterminal.external.models.PaymentStatus
import com.stripe.stripeterminal.external.models.PaymentIntent
import com.stripe.stripeterminal.external.models.Reader
import com.stripe.stripeterminal.external.models.ReaderDisplayMessage
import com.stripe.stripeterminal.external.models.ReaderInputOptions
import com.stripe.stripeterminal.external.models.ReaderSoftwareUpdate
import com.stripe.stripeterminal.external.models.TerminalException
import com.stripe.stripeterminal.log.LogLevel
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import com.datafono.terminal.R
import okhttp3.Headers
import com.stripe.stripeterminal.external.callable.PaymentIntentCallback

class MainActivity : AppCompatActivity() {
    private val client = OkHttpClient()
    private val baseUrl by lazy { BuildConfig.BASE_URL ?: "http://10.0.2.2:3002" }
    private var amountCents: Long = 0
    private val prefs by lazy { getSharedPreferences("terminal_prefs", MODE_PRIVATE) }
    private var events: List<Pair<String, String>> = emptyList()
    private var selectedEventId: String = "evt_local"
    private var authToken: String? = null
    private var backendLocationId: String? = null
    private var discoverCancelable: Cancelable? = null
    private var isDiscovering: Boolean = false
    private var pendingPaymentAmount: Int? = null
    private var pendingEventId: String? = null
    // Stripe-only mode
    // Adyen removed: no waiting state needed

    // Tap to Pay reader listener (progress/messages shown in UI)
    private val tapToPayReaderListener = object : TapToPayReaderListener {
        override fun onStartInstallingUpdate(update: ReaderSoftwareUpdate) {
            runOnUiThread { findViewById<TextView>(R.id.txtStatus)?.text = "Actualizando lector…" }
        }
        override fun onReportReaderSoftwareUpdateProgress(progress: Float) {
            runOnUiThread { findViewById<TextView>(R.id.txtStatus)?.text = "Actualizando lector… ${"%.0f".format(progress * 100)}%" }
        }
        override fun onFinishInstallingUpdate(update: ReaderSoftwareUpdate?, e: TerminalException?) {
            runOnUiThread {
                val s = if (e == null) "Lector actualizado" else "Falló actualización: ${e.errorMessage ?: e.message}"
                findViewById<TextView>(R.id.txtStatus)?.text = s
                findViewById<TextView>(R.id.txtLog)?.append("\n$s")
            }
        }
        override fun onRequestReaderDisplayMessage(message: ReaderDisplayMessage) {
            runOnUiThread { findViewById<TextView>(R.id.txtLog)?.append("\n${message.name.replace('_',' ')}") }
        }
        override fun onRequestReaderInput(options: ReaderInputOptions) {
            // No-op for now; UI driven by SDK prompts
        }
    }

    private val requestPermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        val allGranted = grants.values.all { it }
        if (allGranted) {
            initTerminal()
        } else {
            Toast.makeText(this, "Permisos de Bluetooth/Ubicación requeridos", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        // Set up top app bar to host the menu
        findViewById<MaterialToolbar>(R.id.toolbar)?.let { setSupportActionBar(it) }
    // Show app version in the toolbar subtitle and status line
    supportActionBar?.subtitle = "v${BuildConfig.VERSION_NAME}"
    findViewById<TextView>(R.id.txtStatus)?.let { it.text = "App v${BuildConfig.VERSION_NAME} • Lector: Desconectado" }

    // Load saved preferences
    authToken = prefs.getString("auth_token", null)
    // Stripe-only, no processor selection or NFC adapter

    ensurePermissionsAndInit()
    // Always try auto-connect; if it fails, manual button stays available
    alwaysAutoConnect(findViewById(R.id.txtLog), findViewById(R.id.txtStatus))
    // Fetch backend location id to display
    fetchBackendLocation()

    val btnPay = findViewById<Button>(R.id.btnPay)
    val logView = findViewById<TextView>(R.id.txtLog)
    val txtAmount = findViewById<TextView>(R.id.txtAmount)
    val txtStatus = findViewById<TextView>(R.id.txtStatus)
    val txtReport = findViewById<TextView>(R.id.txtReport)
    val txtEvent = findViewById<TextView>(R.id.txtEvent)

    // Initialize UI
    updateAmountDisplay(txtAmount)
    btnPay.isEnabled = false

    // Connect moved to menu; keep helper function for manual connect
        // Keypad handlers
        val digitIds = listOf(
            R.id.btnK0 to 0, R.id.btnK1 to 1, R.id.btnK2 to 2, R.id.btnK3 to 3, R.id.btnK4 to 4,
            R.id.btnK5 to 5, R.id.btnK6 to 6, R.id.btnK7 to 7, R.id.btnK8 to 8, R.id.btnK9 to 9
        )
        digitIds.forEach { (id, d) ->
            findViewById<Button>(id).setOnClickListener {
                // Shift cents and append digit; cap at 8 digits to respect 99,999,999
                val next = (amountCents * 10) + d
                amountCents = if (next > 99_999_999L) 99_999_999L else next
                updateAmountDisplay(txtAmount)
                btnPay.isEnabled = isPayAllowed()
            }
        }
        // 00 button appends two zeros
        findViewById<Button>(R.id.btnK00)?.setOnClickListener {
            val next = amountCents * 100
            amountCents = if (next > 99_999_999L) 99_999_999L else next
            updateAmountDisplay(txtAmount)
            btnPay.isEnabled = isPayAllowed()
        }
        // X button clears everything
        findViewById<Button>(R.id.btnKBack).setOnClickListener {
            amountCents = 0
            updateAmountDisplay(txtAmount)
            btnPay.isEnabled = false
        }

    // Load events list for menu selection
    loadEvents { list ->
        events = list
        selectedEventId = list.firstOrNull()?.first ?: "evt_local"
        txtEvent.text = "Evento: ${list.firstOrNull()?.second ?: selectedEventId}"
    }

    btnPay.setOnClickListener {
            ensureLoggedIn {
                // Validate first so we can queue the payment if not connected yet
                val amtParsed = amountCents
                if (amtParsed < 1L || amtParsed > 99_999_999L) {
                    runOnUiThread { logView.append("\nMonto inválido. Usa centavos entre 1 y 99,999,999.") }
                    return@ensureLoggedIn
                }
                val amt = amtParsed.toInt()
                val eventId = selectedEventId

                val hasReader = try { Terminal.isInitialized() && Terminal.getInstance().connectedReader != null } catch (_: Exception) { false }
                if (!hasReader) {
                    pendingPaymentAmount = amt
                    pendingEventId = eventId
                    runOnUiThread {
                        logView.append("\nConectando lector… el cobro continuará automáticamente al conectarse.")
                        txtStatus.text = "Buscando lector…"
                        btnPay.isEnabled = false
                        btnPay.text = "Conectando lector…"
                    }
                    alwaysAutoConnect(logView, txtStatus)
                    return@ensureLoggedIn
                }
                startStripeFlow(logView, txtAmount, btnPay, eventId, amt)
            }
        }

    // Report/Refund/Close Day moved to menu
    }

    override fun onResume() {
        super.onResume()
    // NFC foreground dispatch not used in Stripe-only mode
    }

    override fun onPause() {
        super.onPause()
    // Cancel any ongoing discovery to avoid overlap errors when resuming
    cancelDiscovery()
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
    // Stripe-only: no Adyen NFC handling
    }

    private fun ensurePermissionsAndInit() {
        val needed = mutableSetOf<String>()
        // Siempre pide ubicación; el SDK puede requerirla para discovery
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            needed += Manifest.permission.ACCESS_FINE_LOCATION
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                needed += Manifest.permission.BLUETOOTH_SCAN
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                needed += Manifest.permission.BLUETOOTH_CONNECT
            }
        }

    if (needed.isEmpty()) initTerminal() else requestPermissionsLauncher.launch(needed.toTypedArray())
    }

    private fun fetchBackendLocation() {
        val logView = findViewById<TextView>(R.id.txtLog)
        val status = findViewById<TextView>(R.id.txtStatus)
        val req = Request.Builder().url("$baseUrl/api/stripe/location").get().build()
        client.newCall(req).enqueue(SimpleCallback(onFailure = { e ->
            runOnUiThread { logView.append("\nLocation API error: ${e.message}") }
        }, onResponse = { resp ->
            resp.use {
                val body = it.body?.string() ?: "{}"
                val json = try { JSONObject(body) } catch (_: Exception) { JSONObject() }
        val loc = json.optString("location_id", "")
                runOnUiThread {
                    if (loc.isNotBlank()) {
            backendLocationId = loc
                        logView.append("\nLocation backend: $loc")
                        if (status.text.isNullOrBlank()) status.text = "Location: $loc"
                        // Now that we have a location, try to auto-connect if not yet connected
                        if (Terminal.isInitialized() && Terminal.getInstance().connectedReader == null) {
                            alwaysAutoConnect(logView, status)
                        }
                    } else {
                        logView.append("\nLocation backend vacío")
                    }
                }
            }
        }))
    }

    private fun initTerminal() {
    if (Terminal.isInitialized()) return
    val listener = object : TerminalListener {
            override fun onConnectionStatusChange(status: ConnectionStatus) {}
            override fun onPaymentStatusChange(status: PaymentStatus) {}
        }
        val tokenProvider = object : ConnectionTokenProvider {
            override fun fetchConnectionToken(callback: ConnectionTokenCallback) {
                val url = "$baseUrl/api/stripe/connection_token"
                val req = Request.Builder().url(url).addAuth().get().build()
                client.newCall(req).enqueue(SimpleCallback(onFailure = { e ->
                    callback.onFailure(ConnectionTokenException("Fetch token error: ${e.message}", e))
                }, onResponse = { resp ->
                    resp.use {
                        val body = it.body?.string() ?: "{}"
                        if (!it.isSuccessful) {
                            callback.onFailure(ConnectionTokenException("HTTP ${it.code} token body: ${body.take(200)}"))
                            return@use
                        }
                        val json = try { JSONObject(body) } catch (ex: Exception) { JSONObject() }
                        val secret = json.optString("secret")
                        if (secret.isNullOrBlank()) {
                            callback.onFailure(ConnectionTokenException("Missing secret field in response: ${body.take(200)}"))
                        } else {
                            callback.onSuccess(secret)
                        }
                    }
                }))
            }
        }
        try {
            Terminal.initTerminal(applicationContext, LogLevel.VERBOSE, tokenProvider, listener)
        } catch (e: Exception) {
            runOnUiThread {
                val logView = findViewById<TextView>(R.id.txtLog)
                logView?.append("\nError iniciando Terminal: ${e.message}")
                Toast.makeText(this, "Error iniciando Terminal", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun alwaysAutoConnect(logView: TextView?, txtStatus: TextView?) {
    val safeInitialized = try { Terminal.isInitialized() } catch (_: Exception) { false }
    if (!safeInitialized) return
    val safeHasReader = try { Terminal.getInstance().connectedReader != null } catch (_: Exception) { false }
    if (safeHasReader) return
        if (isDiscovering) { runOnUiThread { logView?.append("\nAuto: ya estoy buscando lector...") }; return }
        val buildCfgLoc = BuildConfig.TERMINAL_LOCATION_ID.takeIf { it.isNotEmpty() }
        val locationId = (buildCfgLoc ?: backendLocationId)
        if (locationId.isNullOrBlank()) {
            runOnUiThread {
                logView?.append("\nFalta TERMINAL_LOCATION_ID/Location backend para Tap to Pay")
                txtStatus?.text = "Configurar ubicación del lector"
            }
            return
        }
        var connected = false
    val discoveryConfig = TapToPayDiscoveryConfiguration(isSimulated = BuildConfig.SIMULATED)
        // Ensure no overlapping discovery
        cancelDiscovery()
        isDiscovering = true
        runOnUiThread { txtStatus?.text = "Buscando lector…" }
        discoverCancelable = Terminal.getInstance().discoverReaders(
            discoveryConfig,
            object : DiscoveryListener {
                override fun onUpdateDiscoveredReaders(readers: List<Reader>) {
                    if (connected || readers.isEmpty()) return
                    val reader = readers.first()
                    val connCfg = TapToPayConnectionConfiguration(locationId, tapToPayReaderListener)
                    Terminal.getInstance().connectReader(
                        reader,
                        connCfg,
                        object : ReaderCallback {
                            override fun onSuccess(reader: Reader) {
                                connected = true
                                runOnUiThread {
                                    logView?.append("\nTeléfono registrado como lector (${reader.label ?: reader.serialNumber})")
                                    txtStatus?.text = "Lector (Teléfono): Conectado"
                                    // Continue pending payment if queued
                                    val amt = pendingPaymentAmount
                                    val evt = pendingEventId
                                    if (amt != null && evt != null) {
                                        pendingPaymentAmount = null
                                        pendingEventId = null
                                        val lv = logView ?: findViewById(R.id.txtLog)
                                        startStripeFlow(lv!!, findViewById(R.id.txtAmount), findViewById(R.id.btnPay), evt, amt)
                                    }
                                }
                                cancelDiscovery()
                                isDiscovering = false
                            }
                            override fun onFailure(e: TerminalException) {
                                runOnUiThread {
                                    if (!e.message.orEmpty().contains("canceled because of a new discovery call", true)) {
                                        logView?.append("\nError conectando lector móvil: ${e.message}")
                                    }
                                    txtStatus?.text = "Lector: Desconectado"
                                    // Re-enable pay button so user can reintentar o revisar conexión
                                    findViewById<Button>(R.id.btnPay)?.let { btn ->
                                        btn.isEnabled = isPayAllowed()
                                        btn.text = "CONTINUAR"
                                    }
                                }
                                cancelDiscovery()
                                isDiscovering = false
                            }
                        }
                    )
                }
            },
            object : Callback {
                override fun onSuccess() { runOnUiThread { logView?.append("\nDescubrimiento Tap to Pay iniciado") } }
                override fun onFailure(e: TerminalException) {
                    runOnUiThread {
                        if (!e.message.orEmpty().contains("canceled because of a new discovery call", true)) {
                            logView?.append("\nDiscovery error: ${e.message}")
                        }
                        txtStatus?.text = "Lector: Desconectado"
                        // Re-enable button on discovery failure
                        findViewById<Button>(R.id.btnPay)?.let { btn ->
                            btn.isEnabled = isPayAllowed()
                            btn.text = "CONTINUAR"
                        }
                    }
                    cancelDiscovery()
                    isDiscovering = false
                }
            }
        )
    }

    private fun updateAmountDisplay(txtAmount: TextView) {
        txtAmount.text = formatCurrency(amountCents)
    }

    private fun manualConnect(logView: TextView?, txtStatus: TextView?) {
        if (!Terminal.isInitialized()) {
            runOnUiThread { logView?.append("\nInicializando Terminal...") }
            ensurePermissionsAndInit()
            return
        }
        if (isDiscovering) { runOnUiThread { logView?.append("\nYa hay una búsqueda en curso, cancelando y reintentando...") } }
        val buildCfgLoc = BuildConfig.TERMINAL_LOCATION_ID.takeIf { it.isNotEmpty() }
        val locationId = (buildCfgLoc ?: backendLocationId)
        if (locationId.isNullOrBlank()) {
            runOnUiThread { logView?.append("\nConfigura TERMINAL_LOCATION_ID para conectar") }
            return
        }
        var connected = false
    val discoveryConfig = TapToPayDiscoveryConfiguration(isSimulated = BuildConfig.SIMULATED)
        cancelDiscovery()
        isDiscovering = true
        discoverCancelable = Terminal.getInstance().discoverReaders(
            discoveryConfig,
            object : DiscoveryListener {
                override fun onUpdateDiscoveredReaders(readers: List<Reader>) {
                    if (connected || readers.isEmpty()) return
                    val reader = readers.first()
                    val connCfg = TapToPayConnectionConfiguration(locationId, tapToPayReaderListener)
                    Terminal.getInstance().connectReader(reader, connCfg, object : ReaderCallback {
                        override fun onSuccess(reader: Reader) {
                            connected = true
                            runOnUiThread {
                                logView?.append("\nTeléfono preparado para cobrar (Tap to Pay)")
                                txtStatus?.text = "Lector (Teléfono): Conectado"
                                // Continue pending payment if any
                                val amt = pendingPaymentAmount
                                val evt = pendingEventId
                                if (amt != null && evt != null) {
                                    pendingPaymentAmount = null
                                    pendingEventId = null
                                    val lv = logView ?: findViewById(R.id.txtLog)
                                    startStripeFlow(lv!!, findViewById(R.id.txtAmount), findViewById(R.id.btnPay), evt, amt)
                                }
                            }
                            cancelDiscovery()
                            isDiscovering = false
                        }
                        override fun onFailure(e: TerminalException) {
                            runOnUiThread {
                                if (!e.message.orEmpty().contains("canceled because of a new discovery call", true)) {
                                    logView?.append("\nError conexión Tap to Pay: ${e.message}")
                                }
                            }
                            cancelDiscovery()
                            isDiscovering = false
                        }
                    })
                }
            },
            object : Callback {
                override fun onSuccess() { runOnUiThread { logView?.append("\nDescubriendo lector móvil...") } }
                override fun onFailure(e: TerminalException) {
                    runOnUiThread {
                        if (!e.message.orEmpty().contains("canceled because of a new discovery call", true)) {
                            logView?.append("\nDiscovery error: ${e.message}")
                        }
                    }
                    cancelDiscovery()
                    isDiscovering = false
                }
            }
        )
    }

    private fun cancelDiscovery() {
        try {
            discoverCancelable?.cancel()
        } catch (_: Exception) {}
    discoverCancelable = null
    isDiscovering = false
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.main_menu, menu)
    // Remove processor switching from title; Stripe-only
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        val logView = findViewById<TextView>(R.id.txtLog)
        val txtStatus = findViewById<TextView>(R.id.txtStatus)
        val txtEvent = findViewById<TextView>(R.id.txtEvent)
        when (item.itemId) {
            R.id.menu_connect -> { manualConnect(logView, txtStatus); return true }
            R.id.menu_login -> {
                ensureLoggedIn { Toast.makeText(this, "Login OK", Toast.LENGTH_SHORT).show() }
                return true
            }
            // menu_processor removed in Stripe-only mode
            R.id.menu_choose_event -> {
                if (events.isEmpty()) {
                    Toast.makeText(this, "No hay eventos", Toast.LENGTH_SHORT).show()
                    return true
                }
                val labels = events.map { it.second }
                AlertDialog.Builder(this)
                    .setTitle("Seleccionar evento")
                    .setItems(labels.toTypedArray()) { _, which ->
                        selectedEventId = events[which].first
                        txtEvent.text = "Evento: ${events[which].second}"
                    }
                    .show()
                return true
            }
            R.id.menu_report -> {
                val url = "$baseUrl/reports/summary?eventId=$selectedEventId"
                val req = Request.Builder().url(url).get().build()
                client.newCall(req).enqueue(SimpleCallback(onFailure = {
                    runOnUiThread { logView.append("\nReporte error: ${it.message}") }
                }, onResponse = { resp ->
                    resp.use {
                        val body = it.body?.string() ?: "{}"
                        val json = try { JSONObject(body) } catch (e: Exception) { JSONObject("{}") }
                        val total = json.optLong("total", 0L)
                        val count = json.optInt("count", 0)
                        val net = json.optLong("net", total)
                        val totalFmt = formatCurrency(total)
                        val netFmt = formatCurrency(net)
                        runOnUiThread { findViewById<TextView>(R.id.txtReport).text = "Total: $totalFmt | Net: $netFmt | Tickets: $count" }
                    }
                }))
                return true
            }
            R.id.menu_refund -> {
                val lastId = prefs.getString("last_pi_id", null)
                if (lastId.isNullOrBlank()) {
                    Toast.makeText(this, "No hay transacción reciente", Toast.LENGTH_SHORT).show()
                    return true
                }
                val body = JSONObject(mapOf("id" to lastId)).toString()
                val req = Request.Builder().url("$baseUrl/payments/refund").post(body.toRequestBody("application/json".toMediaType())).build()
                client.newCall(req).enqueue(SimpleCallback(onFailure = {
                    runOnUiThread { logView.append("\nRefund error: ${it.message}") }
                }, onResponse = { resp ->
                    resp.use { runOnUiThread { logView.append("\nRefund: HTTP ${it.code}") } }
                }))
                return true
            }
            R.id.menu_close_day -> {
                val body = JSONObject(mapOf("eventId" to selectedEventId)).toString()
                val req = Request.Builder().url("$baseUrl/reports/close-day").post(body.toRequestBody("application/json".toMediaType())).build()
                client.newCall(req).enqueue(SimpleCallback(onFailure = {
                    runOnUiThread { logView.append("\nCierre día error: ${it.message}") }
                }, onResponse = { resp ->
                    resp.use { runOnUiThread { logView.append("\nCierre día: HTTP ${it.code}") } }
                }))
                return true
            }
        }
        return super.onOptionsItemSelected(item)
    }

    private fun loadEvents(onLoaded: (List<Pair<String, String>>) -> Unit) {
        val logView = findViewById<TextView>(R.id.txtLog)
        val req = Request.Builder().url("$baseUrl/api/events").get().build()
        client.newCall(req).enqueue(SimpleCallback(onFailure = {
            runOnUiThread { logView.append("\nEventos error: ${it.message}") }
        }, onResponse = { resp ->
            resp.use {
                val body = it.body?.string() ?: "{}"
                val list = try {
                    val arr = JSONObject(body).optJSONArray("events")
                    (0 until (arr?.length() ?: 0)).map { i ->
                        val obj = arr!!.getJSONObject(i)
                        obj.getString("id") to obj.optString("name", obj.getString("id"))
                    }
                } catch (e: Exception) { emptyList() }
                runOnUiThread { onLoaded(if (list.isEmpty()) listOf("evt_local" to "Evento local") else list) }
            }
        }))
    }

    private fun isPayAllowed(): Boolean =
        amountCents in 1..99_999_999

    // --- Networking helpers
    private fun Request.Builder.addAuth(): Request.Builder {
        val t = authToken
        return if (!t.isNullOrBlank()) this.header("Authorization", "Bearer $t") else this
    }

    private fun ensureLoggedIn(onReady: () -> Unit) {
        if (!authToken.isNullOrBlank()) { onReady(); return }
        // Quick inline login with default demo creds prompt
        runOnUiThread {
            val inputUser = android.widget.EditText(this)
            inputUser.hint = "usuario"
            val inputPass = android.widget.EditText(this)
            inputPass.hint = "password"
            inputPass.inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            val container = android.widget.LinearLayout(this).apply {
                orientation = android.widget.LinearLayout.VERTICAL
                addView(inputUser)
                addView(inputPass)
                setPadding(50, 20, 50, 0)
            }
            AlertDialog.Builder(this)
                .setTitle("Login requerido")
                .setView(container)
                .setPositiveButton("Entrar") { _, _ ->
                    val body = JSONObject(mapOf(
                        "username" to inputUser.text.toString(),
                        "password" to inputPass.text.toString()
                    )).toString()
                    val req = Request.Builder().url("$baseUrl/api/auth/login")
                        .post(body.toRequestBody("application/json".toMediaType())).build()
                    client.newCall(req).enqueue(SimpleCallback(onFailure = { e ->
                        runOnUiThread { Toast.makeText(this, "Login fallo: ${e.message}", Toast.LENGTH_LONG).show() }
                    }, onResponse = { resp ->
                        resp.use {
                            val bodyTxt = it.body?.string() ?: "{}"
                            val json = try { JSONObject(bodyTxt) } catch (_: Exception) { JSONObject("{}") }
                            if (it.isSuccessful && json.optBoolean("success")) {
                                authToken = json.optString("token")
                                prefs.edit().putString("auth_token", authToken).apply()
                                runOnUiThread { onReady() }
                            } else {
                                runOnUiThread { Toast.makeText(this, "Credenciales inválidas", Toast.LENGTH_LONG).show() }
                            }
                        }
                    }))
                }
                .setNegativeButton("Cancelar", null)
                .show()
        }
    }

    // --- Processor flows
    private fun startStripeFlow(logView: TextView, txtAmount: TextView, btnPay: Button, eventId: String, amt: Int) {
        ensureLoggedIn {
            val connected = try { Terminal.getInstance().connectedReader != null } catch (_: Exception) { false }
            if (!connected) {
                runOnUiThread { logView.append("\nConecta el lector (teléfono) antes de cobrar") }
                return@ensureLoggedIn
            }
            val createBody = JSONObject(mapOf(
                "amount" to amt,
                "eventCode" to eventId,
                "flowType" to "automatic"
            )).toString()
            val createReq = Request.Builder()
                .url("$baseUrl/api/stripe/payment_intent")
                .addAuth()
                .post(createBody.toRequestBody("application/json".toMediaType()))
                .build()
            client.newCall(createReq).enqueue(SimpleCallback(onFailure = { e ->
                runOnUiThread { logView.append("\nError creando PaymentIntent: ${e.message}") }
            }, onResponse = { resp ->
                resp.use {
                    val body = it.body?.string() ?: "{}"
                    val json = try { JSONObject(body) } catch (_: Exception) { JSONObject() }
                    val clientSecret = json.optString("clientSecret")
                    val paymentIntentId = json.optString("paymentIntentId")
                    if (!it.isSuccessful || clientSecret.isNullOrBlank()) {
                        runOnUiThread { logView.append("\nPI auto fallo HTTP ${it.code}: ${body.take(250)}") }
                        return@use
                    }
                    runOnUiThread { logView.append("\nPaymentIntent creado: $paymentIntentId. Pide al cliente acercar la tarjeta.") }
                    Terminal.getInstance().retrievePaymentIntent(clientSecret, object : PaymentIntentCallback {
                        override fun onSuccess(pi: PaymentIntent) {
                            fun collectWithRetry(attempt: Int = 1) {
                                Terminal.getInstance().collectPaymentMethod(pi, object : PaymentIntentCallback {
                                override fun onSuccess(collected: PaymentIntent) {
                    Terminal.getInstance().confirmPaymentIntent(collected, object : PaymentIntentCallback {
                                        override fun onSuccess(processed: PaymentIntent) {
                                            val approved = processed.status == com.stripe.stripeterminal.external.models.PaymentIntentStatus.SUCCEEDED
                                            runOnUiThread {
                                                if (approved) {
                                                    logView.append("\nPago aprobado")
                                                    showResult(true, amountCents, processed.id, null)
                                                    prefs.edit().putString("last_pi_id", processed.id).apply()
                                                    amountCents = 0
                                                    updateAmountDisplay(txtAmount)
                                                    btnPay.isEnabled = false
                                                } else {
                                                    logView.append("\nPago estado: ${processed.status}")
                                                    showResult(false, amountCents, processed.id, processed.status.toString())
                                                }
                                            }
                                        }
                                        override fun onFailure(e: TerminalException) {
                        runOnUiThread { logView.append("\nError confirmPaymentIntent: ${e.message}") }
                                        }
                                    })
                                }
                                override fun onFailure(e: TerminalException) {
                                        val code = e.errorCode?.name ?: "UNKNOWN"
                                        val retryable = code == "CANCELED" || code == "READER_TIMEOUT"
                                        if (retryable && attempt < 2) {
                                            runOnUiThread { logView.append("\n${code} – reintentando collect (${attempt+1}/2)") }
                                            collectWithRetry(attempt + 1)
                                        } else {
                                            runOnUiThread { logView.append("\nError collectPaymentMethod: ${code} ${e.message}") }
                                        }
                                }
                                })
                            }
                            collectWithRetry()
                        }
                        override fun onFailure(e: TerminalException) {
                            runOnUiThread { logView.append("\nError retrievePaymentIntent: ${e.message}") }
                        }
                    })
                }
            }))
        }
    }

    // Adyen flow removed (Stripe Tap to Pay only)
}

private fun formatCurrency(cents: Long): String {
    val abs = kotlin.math.abs(cents)
    val dollars = abs / 100
    val centsPart = abs % 100
    val sign = if (cents < 0) "-" else ""
    return "$sign$${dollars.toString()}.$centsPart".replace(".$centsPart", "." + centsPart.toString().padStart(2, '0'))
}


class SimpleCallback(
    val onFailure: (Exception) -> Unit,
    val onResponse: (okhttp3.Response) -> Unit
) : okhttp3.Callback {
    override fun onFailure(call: okhttp3.Call, e: java.io.IOException) = onFailure(e)
    override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) = onResponse(response)
}

private fun MainActivity.showResult(approved: Boolean, amount: Long, refId: String?, reason: String?) {
    val dialog = android.app.Dialog(this)
    dialog.setContentView(R.layout.view_result)
    val icon = dialog.findViewById<TextView>(R.id.txtIcon)
    val title = dialog.findViewById<TextView>(R.id.txtResultTitle)
    val amt = dialog.findViewById<TextView>(R.id.txtResultAmount)
    val ref = dialog.findViewById<TextView>(R.id.txtResultRef)
    val btn = dialog.findViewById<Button>(R.id.btnResultDone)
    if (approved) {
        icon.text = "✔"
        icon.setTextColor(0xFF2E7D32.toInt())
        title.text = "Approved"
    } else {
        icon.text = "✖"
        icon.setTextColor(0xFFC62828.toInt())
        title.text = "Denied"
    }
    amt.text = formatCurrency(amount)
    val extra = if (!reason.isNullOrBlank()) " — $reason" else ""
    ref.text = "Ref: ${refId ?: "—"}$extra"
    btn.setOnClickListener { dialog.dismiss() }
    dialog.setCanceledOnTouchOutside(true)
    dialog.show()
}

 
