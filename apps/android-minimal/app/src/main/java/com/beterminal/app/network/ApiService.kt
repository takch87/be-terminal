package com.beterminal.app.network

import retrofit2.Response
import retrofit2.http.*

interface ApiService {
    
    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>
    
    @GET("api/auth/user")
    suspend fun getUserInfo(@Header("Authorization") token: String): Response<UserInfo>
    
    @GET("api/stripe/connection_token")
    suspend fun getConnectionToken(@Header("Authorization") token: String): Response<ConnectionTokenResponse>
    
    // Corregido para usar el endpoint principal con flujo automático
    @POST("api/stripe/payment_intent")
    suspend fun createPaymentIntent(
        @Header("Authorization") token: String,
        @Body request: PaymentIntentRequest
    ): Response<PaymentIntentResponse>
    
    // Nuevo endpoint para simulación NFC
    @POST("api/stripe/nfc_tap")
    suspend fun simulateNfcTap(
        @Header("Authorization") token: String,
        @Body request: NfcTapRequest
    ): Response<NfcTapResponse>
    
    // Endpoint para procesar pago NFC real
    @POST("api/stripe/process_nfc")
    suspend fun processNfcPayment(
        @Header("Authorization") token: String,
        @Body request: ProcessNfcRequest
    ): Response<ProcessNfcResponse>
}
