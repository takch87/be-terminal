package com.beterminal.app.network

import com.google.gson.annotations.SerializedName

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

data class ConnectionTokenResponse(
    val secret: String
)

data class PaymentIntentRequest(
    val amount: Long,
    val eventCode: String,
    val flowType: String = "automatic"
)

// Actualizado para el nuevo flujo automático v2.0
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

data class NfcTapRequest(
    val paymentIntentId: String,
    val cardBrand: String = "visa",
    val last4: String = "4242"
)

data class NfcTapResponse(
    val success: Boolean,
    val status: String?,
    val paymentIntentId: String?,
    val completed: Boolean?,
    val requiresAction: Boolean?,
    val paymentMethodId: String?,
    val simulatedCard: SimulatedCard?,
    val message: String?
)

data class SimulatedCard(
    val brand: String,
    val last4: String,
    val type: String
)

data class ProcessNfcRequest(
    val paymentIntentId: String,
    val paymentMethodId: String
)

data class ProcessNfcResponse(
    val success: Boolean,
    val status: String?,
    val paymentIntentId: String?,
    val completed: Boolean?,
    val requiresAction: Boolean?,
    val paymentMethodId: String?,
    val message: String?
)

data class ApiError(
    val error: String,
    val message: String?
)
