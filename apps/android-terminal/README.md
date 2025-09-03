# Android Terminal (Tap to Pay demo)

Este módulo es un esqueleto para probar cobros con Stripe Terminal (simulator o Tap to Pay on Android).

Requisitos
# Android Terminal app (debug)

This minimal app connects to a simulated Stripe Terminal reader and collects a payment using your backend.

Prereqs
- Android Studio Iguana+ and Android SDK 34
- Test device or emulator
- Backend running at `http://10.0.2.2:4000` (emulator) or reachable LAN URL for device

Configure
- Ensure API `services/api` is running and `.env` has valid Stripe test keys.
- For a physical device, set `APP_BASE_URL` via Android Studio Run configuration or .env injection; default is `http://10.0.2.2:4000`.

Build a debug APK
- From project root, open `apps/android-terminal` in Android Studio and build `appDebug`.
- Or via Gradle: `./gradlew :app:assembleDebug`.

Use
1) Launch the app
2) Tap “Connect simulated reader”
3) Enter amount in cents (default 500)
4) Tap “Collect & process”
5) Simulated reader will prompt; flow completes and prints status

Notes
- Location permission is required by Stripe Terminal.
- This sample uses the simulated reader (DiscoveryMethod.SIMULATED); switch to real readers later.