# Claims Dashboard Dockerfile
# Multi-stage build for optimal production image

# Base stage with Bun runtime
FROM oven/bun:1.0-alpine AS base
WORKDIR /app

# Dependencies stage - install all packages
FROM base AS deps
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile || bun install

# Builder stage - build frontend and prepare server
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build frontend with Vite
RUN bun run build

# Production stage - minimal runtime image
FROM base AS runner
ENV NODE_ENV=production

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/package.json ./

# Install production dependencies only
RUN bun install --production --frozen-lockfile || bun install --production

# Add curl for healthcheck
RUN apk add --no-cache curl

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S dashboard -u 1001
USER dashboard

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start server (migrations run on startup)
CMD ["bun", "run", "start"]
