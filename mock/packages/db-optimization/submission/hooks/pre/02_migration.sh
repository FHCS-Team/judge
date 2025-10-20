#!/bin/bash
set -e

echo "[STAGE 2] Applying submission migration to database"

# Wait for database to be ready
for i in {1..30}; do
  if pg_isready -h database -U judge -d hackathon_db 2>/dev/null; then
    echo "[STAGE 2] Database is ready"
    break
  fi
  echo "[STAGE 2] Waiting for database... ($i/30)"
  sleep 2
done

# Get initial database size
INITIAL_SIZE=$(cat /shared/initial_size.txt 2>/dev/null || echo "0")
echo "[STAGE 2] Initial database size: $INITIAL_SIZE bytes"

# Apply migration with timeout (5 minutes)
echo "[STAGE 2] Running migration.sql (5 minute timeout)..."
START_TIME=$(date +%s)

timeout 300 psql -h database -U judge -d hackathon_db -f /submission/migration.sql || {
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 124 ]; then
        echo "[ERROR] Migration timeout (>5 minutes)!"
        exit 1
    else
        echo "[ERROR] Migration failed with exit code $EXIT_CODE"
        exit $EXIT_CODE
    fi
}

END_TIME=$(date +%s)
MIGRATION_TIME=$((END_TIME - START_TIME))

# Record final size
FINAL_SIZE=$(psql -h database -U judge -d hackathon_db -t -c "SELECT pg_database_size('hackathon_db');")
EXTRA_SIZE=$((FINAL_SIZE - INITIAL_SIZE))

echo "[STAGE 2] Migration completed in ${MIGRATION_TIME} seconds"
echo "[STAGE 2] Final database size: $FINAL_SIZE bytes"
echo "[STAGE 2] Additional storage: $EXTRA_SIZE bytes"

# Save metrics for evaluation
mkdir -p /shared
EXTRA_PCT=$(awk "BEGIN {printf \"%.2f\", $EXTRA_SIZE * 100 / $INITIAL_SIZE}")
cat > /shared/migration_metrics.json <<EOF
{
  "migration_time_seconds": $MIGRATION_TIME,
  "initial_size_bytes": $INITIAL_SIZE,
  "final_size_bytes": $FINAL_SIZE,
  "extra_storage_bytes": $EXTRA_SIZE,
  "extra_storage_percentage": $EXTRA_PCT
}
EOF

echo "[STAGE 2] Migration complete"
