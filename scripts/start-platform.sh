#!/usr/bin/env bash
# TravelExp on the MCP platform: the API and the desktop app on one port, run by the project's test server
# (dashboard → project → Test server; command: bash scripts/start-platform.sh {port}). It replaces
# docker-compose.yml there: the database is the project's MongoDB (.env, written by the platform), the app's own
# settings (COOKIE_SECRET, SMTP_*, ANTHROPIC_API_KEY …) are in the same .env. Builds what changed, then runs both;
# when either ends, both end (the platform starts the test server again).
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${1:?usage: start-platform.sh <port>}"
API_PORT="${API_PORT:-3007}"

set -a
. ./.env
set +a
# The API reads MONGO_URI; the platform writes MONGODB_URI / DATABASE_URL.
export MONGO_URI="${MONGO_URI:-${MONGODB_URI:-${DATABASE_URL:-}}}"
[ -n "$MONGO_URI" ] || { echo "start-platform: no MongoDB in .env (MONGODB_URI)" >&2; exit 1; }

newer() { [ -n "$(find "$@" -newer "$TARGET" -print -quit 2>/dev/null)" ]; }

echo "== API (services/node)"
( cd services/node
  [ -d node_modules ] || npm ci --no-audit --no-fund
  TARGET=dist/index.js; if [ ! -f "$TARGET" ] || newer src package.json tsconfig.json; then npx tsc; fi )

echo "== desktop (apps/desktop)"
( cd apps/desktop
  [ -d node_modules ] || npm ci --no-audit --no-fund
  # Same-origin API (/api, /socket): no VITE_API_URL / VITE_WS_URL from a local .env.
  TARGET=dist/index.html; if [ ! -f "$TARGET" ] || newer src public index.html package.json vite.config.ts; then
    env -u VITE_API_URL -u VITE_WS_URL npm run build
  fi )

echo "== run (web :$PORT, api 127.0.0.1:$API_PORT)"
# serve.mjs runs the API as its child: when either ends, both end (no signals needed, see serve.mjs).
PORT="$PORT" API_PORT="$API_PORT" API_ENTRY=services/node/dist/index.js exec node scripts/serve.mjs
