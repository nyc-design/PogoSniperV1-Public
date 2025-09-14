#!/usr/bin/env bash

set -Eeuo pipefail

# Linux/CLI starter for PogoSniperV1-Public (no ngrok)
# - Starts backend (Server-bot.js)
# - Starts frontend (React dev server on port 3000)

ROOT_DIR=$(cd "$(dirname "$0")" && pwd)
LOG_DIR="$ROOT_DIR/logs"
mkdir -p "$LOG_DIR"

BACKEND_PID=""
FRONTEND_PID=""

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: Required command '$1' is not installed or not in PATH." >&2
    exit 1
  fi
}

wait_for_port() {
  local host="$1" port="$2" timeout_sec="$3"
  local start_ts end_ts
  start_ts=$(date +%s)
  end_ts=$(( start_ts + timeout_sec ))

  echo "Waiting for $host:$port (timeout ${timeout_sec}s)..."
  while :; do
    # Prefer nc if available
    if command -v nc >/dev/null 2>&1; then
      if nc -z "$host" "$port" >/dev/null 2>&1; then
        return 0
      fi
    else
      # Fallback: attempt TCP connect using bash/curl
      if curl -sS --max-time 1 "http://$host:$port" >/dev/null 2>&1; then
        return 0
      fi
    fi
    if [ "$(date +%s)" -ge "$end_ts" ]; then
      return 1
    fi
    sleep 1
  done
}

cleanup() {
  echo
  echo "Shutting down services..."
  set +e
  if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" 2>/dev/null || true
    wait "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
  echo "Done."
}

trap cleanup INT TERM

echo "Launching Pogo Dashboard…"

# Check core dependencies
require_cmd node
require_cmd npm
:

# Start backend
echo "Starting backend (Server-bot.js)..."
node "$ROOT_DIR/Server-bot.js" >>"$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID (logs: $LOG_DIR/backend.log)"

# Start frontend
echo "Starting frontend (React dev server on :3000)..."
( cd "$ROOT_DIR/frontend" && npm start >>"$LOG_DIR/frontend.log" 2>&1 ) &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID (logs: $LOG_DIR/frontend.log)"

echo
echo "Backend and frontend started. Open http://localhost:3000 in your browser."

# Keep script attached to background jobs
wait
