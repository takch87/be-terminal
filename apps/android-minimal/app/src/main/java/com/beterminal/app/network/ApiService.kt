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
    
    @POST("api/stripe/payment_intent")
    suspend fun createPaymentIntent(
        @Header("Authorization") token: String,
        @Body request: PaymentIntentRequest
    ): Response<PaymentIntentResponse>
}
