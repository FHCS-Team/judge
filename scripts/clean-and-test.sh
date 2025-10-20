#!/bin/bash

##############################################
# Clean Test Run - Full System Reset & Test
##############################################

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_header() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC} ${MAGENTA}$1${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════╝${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

print_header "CLEAN TEST RUN - Full System Reset"

# ============================================================================
# Phase 1: Clean Server Data
# ============================================================================
print_header "Phase 1: Clean Server Data"

print_info "Stopping any running judgehost server..."
pkill -f "node.*src/server" || true
sleep 2
print_success "Server processes stopped"

print_info "Cleaning data directories..."
rm -rf data/problems/* 2>/dev/null || true
rm -rf data/submissions/* 2>/dev/null || true
rm -rf data/results/* 2>/dev/null || true
rm -rf data/logs/* 2>/dev/null || true
rm -rf test-evaluation-output/* 2>/dev/null || true

# Recreate directories
mkdir -p data/problems
mkdir -p data/submissions
mkdir -p data/results
mkdir -p data/logs
mkdir -p test-evaluation-output

print_success "Server data cleaned"

# ============================================================================
# Phase 2: Clean Docker Data
# ============================================================================
print_header "Phase 2: Clean Docker Data"

print_info "Checking Docker connectivity..."
if ! docker ps &> /dev/null; then
    print_error "Cannot connect to Docker daemon"
    exit 1
fi
print_success "Docker is accessible"

print_info "Stopping and removing judgehost containers..."
CONTAINERS=$(docker ps -a --filter "name=eval-" --format "{{.Names}}" 2>/dev/null || true)
if [ ! -z "$CONTAINERS" ]; then
    echo "$CONTAINERS" | xargs -r docker rm -f 2>/dev/null || true
    print_success "Removed $(echo "$CONTAINERS" | wc -l) containers"
else
    print_info "No evaluation containers found"
fi

print_info "Removing judgehost images..."
IMAGES=$(docker images --filter "reference=problem-*" --format "{{.Repository}}:{{.Tag}}" 2>/dev/null || true)
if [ ! -z "$IMAGES" ]; then
    echo "$IMAGES" | xargs -r docker rmi -f 2>/dev/null || true
    print_success "Removed $(echo "$IMAGES" | wc -l) images"
else
    print_info "No problem images found"
fi

print_info "Removing judgehost networks..."
NETWORKS=$(docker network ls --filter "name=judgehost-" --format "{{.Name}}" 2>/dev/null || true)
if [ ! -z "$NETWORKS" ]; then
    echo "$NETWORKS" | xargs -r docker network rm 2>/dev/null || true
    print_success "Removed $(echo "$NETWORKS" | wc -l) networks"
else
    print_info "No judgehost networks found"
fi

print_success "Docker data cleaned"

# ============================================================================
# Phase 3: Verify Mock Data
# ============================================================================
print_header "Phase 3: Verify Mock Data"

PROBLEM_DIR="$PROJECT_ROOT/mock/packages/db-optimization"
SUBMISSION_DIR="$PROJECT_ROOT/mock/packages/db-optimization-submission-sample"

if [ ! -d "$PROBLEM_DIR" ]; then
    print_error "Problem package not found: $PROBLEM_DIR"
    exit 1
fi
print_success "Problem package found"

if [ ! -f "$PROBLEM_DIR/config.json" ]; then
    print_error "Problem config.json not found"
    exit 1
fi
print_success "Problem config.json found"

PROBLEM_ID=$(jq -r '.problem_id' "$PROBLEM_DIR/config.json")
PROBLEM_NAME=$(jq -r '.problem_name' "$PROBLEM_DIR/config.json")
print_info "Problem ID: $PROBLEM_ID"
print_info "Problem Name: $PROBLEM_NAME"

if [ ! -d "$SUBMISSION_DIR" ]; then
    print_error "Submission package not found: $SUBMISSION_DIR"
    exit 1
fi
print_success "Submission package found"

# ============================================================================
# Phase 4: Start Server
# ============================================================================
print_header "Phase 4: Start Judgehost Server"

print_info "Starting server in background..."
npm start > data/logs/server.log 2>&1 &
SERVER_PID=$!
print_info "Server PID: $SERVER_PID"

print_info "Waiting for server to start..."
for i in {1..30}; do
    if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
        print_success "Server is running"
        break
    fi
    if [ $i -eq 30 ]; then
        print_error "Server failed to start"
        cat data/logs/server.log
        kill $SERVER_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

# ============================================================================
# Phase 5: Register Problem
# ============================================================================
print_header "Phase 5: Register Problem"

print_info "Zipping problem package..."
PROBLEM_ZIP="$PROJECT_ROOT/mock/db-optimization.zip"
rm -f "$PROBLEM_ZIP"
cd "$PROBLEM_DIR"
zip -r "$PROBLEM_ZIP" . > /dev/null 2>&1
cd "$PROJECT_ROOT"
print_success "Problem package zipped"

print_info "Registering problem via API..."
REGISTER_RESPONSE=$(curl -s -X POST http://localhost:3000/api/problems \
  -F "problem_package=@$PROBLEM_ZIP" \
  -F "problem_id=$PROBLEM_ID" \
  -F "problem_name=$PROBLEM_NAME" \
  -F "package_type=file")

if echo "$REGISTER_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    print_success "Problem registered successfully"
    echo "$REGISTER_RESPONSE" | jq '.'
else
    print_error "Failed to register problem"
    echo "$REGISTER_RESPONSE" | jq '.' || echo "$REGISTER_RESPONSE"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi

print_info "Waiting for problem processing..."
sleep 3

# ============================================================================
# Phase 6: Submit Submission
# ============================================================================
print_header "Phase 6: Submit Submission"

print_info "Zipping submission package..."
SUBMISSION_ZIP="$PROJECT_ROOT/mock/db-optimization-submission.zip"
rm -f "$SUBMISSION_ZIP"
cd "$SUBMISSION_DIR"
zip -r "$SUBMISSION_ZIP" . > /dev/null 2>&1
cd "$PROJECT_ROOT"
print_success "Submission package zipped"

SUBMISSION_ID="test-submission-$(date +%s)"
print_info "Submission ID: $SUBMISSION_ID"

print_info "Submitting via API..."
SUBMIT_RESPONSE=$(curl -s -X POST http://localhost:3000/api/submissions \
  -F "submission_file=@$SUBMISSION_ZIP" \
  -F "submission_id=$SUBMISSION_ID" \
  -F "problem_id=$PROBLEM_ID" \
  -F "team_id=test-team" \
  -F "package_type=file")

if echo "$SUBMIT_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    print_success "Submission accepted"
    echo "$SUBMIT_RESPONSE" | jq '.'
else
    print_error "Failed to submit"
    echo "$SUBMIT_RESPONSE" | jq '.' || echo "$SUBMIT_RESPONSE"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi

# ============================================================================
# Phase 7: Monitor Evaluation
# ============================================================================
print_header "Phase 7: Monitor Evaluation Progress"

print_info "Waiting for evaluation to complete..."
MAX_WAIT=300  # 5 minutes
ELAPSED=0

while [ $ELAPSED -lt $MAX_WAIT ]; do
    RESULT_RESPONSE=$(curl -s http://localhost:3000/api/results/$SUBMISSION_ID)
    
    if echo "$RESULT_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
        STATUS=$(echo "$RESULT_RESPONSE" | jq -r '.data.status')
        
        if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
            print_success "Evaluation completed with status: $STATUS"
            break
        else
            print_info "Status: $STATUS (${ELAPSED}s elapsed)"
        fi
    else
        print_info "Evaluation in progress... (${ELAPSED}s elapsed)"
    fi
    
    sleep 5
    ELAPSED=$((ELAPSED + 5))
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
    print_error "Evaluation timed out after ${MAX_WAIT}s"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi

# ============================================================================
# Phase 8: Fetch and Display Results
# ============================================================================
print_header "Phase 8: Fetch Results"

print_info "Fetching results..."
RESULT_RESPONSE=$(curl -s http://localhost:3000/api/results/$SUBMISSION_ID)

if echo "$RESULT_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    print_success "Results retrieved successfully"
    
    echo ""
    echo -e "${CYAN}=== Evaluation Results ===${NC}"
    echo ""
    
    STATUS=$(echo "$RESULT_RESPONSE" | jq -r '.data.status')
    TOTAL_SCORE=$(echo "$RESULT_RESPONSE" | jq -r '.data.total_score')
    MAX_SCORE=$(echo "$RESULT_RESPONSE" | jq -r '.data.max_score')
    PERCENTAGE=$(echo "scale=2; $TOTAL_SCORE * 100 / $MAX_SCORE" | bc)
    
    echo -e "${BLUE}Status:${NC} $STATUS"
    echo -e "${BLUE}Score:${NC}  $TOTAL_SCORE / $MAX_SCORE (${PERCENTAGE}%)"
    echo ""
    
    echo -e "${CYAN}Rubrics:${NC}"
    echo "$RESULT_RESPONSE" | jq -r '.data.rubric_scores[] | "  • \(.rubric_name): \(.score)/\(.max_score) (\(.status))"'
    
    echo ""
    echo -e "${CYAN}Full Response:${NC}"
    echo "$RESULT_RESPONSE" | jq '.'
    
else
    print_error "Failed to retrieve results"
    echo "$RESULT_RESPONSE" | jq '.' || echo "$RESULT_RESPONSE"
fi

# ============================================================================
# Phase 9: Fetch Logs
# ============================================================================
print_header "Phase 9: Fetch Logs"

print_info "Fetching execution logs..."
LOGS_RESPONSE=$(curl -s http://localhost:3000/api/results/$SUBMISSION_ID/logs)

if echo "$LOGS_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    print_success "Logs retrieved"
    echo ""
    echo -e "${CYAN}=== Execution Logs ===${NC}"
    echo "$LOGS_RESPONSE" | jq -r '.data.logs[] | "\(.container_id):\n\(.log)\n"' | head -100
else
    print_warning "Could not retrieve logs"
fi

# ============================================================================
# Phase 10: Fetch Artifacts
# ============================================================================
print_header "Phase 10: Fetch Artifacts"

print_info "Fetching artifacts list..."
ARTIFACTS_RESPONSE=$(curl -s http://localhost:3000/api/results/$SUBMISSION_ID/artifacts)

if echo "$ARTIFACTS_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    print_success "Artifacts list retrieved"
    echo ""
    echo -e "${CYAN}=== Artifacts ===${NC}"
    echo "$ARTIFACTS_RESPONSE" | jq -r '.data.artifacts[] | "  • \(.name) (\(.size_bytes) bytes)"'
else
    print_warning "Could not retrieve artifacts"
fi

# ============================================================================
# Phase 11: Verify File Outputs
# ============================================================================
print_header "Phase 11: Verify File Outputs"

RESULT_DIR="data/results/$SUBMISSION_ID"

if [ -d "$RESULT_DIR" ]; then
    print_success "Result directory exists: $RESULT_DIR"
    
    if [ -f "$RESULT_DIR/results.json" ]; then
        print_success "results.json exists"
    else
        print_warning "results.json not found"
    fi
    
    if [ -d "$RESULT_DIR/output" ]; then
        RUBRIC_COUNT=$(ls -1 "$RESULT_DIR/output"/rubric_*.json 2>/dev/null | wc -l)
        print_success "Found $RUBRIC_COUNT rubric files"
    else
        print_warning "output directory not found"
    fi
    
    if [ -d "$RESULT_DIR/logs" ]; then
        LOG_COUNT=$(ls -1 "$RESULT_DIR/logs"/*.log 2>/dev/null | wc -l)
        print_success "Found $LOG_COUNT log files"
    else
        print_warning "logs directory not found"
    fi
else
    print_error "Result directory not found: $RESULT_DIR"
fi

# ============================================================================
# Phase 12: Cleanup
# ============================================================================
print_header "Phase 12: Cleanup"

print_info "Stopping server..."
kill $SERVER_PID 2>/dev/null || true
sleep 2
print_success "Server stopped"

print_info "Removing temporary zips..."
rm -f "$PROBLEM_ZIP" "$SUBMISSION_ZIP"
print_success "Temporary files cleaned"

# ============================================================================
# Final Summary
# ============================================================================
print_header "Test Summary"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}  ${GREEN}✓ Clean test run completed successfully!${NC}        ${GREEN}║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Results Location:${NC} $RESULT_DIR"
echo -e "${CYAN}Submission ID:${NC}    $SUBMISSION_ID"
echo -e "${CYAN}Final Score:${NC}      $TOTAL_SCORE / $MAX_SCORE (${PERCENTAGE}%)"
echo ""

exit 0
