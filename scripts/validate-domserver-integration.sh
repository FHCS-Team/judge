#!/bin/bash

# DOMserver Integration Validation Script
# Performs automated checks to verify implementation correctness

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0
WARNINGS=0

# Helper functions
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

section() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Main validation
echo ""
echo "DOMserver Integration Validation"
echo "================================="
echo ""

# 1. Configuration Check
section "1. Configuration Check"

if [ -f .env ]; then
    pass ".env file exists"
    set +e  # Temporarily disable exit on error for sourcing .env
    source .env 2>/dev/null || true
    set -e  # Re-enable exit on error
else
    fail ".env file not found"
fi

if command -v node &> /dev/null; then
    pass "Node.js is installed"
    NODE_VERSION=$(node --version)
    info "  Version: $NODE_VERSION"
else
    fail "Node.js not found"
    exit 1
fi

# Test config loading
if node -e "require('./src/config')" 2>/dev/null; then
    pass "Configuration loads without errors"
else
    fail "Configuration has errors"
fi

# Check environment variables
if [ ! -z "$DOMSERVER_URL" ]; then
    pass "DOMSERVER_URL is set"
    info "  URL: $DOMSERVER_URL"
else
    warn "DOMSERVER_URL not set (integration disabled)"
fi

if [ ! -z "$DOMSERVER_USERNAME" ]; then
    pass "DOMSERVER_USERNAME is set"
    info "  Username: $DOMSERVER_USERNAME"
else
    warn "DOMSERVER_USERNAME not set"
fi

if [ ! -z "$DOMSERVER_PASSWORD" ]; then
    pass "DOMSERVER_PASSWORD is set"
    info "  Password: ***${DOMSERVER_PASSWORD: -4}"
else
    warn "DOMSERVER_PASSWORD not set"
fi

if [ ! -z "$JUDGEHOST_HOSTNAME" ]; then
    pass "JUDGEHOST_HOSTNAME is set"
    info "  Hostname: $JUDGEHOST_HOSTNAME"
else
    warn "JUDGEHOST_HOSTNAME not set (will use system hostname)"
fi

if grep -q "AXIOS_BASE_URL" .env 2>/dev/null; then
    fail "AXIOS_BASE_URL still present (should be removed)"
else
    pass "AXIOS_BASE_URL removed"
fi

# 2. API Endpoint Check
section "2. API Endpoint Check"

if grep -q "add-judging-run" src/utils/domserver.js; then
    pass "Endpoint uses 'add-judging-run'"
else
    fail "Endpoint does not use 'add-judging-run'"
fi

if grep -q "/judgehosts/add-judging-run/\${hostname}/\${payload.submission_id}" src/utils/domserver.js; then
    pass "Endpoint includes hostname and submission_id in URL"
else
    warn "Endpoint format may be incorrect"
fi

# 3. Request Body Validation
section "3. Request Body Validation"

# Check percentage is removed
if grep "percentage:" src/utils/domserver.js | grep -v "extra_storage_percentage" | grep -q "percentage"; then
    fail "Percentage field still present in rubrics"
else
    pass "Percentage field removed from rubrics"
fi

# Check rubric_type is used
if grep -q "rubric_type: r.type" src/utils/domserver.js; then
    pass "rubric_type field is included"
else
    fail "rubric_type field missing"
fi

# 4. Metadata Fields Check
section "4. Metadata Fields Check"

METADATA_FIELDS=(
    "judgehost_version"
    "judgehost_hostname"
    "docker_version"
    "node_version"
    "platform"
    "arch"
    "problem_version"
    "problem_name"
    "project_type"
    "evaluation_method"
    "timestamp"
)

for field in "${METADATA_FIELDS[@]}"; do
    if grep -q "$field" src/utils/domserver.js; then
        pass "Metadata field '$field' present"
    else
        fail "Metadata field '$field' missing"
    fi
done

# 5. Processor Integration Check
section "5. Processor Integration Check"

if grep -q "problem_config" src/core/processor.js; then
    pass "Processor passes problem_config"
else
    fail "Processor does not pass problem_config"
fi

if grep -q "domserver.submitResult" src/core/processor.js; then
    pass "Processor calls domserver.submitResult"
else
    fail "Processor does not call domserver.submitResult"
