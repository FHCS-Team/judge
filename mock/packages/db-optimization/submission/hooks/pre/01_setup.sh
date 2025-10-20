#!/bin/bash
set -e

echo "[STAGE 1] Setting up submission tools and validation"

# Check if required files exist
if [ ! -f "/submission/migration.sql" ]; then
    echo "[ERROR] migration.sql not found in submission!"
    exit 1
fi

for i in 1 2 3; do
    if [ ! -f "/submission/Q${i}.sql" ]; then
        echo "[ERROR] Q${i}.sql not found in submission!"
        exit 1
    fi
done

echo "[STAGE 1] All required files present"

# Create query runner helper
cat > /workspace/run_query.sh <<'SCRIPT'
#!/bin/bash
QUERY_FILE=$1
OUTPUT_FILE=$2

START=$(date +%s%3N)
psql -h database -U judge -d hackathon_db -f "$QUERY_FILE" > "$OUTPUT_FILE" 2>&1
EXIT_CODE=$?
END=$(date +%s%3N)
TIME_MS=$((END - START))

echo "$TIME_MS|$EXIT_CODE"
SCRIPT

chmod +x /workspace/run_query.sh

echo "[STAGE 1] Setup complete"
