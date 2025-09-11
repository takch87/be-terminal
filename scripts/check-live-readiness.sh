#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://be.terminal.beticket.net}" # override with env BASE_URL
TOKEN="${TOKEN:-}" # Bearer token (provide with env TOKEN)

echo "== BeTerminal Live Readiness Check =="
date
echo "Base URL: $BASE_URL"

auth_header=()
if [[ -n "$TOKEN" ]]; then
  auth_header=(-H "Authorization: Bearer $TOKEN")
else
  echo "(i) TOKEN no provisto, se omitirá prueba de connection_token protegida"
fi

echo "-- /api/health"
curl -fsS "$BASE_URL/api/health" | jq -r '.' || { echo "Fallo health"; exit 1; }

echo "-- /api/stripe/location"
curl -fsS "$BASE_URL/api/stripe/location" | jq -r '.' || { echo "Fallo location"; exit 1; }

echo "-- /api/stripe/publishable-key"
curl -fsS "$BASE_URL/api/stripe/publishable-key" | jq -r '.' || { echo "Fallo publishable key"; exit 1; }

if [[ -n "$TOKEN" ]]; then
  echo "-- /api/stripe/connection_token"
  curl -fsS -X GET "$BASE_URL/api/stripe/connection_token" "${auth_header[@]}" | jq -r '.' || { echo "Fallo connection_token"; exit 1; }
fi

echo "Listo: verifique que secret, location y claves sean live (sk_live/pk_live) y que el location coincida."
