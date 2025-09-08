BeTerminal – Quickstart Minimal (Android + Backend)

Este flujo completo permite probar una app Android con pantalla de login (código de evento) y pantalla de monto, junto a un backend Node completo con autenticación, gestión de usuarios, eventos y APIs de Stripe Terminal.

Estructura
- apps/android-minimal: app Android (Kotlin + Material)
- services/backend-minimal: backend Node + Express completo con dashboard web

Android (APK de prueba)
- Requisitos: JDK 21+, Android SDK instalado.
- Build: `cd apps/android-minimal && ./gradlew :app:assembleDebug`
- APK: `apps/android-minimal/app/build/outputs/apk/debug/app-debug.apk`
- Instalar: `adb install -r apps/android-minimal/app/build/outputs/apk/debug/app-debug.apk`

Backend (Node + Express + SQLite + Dashboard)
- Requisitos: Node 16+ (recomendado 18/20), Stripe Terminal habilitado en la cuenta.
- Configuración: `cd services/backend-minimal && cp .env.example .env` y define `STRIPE_SECRET_KEY` y `JWT_SECRET`.
- Instalar: `npm ci --omit=dev`
- Levantar: `npm start`
- Dashboard: http://localhost:8001/dashboard
- Login: http://localhost:8001/login (admin/admin123)
- Salud: `GET /healthz` (disponible en https://be-terminal.beticket.net/healthz)

Funcionalidades del Backend:
- 🔐 Autenticación con JWT
- 👥 Gestión de usuarios
- 📅 Gestión de eventos con códigos
- 💳 APIs de Stripe Terminal completas
- 🌐 Dashboard web con interfaz gráfica
- 📱 APIs para validación desde terminal Android

Endpoints API:
  - `POST /api/auth/login` → Autenticación
  - `POST /api/users` → Crear usuarios (protegido)
  - `POST /api/events` → Crear eventos (protegido)
  - `GET /api/events` → Listar eventos (protegido)
  - `POST /api/events/validate` → Validar código de evento (público)
  - `POST /connection_token` → Token de conexión Stripe Terminal
  - `POST /create_payment_intent` → Crear intención de pago
  - `POST /webhooks/stripe` → Webhook de Stripe (opcional)

Despliegue backend
- PM2: `pm2 start server.js --name beterminal-backend`
- Docker: `docker build -t beterminal-backend services/backend-minimal && docker run -d -p 8001:8001 --env-file services/backend-minimal/.env beterminal-backend`
- Producción: disponible en https://be-terminal.beticket.net

Integración Stripe Terminal (próximo paso)
- El cliente Android deberá inicializar el SDK de Stripe Terminal usando `/connection_token` y crear PaymentIntents via `/create_payment_intent`.
- Cuando definamos el backend final, moveremos estas rutas a `services/api` o agregaremos un gateway.

