#!/usr/bin/env bash
# Start SurrealDB and load seed data automatically
# Data is persisted to .surreal/ (gitignored)

set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$DIR/.surreal"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_FILE="$SCRIPT_DIR/seed-data.surql"

mkdir -p "$DATA_DIR"

# Start SurrealDB in the background
surreal start \
  --bind 127.0.0.1:8000 \
  --user root \
  --pass root \
  "file:$DATA_DIR" &

DB_PID=$!
trap "kill $DB_PID 2>/dev/null" EXIT

# Wait for DB to be ready
echo "Waiting for SurrealDB to start..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8000/health > /dev/null 2>&1; then
    break
  fi
  sleep 0.3
done

if ! curl -sf http://127.0.0.1:8000/health > /dev/null 2>&1; then
  echo "SurrealDB failed to start"
  exit 1
fi

# Load seed data (skip if already loaded)
echo "Loading seed data..."
if surreal import --conn http://127.0.0.1:8000 --user root --pass root --ns agentuidb --db default "$DATA_FILE" 2>/dev/null; then
  echo "Sample data loaded."
else
  echo "Sample data already present, skipping import."
fi
echo ""
echo "SurrealDB running on http://127.0.0.1:8000"
echo "Press Ctrl+C to stop."

# Keep running in foreground
wait $DB_PID
