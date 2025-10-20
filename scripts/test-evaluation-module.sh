#!/bin/bash

##############################################
# Test Evaluation Module with db-optimization
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

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TOTAL_TESTS=0

# Function to print colored messages
print_header() {
    echo -e "${CYAN}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC} ${MAGENTA}$1${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════╝${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
}

print_error() {
    echo -e "${RED}✗${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Paths
MOCK_DIR="$PROJECT_ROOT/mock"
PACKAGE_DIR="$MOCK_DIR/packages/db-optimization"
SUBMISSION_DIR="$MOCK_DIR/packages/db-optimization-submission-sample"
TEST_OUTPUT_DIR="$PROJECT_ROOT/test-evaluation-output"

print_header "Evaluation Module Test - db-optimization"

# Phase 1: Verify paths
print_header "Phase 1: Verify Paths"

if [ ! -d "$PACKAGE_DIR" ]; then
    print_error "Package directory not found: $PACKAGE_DIR"
    exit 1
else
    print_success "Package directory found"
fi

if [ ! -d "$SUBMISSION_DIR" ]; then
    print_error "Submission directory not found: $SUBMISSION_DIR"
    exit 1
else
    print_success "Submission directory found"
fi

# Phase 2: Clean up old test data
print_header "Phase 2: Clean Up"

if [ -d "$TEST_OUTPUT_DIR" ]; then
    print_info "Removing old test output directory..."
    rm -rf "$TEST_OUTPUT_DIR"
    print_success "Old output cleaned"
fi

mkdir -p "$TEST_OUTPUT_DIR"
print_success "Created test output directory"

# Phase 3: Verify module files exist
print_header "Phase 3: Verify Module Files"

MODULES=(
    "src/core/evaluation.js"
    "src/core/docker/mounts.js"
    "src/core/docker/hooks.js"
)

for module in "${MODULES[@]}"; do
    MODULE_PATH="$PROJECT_ROOT/$module"
    if [ ! -f "$MODULE_PATH" ]; then
        print_error "Module not found: $module"
    else
        print_success "Module found: $module"
    fi
done

# Phase 4: Create test script
print_header "Phase 4: Create Node.js Test Script"

TEST_SCRIPT="$TEST_OUTPUT_DIR/test-evaluation.js"

cat > "$TEST_SCRIPT" << 'EOF'
const path = require('path');
const { runEvaluation, loadProblemConfig } = require('../src/core/evaluation');
const logger = require('../src/utils/logger');

async function main() {
  const problemPath = process.argv[2];
  const submissionPath = process.argv[3];
  const resultPath = process.argv[4];

  console.log('\n=== Testing Evaluation Module ===\n');
  console.log('Problem Path:', problemPath);
  console.log('Submission Path:', submissionPath);
  console.log('Result Path:', resultPath);
  console.log();

  try {
    // Load problem config
    console.log('Loading problem configuration...');
    const config = await loadProblemConfig(problemPath);
    console.log('Problem:', config.problem_id);
    console.log('Containers:', config.containers.map(c => c.container_id).join(', '));
    console.log('Rubrics:', config.rubrics.map(r => r.rubric_id).join(', '));
    console.log();

    // Run evaluation
    console.log('Starting evaluation...\n');
    const result = await runEvaluation({
      problemId: config.problem_id,
      submissionId: 'test-submission-001',
      resultId: 'test-result-001',
      problemPath,
      submissionPath,
      resultPath,
    });

    console.log('\n=== Evaluation Result ===\n');
    console.log('Status:', result.status);
    console.log('Rubrics:');
    
    let totalScore = 0;
    let maxScore = 0;
    
    for (const rubric of result.rubrics) {
      console.log(`  - ${rubric.name}: ${rubric.score}/${rubric.max_score} (${rubric.status})`);
      if (rubric.message) {
        console.log(`    Message: ${rubric.message}`);
      }
      totalScore += rubric.score;
      maxScore += rubric.max_score;
    }
    
    console.log(`\nTotal Score: ${totalScore}/${maxScore} (${((totalScore/maxScore)*100).toFixed(2)}%)`);
    console.log(`Duration: ${new Date(result.end_time) - new Date(result.start_time)}ms`);
    
    if (result.error) {
      console.log('\nError:', result.error);
      process.exit(1);
    }
    
    console.log('\n✓ Evaluation completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Evaluation failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
EOF

print_success "Test script created"

# Phase 5: Check Docker
print_header "Phase 5: Docker Verification"

if ! command -v docker &> /dev/null; then
    print_error "Docker not found"
    exit 1
else
    print_success "Docker found"
fi

if ! docker ps &> /dev/null; then
    print_error "Cannot connect to Docker daemon"
    exit 1
else
    print_success "Docker daemon accessible"
fi

# Phase 6: Run the evaluation
print_header "Phase 6: Run Evaluation"

print_info "Running evaluation with Node.js test script..."
echo ""

cd "$PROJECT_ROOT"

if node "$TEST_SCRIPT" "$PACKAGE_DIR" "$SUBMISSION_DIR" "$TEST_OUTPUT_DIR"; then
    print_success "Evaluation completed successfully"
else
    print_error "Evaluation failed"
    exit 1
fi

# Phase 7: Verify outputs
print_header "Phase 7: Verify Outputs"

OUTPUT_DIR="$TEST_OUTPUT_DIR/output"

if [ ! -d "$OUTPUT_DIR" ]; then
    print_error "Output directory not created"
else
    print_success "Output directory exists"
    
    # Check rubric files
    EXPECTED_RUBRICS=("rubric_correctness.json" "rubric_query_latency.json" "rubric_concurrency.json" "rubric_resource_efficiency.json")
    
    for rubric_file in "${EXPECTED_RUBRICS[@]}"; do
        RUBRIC_PATH="$OUTPUT_DIR/$rubric_file"
        if [ ! -f "$RUBRIC_PATH" ]; then
            print_error "Rubric file not found: $rubric_file"
        else
            SCORE=$(jq -r '.score' "$RUBRIC_PATH" 2>/dev/null || echo "N/A")
            print_success "Rubric file exists: $rubric_file (score: $SCORE)"
        fi
    done
fi

# Phase 8: Display summary
print_header "Test Summary"

echo ""
echo -e "${CYAN}Total Tests:${NC} $TOTAL_TESTS"
echo -e "${GREEN}Passed:${NC}      $TESTS_PASSED"
echo -e "${RED}Failed:${NC}      $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║${NC}  ${GREEN}✓ All tests passed!${NC}                               ${GREEN}║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║${NC}  ${RED}✗ Some tests failed${NC}                               ${RED}║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════╝${NC}"
    exit 1
fi
