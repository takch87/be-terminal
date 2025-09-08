# Imagen completa para desplegar el backend BeTerminal
FROM node:20-alpine

# Install build dependencies for native modules
RUN apk add --no-cache \
    make \
    g++ \
    python3 \
    sqlite

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S backend -u 1001

# Create directory for database and set permissions
RUN mkdir -p /app/data && chown -R backend:nodejs /app

USER backend

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8001/healthz', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

EXPOSE 8001

# Set database path to persistent volume
ENV DB_PATH=/app/data/database.sqlite

CMD ["node", "server.js"]

