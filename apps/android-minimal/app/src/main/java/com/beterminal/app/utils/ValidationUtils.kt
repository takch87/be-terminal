package com.beterminal.app.utils

import java.text.DecimalFormat
import java.util.regex.Pattern

/**
 * Utilidades para validación y formateo
 */
object ValidationUtils {
    
    private val EMAIL_PATTERN = Pattern.compile(
        "[a-zA-Z0-9\\+\\.\\_\\%\\-\\+]{1,256}" +
        "\\@" +
        "[a-zA-Z0-9][a-zA-Z0-9\\-]{0,64}" +
        "(" +
        "\\." +
        "[a-zA-Z0-9][a-zA-Z0-9\\-]{0,25}" +
        ")+"
    )
    
    /**
     * Valida si un evento code tiene el formato correcto
     */
    fun isValidEventCode(eventCode: String?): Boolean {
        return !eventCode.isNullOrBlank() && 
               eventCode.length >= 3 && 
               eventCode.matches(Regex("^[A-Z0-9]+$"))
    }
    
    /**
     * Valida si un monto es válido
     */
    fun isValidAmount(amount: String?): Boolean {
        if (amount.isNullOrBlank()) return false
        
        return try {
            val value = amount.toDouble()
            value > 0 && value <= 999999.99
        } catch (e: NumberFormatException) {
            false
        }
    }
    
    /**
     * Formatea un monto para mostrar
     */
    fun formatAmount(amount: Double): String {
        val formatter = DecimalFormat("#,##0.00")
        return "$${formatter.format(amount)}"
    }
    
    /**
     * Convierte monto a centavos
     */
    fun amountToCents(amount: String): Int {
        return try {
            (amount.toDouble() * 100).toInt()
        } catch (e: NumberFormatException) {
            0
        }
    }
    
    /**
     * Convierte centavos a monto
     */
    fun centsToAmount(cents: Int): String {
        return String.format("%.2f", cents / 100.0)
    }
    
    /**
     * Valida URL
     */
    fun isValidUrl(url: String?): Boolean {
        return !url.isNullOrBlank() && 
               (url.startsWith("http://") || url.startsWith("https://"))
    }
    
    /**
     * Valida email
     */
    fun isValidEmail(email: String?): Boolean {
        return !email.isNullOrBlank() && EMAIL_PATTERN.matcher(email).matches()
    }
}
