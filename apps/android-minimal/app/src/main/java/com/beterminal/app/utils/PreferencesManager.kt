package com.beterminal.app.utils

import android.content.Context
import android.content.SharedPreferences
import android.util.Log

/**
 * Utilidad para manejar configuraciones y preferencias de la app
 */
object PreferencesManager {
    private const val PREFS_NAME = "BeTerminalPrefs"
    private const val KEY_AUTH_TOKEN = "auth_token"
    private const val KEY_EVENT_CODE = "event_code"
    private const val KEY_LAST_TRANSACTION = "last_transaction"
    private const val KEY_BASE_URL = "base_url"
    
    fun saveAuthToken(context: Context, token: String) {
        getPrefs(context).edit().putString(KEY_AUTH_TOKEN, token).apply()
    }
    
    fun getAuthToken(context: Context): String? {
        return getPrefs(context).getString(KEY_AUTH_TOKEN, null)
    }
    
    fun saveEventCode(context: Context, eventCode: String) {
        getPrefs(context).edit().putString(KEY_EVENT_CODE, eventCode).apply()
    }
    
    fun getEventCode(context: Context): String? {
        return getPrefs(context).getString(KEY_EVENT_CODE, "EVT001")
    }
    
    fun saveLastTransaction(context: Context, transactionId: String) {
        getPrefs(context).edit().putString(KEY_LAST_TRANSACTION, transactionId).apply()
    }
    
    fun getLastTransaction(context: Context): String? {
        return getPrefs(context).getString(KEY_LAST_TRANSACTION, null)
    }
    
    fun saveBaseUrl(context: Context, url: String) {
        getPrefs(context).edit().putString(KEY_BASE_URL, url).apply()
    }
    
    fun getBaseUrl(context: Context): String {
        return getPrefs(context).getString(KEY_BASE_URL, "https://be.terminal.beticket.net") ?: "https://be.terminal.beticket.net"
    }
    
    fun clearAll(context: Context) {
        getPrefs(context).edit().clear().apply()
    }
    
    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }
}
