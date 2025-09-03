# Keep Stripe Terminal models
-keep class com.stripe.** { *; }

# Keep SLF4J interfaces and prevent R8 from treating missing binders as errors
-dontwarn org.slf4j.**
-keep class org.slf4j.** { *; }
