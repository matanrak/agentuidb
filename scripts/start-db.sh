#!/usr/bin/env bash
# Start SurrealDB for local development
# Data is persisted to .surreal/ (gitignored)

set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$DIR/.surreal"
mkdir -p "$DATA_DIR"

echo "Starting SurrealDB on http://127.0.0.1:8000 ..."
echo "Data dir: $DATA_DIR"
echo ""

exec surreal start \
  --bind 127.0.0.1:8000 \
  --user root \
  --pass root \
  "file:$DATA_DIR"
