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
    val eventCode: String
)

data class PaymentIntentResponse(
    val success: Boolean,
    val paymentIntent: PaymentIntentData?,
    val message: String?
)

data class PaymentIntentData(
    val id: String,
    @SerializedName("client_secret") val clientSecret: String,
    val amount: Long,
    val currency: String,
    val status: String
)

data class ApiError(
    val error: String,
    val message: String?
)
