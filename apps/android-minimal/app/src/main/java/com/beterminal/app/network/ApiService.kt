package com.beterminal.app.network

import retrofit2.Response
import retrofit2.http.*

interface ApiService {
    
    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>
    
    @GET("api/auth/user")
    suspend fun getUserInfo(@Header("Authorization") token: String): Response<UserInfo>
    
    // Stripe Terminal: obtiene un connection token desde backend (Location USA enforced)
    @GET("api/stripe/connection_token")
    suspend fun getConnectionToken(@Header("Authorization") token: String): Response<ConnectionTokenResponse>
    
    // Endpoint general (puede crear PIs para online con payment_method_types=["card"]) 
    @POST("api/stripe/payment_intent")
    suspend fun createPaymentIntent(
        @Header("Authorization") token: String,
        @Body request: PaymentIntentRequest
    ): Response<PaymentIntentResponse>

    // Tap to Pay: crea PIs con payment_method_types=["card_present"]. Usar para Terminal.
    @POST("api/stripe/payment_intent_auto")
    suspend fun createPaymentIntentAuto(
        @Header("Authorization") token: String,
        @Body request: PaymentIntentRequest
    ): Response<PaymentIntentResponse>
    
    @POST("api/stripe/confirm_payment")
    suspend fun confirmPayment(
        @Header("Authorization") token: String,
        @Body request: Map<String, String>
    ): Response<PaymentConfirmResponse>
    
    @GET("api/stripe/config")
    suspend fun getStripeConfig(
        @Header("Authorization") token: String
    ): Response<StripeConfigResponse>
    
    @GET("api/stripe/publishable-key")
    suspend fun getStripePublishableKey(): Response<StripeConfigResponse>

    // Transactions list for mobile
    @GET("api/transactions/recent")
    suspend fun getRecentTransactions(
        @Header("Authorization") token: String,
        @Query("limit") limit: Int = 20
    ): Response<TransactionsResponse>

    // Refund a payment intent
    @POST("api/stripe/refund")
    suspend fun refundPayment(
        @Header("Authorization") token: String,
        @Body request: RefundRequest
    ): Response<RefundResponse>
}
