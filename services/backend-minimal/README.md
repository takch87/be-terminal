BeTerminal – Backend mínimo (Node + Express)

Endpoints
- POST `/connection_token` → `{ secret }`
- POST `/create_payment_intent` → body: `{ amount_cents, currency?=mxn, description?, event_code? }` → `{ id, client_secret, status }`

Requisitos
- Node 18+
- Cuenta de Stripe con Terminal habilitado y Tap to Pay on Android si se usará en dispositivos elegibles.

Configurar
1. `cp .env.example .env`
2. Edita `.env` y coloca tu `STRIPE_SECRET_KEY`.

Ejecución local
```
npm install
npm run dev
```

Despliegue
- Cualquier VM o PaaS: configurar variables de entorno del `.env`.
- Docker (opcional): crear una imagen simple de Node con este directorio.

Notas
- Nunca expongas `STRIPE_SECRET_KEY` al cliente; solo desde este servidor se generan `connection_token` y `payment_intent`.
- El cliente Android llamará a `/connection_token` para inicializar Terminal y a `/create_payment_intent` para iniciar el cobro.

