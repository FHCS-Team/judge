#!/bin/bash
set -e

echo "[POST] Evaluating storage efficiency"

# Read migration metrics
if [ ! -f "/shared/migration_metrics.json" ]; then
    echo "[ERROR] Migration metrics not found!"
    exit 1
fi

INITIAL_SIZE=$(jq -r '.initial_size_bytes' /shared/migration_metrics.json)
EXTRA_SIZE=$(jq -r '.extra_storage_bytes' /shared/migration_metrics.json)

echo "[TEST] Base dataset: $INITIAL_SIZE bytes"
echo "[TEST] Additional storage: $EXTRA_SIZE bytes"

# Calculate storage efficiency score
# score_s = clamp(1 - (extra_storage / (0.3 * base_data_size)), 0, 1)
target_extra=$(awk "BEGIN {printf \"%.0f\", $INITIAL_SIZE * 0.3}")
storage_ratio=$(awk "BEGIN {printf \"%.4f\", $EXTRA_SIZE / $target_extra}")
storage_score=$(awk "BEGIN {score = 1 - $storage_ratio; if (score < 0) score = 0; if (score > 1) score = 1; printf \"%.4f\", score}")

final_score=$(awk "BEGIN {printf \"%.2f\", $storage_score * 10}")
extra_percentage=$(awk "BEGIN {printf \"%.2f\", $EXTRA_SIZE * 100 / $INITIAL_SIZE}")

cat > /out/rubric_resource_efficiency.json <<EOF
{
  "rubric_id": "resource_efficiency",
  "rubric_type": "resource_usage",
  "max_score": 10,
  "score": $final_score,
  "status": "DONE",
  "details": {
    "base_size_bytes": $INITIAL_SIZE,
    "extra_storage_bytes": $EXTRA_SIZE,
    "extra_storage_percentage": $extra_percentage,
    "target_percentage": 30
  },
  "message": "Storage: ${extra_percentage}% additional (target: ≤30%)"
}
EOF

echo "[POST] Storage efficiency evaluation complete"
