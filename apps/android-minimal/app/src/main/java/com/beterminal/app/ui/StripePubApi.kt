package com.beterminal.app.ui

import retrofit2.Response
import retrofit2.http.GET

data class PubKeyResponse(
    val success: Boolean,
    val publishable_key: String?
)

interface StripePubApi {
    @GET("api/stripe/publishable-key")
    suspend fun getPublishableKey(): Response<PubKeyResponse>
}
