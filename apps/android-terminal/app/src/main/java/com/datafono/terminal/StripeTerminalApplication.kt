package com.datafono.terminal

import android.app.Application
import android.util.Log
import com.stripe.stripeterminal.TerminalApplicationDelegate

class StripeTerminalApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        TerminalApplicationDelegate.onCreate(this)
        // Simple crash logger to help diagnose unexpected crashes in the field
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            try {
                Log.e("TerminalApp", "Fatal in thread ${t.name}", e)
                val f = java.io.File(cacheDir, "crash.log")
                f.appendText("\n--- ${java.util.Date()} ---\n${Log.getStackTraceString(e)}\n")
            } catch (_: Exception) {}
        }
    }
}
