#!/bin/bash

# Test script for DOMserver result submission
# This script tests the judgehost's ability to submit results to DOMserver

set -e

JUDGEHOST_URL="${JUDGEHOST_URL:-http://localhost:3000}"
SUBMISSION_ID="${1:-test-submission-002}"

echo "================================================"
echo "Testing DOMserver Result Submission"
echo "================================================"
echo ""
echo "Judgehost URL: $JUDGEHOST_URL"
echo "Submission ID: $SUBMISSION_ID"
echo ""

# Function to make a request and pretty print the response
make_request() {
    local method="$1"
    local endpoint="$2"
    local description="$3"
    
    echo "----------------------------------------"
    echo "TEST: $description"
    echo "REQUEST: $method $endpoint"
    echo "----------------------------------------"
    
    response=$(curl -s -X "$method" "$JUDGEHOST_URL$endpoint")
    echo "$response" | jq . 2>/dev/null || echo "$response"
    echo ""
}

# Test 1: Get main results
make_request "GET" "/api/results/$SUBMISSION_ID" \
    "Get main evaluation results"

# Test 2: Get logs (all containers)
make_request "GET" "/api/results/$SUBMISSION_ID/logs" \
    "Get all logs"

# Test 3: Get metrics
make_request "GET" "/api/results/$SUBMISSION_ID/metrics" \
    "Get evaluation metrics"

# Test 4: List artifacts
make_request "GET" "/api/results/$SUBMISSION_ID/artifacts" \
    "List all artifacts"

# Test 5: Get specific rubric
make_request "GET" "/api/results/$SUBMISSION_ID/rubric/correctness" \
    "Get correctness rubric details"

# Test 6: Try to get logs for specific container (if logs directory exists)
if [ -d "./data/results/$SUBMISSION_ID/logs" ]; then
    # Get first log file name
    first_log=$(ls ./data/results/$SUBMISSION_ID/logs/*.log 2>/dev/null | head -1 | xargs basename | sed 's/.log$//')
    if [ -n "$first_log" ]; then
        make_request "GET" "/api/results/$SUBMISSION_ID/logs/$first_log" \
            "Get logs for container: $first_log"
    fi
fi

echo "================================================"
echo "Test URLs that DOMserver would use:"
echo "================================================"
echo ""
echo "Logs URL:"
echo "  $JUDGEHOST_URL/api/results/$SUBMISSION_ID/logs"
echo ""
echo "Metrics URL:"
echo "  $JUDGEHOST_URL/api/results/$SUBMISSION_ID/metrics"
echo ""
echo "Artifacts URL:"
echo "  $JUDGEHOST_URL/api/results/$SUBMISSION_ID/artifacts"
echo ""
echo "================================================"
echo "Example DOMserver submission payload:"
echo "================================================"
echo ""

# Generate example payload based on actual results
if curl -s "$JUDGEHOST_URL/api/results/$SUBMISSION_ID" | jq -e . >/dev/null 2>&1; then
    result=$(curl -s "$JUDGEHOST_URL/api/results/$SUBMISSION_ID")
    
    cat <<EOF | jq .
{
  "judge_task_id": 12345,
  "submission_id": "$SUBMISSION_ID",
  "problem_id": $(echo "$result" | jq -r '.data.problem_id // "unknown"'),
  "status": "completed",
  "started_at": "$(date -u -Iseconds)",
  "completed_at": "$(date -u -Iseconds)",
  "execution_time_seconds": 345.123,
  "rubrics": $(echo "$result" | jq '.data.rubric_scores // []' | jq 'map({
    rubric_id: .rubric_id,
    name: .rubric_name,
    rubric_type: .rubric_type,
    score: .score,
    max_score: .max_score,
    percentage: .percentage,
    status: .status,
    message: .message,
    details: .details
  })'),
  "logs_url": "$JUDGEHOST_URL/api/results/$SUBMISSION_ID/logs",
  "artifacts_urls": {
    "metrics": "$JUDGEHOST_URL/api/results/$SUBMISSION_ID/metrics"
  },
  "metadata": {
    "judgehost_version": "1.0.0",
    "judgehost_hostname": "$(hostname)",
    "evaluation_method": "containerized_hooks"
  }
}
EOF
else
    echo "Could not fetch results to generate example payload"
fi

echo ""
echo "================================================"
echo "Tests completed!"
echo "================================================"
