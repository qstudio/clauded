#!/bin/bash

# Run local clauded package
# Usage: ./run-local.sh [command] [args]

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if node is available
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH"
    exit 1
fi

# Run clauded from the local package
node "$SCRIPT_DIR/bin/clauded.js" "$@" 