package com.datafono.terminal

import android.app.Application
import com.stripe.stripeterminal.TerminalApplicationDelegate

class StripeTerminalApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        TerminalApplicationDelegate.onCreate(this)
    }
}
