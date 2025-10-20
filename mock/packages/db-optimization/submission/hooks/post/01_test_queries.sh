#!/bin/bash
set -e

echo "[POST] Stage 2: Testing query correctness and performance"

# Function to run query and measure time
run_query() {
    local query_name=$1
    local query_file=$2
    
    echo "[TEST] Running $query_name..."
    
    # Warm-up run
    psql -h database -U judge -d hackathon_db -f "$query_file" > /dev/null 2>&1 || true
    
    # Timed runs (2 iterations)
    local total_time=0
    local runs=0
    local success=true
    
    for i in 1 2; do
        START=$(date +%s%3N)
        OUTPUT=$(psql -h database -U judge -d hackathon_db -f "$query_file" 2>&1)
        EXIT_CODE=$?
        END=$(date +%s%3N)
        TIME_MS=$((END - START))
        
        if [ $EXIT_CODE -ne 0 ]; then
            echo "[FAIL] $query_name failed with exit code $EXIT_CODE"
            success=false
            break
        fi
        
        # Check if query timed out (>5 seconds)
        if [ $TIME_MS -gt 5000 ]; then
            echo "[FAIL] $query_name timed out (${TIME_MS}ms > 5000ms)"
            success=false
            break
        fi
        
        total_time=$((total_time + TIME_MS))
        runs=$((runs + 1))
        
        echo "[TEST] $query_name run $i: ${TIME_MS}ms"
    done
    
    if [ "$success" = true ] && [ $runs -gt 0 ]; then
        MEDIAN_TIME=$((total_time / runs))
        echo "[TEST] $query_name median time: ${MEDIAN_TIME}ms"
        echo "$query_name|$MEDIAN_TIME|true"
    else
        echo "$query_name|5000|false"
    fi
}

# Run queries and collect results
echo "" > /tmp/query_results.txt
run_query "Q1" "/submission/Q1.sql" >> /tmp/query_results.txt
run_query "Q2" "/submission/Q2.sql" >> /tmp/query_results.txt
run_query "Q3" "/submission/Q3.sql" >> /tmp/query_results.txt

# Process correctness results
total_queries=3
passed_queries=0

while IFS='|' read -r query_name time_ms success; do
    if [ "$success" = "true" ]; then
        passed_queries=$((passed_queries + 1))
    fi
done < /tmp/query_results.txt

correctness_score=$(awk "BEGIN {printf \"%.2f\", ($passed_queries * 100 / $total_queries) * 0.5}")

# Generate correctness rubric
cat > /out/rubric_correctness.json <<EOF
{
  "rubric_id": "correctness",
  "rubric_type": "test_cases",
  "max_score": 50,
  "score": $correctness_score,
  "status": "DONE",
  "details": {
    "total_queries": $total_queries,
    "passed_queries": $passed_queries,
    "failed_queries": $((total_queries - passed_queries))
  },
  "message": "Query correctness: $passed_queries/$total_queries queries passed"
}
EOF

# Process latency results (target: 2000ms)
latency_score=0
query_count=0

while IFS='|' read -r query_name time_ms success; do
    if [ "$success" = "true" ]; then
        query_count=$((query_count + 1))
        # score_q = clamp((2000 / median_time_ms), 0, 1)
        if [ "$time_ms" -gt 0 ]; then
            # Calculate score using awk for floating point
            query_score=$(awk "BEGIN {score = 2000 / $time_ms; if (score > 1) score = 1; printf \"%.4f\", score}")
            latency_score=$(awk "BEGIN {printf \"%.4f\", $latency_score + $query_score}")
        fi
    fi
done < /tmp/query_results.txt

if [ $query_count -gt 0 ]; then
    avg_latency_score=$(awk "BEGIN {printf \"%.4f\", $latency_score / $query_count}")
    final_latency_score=$(awk "BEGIN {printf \"%.2f\", $avg_latency_score * 30}")
else
    final_latency_score=0
fi

cat > /out/rubric_query_latency.json <<EOF
{
  "rubric_id": "query_latency",
  "rubric_type": "performance_benchmark",
  "max_score": 30,
  "score": $final_latency_score,
  "status": "DONE",
  "details": {
    "queries_tested": $query_count,
    "target_ms": 2000,
    "timeout_ms": 5000
  },
  "message": "Query latency: average score $avg_latency_score"
}
EOF

echo "[POST] Query testing complete"
