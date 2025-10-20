#!/bin/bash

# API Testing Script - Submission Evaluation
# Tests POST /api/submissions endpoint with test packages

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGES_DIR="$SCRIPT_DIR/../mock/packages"
API_BASE="http://localhost:3000/api"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_info() { echo -e "${YELLOW}ℹ${NC} $1"; }
log_header() { echo -e "${BLUE}▶${NC} $1"; }

echo "======================================"
echo "API Testing - Submission Evaluation"
echo "API Base: $API_BASE"
echo "======================================"
echo ""

# Test 1: Submit correct two-sum solution
test_submit_two_sum_correct() {
    log_header "Test 1: Submit correct two-sum solution"
    
    # Check if package exists
    if [ ! -f "$PACKAGES_DIR/two-sum-submission-correct.tar.gz" ]; then
        log_error "Submission package not found: two-sum-submission-correct.tar.gz"
        return 1
    fi
    
    log_info "Uploading two-sum-submission-correct.tar.gz..."
    
    # Submit to two-sum problem
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -F "submission_file=@$PACKAGES_DIR/two-sum-submission-correct.tar.gz" \
        -F "problem_id=two-sum" \
        -F "package_type=file" \
        "$API_BASE/submissions")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)
    
    echo "Response: $BODY"
    
    if [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 200 ]; then
        log_success "Submission accepted (HTTP $HTTP_CODE)"
        
        # Extract submission_id from response
        SUBMISSION_ID=$(echo "$BODY" | grep -o '"submission_id":"[^"]*"' | cut -d'"' -f4)
        if [ -n "$SUBMISSION_ID" ]; then
            log_success "Submission ID: $SUBMISSION_ID"
            echo "$SUBMISSION_ID" > /tmp/judgehost-test-submission-two-sum-correct.txt
            
            # Wait for evaluation to complete
            log_info "Waiting for evaluation to complete..."
            for i in {1..30}; do
                sleep 2
                STATUS_RESPONSE=$(curl -s "$API_BASE/results/$SUBMISSION_ID")
                STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
                
                if [ "$STATUS" = "completed" ] || [ "$STATUS" = "COMPLETED" ]; then
                    log_success "Evaluation completed!"
                    echo "$STATUS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$STATUS_RESPONSE"
                    break
                elif [ "$STATUS" = "failed" ] || [ "$STATUS" = "FAILED" ]; then
                    log_error "Evaluation failed!"
                    echo "$STATUS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$STATUS_RESPONSE"
                    return 1
                fi
                
                log_info "Status: $STATUS (attempt $i/30)"
            done
        fi
        
        log_success "Test 1 PASSED"
        return 0
    else
        log_error "Submission failed (HTTP $HTTP_CODE)"
        log_error "Response: $BODY"
        return 1
    fi
}

# Test 2: Submit partial two-sum solution
test_submit_two_sum_partial() {
    log_header "Test 2: Submit partial two-sum solution"
    
    if [ ! -f "$PACKAGES_DIR/two-sum-submission-partial.tar.gz" ]; then
        log_error "Submission package not found: two-sum-submission-partial.tar.gz"
        return 1
    fi
    
    log_info "Uploading two-sum-submission-partial.tar.gz..."
    
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -F "submission_file=@$PACKAGES_DIR/two-sum-submission-partial.tar.gz" \
        -F "problem_id=two-sum" \
        -F "package_type=file" \
        "$API_BASE/submissions")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)
    
    echo "Response: $BODY"
    
    if [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 200 ]; then
        log_success "Submission accepted (HTTP $HTTP_CODE)"
        
        SUBMISSION_ID=$(echo "$BODY" | grep -o '"submission_id":"[^"]*"' | cut -d'"' -f4)
        if [ -n "$SUBMISSION_ID" ]; then
            log_success "Submission ID: $SUBMISSION_ID"
            echo "$SUBMISSION_ID" > /tmp/judgehost-test-submission-two-sum-partial.txt
            
            # Wait for evaluation
            log_info "Waiting for evaluation to complete..."
            for i in {1..30}; do
                sleep 2
                STATUS_RESPONSE=$(curl -s "$API_BASE/results/$SUBMISSION_ID")
                STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
                
                if [ "$STATUS" = "completed" ] || [ "$STATUS" = "COMPLETED" ]; then
                    log_success "Evaluation completed!"
                    echo "$STATUS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$STATUS_RESPONSE"
                    break
                elif [ "$STATUS" = "failed" ] || [ "$STATUS" = "FAILED" ]; then
                    log_error "Evaluation failed!"
                    echo "$STATUS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$STATUS_RESPONSE"
                    return 1
                fi
                
                log_info "Status: $STATUS (attempt $i/30)"
            done
        fi
        
        log_success "Test 2 PASSED"
        return 0
    else
        log_error "Submission failed (HTTP $HTTP_CODE)"
        return 1
    fi
}

