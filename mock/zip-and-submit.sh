#!/bin/bash

# Script to package and submit a submission
# Usage: ./zip-and-submit.sh <submission_directory> <problem_id> [team_id]

set -e

API_BASE_URL="${API_BASE_URL:-http://localhost:3000/api}"
SUBMISSION_DIR="${1}"
PROBLEM_ID="${2}"
TEAM_ID="${3:-test-team}"

if [ $# -lt 2 ]; then
  echo "Usage: $0 <submission_directory> <problem_id> [team_id]"
  echo ""
  echo "Examples:"
  echo "  $0 mock/test-submission nodejs-api"
  echo "  $0 my-solution nodejs-api my-team"
  exit 1
fi

# Validate submission directory exists
if [ ! -d "$SUBMISSION_DIR" ]; then
  echo "Error: Submission directory '$SUBMISSION_DIR' does not exist"
  exit 1
fi

echo "=========================================="
echo "Packaging and Submitting Code"
echo "=========================================="
echo "Submission Directory: $SUBMISSION_DIR"
echo "Problem ID: $PROBLEM_ID"
echo "Team ID: $TEAM_ID"
echo "API Base URL: $API_BASE_URL"
echo ""

# Create temporary submission package
TEMP_DIR=$(mktemp -d)
SUBMISSION_PACKAGE="$TEMP_DIR/submission.tar.gz"

echo "Creating submission package..."
(cd "$SUBMISSION_DIR" && tar --exclude="node_modules" --exclude=".git*" --exclude=".DS_Store" -czf "$SUBMISSION_PACKAGE" .)

echo "Package created: $SUBMISSION_PACKAGE"
echo "Package size: $(du -h "$SUBMISSION_PACKAGE" | cut -f1)"
echo ""

# List contents for verification
echo "Package contents:"
tar -tzf "$SUBMISSION_PACKAGE" | head -20
echo ""

echo "=========================================="
echo "Submitting to API..."
echo "=========================================="
echo ""

# Submit via API
HTTP_CODE=$(curl -s -o "$TEMP_DIR/response.json" -w "%{http_code}" \
  -X POST "$API_BASE_URL/submissions" \
  -F "problem_id=$PROBLEM_ID" \
  -F "package_type=file" \
  -F "submission_file=@$SUBMISSION_PACKAGE" \
  -F "team_id=$TEAM_ID" \
  -F "submission_metadata={\"source\":\"cli\"}")

echo "HTTP Status Code: $HTTP_CODE"
echo ""
echo "Response Body:"
cat "$TEMP_DIR/response.json" | jq '.' || cat "$TEMP_DIR/response.json"
echo ""

if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
  SUBMISSION_ID=$(cat "$TEMP_DIR/response.json" | jq -r '.data.submission_id // .data.submissionId // .data.job_id')
  echo ""
  echo "✓ Submission created: $SUBMISSION_ID"
  echo ""
  echo "Check status with:"
  echo "  curl $API_BASE_URL/submissions/$SUBMISSION_ID | jq '.'"
  echo ""
  echo "Waiting for evaluation to complete..."

  # Poll until the submission is completed or failed (or timeout)
  POLL_INTERVAL=${POLL_INTERVAL:-2}
  TIMEOUT_SECONDS=${TIMEOUT_SECONDS:-600} # 10 minutes default
  ELAPSED=0
  STATUS="running"

  while [ $ELAPSED -lt $TIMEOUT_SECONDS ]; do
    RESP=$(curl -s "$API_BASE_URL/submissions/$SUBMISSION_ID")
    SUCCESS=$(echo "$RESP" | jq -r '.success // false')

    if [ "$SUCCESS" != "true" ]; then
      echo "Error fetching status:"
      echo "$RESP" | jq '.' || echo "$RESP"
      break
    fi

    STATUS=$(echo "$RESP" | jq -r '.data.status // "unknown"')
    EVAL_STATE=$(echo "$RESP" | jq -r '.data.evaluation_state // ""')

    echo "Status: $STATUS  Eval: $EVAL_STATE  (t=${ELAPSED}s)"

    if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ] || [ "$STATUS" = "cancelled" ]; then
      echo ""
      echo "Final result:"
      echo "$RESP" | jq '.data | {status, evaluation_state, result: .result}'

      if [ "$STATUS" = "completed" ]; then
        TOTAL=$(echo "$RESP" | jq -r '.data.result.totalScore // .data.result.total_score // ""')
        MAX=$(echo "$RESP" | jq -r '.data.result.maxScore // .data.result.max_score // ""')
        echo "\nScore: ${TOTAL}/${MAX}"
        EXIT_CODE=0
      else
        echo "\nSubmission did not complete successfully (status=$STATUS)"
        EXIT_CODE=1
      fi

      # Cleanup
      rm -rf "$TEMP_DIR"
      exit ${EXIT_CODE}
    fi

    sleep $POLL_INTERVAL
    ELAPSED=$((ELAPSED + POLL_INTERVAL))
  done

  echo "\nTimeout (${TIMEOUT_SECONDS}s) waiting for evaluation to finish."
  echo "You can keep checking with: curl $API_BASE_URL/submissions/$SUBMISSION_ID | jq '.'"
  rm -rf "$TEMP_DIR"
  exit 1
else
  echo ""
  echo "✗ Submission failed with status $HTTP_CODE"
  rm -rf "$TEMP_DIR"
  exit 1
fi
