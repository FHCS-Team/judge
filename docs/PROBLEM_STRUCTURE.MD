# Problem Structure & Package Format (Fully Expanded)

This document provides a comprehensive reference for authoring, structuring, and deploying problem packages in judgehost. It is the authoritative guide for problem creators.

---

## Table of Contents

1. [Overview & Quick Start](#overview--quick-start)
2. [Package Format & Directory Layout](#package-format--directory-layout)
3. [config.json Schema (Complete Reference)](#configjson-schema-complete-reference)
4. [Container Architecture & Lifecycle](#container-architecture--lifecycle)
5. [Hooks: Pre, Post, and Periodic](#hooks-pre-post-and-periodic)
6. [Rubrics: Evaluation & Scoring](#rubrics-evaluation--scoring)
7. [Submission Distribution & Mounting](#submission-distribution--mounting)
8. [Multi-Container Examples](#multi-container-examples)
9. [Best Practices & Common Patterns](#best-practices--common-patterns)
10. [Troubleshooting & Validation](#troubleshooting--validation)

---

## Overview & Quick Start

### What is a Problem Package?

A problem package is a self-contained archive (`.tar.gz` or `.zip`) that defines:

- **Problem metadata** (name, type, version)
- **Container specifications** (Dockerfiles, dependencies, environment)
- **Evaluation logic** (hooks, rubrics, test scripts)
- **Test data** (fixtures, expected outputs, datasets)

### Minimal Problem Package

At minimum, a problem package must contain:

```
minimal-problem/
├── config.json           # Problem metadata and container specs
└── Dockerfile            # OR container-specific Dockerfiles (see below)
```

### Standard Problem Package

A well-structured package includes:

```
standard-problem/
├── config.json
├── container-a/
│   ├── Dockerfile
│   ├── hooks/            # Lifecycle scripts
│   │   ├── pre/
│   │   ├── post/
│   │   └── periodic/
│   └── data/             # Resources for this container
├── container-b/
│   ├── Dockerfile
│   └── ...
├── README.md             # Problem description
└── SUBMISSION.md         # Submission format guide
```

### Package Validation Checklist

- ✅ `config.json` is valid JSON and follows schema
- ✅ Each container in `config.json` has a referenced Dockerfile
- ✅ Dockerfile paths are relative to package root
- ✅ All hooks are executable shell scripts
- ✅ Problem ID matches pattern: `^[a-z][a-z0-9-]{2,63}$`
- ✅ Rubric IDs are unique within the problem
- ✅ Container IDs are unique within the problem
- ✅ Total score across rubrics is reasonable (100–1000 points)

---

## Package Format & Directory Layout

### Root-Level Files

```
problem-package-root/
├── config.json           # (REQUIRED) Problem configuration
├── README.md             # (RECOMMENDED) Problem description and context
├── SUBMISSION.md         # (RECOMMENDED) Guidelines for submission format
├── [any Dockerfile]      # Deprecated; use container-specific paths
└── [data files]          # Optional: top-level shared data
```

### Container-Specific Subdirectories

Each container has an optional subdirectory for Dockerfile and resources:

```
problem-package-root/
├── config.json
├── submission/           # Container-specific directory (optional)
│   ├── Dockerfile        # Specific to 'submission' container
│   ├── hooks/
│   │   ├── pre/
│   │   │   ├── 01_setup.sh
│   │   │   └── 02_validate.sh
│   │   ├── post/
│   │   │   ├── 01_test.sh
│   │   │   └── 02_evaluate.sh
│   │   └── periodic/
│   │       └── monitor_01.sh
│   ├── data/
│   │   ├── fixtures.json
│   │   └── expected_output.txt
│   └── scripts/
│       └── test_runner.sh
├── database/             # Another container-specific directory
│   ├── Dockerfile
│   ├── hooks/
│   │   ├── pre/
│   │   │   └── 01_init.sh
│   │   └── post/
│   │       └── 01_verify.sh
│   └── data/
│       ├── schema.sql
│       └── seed_data.sql
└── tester/
    ├── Dockerfile
    └── scripts/
        └── run_tests.sh
```

### Directory Naming Conventions

- **Container directories**: Use `container_id` from `config.json`

  - Example: If `config.json` has container `{ "container_id": "submission" }`, use subdirectory `submission/`
  - Snake_case is recommended for multi-word IDs: `api_tester`, `db_validator`

- **Hooks directories**: Must be exactly `hooks/pre/`, `hooks/post/`, `hooks/periodic/`

  - These are mounted at `/hooks/pre`, `/hooks/post`, `/hooks/periodic` in the container

- **Data directories**: Convention is `data/`

  - Mounted at `/data` in the container (configurable via `mounts`)

- **Scripts**: Optional `scripts/` subdirectory
  - Not automatically mounted; reference from hooks as needed

### File Naming Conventions for Hooks

Hooks in each category are executed in **lexicographic order**:

```
hooks/pre/
├── 01_setup.sh           # Runs first
├── 02_install.sh         # Runs second
└── 03_validate.sh        # Runs third

hooks/post/
├── 01_test_basic.sh      # Runs first
├── 01_test_advanced.sh   # Runs concurrently with 01_test_basic (same prefix)
└── 02_evaluate.sh        # Runs after all 01_* hooks complete
```

**Naming scheme**: `[priority]_[description].sh`

- `priority`: 2-digit number (01–99)
- `description`: Short, lowercase, underscores (no spaces)

---

## config.json Schema (Complete Reference)

### Root-Level Structure

```json
{
  "problem_id": "string (required, immutable)",
  "problem_name": "string (required)",
  "project_type": "string (optional)",
  "version": "string (optional, default: '1.0.0')",
  "description": "string (optional, markdown)",
  "author": "string (optional)",
  "license": "string (optional)",

  "containers": [
    /* required, non-empty */
  ],
  "submission_packages": [
    /* optional */
  ],
  "rubrics": [
    /* optional but recommended */
  ],
  "hooks_config": {
    /* optional */
  },
  "network": {
    /* optional */
  },
  "timeouts": {
    /* optional */
  }
}
```

### containers Array (REQUIRED)

Each problem must define at least one container. Containers define:

- **Base environment**: Docker image, dependencies, runtime
- **Submission acceptance**: Which container(s) receive submission code
- **Lifecycle**: Startup, healthcheck, termination behavior
- **Dependencies**: Ordering and wait conditions

#### Container Object Schema

```json
{
  "container_id": "string (required, unique)",
  "container_name": "string (optional)",
  "dockerfile_path": "string (required)",

  "accepts_submission": "boolean (default: false)",
  "submission_package_id": "string (optional, if accepts_submission: true)",

  "environment": {
    "VAR_NAME": "value",
    "ANOTHER_VAR": "value"
  },

  "resource_limits": {
    "memory": "string (e.g., '512m', '2gb')",
    "cpus": "number (e.g., 1.0, 0.5)",
    "timeout": "integer (seconds, max for container lifetime)"
  },

  "ports": ["8080", "9000"],

  "depends_on": [
    {
      "container_id": "string",
      "condition": "string ('started', 'healthy', 'completed')",
      "timeout": "integer (seconds, max wait time)",
      "retry": "integer (number of retries)",
      "retry_interval": "integer (seconds between retries)"
    }
  ],

  "terminates": ["container_id_1", "container_id_2"],

  "health_check": {
    "command": "string",
    "interval": "integer (seconds)",
    "timeout": "integer (seconds)",
    "retries": "integer",
    "start_period": "integer (seconds)"
  },

  "mounts": [
    {
      "type": "string ('bind', 'volume', 'tmpfs')",
      "source": "string (path in package or volume name)",
      "destination": "string (path in container)",
      "read_only": "boolean (default: false)",
      "propagation": "string (optional, 'rprivate', 'rpublic', etc.)"
    }
  ],

  "capabilities": {
    "add": ["CAP_NET_BIND_SERVICE"],
    "drop": ["CAP_SYS_ADMIN"]
  }
}
```

#### Full Container Example

```json
{
  "container_id": "api-server",
  "container_name": "API Server Container",
  "dockerfile_path": "server/Dockerfile",

  "accepts_submission": true,
  "submission_package_id": "app",

  "environment": {
    "NODE_ENV": "production",
    "PORT": "3000",
    "DB_HOST": "database",
    "DB_PORT": "5432"
  },

  "resource_limits": {
    "memory": "1gb",
    "cpus": 2.0,
    "timeout": 600
  },

  "ports": ["3000"],

  "depends_on": [
    {
      "container_id": "database",
      "condition": "healthy",
      "timeout": 30,
      "retry": 5,
      "retry_interval": 2
    }
  ],

  "terminates": [],

  "health_check": {
    "command": "curl -f http://localhost:3000/health || exit 1",
    "interval": 10,
    "timeout": 5,
    "retries": 3,
    "start_period": 15
  },

  "mounts": [
    {
      "type": "bind",
      "source": "server/data",
      "destination": "/app/data",
      "read_only": true
    },
    {
      "type": "tmpfs",
      "destination": "/tmp",
      "read_only": false
    }
  ],

  "capabilities": {
    "drop": ["CAP_SYS_ADMIN", "CAP_NET_ADMIN"]
  }
}
```

### submission_packages Array (OPTIONAL)

Defines how submissions are distributed to containers. If not specified, a single `main` package is assumed.

```json
"submission_packages": [
  {
    "package_id": "string (required, unique)",
    "container_id": "string (required)",
    "extract_path": "string (optional, default: '/')",
    "permissions": "string (optional, default: '0755')"
  }
]
```

**Example**: Multi-part submission (frontend + backend)

```json
"submission_packages": [
  {
    "package_id": "frontend",
    "container_id": "ui-tester",
    "extract_path": "/app/frontend"
  },
  {
    "package_id": "backend",
    "container_id": "api-tester",
    "extract_path": "/app/backend"
  }
]
```

### rubrics Array (OPTIONAL but RECOMMENDED)

Defines the evaluation criteria and scoring rubric.

#### Rubric Object Schema

```json
{
  "rubric_id": "string (required, unique)",
  "rubric_name": "string (required)",
  "rubric_type": "string (required)",
  "description": "string (optional)",
  "max_score": "number (required, >0)",
  "weight": "number (optional, default: 1.0)",
  "container": "string (optional, container_id that evaluates this)",
  "properties": {
    /* type-specific properties */
  }
}
```

#### Rubric Types

**1. test_cases**

- Evaluates correctness based on test case pass/fail
- Output: `/out/rubric_<rubric_id>.json`

```json
{
  "rubric_id": "correctness",
  "rubric_type": "test_cases",
  "max_score": 60,
  "properties": {
    "test_count": 15,
    "pass_threshold": 0.8
  }
}
```

**2. performance_benchmark**

- Evaluates performance (time, throughput, latency)
- Output: `/out/rubric_<rubric_id>.json` with timing data

```json
{
  "rubric_id": "latency",
  "rubric_type": "performance_benchmark",
  "max_score": 30,
  "properties": {
    "baseline_ms": 1000,
    "target_ms": 500
  }
}
```

**3. resource_usage**

- Evaluates resource efficiency (memory, CPU, disk)
- Output: `/out/rubric_<rubric_id>.json` with usage metrics

```json
{
  "rubric_id": "memory_efficiency",
  "rubric_type": "resource_usage",
  "max_score": 20,
  "properties": {
    "baseline_mb": 256,
    "target_mb": 128
  }
}
```

**4. code_quality**

- Evaluates code style, complexity, and best practices
- Uses linters, complexity analyzers, or custom scripts

```json
{
  "rubric_id": "code_quality",
  "rubric_type": "code_quality",
  "max_score": 40,
  "properties": {
    "language": "python",
    "linter": "pylint",
    "min_score": 7.5
  }
}
```

**5. api_endpoints**

- Evaluates API functionality (routes, request/response validation)

```json
{
  "rubric_id": "api_correctness",
  "rubric_type": "api_endpoints",
  "max_score": 50,
  "properties": {
    "endpoint_count": 5,
    "base_url": "http://localhost:3000"
  }
}
```

**6. ui_test**

- Evaluates UI/frontend functionality using headless browser tests

```json
{
  "rubric_id": "ui_functionality",
  "rubric_type": "ui_test",
  "max_score": 40,
  "properties": {
    "browser": "chromium",
    "viewport": "1920x1080"
  }
}
```

**7. integration_test**

- Multi-component integration testing

```json
{
  "rubric_id": "end_to_end",
  "rubric_type": "integration_test",
  "max_score": 50
}
```

**8. security_scan**

- Evaluates security (OWASP, CVE scanning, secure coding)

```json
{
  "rubric_id": "security",
  "rubric_type": "security_scan",
  "max_score": 30,
  "properties": {
    "scan_tool": "owasp-dependency-check",
    "fail_on_high": true
  }
}
```

**9. ml_metrics**

- Evaluates ML model performance (accuracy, precision, recall, F1)

```json
{
  "rubric_id": "model_accuracy",
  "rubric_type": "ml_metrics",
  "max_score": 50,
  "properties": {
    "metric": "accuracy",
    "target": 0.95
  }
}
```

**10. custom**

- Custom evaluation logic defined in hooks

```json
{
  "rubric_id": "domain_specific",
  "rubric_type": "custom",
  "max_score": 25,
  "properties": {
    "hook_name": "evaluate_custom"
  }
}
```

#### Complete Rubrics Example

```json
"rubrics": [
  {
    "rubric_id": "correctness",
    "rubric_name": "Solution Correctness",
    "rubric_type": "test_cases",
    "description": "Percentage of test cases passed",
    "max_score": 50,
    "weight": 2.0,
    "container": "tester",
    "properties": {
      "test_count": 10,
      "pass_threshold": 0.8
    }
  },
  {
    "rubric_id": "performance",
    "rubric_name": "Algorithm Performance",
    "rubric_type": "performance_benchmark",
    "max_score": 30,
    "weight": 1.5,
    "container": "tester",
    "properties": {
      "baseline_ms": 2000,
      "target_ms": 500
    }
  },
  {
    "rubric_id": "code_quality",
    "rubric_name": "Code Quality",
    "rubric_type": "code_quality",
    "max_score": 20,
    "container": "submission",
    "properties": {
      "language": "python",
      "linter": "pylint",
      "min_score": 8.0
    }
  }
]
```

### hooks_config Object (OPTIONAL)

Global configuration for hook execution.

```json
"hooks_config": {
  "parallel_execution": "boolean (default: false)",
  "periodic_interval_seconds": "integer (default: 10)",
  "hook_timeout_seconds": "integer (default: 30)",
  "max_concurrent_hooks": "integer (default: 4)"
}
```

**Example**:

```json
"hooks_config": {
  "parallel_execution": true,
  "periodic_interval_seconds": 5,
  "hook_timeout_seconds": 60,
  "max_concurrent_hooks": 8
}
```

### network Object (OPTIONAL)

Network configuration for the problem's containers.

```json
"network": {
  "name": "string (optional, default: 'problem-{{problem_id}}-{{submission_id}}')",
  "driver": "string (optional, default: 'bridge')",
  "internet_access": "boolean (default: false)",
  "dns_servers": ["array of strings (optional)"],
  "mtu": "integer (optional)"
}
```

**Example**: Isolated network, no internet

```json
"network": {
  "name": "sql-opt-{{submission_id}}",
  "driver": "bridge",
  "internet_access": false
}
```

### timeouts Object (OPTIONAL)

Global timeout configurations.

```json
"timeouts": {
  "problem_total_seconds": "integer (default: 1800, 30 minutes)",
  "container_startup_seconds": "integer (default: 60)",
  "hook_execution_seconds": "integer (default: 30)",
  "submission_execution_seconds": "integer (default: 600)"
}
```

**Example**:

```json
"timeouts": {
  "problem_total_seconds": 3600,
  "container_startup_seconds": 120,
  "hook_execution_seconds": 60,
  "submission_execution_seconds": 1200
}
```

### Complete config.json Example

See the **Multi-Container Examples** section for full working examples.

---

## Container Architecture & Lifecycle

### Container Lifecycle Stages

Every container follows this lifecycle:

```
[Build]
   ↓
[Start] → [Wait for dependencies]
   ↓
[Pre-hooks] → [Run sequentially]
   ↓
[Application Ready] → [Optional: wait for submission]
   ↓
[Post-hooks] → [Run sequentially or parallel]
   ↓
[Periodic hooks] → [Run at intervals]
   ↓
[Termination cascade] → [If dependents terminate]
   ↓
[Cleanup]
```

### Dependency Management

Containers can declare dependencies on other containers using `depends_on`:

```json
"depends_on": [
  {
    "container_id": "database",
    "condition": "healthy",
    "timeout": 30,
    "retry": 5,
    "retry_interval": 2
  }
]
```

**Conditions**:

- `"started"`: Container process started
- `"healthy"`: Container passed health check (requires `health_check` definition)
- `"completed"`: Container exited successfully

### Termination Cascade

If a container in `terminates` list completes, it signals other containers to shut down:

```json
"terminates": ["tester", "monitor"]
```

When the parent container exits, all containers in its `terminates` list are stopped.

### Health Checks

A container can define a health check to verify it's ready:

```json
"health_check": {
  "command": "pg_isready -U postgres || exit 1",
  "interval": 5,
  "timeout": 3,
  "retries": 3,
  "start_period": 10
}
```

**Command**:

- Must return exit code `0` for healthy, non-zero for unhealthy
- Common tools: `curl`, `pg_isready`, `redis-cli PING`, `docker exec` with checks

**Parameters**:

- `interval`: Check frequency (seconds)
- `timeout`: Max time for check to complete
- `retries`: Consecutive failures before unhealthy
- `start_period`: Grace period before checks start

---

## Hooks: Pre, Post, and Periodic

### Hook Basics

Hooks are shell scripts that run at specific points in the evaluation lifecycle. They have access to:

- Container filesystem
- Submission files (if `accepts_submission: true`)
- Problem data (mounted)
- Environment variables from `config.json`

### Hook Output & Results

Hooks can generate rubric results by writing JSON files to `/out/`:

```bash
#!/bin/bash
# post_01_test.sh

# Run tests
python -m pytest tests/ --json=results.json

# Generate rubric result
python - << 'EOF'
import json

score = 0
# ... evaluate test results ...

with open('/out/rubric_correctness.json', 'w') as f:
    json.dump({
        "rubric_id": "correctness",
        "score": score,
        "max_score": 50,
        "details": {
            "tests_passed": 8,
            "tests_total": 10
        }
    }, f)
EOF
```

### Pre-Execution Hooks

**Location**: `hooks/pre/`

**Execution**: Sequential, in lexicographic order

**Purpose**: Setup, installation, data preparation

**Example**: `hooks/pre/01_install.sh`

```bash
#!/bin/bash
set -e

echo "Installing dependencies..."
apt-get update
apt-get install -y python3-pip
pip3 install -r requirements.txt

echo "Setup complete"
```

**Common Tasks**:

- Package installation
- Database initialization
- Configuration generation
- Dependency compilation
- Network setup

### Post-Execution Hooks

**Location**: `hooks/post/`

**Execution**: Sequential by default; parallel if `parallel_execution: true`

**Purpose**: Testing, evaluation, result collection

**Example**: `hooks/post/01_test.sh`

```bash
#!/bin/bash
set -e

echo "Running test suite..."
python -m pytest tests/ -v --tb=short

# Collect results
python - << 'EOF'
import json, subprocess

result = subprocess.run(['pytest', 'tests/', '--json-report', '--json-report-file=report.json'], capture_output=True)
data = json.load(open('report.json'))

score = 0
if result.returncode == 0:
    score = 50

with open('/out/rubric_correctness.json', 'w') as f:
    json.dump({
        "rubric_id": "correctness",
        "score": score,
        "max_score": 50
    }, f)
EOF
```

**Common Tasks**:

- Running test suites
- Evaluating correctness
- Measuring performance
- Generating rubric scores
- Collecting logs and artifacts

### Periodic Hooks

**Location**: `hooks/periodic/`

**Execution**: Runs continuously at specified intervals while submission is active

**Purpose**: Monitoring, metrics collection, continuous evaluation

**Example**: `hooks/periodic/01_monitor.sh`

```bash
#!/bin/bash

# This runs every 5 seconds (set in hooks_config.periodic_interval_seconds)

# Monitor resource usage
stats=$(docker stats --no-stream --format "{{.MemUsage}}")

# Log to file
echo "$(date +%s),$(date),${stats}" >> /out/metrics.csv

# Check if threshold exceeded
if [ "${stats}" -gt 500000000 ]; then
  echo "ALERT: Memory usage exceeded 500MB" >> /out/alerts.log
fi
```

**Common Tasks**:

- Resource monitoring (CPU, memory, I/O)
- Custom metrics collection
- Early termination if thresholds exceeded
- Real-time performance tracking

### Hook Execution Order

**Pre-hooks**: Sequential by filename

```
01_install.sh
02_setup.sh
03_validate.sh
```

**Post-hooks**: Sequential by filename (or parallel if enabled)

```
01_test_correctness.sh  (waits)
02_evaluate_performance.sh (waits)
03_collect_results.sh   (waits)
```

**Parallel example** (if two hooks have same prefix):

```
01_test_a.sh  (concurrent with 01_test_b.sh)
01_test_b.sh  (concurrent with 01_test_a.sh)
02_evaluate.sh (waits for all 01_* to complete)
```

### Hook Environment Variables

Hooks inherit:

- Container `environment` from `config.json`
- Judgehost-provided variables:
  - `SUBMISSION_ID`: Unique submission identifier
  - `PROBLEM_ID`: Problem identifier
  - `CONTAINER_ID`: Current container ID
  - `PROBLEM_VERSION`: Problem version
  - `EVALUATION_START_TIME`: Unix timestamp when evaluation started

### Hook Standard Streams

**stdout**: Logged to `/out/logs/hooks.log` (combined with other outputs)

**stderr**: Logged to `/out/logs/hooks.error.log`

**Exit code**: Must be `0` for success; non-zero aborts hook sequence

### Hook Debugging

To debug hooks during development:

1. Set `hook_timeout_seconds` to a high value in `hooks_config`
2. Add verbose logging: `set -x` at top of hook
3. Write intermediate results to `/out/` for inspection
4. Use `docker exec` to manually test hook scripts in running containers

---

## Rubrics: Evaluation & Scoring

### Rubric Output Format

Each rubric writes a JSON file to `/out/rubric_<rubric_id>.json`:

```json
{
  "rubric_id": "correctness",
  "score": 45,
  "max_score": 50,
  "verdict": "PASS",
  "details": {
    "tests_passed": 9,
    "tests_total": 10,
    "failures": [
      {
        "test_name": "test_edge_case_3",
        "error": "Expected 5, got 6"
      }
    ]
  },
  "metadata": {
    "evaluated_at": "2025-10-19T15:30:45Z",
    "evaluator": "test_hook_01"
  }
}
```

### Scoring Rubric

Final score calculation:

```
total_score = sum(rubric.score for each rubric)
max_total_score = sum(rubric.max_score for each rubric)

weighted_score = sum(rubric.score * rubric.weight for each rubric) /
                 sum(rubric.max_score * rubric.weight for each rubric)

normalized_score = (total_score / max_total_score) * 100
```

**Example**:

| Rubric       | Score  | Max     | Weight  | Weighted Score      |
| ------------ | ------ | ------- | ------- | ------------------- |
| Correctness  | 45     | 50      | 2.0     | 90                  |
| Performance  | 24     | 30      | 1.5     | 36                  |
| Code Quality | 18     | 20      | 1.0     | 18                  |
| **Total**    | **87** | **100** | **4.5** | **144 / 180 = 80%** |

### Verdict Codes

Rubric results should include a `verdict` field:

- `PASS`: Acceptable performance
- `FAIL`: Below acceptable threshold
- `PARTIAL`: Partial success
- `SKIP`: Test skipped (optional, for conditional tests)
- `ERROR`: Evaluation error occurred

### Rubric Aggregation

The evaluation framework aggregates all rubric results:

```json
{
  "submission_id": "sub_...",
  "problem_id": "two-sum",
  "status": "COMPLETED",
  "rubrics": [
    {
      "rubric_id": "correctness",
      "score": 45,
      "max_score": 50,
      "verdict": "PASS"
    },
    ...
  ],
  "total_score": 87,
  "max_total_score": 100,
  "normalized_score": 87.0,
  "verdict": "PASS"
}
```

---

## Submission Distribution & Mounting

### Default Submission Package

If no `submission_packages` defined, judgehost creates a default:

```json
"submission_packages": [
  {
    "package_id": "main",
    "container_id": "<first_container_that_accepts_submission>",
    "extract_path": "/"
  }
]
```

### Multi-Part Submissions

For problems requiring separate submissions (frontend + backend, etc.):

```json
"submission_packages": [
  {
    "package_id": "frontend",
    "container_id": "ui-tester",
    "extract_path": "/app/frontend"
  },
  {
    "package_id": "backend",
    "container_id": "api-tester",
    "extract_path": "/app/backend"
  }
]
```

**Submission format**: User sends ZIP/TAR with:

```
submission.zip
├── frontend/
│   └── ... (files extracted to /app/frontend)
└── backend/
    └── ... (files extracted to /app/backend)
```

### Mounting & File Availability

By default, these paths are mounted in each container:

| Source (in package)             | Destination (in container) | Read-only | Available to                         |
| ------------------------------- | -------------------------- | --------- | ------------------------------------ |
| `<container_id>/hooks/pre`      | `/hooks/pre`               | Yes       | Execution system (not containers)    |
| `<container_id>/hooks/post`     | `/hooks/post`              | Yes       | Execution system (not containers)    |
| `<container_id>/hooks/periodic` | `/hooks/periodic`          | Yes       | Execution system (not containers)    |
| `<container_id>/data`           | `/data`                    | Yes       | Containers (if mounted)              |
| Submission files                | `<extract_path>`           | Yes       | Containers that accept submission    |
| `/out`                          | `/out`                     | No        | All containers (for writing results) |

### Custom Mounts

Define custom mounts in `mounts` array:

```json
"mounts": [
  {
    "type": "bind",
    "source": "shared_data",
    "destination": "/shared",
    "read_only": true
  },
  {
    "type": "tmpfs",
    "destination": "/tmp",
    "read_only": false
  }
]
```

**Mount types**:

- `bind`: Bind mount from package (source must exist in package)
- `volume`: Docker named volume
- `tmpfs`: In-memory filesystem

---

## Multi-Container Examples

### Example 1: Simple Algorithm Problem

```json
{
  "problem_id": "two-sum",
  "problem_name": "Two Sum Algorithm Challenge",
  "project_type": "algorithm",
  "version": "1.0.0",

  "containers": [
    {
      "container_id": "submission",
      "container_name": "User Submission",
      "dockerfile_path": "submission/Dockerfile",
      "accepts_submission": true,
      "environment": {
        "SOLUTION_LANGUAGE": "python"
      },
      "resource_limits": {
        "memory": "512m",
        "cpus": 1.0,
        "timeout": 300
      }
    },
    {
      "container_id": "tester",
      "container_name": "Test Runner",
      "dockerfile_path": "tester/Dockerfile",
      "accepts_submission": false,
      "resource_limits": {
        "memory": "256m",
        "cpus": 0.5,
        "timeout": 300
      },
      "depends_on": [
        {
          "container_id": "submission",
          "condition": "started",
          "timeout": 10
        }
      ],
      "mounts": [
        {
          "type": "bind",
          "source": "tester/data",
          "destination": "/test_data",
          "read_only": true
        }
      ]
    }
  ],

  "rubrics": [
    {
      "rubric_id": "correctness",
      "rubric_name": "Correctness",
      "rubric_type": "test_cases",
      "max_score": 60,
      "container": "tester"
    },
    {
      "rubric_id": "performance",
      "rubric_name": "Performance",
      "rubric_type": "performance_benchmark",
      "max_score": 30,
      "container": "tester"
    },
    {
      "rubric_id": "code_quality",
      "rubric_name": "Code Quality",
      "rubric_type": "code_quality",
      "max_score": 10,
      "container": "submission"
    }
  ]
}
```

### Example 2: Database Query Optimization

```json
{
  "problem_id": "sql-optimization",
  "problem_name": "Database Query Optimization Challenge",
  "project_type": "database",
  "version": "1.0.0",

  "containers": [
    {
      "container_id": "database",
      "container_name": "PostgreSQL Database",
      "dockerfile_path": "database/Dockerfile",
      "accepts_submission": false,
      "environment": {
        "POSTGRES_USER": "testuser",
        "POSTGRES_PASSWORD": "secret",
        "POSTGRES_DB": "testdb"
      },
      "resource_limits": {
        "memory": "2gb",
        "cpus": 2.0,
        "timeout": 1800
      },
      "ports": ["5432"],
      "health_check": {
        "command": "pg_isready -U testuser -d testdb || exit 1",
        "interval": 5,
        "timeout": 3,
        "retries": 3,
        "start_period": 10
      }
    },
    {
      "container_id": "submission",
      "container_name": "Query Submission",
      "dockerfile_path": "submission/Dockerfile",
      "accepts_submission": true,
      "resource_limits": {
        "memory": "1gb",
        "cpus": 1.0,
        "timeout": 600
      },
      "depends_on": [
        {
          "container_id": "database",
          "condition": "healthy",
          "timeout": 30,
          "retry": 5,
          "retry_interval": 2
        }
      ],
      "environment": {
        "DB_HOST": "database",
        "DB_PORT": "5432",
        "DB_USER": "testuser",
        "DB_PASSWORD": "secret",
        "DB_NAME": "testdb"
      }
    }
  ],

  "submission_packages": [
    {
      "package_id": "main",
      "container_id": "submission",
      "extract_path": "/"
    }
  ],

  "rubrics": [
    {
      "rubric_id": "correctness",
      "rubric_name": "Query Correctness",
      "rubric_type": "test_cases",
      "max_score": 50,
      "container": "submission"
    },
    {
      "rubric_id": "performance",
      "rubric_name": "Query Performance",
      "rubric_type": "performance_benchmark",
      "max_score": 30,
      "container": "submission"
    },
    {
      "rubric_id": "efficiency",
      "rubric_name": "Storage Efficiency",
      "rubric_type": "resource_usage",
      "max_score": 20,
      "container": "submission"
    }
  ],

  "network": {
    "internet_access": false
  },

  "timeouts": {
    "problem_total_seconds": 1800,
    "hook_execution_seconds": 60
  }
}
```

### Example 3: Full-Stack Web Application

```json
{
  "problem_id": "todo-app",
  "problem_name": "Full-Stack Todo Application",
  "project_type": "fullstack",

  "containers": [
    {
      "container_id": "database",
      "dockerfile_path": "database/Dockerfile",
      "environment": { "POSTGRES_PASSWORD": "secret" },
      "health_check": {
        "command": "pg_isready -U postgres || exit 1",
        "interval": 5,
        "timeout": 3,
        "retries": 3,
        "start_period": 10
      }
    },
    {
      "container_id": "backend",
      "dockerfile_path": "backend/Dockerfile",
      "accepts_submission": true,
      "environment": {
        "DB_HOST": "database",
        "NODE_ENV": "test",
        "PORT": "3000"
      },
      "depends_on": [
        {
          "container_id": "database",
          "condition": "healthy",
          "timeout": 30
        }
      ],
      "health_check": {
        "command": "curl -f http://localhost:3000/health || exit 1",
        "interval": 10,
        "timeout": 5,
        "retries": 3,
        "start_period": 15
      }
    },
    {
      "container_id": "frontend",
      "dockerfile_path": "frontend/Dockerfile",
      "environment": {
        "REACT_APP_API_URL": "http://backend:3000",
        "PORT": "3001"
      },
      "depends_on": [
        {
          "container_id": "backend",
          "condition": "healthy",
          "timeout": 30
        }
      ]
    },
    {
      "container_id": "e2e-tester",
      "dockerfile_path": "e2e/Dockerfile",
      "environment": {
        "FRONTEND_URL": "http://frontend:3001",
        "API_URL": "http://backend:3000"
      },
      "depends_on": [
        { "container_id": "frontend", "condition": "started" },
        { "container_id": "backend", "condition": "healthy" }
      ]
    }
  ],

  "rubrics": [
    {
      "rubric_id": "backend_api",
      "rubric_type": "api_endpoints",
      "max_score": 30,
      "container": "e2e-tester"
    },
    {
      "rubric_id": "frontend_ui",
      "rubric_type": "ui_test",
      "max_score": 30,
      "container": "e2e-tester"
    },
    {
      "rubric_id": "integration",
      "rubric_type": "integration_test",
      "max_score": 40,
      "container": "e2e-tester"
    }
  ]
}
```

---

## Best Practices & Common Patterns

### 1. Keep Containers Small and Focused

❌ **Bad**: Single "everything" container

```json
{
  "container_id": "all-in-one",
  "dockerfile_path": "Dockerfile"
}
```

✅ **Good**: Separate containers by responsibility

```json
[
  { "container_id": "database", "dockerfile_path": "database/Dockerfile" },
  { "container_id": "app", "dockerfile_path": "app/Dockerfile" },
  { "container_id": "tester", "dockerfile_path": "tester/Dockerfile" }
]
```

### 2. Use Health Checks for Readiness

❌ **Bad**: Assume container is ready immediately

```json
{
  "depends_on": [{ "container_id": "database", "condition": "started" }]
}
```

✅ **Good**: Wait for health check

```json
{
  "depends_on": [
    {
      "container_id": "database",
      "condition": "healthy",
      "timeout": 30,
      "retry": 5,
      "retry_interval": 2
    }
  ]
}
```

### 3. Fail Fast in Hooks

❌ **Bad**: Continue despite errors

```bash
#!/bin/bash
python tests.py
# Continue even if tests fail
cp results.json /out/
```

✅ **Good**: Exit on first error

```bash
#!/bin/bash
set -e
python tests.py || exit 1
cp results.json /out/
```

### 4. Generate Machine-Readable Output

❌ **Bad**: Free-text rubric output

```bash
echo "Tests: 8/10 passed" > /out/rubric_correctness.json
```

✅ **Good**: Structured JSON output

```bash
python - << 'EOF'
import json
with open('/out/rubric_correctness.json', 'w') as f:
    json.dump({
        "rubric_id": "correctness",
        "score": 40,
        "max_score": 50,
        "details": {"passed": 8, "total": 10}
    }, f)
EOF
```

### 5. Isolate Test Data

❌ **Bad**: Mixed test data and hooks

```
package/
├── hooks/post/
│   └── test.sh
└── test_data.txt  # Where is this?
```

✅ **Good**: Organized data structure

```
package/
├── tester/
│   ├── Dockerfile
│   ├── hooks/post/
│   │   └── run_tests.sh
│   └── data/
│       ├── fixtures.json
│       └── expected.txt
```

### 6. Resource Limits Prevent Runaway Evaluations

```json
"resource_limits": {
  "memory": "1gb",        # Prevent memory bombs
  "cpus": 2.0,            # Limit CPU
  "timeout": 600          # Max lifetime
}
```

### 7. Use Environment Variables for Configuration

❌ **Bad**: Hardcoded values in hooks

```bash
python train_model.py --lr=0.001 --epochs=100
```

✅ **Good**: Environment-driven

```bash
python train_model.py --lr=$LR --epochs=$EPOCHS
```

```json
"environment": {
  "LR": "0.001",
  "EPOCHS": "100"
}
```

### 8. Ensure Idempotent Hooks

Hooks should produce the same output when run multiple times with the same input.

❌ **Bad**: Appending to files

```bash
echo "test result" >> /out/results.txt
```

✅ **Good**: Overwrite or clear first

```bash
rm -f /out/results.txt
echo "test result" > /out/results.txt
```

### 9. Use Meaningful Container & Hook Names

```json
"containers": [
  {
    "container_id": "submission_executor",
    "container_name": "User Submission Executor"
  }
]
```

```bash
hooks/pre/
├── 01_install_dependencies.sh
├── 02_compile_code.sh
└── 03_verify_requirements.sh
```

### 10. Document Expected Submission Format

Create `SUBMISSION.md` in package root:

```markdown
# Submission Format

## Expected Directory Structure
```

submission.zip
├── src/
│ └── solution.py
├── tests/
│ └── test_solution.py
└── README.md

```

## File Requirements

- `solution.py`: Main solution file with function `solve(x)`
- `tests/`: Unit tests for your solution
- `README.md`: Brief explanation of approach

## Constraints

- Solution must complete in <1 second for any input
- Maximum file size: 10MB
```

---

## Troubleshooting & Validation

### Common Issues & Solutions

#### Issue 1: "config.json not found"

- Ensure `config.json` is in package root
- Check file name spelling (case-sensitive)
- Verify it's valid JSON: `cat config.json | jq .`

#### Issue 2: "Dockerfile not found for container X"

- Check `dockerfile_path` in config.json
- Verify file exists at that path (relative to package root)
- Check for typos in path

#### Issue 3: Hooks not executing

- Ensure hook files are executable: `chmod +x hooks/pre/*.sh`
- Check hook filenames follow convention: `NN_name.sh`
- Verify hooks are in correct directory: `hooks/pre/`, `hooks/post/`, `hooks/periodic/`
- Check hook exit codes: should be `0` for success

#### Issue 4: Container fails to start

- Check Dockerfile syntax: `docker build -f Dockerfile .`
- Verify base image is accessible
- Check resource limits aren't too low
- Review container logs for startup errors

#### Issue 5: Rubric scores not generated

- Ensure hooks write to `/out/rubric_<rubric_id>.json`
- Verify JSON format is correct
- Check that `rubric_id` in JSON matches config.json
- Ensure hooks exit with code `0`

#### Issue 6: Submission not mounted

- Verify `accepts_submission: true` on container
- Check `submission_packages` is configured correctly
- Ensure extraction path is correct
- Verify submission archive structure matches expected format

### Validation Checklist

Run these checks before registering a problem:

```bash
#!/bin/bash
set -e

PACKAGE_DIR="."

echo "Validating problem package..."

# 1. Check config.json exists and is valid JSON
if [ ! -f "$PACKAGE_DIR/config.json" ]; then
  echo "❌ config.json not found"
  exit 1
fi
jq . "$PACKAGE_DIR/config.json" > /dev/null || exit 1
echo "✅ config.json valid"

# 2. Check all referenced Dockerfiles exist
dockerfiles=$(jq -r '.containers[].dockerfile_path' "$PACKAGE_DIR/config.json")
for df in $dockerfiles; do
  if [ ! -f "$PACKAGE_DIR/$df" ]; then
    echo "❌ Dockerfile not found: $df"
    exit 1
  fi
done
echo "✅ All Dockerfiles found"

# 3. Check hooks are executable
for hook in "$PACKAGE_DIR"/*/hooks/pre/*.sh "$PACKAGE_DIR"/*/hooks/post/*.sh; do
  if [ -f "$hook" ] && [ ! -x "$hook" ]; then
    echo "❌ Hook not executable: $hook"
    chmod +x "$hook"
  fi
done
echo "✅ Hooks executable"

# 4. Check problem_id matches pattern
problem_id=$(jq -r '.problem_id' "$PACKAGE_DIR/config.json")
if ! echo "$problem_id" | grep -qE '^[a-z][a-z0-9-]{2,63}$'; then
  echo "❌ Invalid problem_id: $problem_id"
  exit 1
fi
echo "✅ problem_id valid"

# 5. Check unique rubric IDs
rubric_ids=$(jq -r '.rubrics[].rubric_id' "$PACKAGE_DIR/config.json")
if [ $(echo "$rubric_ids" | wc -l) -ne $(echo "$rubric_ids" | sort -u | wc -l) ]; then
  echo "❌ Duplicate rubric IDs"
  exit 1
fi
echo "✅ Rubric IDs unique"

echo "✅ All checks passed!"
```

---

## Summary

This document provides the complete specification for authoring problem packages. Key takeaways:

1. **Organize by responsibility**: Use container-specific subdirectories
2. **Define containers first**: Each container needs a Dockerfile and ID
3. **Add hooks for evaluation**: Pre-execution, post-execution, and periodic hooks
4. **Generate rubrics**: Write structured JSON output to `/out/`
5. **Test locally**: Use Docker to test hooks before uploading
6. **Follow naming conventions**: Snake_case for IDs, numeric prefixes for hooks
7. **Document clearly**: Include README.md and SUBMISSION.md
8. **Handle failures gracefully**: Use `set -e` in hooks, meaningful error messages

For questions or issues, refer to the example packages in `mock/packages/` and the API documentation in `docs/`.
