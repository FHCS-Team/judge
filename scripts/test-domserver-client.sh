#!/bin/bash

# Test DOMserver Result Submission
# This script verifies the DOMserver client functionality

set -e

echo "=========================================="
echo "DOMserver Result Submission Test"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if required environment variables are set
echo "1. Checking configuration..."
if [ -f .env ]; then
    echo -e "${GREEN}✓${NC} .env file found"
    source .env
else
    echo -e "${RED}✗${NC} .env file not found"
    exit 1
fi

# Check DOMSERVER_URL
if [ -z "$DOMSERVER_URL" ]; then
    echo -e "${YELLOW}⚠${NC} DOMSERVER_URL not set (DOMserver integration disabled)"
else
    echo -e "${GREEN}✓${NC} DOMSERVER_URL: $DOMSERVER_URL"
fi

# Check DOMSERVER_USERNAME
if [ -z "$DOMSERVER_USERNAME" ]; then
    echo -e "${YELLOW}⚠${NC} DOMSERVER_USERNAME not set"
else
    echo -e "${GREEN}✓${NC} DOMSERVER_USERNAME: $DOMSERVER_USERNAME"
fi

# Check DOMSERVER_PASSWORD
if [ -z "$DOMSERVER_PASSWORD" ]; then
    echo -e "${YELLOW}⚠${NC} DOMSERVER_PASSWORD not set"
else
    echo -e "${GREEN}✓${NC} DOMSERVER_PASSWORD: ***${DOMSERVER_PASSWORD: -4}"
fi

# Check JUDGEHOST_HOSTNAME
if [ -z "$JUDGEHOST_HOSTNAME" ]; then
    echo -e "${YELLOW}⚠${NC} JUDGEHOST_HOSTNAME not set, will use system hostname"
else
    echo -e "${GREEN}✓${NC} JUDGEHOST_HOSTNAME: $JUDGEHOST_HOSTNAME"
fi

echo ""
echo "2. Testing DOMserver client..."

# Create a test script
cat > /tmp/test-domserver-client.js << 'EOF'
const domserver = require('./src/utils/domserver');
const config = require('./src/config');

console.log('DOMserver Configuration:');
console.log('  Enabled:', config.domserver.enabled);
console.log('  URL:', config.domserver.url || '(not set)');
console.log('  API Version:', config.domserver.apiVersion);
console.log('  Hostname:', config.domserver.hostname);
console.log('  Submit Results:', config.domserver.submitResults);
console.log('  Retry Enabled:', config.domserver.retryEnabled);
console.log('  Max Retry Attempts:', config.domserver.retryMaxAttempts);
console.log('');

if (!config.domserver.enabled) {
    console.log('⚠ DOMserver integration is disabled');
    console.log('  To enable, set DOMSERVER_ENABLED=true in .env');
    process.exit(0);
}

if (!config.domserver.url) {
    console.log('✗ DOMserver URL not configured');
    console.log('  Set DOMSERVER_URL in .env');
    process.exit(1);
}

// Test result submission with mock data
const testResult = {
    submission_id: 'test-' + Date.now(),
    problem_id: 'sql-optimization',
    problem_config: {
        version: '1.0.0',
        problem_name: 'SQL Query Optimization',
        project_type: 'database-optimization'
    },
    status: 'completed',
    start_time: new Date(Date.now() - 5000).toISOString(),
    end_time: new Date().toISOString(),
    rubrics: [
        {
            rubric_id: 'correctness',
            name: 'Query Correctness',
            type: 'test_cases',
            score: 50,
            max_score: 50,
            status: 'DONE',
            message: 'All tests passed',
            details: { total_tests: 3, passed_tests: 3 }
        },
        {
            rubric_id: 'performance',
            name: 'Query Performance',
            type: 'performance_benchmark',
            score: 18.5,
            max_score: 20,
            status: 'DONE',
            message: 'Good performance',
            details: { avg_latency_ms: 45.2 }
        }
    ],
    metrics: {
        total_containers: 2,
        containers_succeeded: 2,
        containers_failed: 0
    }
};

console.log('Submitting test result to DOMserver...');
console.log('  Submission ID:', testResult.submission_id);
console.log('  Problem ID:', testResult.problem_id);
console.log('  Status:', testResult.status);
console.log('  Rubrics:', testResult.rubrics.length);
console.log('');

domserver.submitResult(testResult)
    .then(result => {
        if (result.success) {
            console.log('✓ Result submitted successfully');
            console.log('  Result ID:', result.result_id);
            console.log('  Response:', JSON.stringify(result.response, null, 2));
            process.exit(0);
        } else {
            console.log('✗ Failed to submit result');
            console.log('  Reason:', result.reason);
            if (result.error) {
                console.log('  Error:', result.error.message);
                console.log('  Status:', result.error.status);
                console.log('  Data:', JSON.stringify(result.error.data, null, 2));
            }
            process.exit(1);
        }
    })
    .catch(error => {
        console.log('✗ Exception occurred');
        console.log('  Error:', error.message);
        console.log('  Stack:', error.stack);
        process.exit(1);
    });
EOF

# Run the test
node /tmp/test-domserver-client.js
TEST_EXIT_CODE=$?

# Cleanup
rm /tmp/test-domserver-client.js

echo ""
if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}=========================================="
    echo "Test completed successfully"
    echo -e "==========================================${NC}"
else
    echo -e "${RED}=========================================="
    echo "Test failed"
    echo -e "==========================================${NC}"
fi

exit $TEST_EXIT_CODE
