#!/bin/bash

# Judgehost Setup Script
# Creates necessary directories and validates configuration

set -e

echo "🚀 Judgehost Setup"
echo "=================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Docker is installed
echo "📦 Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker is not installed${NC}"
    echo "  Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi
echo -e "${GREEN}✓ Docker is installed${NC}"

# Check if Docker daemon is running
echo "🐳 Checking Docker daemon..."
if ! docker ps &> /dev/null; then
    echo -e "${RED}✗ Docker daemon is not running${NC}"
    echo "  Please start Docker daemon"
    exit 1
fi
echo -e "${GREEN}✓ Docker daemon is running${NC}"

# Check Node.js version
echo "📦 Checking Node.js version..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js is not installed${NC}"
    echo "  Please install Node.js 18+: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${YELLOW}⚠ Node.js version is $NODE_VERSION, recommended 18+${NC}"
else
    echo -e "${GREEN}✓ Node.js version $(node -v)${NC}"
fi

# Check if .env exists
echo ""
echo "⚙️  Checking configuration..."
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠ .env file not found, creating from .env.example...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✓ Created .env file${NC}"
    echo "  Please review and customize .env file"
else
    echo -e "${GREEN}✓ .env file exists${NC}"
fi

# Load .env
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Create directories
echo ""
echo "📁 Creating directories..."

DIRS=(
    "${JUDGEHOST_WORK_DIR:-/tmp/judgehost}"
    "${JUDGEHOST_PROBLEMS_DIR:-/var/lib/judgehost/problems}"
    "${JUDGEHOST_SUBMISSIONS_DIR:-/var/lib/judgehost/submissions}"
    "${JUDGEHOST_RESULTS_DIR:-/var/lib/judgehost/results}"
    "${JUDGEHOST_LOGS_DIR:-/var/log/judgehost}"
)

for dir in "${DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir" 2>/dev/null || {
            echo -e "${YELLOW}⚠ Cannot create $dir (requires sudo)${NC}"
            echo "  Run: sudo mkdir -p $dir && sudo chown $USER:$USER $dir"
        }
    fi
    
    if [ -d "$dir" ] && [ -w "$dir" ]; then
        echo -e "${GREEN}✓ $dir${NC}"
    elif [ -d "$dir" ]; then
        echo -e "${YELLOW}⚠ $dir (not writable)${NC}"
    fi
done

# Install dependencies
echo ""
echo "📦 Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "Installing npm packages..."
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${GREEN}✓ Dependencies already installed${NC}"
fi

# Summary
echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Review .env configuration"
echo "  2. Start the server: npm run dev"
echo "  3. Check health: curl http://localhost:${API_PORT:-3000}/api/health"
echo ""
echo "📚 Documentation:"
echo "  - Implementation guide: IMPLEMENTATION.md"
echo "  - API documentation: docs/[API] *.md"
echo "  - System specs: docs/[SPEC] *.md"
echo ""
