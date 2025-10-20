#!/bin/sh
set -eu

echo "[PRE] Preparing workspace and optional generator"

# Ensure workspace and submission directories exist
mkdir -p /workspace /submission /shared

# Try to chown only workspace and submission; avoid changing ownership of /shared which may be a mounted volume
chown -R postgres:postgres /workspace /submission 2>/dev/null || true

echo "[PRE] Preparation complete"
