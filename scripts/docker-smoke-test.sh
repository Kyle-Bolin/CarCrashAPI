#!/usr/bin/env bash
# Builds the Docker image, starts the Compose stack and checks how the API behaves.
# CI runs this on every pull request (the "Docker smoke test" job); run it locally
# with `pnpm test:docker`. Set COMPOSE to pass extra -f files.
set -euo pipefail
read -r -a compose <<<"${COMPOSE:-docker compose}"
step() { printf '\n=== %s ===\n' "$*"; }

step "Start the stack and wait for a healthy database"
"${compose[@]}" up --build --detach --wait --wait-timeout 180

step "The API serves /healthz"
curl --fail --silent --show-error --retry 15 --retry-connrefused --retry-delay 2 \
  http://localhost:3000/healthz | tee /dev/stderr | jq -e '.status == "ok"' >/dev/null

step "The API runs as a non-root user"
user=$("${compose[@]}" exec -T api id -un)
echo "user: $user"
[ "$user" != "root" ]

step "The API refuses to start when the database is unreachable"
"${compose[@]}" stop db
set +e
output=$(timeout 60 "${compose[@]}" run --rm --no-deps -T api 2>&1)
status=$?
set -e
echo "$output"
echo "exit status: $status"
[ "$status" -ne 0 ] && grep -q "Cannot reach the database" <<<"$output"

step "The API refuses to start with invalid configuration"
set +e
output=$(timeout 60 "${compose[@]}" run --rm --no-deps -T -e DATABASE_URL=not-a-url -e PORT=abc api 2>&1)
status=$?
set -e
echo "$output"
echo "exit status: $status"
[ "$status" -ne 0 ] && grep -q "DATABASE_URL" <<<"$output" && grep -q "PORT" <<<"$output"

printf '\nDocker smoke test passed\n'
