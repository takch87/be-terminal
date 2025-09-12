package com.beterminal.app.network

import com.google.gson.annotations.SerializedName

// --- Auth ---
data class LoginRequest(
    val username: String,
    val password: String,
    val eventCode: String
)

data class LoginResponse(
    val success: Boolean,
    val token: String?,
    val message: String?
)

data class UserInfo(
    val id: Int,
    val username: String,
    val email: String?
)

// Respuesta del backend para Stripe Terminal connection tokens
data class ConnectionTokenResponse(
    val secret: String,
    val success: Boolean? = null,
    val location: String? = null
)

// --- Payments ---
// amount: centavos (ej. $0.78 -> 78)
// eventCode: código libre para auditar/etiquetar el pago en metadata
data class PaymentIntentRequest(
    val amount: Long,
    val eventCode: String,
    val flowType: String = "automatic"
)

// Actualizado para el nuevo flujo automático v2.0
// Respuesta genérica de creación de PI (viene de /payment_intent o /payment_intent_auto)
data class PaymentIntentResponse(
    val success: Boolean,
    val clientSecret: String?,
    val status: String?,
    val paymentIntentId: String?,
    val completed: Boolean?,
    val requiresAction: Boolean?,
    val message: String?
)

data class PaymentIntentData(
    val id: String,
    @SerializedName("client_secret") val clientSecret: String,
    val amount: Long,
    val currency: String,
    val status: String
)

// Respuesta al confirmar un PI (no se usa en Tap to Pay, pero está para flujos online)
data class PaymentConfirmResponse(
    val success: Boolean,
    val status: String?,
    val paymentIntentId: String?,
    val completed: Boolean?,
    val requiresAction: Boolean?,
    val message: String?,
    val clientSecret: String?
)

// Configuración pública de Stripe (publishable key, etc.)
data class StripeConfigResponse(
    val success: Boolean,
    val publishable_key: String?,
    val test_mode: Boolean?,
    val error: String?
)

data class ApiError(
    val error: String,
    val message: String?
)
