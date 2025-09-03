# Build and run Fastify API (Node 20 Alpine)
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies (include dev deps to build TS and Prisma client)
COPY package*.json ./
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Build TS
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime image
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy node_modules built artifacts and dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/dist ./dist

EXPOSE 4000
# Note: run migrations outside or add `npx prisma migrate deploy` in an entrypoint if desired
CMD ["node", "dist/index.js"]
