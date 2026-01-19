# syntax=docker/dockerfile:1

FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build frontend
FROM base AS frontend-build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# Production image
FROM base AS runner
ENV NODE_ENV=production

# Copy built files
COPY --from=frontend-build /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server

# Expose port
EXPOSE 3000

# Start server
CMD ["bun", "run", "start"]
