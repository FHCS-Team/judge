# Judgehost

A containerized evaluation orchestration system **prototype** for automated assessment of code submissions. Judgehost provides secure, scalable, and flexible evaluation of programming assignments using Docker containers and multi-stage evaluation pipelines.

> **Note**: This is a prototype system demonstrating core functionality.

## Features

### Core Capabilities (Implemented)

- **Multi-container evaluation architecture** - Complex submissions can be evaluated using multiple specialized containers
- **Docker-based sandboxing** - Secure execution environments with resource limits and network isolation
- **Priority-based job queue** - Efficient processing with configurable worker pools and priority scheduling
- **Flexible submission formats** - Support for file uploads, Git repositories, and archive URLs
- **Comprehensive rubric system** - Automated grading with detailed scoring breakdowns
- **Real-time evaluation tracking** - Monitor submission progress through queue status
- **DOMserver integration** - Compatible with programming contest management systems

### Security & Reliability (Implemented)

- **Resource quotas** - Configurable CPU, memory, and time limits per evaluation
- **Network isolation** - Containers run in isolated Docker networks
- **Graceful error handling** - Robust failure recovery and detailed error reporting
- **Rate limiting** - Prevent abuse with configurable per-team submission limits

### Deployment & Operations (Current State)

- **Local filesystem storage** - File-based storage for problems, submissions, and results
- **Basic logging** - Structured JSON logging with configurable levels
- **RESTful API** - Complete HTTP API for problem management and submission handling
- **Container lifecycle management** - Automatic cleanup and resource management
- **Basic health checks** - Simple health monitoring endpoints

## Quick Start

### Prerequisites

- Docker Engine 20.10+
- Node.js 18+
- Linux host (recommended for container security features)

### Installation

1. **Clone and install dependencies:**

```bash
git clone <repository-url> judgehost
cd judgehost
npm install
```

2. **Create working directories:**

```bash
mkdir -p /tmp/judgehost/{problems,submissions,results,uploads}
```

3. **Configure environment (optional):**

```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start the service:**

```bash
npm start
```

The API will be available at `http://localhost:3000/api` by default.

### Basic Usage

#### 1. Register a Problem

Upload a problem package containing evaluation containers and rubrics:

```bash
curl -X POST http://localhost:3000/api/problems \
  -F "problem_id=hello-world" \
  -F "problem_name=Hello World Challenge" \
  -F "package_type=file" \
  -F "problem_package=@hello-world.tar.gz"
```

#### 2. Submit a Solution

Submit code for evaluation:

```bash
curl -X POST http://localhost:3000/api/submissions \
  -F "problem_id=hello-world" \
  -F "package_type=file" \
  -F "submission_file=@solution.zip"
```

#### 3. Check Results

Retrieve evaluation results:

```bash
curl http://localhost:3000/api/results/{submission_id}
```

## Architecture

### Evaluation Flow

```
Problem Package → Image Build → Submission Queue → Multi-Container Evaluation → Results
```

1. **Problem Registration**: Upload problem packages with Dockerfiles, evaluation scripts, and rubrics
2. **Image Building**: Build Docker images for each container in the problem
3. **Submission Processing**: Queue submissions with priority-based scheduling
4. **Container Orchestration**: Start containers with dependencies, health checks, and resource limits
5. **Evaluation Execution**: Run evaluation hooks via `docker exec` commands
6. **Result Collection**: Aggregate rubric scores and logs
7. **Cleanup**: Remove containers and networks after evaluation

### Multi-Container Model

Problems can define multiple specialized containers:

- **Submission Container**: Executes student code with security restrictions
- **Tester Container**: Runs automated tests and validation
- **Service Container**: Provides databases, APIs, or other infrastructure

Containers communicate through Docker networks and shared volumes, with judgehost orchestrating the entire evaluation workflow.

### Queue System

- **Priority-based processing**: Jobs processed by priority (1-10, configurable)
- **Worker pool management**: Configurable concurrent evaluation limits
- **Rate limiting**: Per-team submission throttling (if enabled)
- **Job states**: Queued → Running → Completed/Failed/Cancelled

## API Reference

### Problems

| Endpoint             | Method | Description                    |
| -------------------- | ------ | ------------------------------ |
| `/api/problems`      | GET    | List all registered problems   |
| `/api/problems`      | POST   | Register a new problem package |
| `/api/problems/{id}` | GET    | Get problem details            |
| `/api/problems/{id}` | DELETE | Delete a problem               |

### Submissions

| Endpoint                | Method | Description                |
| ----------------------- | ------ | -------------------------- |
| `/api/submissions`      | POST   | Submit code for evaluation |
| `/api/submissions/{id}` | GET    | Get submission status      |
| `/api/submissions/{id}` | DELETE | Cancel a submission        |

### Results

| Endpoint                 | Method | Description            |
| ------------------------ | ------ | ---------------------- |
| `/api/results/{id}`      | GET    | Get evaluation results |
| `/api/results/{id}/logs` | GET    | Get execution logs     |

### System

