#!/usr/bin/env bash
# Load seed data into SurrealDB
# Requires: surreal CLI, DB running on 127.0.0.1:8000
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_FILE="$SCRIPT_DIR/seed-data.surql"

surreal import --conn http://127.0.0.1:8000 --user root --pass root --ns agentuidb --db default "$DATA_FILE"
echo "Seed data loaded."
