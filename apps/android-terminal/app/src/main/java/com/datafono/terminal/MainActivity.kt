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
import com.stripe.stripeterminal.Terminal
import com.stripe.stripeterminal.external.callable.MobileReaderListener
import com.stripe.stripeterminal.external.callable.DiscoveryListener
import com.stripe.stripeterminal.external.callable.Callback
import com.stripe.stripeterminal.external.callable.Cancelable
import com.stripe.stripeterminal.external.callable.ConnectionTokenCallback
import com.stripe.stripeterminal.external.models.ConnectionTokenException
import com.stripe.stripeterminal.external.callable.ConnectionTokenProvider
import com.stripe.stripeterminal.external.callable.ReaderCallback
import com.stripe.stripeterminal.external.callable.PaymentIntentCallback
import com.stripe.stripeterminal.external.callable.TerminalListener
import com.stripe.stripeterminal.external.models.ConnectionConfiguration
import com.stripe.stripeterminal.external.models.ConnectionStatus
import com.stripe.stripeterminal.external.models.DiscoveryConfiguration
import com.stripe.stripeterminal.external.models.PaymentIntent
import com.stripe.stripeterminal.external.models.PaymentStatus
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

class MainActivity : AppCompatActivity() {
    private val client = OkHttpClient()
    private val baseUrl by lazy { BuildConfig.BASE_URL ?: "http://10.0.2.2:4000" }
    private var amountCents: Long = 0
    private val prefs by lazy { getSharedPreferences("terminal_prefs", MODE_PRIVATE) }
    private var events: List<Pair<String, String>> = emptyList()
    private var selectedEventId: String = "evt_local"

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