| Endpoint      | Method | Description                 |
| ------------- | ------ | --------------------------- |
| `/api/health` | GET    | System health check         |
| `/api/queue`  | GET    | Queue status and statistics |

## Configuration

Judgehost uses environment variables or a `.env` file for configuration:

### Core Settings

```bash
# API Server
API_PORT=3000
API_HOST=0.0.0.0
API_BASE_PATH=/api

# Docker Configuration
DOCKER_HOST=unix:///var/run/docker.sock
NETWORK_BRIDGE_NAME=judgehost-eval-network

# Resource Limits
JUDGEHOST_MAX_WORKERS=3
JUDGEHOST_CONTAINER_MAX_MEMORY_MB=4096
JUDGEHOST_CONTAINER_MAX_CPU_CORES=4.0
JUDGEHOST_DEFAULT_TIMEOUT_SECONDS=600

# Storage Paths
JUDGEHOST_WORK_DIR=/tmp/judgehost
JUDGEHOST_PROBLEMS_DIR=/var/lib/judgehost/problems
JUDGEHOST_SUBMISSIONS_DIR=/var/lib/judgehost/submissions
JUDGEHOST_RESULTS_DIR=/var/lib/judgehost/results

# Queue Configuration
JUDGEHOST_MAX_QUEUE_SIZE=100
JUDGEHOST_RATE_LIMIT_ENABLED=false
JUDGEHOST_RATE_LIMIT_PER_TEAM=10

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

### DOMserver Integration (Optional)

```bash
# Enable DOMserver integration
DOMSERVER_ENABLED=false
DOMSERVER_URL=https://domserver.example.com
DOMSERVER_USERNAME=judgehost
DOMSERVER_PASSWORD=secret
DOMSERVER_SUBMIT_RESULTS=true
```

## Problem Package Format

Problem packages define the evaluation environment and rubrics:

```
problem-package.tar.gz
├── config.json              # Problem configuration
├── container1/
│   ├── Dockerfile           # Container image definition
│   ├── stage2.json          # Runtime configuration
│   ├── hooks/               # Evaluation scripts
│   │   ├── pre/             # Pre-evaluation setup
│   │   └── post/            # Evaluation execution
│   └── tools/               # Helper utilities
└── container2/
    └── ...
```

### Example config.json

```json
{
  "problem_id": "hello-world",
  "problem_name": "Hello World Challenge",
  "containers": [
    {
      "container_id": "runner",
      "dockerfile_path": "runner/Dockerfile",
      "accepts_submission": true,
      "depends_on": []
    },
    {
      "container_id": "tester",
      "dockerfile_path": "tester/Dockerfile",
      "accepts_submission": false,
      "depends_on": [
        {
          "container_id": "runner",
          "timeout": 60
        }
      ]
    }
  ],
  "rubrics": [
    {
      "rubric_id": "functionality",
      "name": "Code Functionality",
      "type": "test_cases",
      "max_score": 80
    },
    {
      "rubric_id": "style",
      "name": "Code Style",
      "type": "static_analysis",
      "max_score": 20
    }
  ]
}
```

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- queue.test.js

# Run with coverage
npm test -- --coverage
```

### Development Mode

```bash
# Start with file watching
npm run dev
```

### Docker Build

```bash
# Build production image
docker build -t judgehost .

# Run container
docker run -v /var/run/docker.sock:/var/run/docker.sock \
  -p 3000:3000 judgehost
```

## Security Considerations

### Container Security

- Containers run with basic Docker isolation
- Network access controlled through Docker networks
- Resource limits prevent basic denial-of-service attacks

### Host Security

- Docker socket access required for container management
- Evaluation workspaces isolated to configured directories
- File permissions enforced for uploaded content
- Rate limiting available to prevent submission flooding

### Best Practices

- Run judgehost on dedicated evaluation hosts
- Use firewall rules to restrict network access
- Regularly update base images and dependencies
- Set appropriate resource limits for your environment
- Enable rate limiting if needed for your use case

## Troubleshooting

### Common Issues

**Container build failures:**

- Check Dockerfile syntax in problem packages
- Verify base images are accessible
- Review build logs in evaluation results

**Evaluation timeouts:**

- Increase timeout limits in configuration
- Check container resource usage
- Verify dependency health checks

**Queue processing issues:**

- Check available worker capacity
- Review rate limiting configuration if enabled
- Monitor system resource availability

**Network connectivity problems:**

- Verify Docker network configuration
- Check firewall rules for container communication
- Review dependency timeout settings

### Logs and Debugging

- Structured JSON logs available at configured log level
- Container logs preserved in evaluation results
- Queue status available via API endpoint
- Health check endpoint for basic system monitoring

## Contributing

This is the prototype version only. We do not accept external contributions at this time.

### Development Guidelines

- Follow existing code style and structure
- Add tests for new functionality
- Update documentation for API changes
- Ensure Docker containers clean up properly
- Test with various problem package formats

## License

This project is licensed under the GNU General Public License - see the [LICENSE](LICENSE) file for details.
