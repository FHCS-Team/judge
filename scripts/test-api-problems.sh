#!/bin/bash

# API Testing Script - Problem Registration
# Tests POST /api/problems endpoint with both test packages

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
echo "API Testing - Problem Registration"
echo "API Base: $API_BASE"
echo "======================================"
echo ""

# Test 1: Register two-sum problem
test_register_two_sum() {
    log_header "Test 1: Register two-sum problem"
    
    # Check if package exists
    if [ ! -f "$PACKAGES_DIR/two-sum.tar.gz" ]; then
        log_error "Package not found: two-sum.tar.gz"
        return 1
    fi
    
    log_info "Uploading two-sum.tar.gz..."
    
    # Upload problem package
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -F "problem_package=@$PACKAGES_DIR/two-sum.tar.gz" \
        -F "problem_id=two-sum" \
        -F "problem_name=Two Sum Algorithm" \
        -F "package_type=file" \
        -F "project_type=algorithm" \
        "$API_BASE/problems")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)
    
    echo "Response: $BODY"
    
    if [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 200 ]; then
        log_success "Problem registered successfully (HTTP $HTTP_CODE)"
        
        # Extract problem_id from response
        PROBLEM_ID=$(echo "$BODY" | grep -o '"problem_id":"[^"]*"' | cut -d'"' -f4)
        if [ -n "$PROBLEM_ID" ]; then
            log_success "Problem ID: $PROBLEM_ID"
            echo "$PROBLEM_ID" > /tmp/judgehost-test-problem-two-sum.txt
        fi
        
        # Check if Docker image was built
        if docker images | grep -q "$PROBLEM_ID"; then
            log_success "Docker image built successfully"
            docker images | grep "$PROBLEM_ID"
        else
            log_info "Docker image not yet built (may be building in background)"
        fi
        
        log_success "Test 1 PASSED"
        return 0
    else
        log_error "Problem registration failed (HTTP $HTTP_CODE)"
        log_error "Response: $BODY"
        return 1
    fi
}

# Test 2: Register rest-api-users problem
test_register_rest_api() {
    log_header "Test 2: Register rest-api-users problem"
    
    # Check if package exists
    if [ ! -f "$PACKAGES_DIR/rest-api-users.tar.gz" ]; then
        log_error "Package not found: rest-api-users.tar.gz"
        return 1
    fi
    
    log_info "Uploading rest-api-users.tar.gz..."
    
    # Upload problem package
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -F "problem_package=@$PACKAGES_DIR/rest-api-users.tar.gz" \
        -F "problem_id=rest-api-users" \
        -F "problem_name=REST API Users Management" \
        -F "package_type=file" \
        -F "project_type=web-api" \
        "$API_BASE/problems")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)
    
    echo "Response: $BODY"
    
    if [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 200 ]; then
        log_success "Problem registered successfully (HTTP $HTTP_CODE)"
        
        # Extract problem_id from response
        PROBLEM_ID=$(echo "$BODY" | grep -o '"problem_id":"[^"]*"' | cut -d'"' -f4)
        if [ -n "$PROBLEM_ID" ]; then
            log_success "Problem ID: $PROBLEM_ID"
            echo "$PROBLEM_ID" > /tmp/judgehost-test-problem-rest-api.txt
        fi
        
        # Check if Docker images were built (3 containers)
        log_info "Checking for Docker images (3 expected)..."
        if docker images | grep -q "$PROBLEM_ID"; then
            log_success "Docker images built successfully"
            docker images | grep "$PROBLEM_ID"
        else
            log_info "Docker images not yet built (may be building in background)"
        fi
        
        log_success "Test 2 PASSED"
        return 0
    else
        log_error "Problem registration failed (HTTP $HTTP_CODE)"
        log_error "Response: $BODY"
        return 1
    fi
}

# Test 3: GET /problems to list all registered problems
test_list_problems() {
    log_header "Test 3: List all problems"
    
    RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/problems")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)
    
    if [ "$HTTP_CODE" -eq 200 ]; then
        log_success "Problems listed successfully"
        echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
        
        # Count problems
        PROBLEM_COUNT=$(echo "$BODY" | grep -o '"problem_id"' | wc -l)
        log_info "Total problems registered: $PROBLEM_COUNT"
        
        log_success "Test 3 PASSED"
        return 0
    else
        log_error "Failed to list problems (HTTP $HTTP_CODE)"
        return 1
    fi
}

# Test 4: GET specific problem details
test_get_problem_details() {
    log_header "Test 4: Get problem details"
    
    # Get problem ID from previous test
    if [ -f /tmp/judgehost-test-problem-two-sum.txt ]; then
        PROBLEM_ID=$(cat /tmp/judgehost-test-problem-two-sum.txt)
        log_info "Testing with problem ID: $PROBLEM_ID"
        
        RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/problems/$PROBLEM_ID")
        
        HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
        BODY=$(echo "$RESPONSE" | head -n-1)
        
        if [ "$HTTP_CODE" -eq 200 ]; then
            log_success "Problem details retrieved successfully"
            echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
            log_success "Test 4 PASSED"
            return 0
        else
            log_error "Failed to get problem details (HTTP $HTTP_CODE)"
            return 1
        fi
    else
        log_info "Skipping - no problem ID available from previous tests"
        return 0
    fi
}

# Test 5: Force rebuild test
test_force_rebuild() {
    log_header "Test 5: Force rebuild existing problem"
    
    if [ -f /tmp/judgehost-test-problem-two-sum.txt ]; then
        PROBLEM_ID=$(cat /tmp/judgehost-test-problem-two-sum.txt)
        log_info "Force rebuilding problem: $PROBLEM_ID"
        
        RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
            -F "problem_package=@$PACKAGES_DIR/two-sum.tar.gz" \
            -F "problem_id=two-sum" \
            -F "problem_name=Two Sum Algorithm" \
            -F "package_type=file" \
            -F "project_type=algorithm" \
            -F "force_rebuild=true" \
            "$API_BASE/problems")
        
        HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
        BODY=$(echo "$RESPONSE" | head -n-1)
        
        echo "Response: $BODY"
        
        if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ]; then
            log_success "Force rebuild successful (HTTP $HTTP_CODE)"
            log_success "Test 5 PASSED"
            return 0
        else
            log_error "Force rebuild failed (HTTP $HTTP_CODE)"
            return 1
        fi
    else
        log_info "Skipping - no problem registered yet"
        return 0
    fi
}

# Run all tests
FAILED=0

test_register_two_sum || FAILED=$((FAILED + 1))
echo ""

sleep 2  # Give server time to process

test_register_rest_api || FAILED=$((FAILED + 1))
echo ""

sleep 2

test_list_problems || FAILED=$((FAILED + 1))
echo ""

test_get_problem_details || FAILED=$((FAILED + 1))
echo ""

test_force_rebuild || FAILED=$((FAILED + 1))
echo ""

# Summary
echo "======================================"
if [ $FAILED -eq 0 ]; then
    log_success "All API tests PASSED!"
else
    log_error "$FAILED test(s) FAILED"
    exit 1
fi
echo "======================================"