        ensurePermissionsAndInit()
    // Always try auto-connect; if it fails, manual button stays available
    alwaysAutoConnect(findViewById(R.id.txtLog), findViewById(R.id.txtStatus))

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
                btnPay.isEnabled = Terminal.isInitialized() && Terminal.getInstance().connectedReader != null && amountCents in 1..99_999_999
            }
        }
        // 00 button appends two zeros
        findViewById<Button>(R.id.btnK00)?.setOnClickListener {
            val next = amountCents * 100
            amountCents = if (next > 99_999_999L) 99_999_999L else next
            updateAmountDisplay(txtAmount)
            btnPay.isEnabled = Terminal.isInitialized() && Terminal.getInstance().connectedReader != null && amountCents in 1..99_999_999
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
            // Preconditions
            if (!Terminal.isInitialized()) {
                runOnUiThread { logView.append("\nTerminal no inicializado. Pulsa Conectar primero.") }
                return@setOnClickListener
            }
            if (Terminal.getInstance().connectedReader == null) {
                runOnUiThread { logView.append("\nNingún lector conectado. Pulsa Conectar primero.") }
                return@setOnClickListener
            }

            // Validate amount in cents (1..99_999_999)
            val amtParsed = amountCents
            if (amtParsed < 1L || amtParsed > 99_999_999L) {
                runOnUiThread { logView.append("\nMonto inválido. Usa centavos entre 1 y 99,999,999.") }
                return@setOnClickListener
            }
            val amt = amtParsed.toInt()
            val eventId = selectedEventId
            // Create PaymentIntent on backend
            val payload = JSONObject(mapOf("eventId" to eventId, "amount" to amt, "currency" to "usd")).toString()
            val req = try {
                Request.Builder()
                    .url("$baseUrl/payments/intents")
                    .post(payload.toRequestBody("application/json".toMediaType()))
                    .build()
            } catch (e: Exception) {
                runOnUiThread { logView.append("\nURL inválida: $baseUrl") }
                return@setOnClickListener
            }
            client.newCall(req).enqueue(SimpleCallback(onFailure = {
                runOnUiThread { logView.append("\nPI create error: ${it.message}") }
            }, onResponse = { resp ->
                resp.use {
                    val status = it.code
                    val body = it.body?.string() ?: "{}"
                    if (!it.isSuccessful) {
                        val preview = body.take(500)
                        runOnUiThread { logView.append("\nPI create HTTP ${status}. Respuesta: ${preview}") }
                        return@use
                    }
                    val json = try { JSONObject(body) } catch (e: Exception) { JSONObject("{}") }
                    val clientSecret = json.optString("clientSecret")
                    if (clientSecret.isNullOrEmpty()) {
                        val errMsg = json.optString("error", json.optString("message", ""))
                        val hint = if (errMsg.isNotBlank()) " ($errMsg)" else ""
                        runOnUiThread { logView.append("\nNo clientSecret returned${hint}. Cuerpo: ${body.take(500)}") }
                        return@use
                    }
                    Terminal.getInstance().retrievePaymentIntent(clientSecret, object : PaymentIntentCallback {
                        override fun onSuccess(paymentIntent: PaymentIntent) {
                            Terminal.getInstance().collectPaymentMethod(paymentIntent, object : PaymentIntentCallback {
                                override fun onSuccess(updatedIntent: PaymentIntent) {
                    Terminal.getInstance().confirmPaymentIntent(updatedIntent, object : PaymentIntentCallback {
                                        override fun onSuccess(pi: PaymentIntent) {
                                            runOnUiThread {
                                                logView.append("\nPayment ${pi.id} status ${pi.status}")
                                                showResult(true, amountCents, pi.id, null)
                                                // Reset amount
                                                amountCents = 0
                                                updateAmountDisplay(txtAmount)
                                                btnPay.isEnabled = false
                                                prefs.edit().putString("last_pi_id", pi.id).apply()
                                            }
                                        }
                                        override fun onFailure(e: TerminalException) {
                        runOnUiThread {
                            logView.append("\nConfirm error: ${e.message}")
                            showResult(false, amountCents, null, e.message)
                        }
                                        }
                                    })
                                }
                                override fun onFailure(e: TerminalException) {
                                    runOnUiThread { logView.append("\nCollect error: ${e.message}") }
                                }
                            })
                        }
                        override fun onFailure(e: TerminalException) {
                            runOnUiThread { logView.append("\nRetrieve PI error: ${e.message}") }
                        }
                    })
                }
            }))
        }

    // Report/Refund/Close Day moved to menu
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

    private fun initTerminal() {
        if (Terminal.isInitialized()) return
        val listener = object : TerminalListener {
            override fun onConnectionStatusChange(status: ConnectionStatus) {}
            override fun onPaymentStatusChange(status: PaymentStatus) {}
        }
        val tokenProvider = object : ConnectionTokenProvider {
            override fun fetchConnectionToken(callback: ConnectionTokenCallback) {
                val url = "$baseUrl/terminal/connection_token"
                val req = Request.Builder().url(url).post("".toRequestBody()).build()
                client.newCall(req).enqueue(SimpleCallback(onFailure = {
                    callback.onFailure(ConnectionTokenException("Failed to fetch token from $url: ${it.message}", it))
                }, onResponse = { resp ->
                    resp.use {
                        val status = it.code
                        val body = it.body?.string() ?: "{}"
                        if (!it.isSuccessful) {
                            callback.onFailure(ConnectionTokenException("Token HTTP ${status} from $url. Body: ${body.take(300)}"))
                            return@use
                        }
                        val secret = try { JSONObject(body).optString("secret") } catch (e: Exception) { "" }
                        if (secret.isNullOrEmpty()) callback.onFailure(ConnectionTokenException("Empty token from $url. Body: ${body.take(300)}"))
                        else callback.onSuccess(secret)
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
        if (!Terminal.isInitialized()) return
        if (Terminal.getInstance().connectedReader != null) return
        val preferredSerial = prefs.getString("last_serial", null)
        val discoveryConfig = DiscoveryConfiguration.BluetoothDiscoveryConfiguration(
            timeout = 0, // continuous until onSuccess callback
            isSimulated = BuildConfig.SIMULATED
        )
        var connected = false
        Terminal.getInstance().discoverReaders(
            discoveryConfig,
            object : DiscoveryListener {
                override fun onUpdateDiscoveredReaders(readers: List<Reader>) {
                    if (connected || readers.isEmpty()) return
                    val reader = preferredSerial?.let { s -> readers.firstOrNull { it.serialNumber == s } } ?: readers.first()
                    val locationId = reader.location?.id ?: BuildConfig.TERMINAL_LOCATION_ID.takeIf { it.isNotEmpty() }
                    if (locationId == null) {
                        runOnUiThread { logView?.append("\nAuto-connect: falta locationId para ${reader.serialNumber}") }
                        return
                    }
                    val connCfg = ConnectionConfiguration.BluetoothConnectionConfiguration(
                        locationId = locationId,
                        bluetoothReaderListener = object : MobileReaderListener {
                            override fun onStartInstallingUpdate(update: ReaderSoftwareUpdate, cancelable: Cancelable?) {}
                            override fun onReportReaderSoftwareUpdateProgress(progress: Float) {}
                            override fun onFinishInstallingUpdate(update: ReaderSoftwareUpdate?, e: TerminalException?) {}
                            override fun onRequestReaderInput(options: ReaderInputOptions) {}
                            override fun onRequestReaderDisplayMessage(message: ReaderDisplayMessage) {}
                        }
                    )
                    Terminal.getInstance().connectReader(
                        reader,
                        connCfg,
                        object : ReaderCallback {
                            override fun onSuccess(reader: Reader) {
                                connected = true
                                runOnUiThread {
                                    logView?.append("\nAuto-connected to ${reader.serialNumber}")
                                    txtStatus?.text = "Lector: Conectado a ${reader.serialNumber}"
                                }
                                prefs.edit().putString("last_serial", reader.serialNumber).apply()
                            }
                            override fun onFailure(e: TerminalException) {
                                runOnUiThread {
                                    txtStatus?.text = "Lector: Error de conexión"
                                    logView?.append("\nAuto-connect error: ${e.message}")
                                }
                            }
                        }
                    )
                }
            },
            object : Callback {
                override fun onSuccess() {}
                override fun onFailure(e: TerminalException) {
                    runOnUiThread { logView?.append("\nAuto-discovery error: ${e.message}") }
                }
            }
        )
    }

    private fun updateAmountDisplay(txtAmount: TextView) {
        txtAmount.text = formatCurrency(amountCents)
    }

    private fun manualConnect(logView: TextView?, txtStatus: TextView?) {
        if (!Terminal.isInitialized()) {
            runOnUiThread { logView?.append("\nInicializando Terminal y permisos...") }
            ensurePermissionsAndInit()
            return
        }
        val discoveryConfig = DiscoveryConfiguration.BluetoothDiscoveryConfiguration(
            timeout = 0,
            isSimulated = BuildConfig.SIMULATED
        )
        var connected = false
        Terminal.getInstance().discoverReaders(
            discoveryConfig,
            object : DiscoveryListener {
                override fun onUpdateDiscoveredReaders(readers: List<Reader>) {
                    if (!connected && readers.isNotEmpty()) {
                        val reader = readers.first()
                        val locationId = reader.location?.id ?: BuildConfig.TERMINAL_LOCATION_ID.takeIf { it.isNotEmpty() }
                        if (locationId == null) {
                            runOnUiThread { logView?.append("\nCannot connect: missing location id for reader ${reader.serialNumber}") }
                            return
                        }
                        val connCfg = ConnectionConfiguration.BluetoothConnectionConfiguration(
                            locationId = locationId,
                            bluetoothReaderListener = object : MobileReaderListener {
                                override fun onStartInstallingUpdate(update: ReaderSoftwareUpdate, cancelable: Cancelable?) {}
                                override fun onReportReaderSoftwareUpdateProgress(progress: Float) {}
                                override fun onFinishInstallingUpdate(update: ReaderSoftwareUpdate?, e: TerminalException?) {}
                                override fun onRequestReaderInput(options: ReaderInputOptions) {}
                                override fun onRequestReaderDisplayMessage(message: ReaderDisplayMessage) {}
                            }
                        )
                        Terminal.getInstance().connectReader(
                            reader,
                            connCfg,
                            object : ReaderCallback {
                                override fun onSuccess(reader: Reader) {
                                    connected = true
                                    runOnUiThread {
                                        logView?.append("\nConnected to ${reader.serialNumber}")
                                        txtStatus?.text = "Lector: Conectado a ${reader.serialNumber}"
                                    }
                                    prefs.edit().putString("last_serial", reader.serialNumber).apply()
                                }
                                override fun onFailure(e: TerminalException) {
                                    runOnUiThread {
                                        txtStatus?.text = "Lector: Error de conexión"
                                        logView?.append("\nConnect error: ${e.message}")
                                    }
                                }
                            }
                        )
                    }
                }
            },
            object : Callback {
                override fun onSuccess() {}
                override fun onFailure(e: TerminalException) {
                    runOnUiThread { logView?.append("\nDiscovery error: ${e.message}") }
                }
            }
        )
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.main_menu, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        val logView = findViewById<TextView>(R.id.txtLog)
        val txtStatus = findViewById<TextView>(R.id.txtStatus)
        val txtEvent = findViewById<TextView>(R.id.txtEvent)
        when (item.itemId) {
            R.id.menu_connect -> {
                manualConnect(logView, txtStatus)
                return true
            }
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
        val req = Request.Builder().url("$baseUrl/events").get().build()
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

 
