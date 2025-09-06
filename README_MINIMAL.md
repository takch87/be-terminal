BeTerminal – Quickstart Minimal (Android + Backend)

Este flujo mínimo permite probar una app Android con pantalla de login (código de evento) y pantalla de monto, junto a un backend Node que expone los endpoints básicos para Stripe Terminal.

Estructura
- apps/android-minimal: app Android (Kotlin + Material)
- services/backend-minimal: backend Node + Express (connection_token, create_payment_intent)

Android (APK de prueba)
- Requisitos: JDK 21+, Android SDK instalado.
- Build: `cd apps/android-minimal && ./gradlew :app:assembleDebug`
- APK: `apps/android-minimal/app/build/outputs/apk/debug/app-debug.apk`
- Instalar: `adb install -r apps/android-minimal/app/build/outputs/apk/debug/app-debug.apk`

Backend (Node + Express)
- Requisitos: Node 16+ (recomendado 18/20), Stripe Terminal habilitado en la cuenta.
- Configuración: `cd services/backend-minimal && cp .env.example .env` y define `STRIPE_SECRET_KEY`.
- Levantar: `npm ci --omit=dev && npm start`
- Salud: `GET /healthz`
- Endpoints:
  - `POST /connection_token` → `{ secret }`
  - `POST /create_payment_intent` → body `{ amount_cents, currency?=mxn, description?, event_code? }` → `{ id, client_secret, status }`

Despliegue backend
- PM2: `pm2 start server.js --name beterminal-backend`
- Docker: `docker build -t beterminal-backend services/backend-minimal && docker run -d -p 8080:8080 --env-file services/backend-minimal/.env beterminal-backend`

Integración Stripe Terminal (próximo paso)
- El cliente Android deberá inicializar el SDK de Stripe Terminal usando `/connection_token` y crear PaymentIntents via `/create_payment_intent`.
- Cuando definamos el backend final, moveremos estas rutas a `services/api` o agregaremos un gateway.

