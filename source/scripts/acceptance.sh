#!/bin/sh
# Host performs Docker orchestration only. All app code, fixtures and assertions run in containers.
set -eu
cd "$(dirname "$0")/.."
project="material-studio-acceptance-$$"
export FRONTEND_PORT="${ACCEPTANCE_FRONTEND_PORT:-3107}"
export BACKEND_PORT="${ACCEPTANCE_BACKEND_PORT:-8107}"
compose() { docker compose --env-file .env.example -p "$project" -f compose.yaml -f compose.acceptance.yaml --profile tools "$@"; }
cleanup() {
  code=$?
  trap - EXIT HUP INT TERM
  if [ "$code" -ne 0 ]; then compose logs --tail 80 frontend backend mysql || true; fi
  if [ "${ACCEPTANCE_KEEP:-0}" = 1 ] && [ "$code" -eq 0 ]; then
    echo "Retained isolated project: $project (http://127.0.0.1:$FRONTEND_PORT)"
    echo "Cleanup: docker compose --env-file .env.example -p $project -f compose.yaml -f compose.acceptance.yaml --profile tools down --volumes --remove-orphans"
  else
    compose down --volumes --remove-orphans
  fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM
compose up --build -d --wait --wait-timeout 180 frontend
compose run --rm acceptance seed
compose down
compose up -d --wait --wait-timeout 180 frontend
compose run --rm acceptance verify
echo "PASS: complete isolated acceptance"
