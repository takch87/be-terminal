# be-terminal (Stripe Tap to Pay demo)

> Quickstart (Minimal): si buscas un flujo mínimo para probar de inmediato la app Android + backend, ve a `README_MINIMAL.md`. Allí están los pasos para compilar el APK (apps/android-minimal) y levantar el backend simple (services/backend-minimal).

Monorepo con:
- apps/web-dashboard (Next.js)
- services/api (Fastify + Stripe + Prisma)
- packages/shared (tipos/contratos)
- packages/sdk-client (cliente JS/TS para consumir la API)
- apps/android-terminal (skeleton; completar en Android Studio)
 - apps/android-minimal (app mínima para cobros; Login + Monto)
 - services/backend-minimal (backend mínimo Node + Express con endpoints de Terminal)

## Requisitos
- Node.js 18+
- npm 9+
- PostgreSQL (DATABASE_URL)
- Claves de Stripe (SECRET/PUBLISHABLE + WEBHOOK SECRET)
 - (Prod) Dominio para API y CORS_ORIGIN configurado

## Primeros pasos
1) Copia `.env.example` a `.env` y completa variables.
2) Instala dependencias en el monorepo:

```
npm install --workspaces
```

3) Arranca la API (puerto 4000 por defecto):

```
npm run dev:api -w be-terminal
```

4) Arranca el dashboard (puerto 3001):

```
npm run dev:web -w be-terminal
```

5) (Opcional) Ejecuta migraciones Prisma desde `services/api`:

```
npm run prisma:migrate -w services/api
```

## Flujo
- Dispositivo inicia sesión (login) y recibe JWT.
- Selecciona evento activo.
- Crea PaymentIntent con `POST /payments/intents`.
- Terminal SDK cobra y procesa.
- Webhook actualiza `Transaction.status`.
- Dashboard muestra totales por evento/rango.

> Nota: La app Android aquí es un esqueleto. La lógica Tap to Pay y el SDK de Stripe Terminal deben configurarse en Android Studio siguiendo la guía de Stripe.

## Producción – Checklist rápida
- API compila: `services/api` con `npm run build` y arranca con `npm start`.
- Prisma migrations aplicadas (Docker lo hace con `prisma migrate deploy`).
- Variables definidas en el servidor: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, JWT_SECRET, DATABASE_URL, CORS_ORIGIN.
- Nginx proxy operativo (ver `infra/docker`), TLS delante (443→nginx:80).
- Webhook de Stripe apunta a `https://api.<dominio>/webhooks/stripe` y firmado.
- Dashboard construye con `NEXT_PUBLIC_API_URL` apuntando a la API.
