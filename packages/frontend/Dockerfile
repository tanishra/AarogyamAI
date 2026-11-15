# Build stage — monorepo root context required
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json package-lock.json ./
COPY packages/backend/package.json ./packages/backend/package.json
COPY packages/frontend/package.json ./packages/frontend/package.json

# Install workspace deps
RUN npm ci --workspace=packages/frontend --include-workspace-root=false

# Copy frontend source and build
COPY packages/frontend ./packages/frontend
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=packages/frontend

# Production stage
FROM node:20-alpine

WORKDIR /app

# Reinstall production deps only (next must be present for `next start`)
COPY package.json package-lock.json ./
COPY packages/backend/package.json ./packages/backend/package.json
COPY packages/frontend/package.json ./packages/frontend/package.json
RUN npm ci --omit=dev --workspace=packages/frontend --include-workspace-root=false

# Copy built output
COPY --from=builder /app/packages/frontend/.next ./packages/frontend/.next
COPY --from=builder /app/packages/frontend/public ./packages/frontend/public
COPY --from=builder /app/packages/frontend/next.config.ts ./packages/frontend/next.config.ts

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

WORKDIR /app/packages/frontend
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000

CMD ["npx", "next", "start"]
