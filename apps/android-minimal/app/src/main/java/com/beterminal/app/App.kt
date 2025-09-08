package com.beterminal.app

import android.app.Application
import com.stripe.android.PaymentConfiguration

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        
        // Inicializar Stripe SDK (no Terminal, usaremos NFC + PaymentIntents)
        // La publishable key se configurará dinámicamente desde el backend
        android.util.Log.i("App", "BeTerminal App initialized")
    }
    
    fun initializeStripe(publishableKey: String) {
        try {
            PaymentConfiguration.init(applicationContext, publishableKey)
            android.util.Log.i("App", "Stripe SDK initialized with publishable key")
        } catch (e: Exception) {
            android.util.Log.e("App", "Failed to initialize Stripe SDK", e)
        }
    }
}