# Test 3: Submit REST API solution
test_submit_rest_api() {
    log_header "Test 3: Submit REST API solution"
    
    if [ ! -f "$PACKAGES_DIR/rest-api-users-submission.tar.gz" ]; then
        log_error "Submission package not found: rest-api-users-submission.tar.gz"
        return 1
    fi
    
    log_info "Uploading rest-api-users-submission.tar.gz..."
    
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -F "submission_file=@$PACKAGES_DIR/rest-api-users-submission.tar.gz" \
        -F "problem_id=rest-api-users" \
        -F "package_type=file" \
        "$API_BASE/submissions")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)
    
    echo "Response: $BODY"
    
    if [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 200 ]; then
        log_success "Submission accepted (HTTP $HTTP_CODE)"
        
        SUBMISSION_ID=$(echo "$BODY" | grep -o '"submission_id":"[^"]*"' | cut -d'"' -f4)
        if [ -n "$SUBMISSION_ID" ]; then
            log_success "Submission ID: $SUBMISSION_ID"
            echo "$SUBMISSION_ID" > /tmp/judgehost-test-submission-rest-api.txt
            
            # Wait for evaluation (longer timeout for multi-container)
            log_info "Waiting for evaluation to complete (multi-container may take longer)..."
            for i in {1..60}; do
                sleep 3
                STATUS_RESPONSE=$(curl -s "$API_BASE/results/$SUBMISSION_ID")
                STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
                
                if [ "$STATUS" = "completed" ] || [ "$STATUS" = "COMPLETED" ]; then
                    log_success "Evaluation completed!"
                    echo "$STATUS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$STATUS_RESPONSE"
                    break
                elif [ "$STATUS" = "failed" ] || [ "$STATUS" = "FAILED" ]; then
                    log_error "Evaluation failed!"
                    echo "$STATUS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$STATUS_RESPONSE"
                    return 1
                fi
                
                log_info "Status: $STATUS (attempt $i/60)"
            done
        fi
        
        log_success "Test 3 PASSED"
        return 0
    else
        log_error "Submission failed (HTTP $HTTP_CODE)"
        return 1
    fi
}

# Test 4: List all submissions
test_list_submissions() {
    log_header "Test 4: List all submissions"
    
    RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/submissions")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)
    
    if [ "$HTTP_CODE" -eq 200 ]; then
        log_success "Submissions listed successfully"
        echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
        
        # Count submissions
        SUBMISSION_COUNT=$(echo "$BODY" | grep -o '"submission_id"' | wc -l)
        log_info "Total submissions: $SUBMISSION_COUNT"
        
        log_success "Test 4 PASSED"
        return 0
    else
        log_error "Failed to list submissions (HTTP $HTTP_CODE)"
        return 1
    fi
}

# Test 5: Get specific submission details
test_get_submission_details() {
    log_header "Test 5: Get submission details"
    
    # Get submission ID from previous test
    if [ -f /tmp/judgehost-test-submission-two-sum-correct.txt ]; then
        SUBMISSION_ID=$(cat /tmp/judgehost-test-submission-two-sum-correct.txt)
        log_info "Testing with submission ID: $SUBMISSION_ID"
        
        RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/submissions/$SUBMISSION_ID")
        
        HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
        BODY=$(echo "$RESPONSE" | head -n-1)
        
        if [ "$HTTP_CODE" -eq 200 ]; then
            log_success "Submission details retrieved successfully"
            echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
            log_success "Test 5 PASSED"
            return 0
        else
            log_error "Failed to get submission details (HTTP $HTTP_CODE)"
            return 1
        fi
    else
        log_info "Skipping - no submission ID available from previous tests"
        return 0
    fi
}

# Run all tests
FAILED=0

test_submit_two_sum_correct || FAILED=$((FAILED + 1))
echo ""

test_submit_two_sum_partial || FAILED=$((FAILED + 1))
echo ""

test_submit_rest_api || FAILED=$((FAILED + 1))
echo ""

test_list_submissions || FAILED=$((FAILED + 1))
echo ""

test_get_submission_details || FAILED=$((FAILED + 1))
echo ""

# Summary
echo "======================================"
if [ $FAILED -eq 0 ]; then
    log_success "All API submission tests PASSED!"
else
    log_error "$FAILED test(s) FAILED"
    exit 1
fi
echo "======================================"