fi

# 6. Documentation Check
section "6. Documentation Check"

if grep -q "add-judging-run" docs/API_RESULT_SUBMISSION.md; then
    pass "API documentation uses correct endpoint"
else
    fail "API documentation has incorrect endpoint"
fi

# Check for percentage in request body rubrics (before "Response Formats" section)
if sed -n '/^### Request Body/,/^## Response Formats/p' docs/API_RESULT_SUBMISSION.md | grep -q '"percentage"'; then
    fail "API documentation still shows percentage in request rubrics"
else
    pass "API documentation removed percentage from request rubrics"
fi

if [ -f DOMSERVER_API_CHANGES.md ]; then
    pass "DOMSERVER_API_CHANGES.md exists"
else
    warn "DOMSERVER_API_CHANGES.md not found"
fi

if [ -f VALIDATION_CHECKLIST.md ]; then
    pass "VALIDATION_CHECKLIST.md exists"
else
    warn "VALIDATION_CHECKLIST.md not found"
fi

# 7. Rubric Types Validation
section "7. Rubric Types Validation"

VALID_RUBRIC_TYPES=(
    "test_cases"
    "api_endpoints"
    "performance_benchmark"
    "code_quality"
    "security_scan"
    "ui_test"
    "resource_usage"
    "integration_test"
    "ml_metrics"
    "manual"
    "custom"
)

if [ -f docs/data-models/rubric_types.md ]; then
    pass "rubric_types.md exists"
    
    for rubric_type in "${VALID_RUBRIC_TYPES[@]}"; do
        if grep -q "\`$rubric_type\`" docs/data-models/rubric_types.md; then
            pass "  Rubric type '$rubric_type' documented"
        else
            warn "  Rubric type '$rubric_type' not found in docs"
        fi
    done
else
    fail "rubric_types.md not found"
fi

# 8. File Permissions Check
section "8. File Permissions Check"

if [ -x scripts/test-domserver-client.sh ]; then
    pass "test-domserver-client.sh is executable"
else
    warn "test-domserver-client.sh not executable (run: chmod +x scripts/test-domserver-client.sh)"
fi

# 9. Code Quality Check
section "9. Code Quality Check"

# Check for syntax errors
if node -c src/utils/domserver.js 2>/dev/null; then
    pass "domserver.js has no syntax errors"
else
    fail "domserver.js has syntax errors"
fi

if node -c src/core/processor.js 2>/dev/null; then
    pass "processor.js has no syntax errors"
else
    fail "processor.js has syntax errors"
fi

if node -c src/config/index.js 2>/dev/null; then
    pass "config/index.js has no syntax errors"
else
    fail "config/index.js has syntax errors"
fi

# 10. Security Check
section "10. Security Check"

if git grep -q "your-auth-token-here" 2>/dev/null; then
    if git grep "your-auth-token-here" | grep -v ".env.example" | grep -q "your-auth-token-here"; then
        fail "Default auth token found in committed files"
    else
        pass "No default auth tokens in committed files"
    fi
else
    pass "No default auth tokens found"
fi

if [ -f .env ] && [ -f .gitignore ]; then
    if grep -q "^\.env$" .gitignore; then
        pass ".env is in .gitignore"
    else
        fail ".env is NOT in .gitignore (security risk!)"
    fi
fi

# Summary
section "Validation Summary"

TOTAL=$((PASSED + FAILED + WARNINGS))

echo ""
echo -e "${GREEN}Passed:${NC}   $PASSED"
echo -e "${YELLOW}Warnings:${NC} $WARNINGS"
echo -e "${RED}Failed:${NC}   $FAILED"
echo -e "Total:    $TOTAL"
echo ""

if [ $FAILED -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}✓ All checks passed!${NC}"
        echo -e "${GREEN}========================================${NC}"
        exit 0
    else
        echo -e "${YELLOW}========================================${NC}"
        echo -e "${YELLOW}⚠ Validation complete with warnings${NC}"
        echo -e "${YELLOW}========================================${NC}"
        exit 0
    fi
else
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}✗ Validation failed${NC}"
    echo -e "${RED}Please fix the issues above${NC}"
    echo -e "${RED}========================================${NC}"
    exit 1
fi
