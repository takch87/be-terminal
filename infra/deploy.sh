#!/usr/bin/env bash
set -euo pipefail

# Usage: ./infra/deploy.sh
# Builds and deploys API + Nginx via docker compose prod file

cd "$(dirname "$0")/docker"

echo "Building images..."
docker compose -f docker-compose.prod.yml build --no-cache

echo "Starting stack..."
docker compose -f docker-compose.prod.yml up -d

echo "Services running. Checking health:"
sleep 2
echo "Testing API health:"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST http://localhost/terminal/connection_token || true
echo "Testing Backend Minimal health:"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost/healthz || true
