# Multi-stage build para optimizar tamaño de imagen
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar package files
COPY package*.json ./
COPY tsconfig.json ./

# Instalar dependencias
RUN npm ci

# Copiar código fuente
COPY src/ ./src/
COPY prisma/ ./prisma/

# Generar Prisma client y compilar TypeScript
RUN npx prisma generate
RUN npm run build

# Imagen final optimizada
FROM node:20-alpine AS runner

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs
RUN adduser -S beapi -u 1001

WORKDIR /app
ENV NODE_ENV=production

# Copiar archivos necesarios desde builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# Cambiar ownership a usuario no-root
RUN chown -R beapi:nodejs /app
USER beapi

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health',(r)=>{process.exit(r.statusCode===200?0:1)})"

EXPOSE 4000

# Ejecutar migraciones y iniciar servidor
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
CMD ["node", "dist/index.js"]
