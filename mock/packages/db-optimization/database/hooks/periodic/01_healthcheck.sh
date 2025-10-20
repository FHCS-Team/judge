#!/bin/sh
set -eu

# Health check for PostgreSQL database
# This runs periodically to verify the database is ready to accept connections

echo "[HEALTHCHECK] Checking PostgreSQL health..."

# Check if PostgreSQL is accepting connections
if pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" > /dev/null 2>&1; then
    echo "[HEALTHCHECK] PostgreSQL is healthy and accepting connections"
    exit 0
else
    echo "[HEALTHCHECK] PostgreSQL is not ready"
    exit 1
fi
