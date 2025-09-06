Android – App mínima (Login + Monto)

Build
- `./gradlew :app:assembleDebug`
- APK: `app/build/outputs/apk/debug/app-debug.apk`

Instalación (ADB)
- `adb install -r app/build/outputs/apk/debug/app-debug.apk`

Notas
- Pantalla de Login: solo captura código de evento (sin lógica de auth por ahora).
- Pantalla de Venta: teclado numérico y botón Continuar (sin Stripe aún).
- Próximo paso: integrar Stripe Terminal (Tap to Pay) llamando al backend minimal.

