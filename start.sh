#!/bin/sh
# Claims Dashboard Startup Script
# Handles database migration and server startup

set -e

echo "=========================================="
echo "  Claims Dashboard - Starting"
echo "=========================================="
echo ""

# Configuration
MAX_RETRIES=${DB_CONNECT_RETRIES:-30}
RETRY_INTERVAL=${DB_CONNECT_INTERVAL:-2}

# Function to check database connectivity
check_db() {
    if [ -z "$DATABASE_URL" ]; then
        echo "[startup] DATABASE_URL not set, using SQLite (in-memory or file)"
        return 0
    fi

    echo "[startup] Checking database connectivity..."

    # Extract host and port from DATABASE_URL
    DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:/]*\).*/\1/p')
    DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')

    if [ -z "$DB_PORT" ]; then
        DB_PORT="5432"
    fi

    if [ -z "$DB_HOST" ]; then
        echo "[startup] Could not parse database host from DATABASE_URL"
        return 1
    fi

    echo "[startup] Attempting to connect to $DB_HOST:$DB_PORT..."

    # Try to connect using nc if available, otherwise skip check
    if command -v nc >/dev/null 2>&1; then
        if nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; then
            return 0
        fi
        return 1
    else
        # If nc not available, just try to continue
        echo "[startup] nc not available, skipping connection check"
        return 0
    fi
}

# Wait for database
wait_for_db() {
    if [ -z "$DATABASE_URL" ]; then
        return 0
    fi

    echo "[startup] Waiting for database..."

    retries=0
    until check_db; do
        retries=$((retries + 1))
        if [ $retries -ge $MAX_RETRIES ]; then
            echo "[startup] ERROR: Database not available after $MAX_RETRIES attempts"
            exit 1
        fi
        echo "[startup] Database not ready, waiting... (attempt $retries/$MAX_RETRIES)"
        sleep $RETRY_INTERVAL
    done

    echo "[startup] Database is ready!"
}

# Run database migrations
run_migrations() {
    if [ -z "$DATABASE_URL" ]; then
        echo "[startup] No DATABASE_URL, skipping migrations (using in-memory storage)"
        return 0
    fi

    if [ "$SKIP_MIGRATIONS" = "true" ]; then
        echo "[startup] SKIP_MIGRATIONS=true, skipping migrations"
        return 0
    fi

    echo "[startup] Running database migrations..."

    if [ -f "server/db/migrate.ts" ]; then
        bun run server/db/migrate.ts
        echo "[startup] Migrations completed successfully"
    else
        echo "[startup] No migration file found, skipping"
    fi
}

# Print configuration summary
print_config() {
    echo ""
    echo "[startup] Configuration:"
    echo "  - PORT: ${PORT:-3000}"
    echo "  - HOST: ${HOST:-0.0.0.0}"
    echo "  - NODE_ENV: ${NODE_ENV:-development}"
    echo "  - DATABASE: ${DATABASE_URL:+configured}${DATABASE_URL:-not set (using memory)}"
    echo "  - GITHUB_SYNC: ${GITHUB_OWNER:+enabled for $GITHUB_OWNER/$GITHUB_REPO}${GITHUB_OWNER:-disabled}"
    echo "  - ORCHESTRATOR: ${ORCHESTRATOR_ENABLED:-false} (max agents: ${ORCHESTRATOR_MAX_AGENTS:-1})"
    echo ""
}

# Main startup sequence
main() {
    print_config

    # Wait for database if configured
    wait_for_db

    # Run migrations
    run_migrations

    # Start orchestrator in background if enabled
    if [ "${ORCHESTRATOR_ENABLED:-false}" = "true" ]; then
        echo "[startup] Starting orchestrator in background..."
        bun run orchestrator/index.ts &
        ORCHESTRATOR_PID=$!
        echo "[startup] Orchestrator started (PID $ORCHESTRATOR_PID)"

        # Forward signals to orchestrator
        trap "kill $ORCHESTRATOR_PID 2>/dev/null; wait $ORCHESTRATOR_PID 2>/dev/null" EXIT
    fi

    echo "[startup] Starting Claims Dashboard server..."
    echo ""

    # Start the server
    exec bun run server/index.ts
}

# Run main
main
