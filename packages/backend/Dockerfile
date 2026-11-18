# Build stage — monorepo root context required
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json package-lock.json ./
COPY packages/backend/package.json ./packages/backend/package.json
COPY packages/frontend/package.json ./packages/frontend/package.json

# Install workspace deps (hoisted to root node_modules)
RUN npm ci --workspace=packages/backend --include-workspace-root=false

# Copy backend source and build
COPY packages/backend ./packages/backend
RUN npm run build --workspace=packages/backend

# Production stage
FROM node:20-alpine

WORKDIR /app

# Reinstall production deps only
COPY package.json package-lock.json ./
COPY packages/backend/package.json ./packages/backend/package.json
RUN npm ci --omit=dev --workspace=packages/backend --include-workspace-root=false

# Copy built output + migration SQL files (runner reads *.sql next to itself)
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/backend/src/migrations/*.sql ./packages/backend/dist/migrations/

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p /app/packages/backend/storage/reports && \
    chown -R nodejs:nodejs /app/packages/backend/storage

USER nodejs

WORKDIR /app/packages/backend
EXPOSE 3001

CMD ["node", "dist/index.js"]
