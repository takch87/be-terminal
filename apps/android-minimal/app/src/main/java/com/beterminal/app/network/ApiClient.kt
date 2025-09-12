package com.beterminal.app.network

import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import java.util.concurrent.TimeUnit

object ApiClient {
    // Actualizado para usar el backend-minimal con flujo automático
    private const val BASE_URL = "https://be.terminal.beticket.net/"
    
    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        })
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val retrofit = Retrofit.Builder()
        .baseUrl(BASE_URL)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    private val apiService = retrofit.create(ApiService::class.java)

    suspend fun login(request: LoginRequest): Response<LoginResponse> {
        return apiService.login(request)
    }

    suspend fun getUserInfo(token: String): Response<UserInfo> {
        return apiService.getUserInfo("Bearer $token")
    }

    suspend fun getConnectionToken(token: String): Response<ConnectionTokenResponse> {
        return apiService.getConnectionToken("Bearer $token")
    }

    suspend fun createPaymentIntent(token: String, request: PaymentIntentRequest): Response<PaymentIntentResponse> {
        return apiService.createPaymentIntent("Bearer $token", request)
    }

    // Nuevo wrapper para el endpoint automático con card_present
    suspend fun createPaymentIntentAuto(token: String, request: PaymentIntentRequest): Response<PaymentIntentResponse> {
        return apiService.createPaymentIntentAuto("Bearer $token", request)
    }

    suspend fun confirmPayment(token: String, request: Map<String, String>): Response<PaymentConfirmResponse> {
        return apiService.confirmPayment("Bearer $token", request)
    }

    suspend fun getStripeConfig(token: String): Response<StripeConfigResponse> {
        return apiService.getStripeConfig("Bearer $token")
    }
    
    suspend fun getStripePublishableKey(): Response<StripeConfigResponse> {
        return apiService.getStripePublishableKey()
    }
}
