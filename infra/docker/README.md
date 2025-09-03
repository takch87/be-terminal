# Deploy (Option A: api subdomain)

1) DNS
- Create A/CNAME for `api.be-terminal.beticket.net` to your server.

2) Env
- On the server, export env vars (or create a .env next to docker-compose):
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
JWT_SECRET=...
DATABASE_URL=postgresql://user:pass@host:5432/be_terminal
```

3) Build & Run
```
# From repo root on your server
cd be-terminal/infra/docker
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

4) TLS
- Terminate TLS in front (e.g., Caddy, Traefik, or Nginx with certbot) and route 443 → nginx:80.
- If you want Nginx here to serve TLS directly, mount certs and add a server block on 443.

5) Verify
```
curl -X POST https://api.be-terminal.beticket.net/terminal/connection_token
```
Should return `{ "secret": "..." }`.

Notes
- API listens on 0.0.0.0:4000 inside container; Nginx proxies / → api:4000.
- Webhook endpoint: `https://api.be-terminal.beticket.net/webhooks/stripe`.
