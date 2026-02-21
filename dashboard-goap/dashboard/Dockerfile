# Claims Dashboard - Production Dockerfile
# Multi-stage build for optimal image size

# ==============================================================================
# Stage 1: Base image with Bun runtime
# ==============================================================================
FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# ==============================================================================
# Stage 2: Install dependencies
# ==============================================================================
FROM base AS deps

# Copy package files
COPY package.json bun.lock ./

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# ==============================================================================
# Stage 3: Build application
# ==============================================================================
FROM base AS builder

# Copy all dependencies (including dev)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build frontend (Vite)
RUN bun run build

# ==============================================================================
# Stage 4: Production runtime
# ==============================================================================
FROM base AS runner

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 dashboard
USER dashboard

# Copy production dependencies
COPY --from=deps --chown=dashboard:nodejs /app/node_modules ./node_modules

# Copy built frontend assets
COPY --from=builder --chown=dashboard:nodejs /app/dist ./dist

# Copy server source (TypeScript files for Bun to run)
COPY --from=builder --chown=dashboard:nodejs /app/server ./server
COPY --from=builder --chown=dashboard:nodejs /app/package.json ./

# Copy startup script
COPY --chown=dashboard:nodejs start.sh ./
RUN chmod +x start.sh

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start server
CMD ["./start.sh"]
