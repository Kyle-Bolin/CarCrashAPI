#!/usr/bin/env bash
# Builds the Docker image, starts the Compose stack and checks how the API behaves.
# CI runs this on every pull request (the "Docker smoke test" job); run it locally
# with `pnpm test:docker`. Set COMPOSE to pass extra -f files.
set -euo pipefail
read -r -a compose <<<"${COMPOSE:-docker compose}"
step() { printf '\n=== %s ===\n' "$*"; }
api=http://localhost:3000
get() { curl --fail --silent --show-error "$api$1"; }
db_count() {
  "${compose[@]}" exec -T db psql -U carcrash -d carcrash -tAc "SELECT count(*) FROM crashes"
}

step "Create .env from .env.example, as the README quick start does"
[ -f .env ] || cp .env.example .env

step "Start the stack: database, migrations, sample data, then the API"
# `up` waits for each depends_on condition, and fails if migrate or seed fails.
"${compose[@]}" up --build --detach
# The port opens before the server listens, so retry resets as well as refusals.
curl --fail --silent --show-error --retry 30 --retry-all-errors --retry-delay 2 \
  "$api/healthz" | tee /dev/stderr | jq -e '.status == "ok"' >/dev/null

step "The migrate and seed steps finished successfully"
"${compose[@]}" ps --all --format '{{.Service}} {{.State}} {{.ExitCode}}' | tee /dev/stderr \
  | awk '$1 == "migrate" || $1 == "seed" { n++; if ($3 != 0) bad = 1 } END { exit (n == 2 && !bad) ? 0 : 1 }'

step "GET /v1/crashes serves the sample data"
get "/v1/crashes?limit=5" | jq -e '.data | length == 5' >/dev/null
echo "ok"

step "GET /v1/crashes/{id} returns one crash with its time converted to UTC"
# fixtures/crashes.csv has SYN-1 at 2018-03-26 16:57 US/Pacific (PDT, UTC-7).
get /v1/crashes/SYN-1 | tee /dev/stderr \
  | jq -e '.id == "SYN-1" and .startTime == "2018-03-26T23:57:00.000Z" and .timezone == "America/Los_Angeles"' >/dev/null

step "An unknown ID is a 404 problem"
headers=$(curl --silent --output /dev/null --dump-header - "$api/v1/crashes/A-0")
echo "$headers" | head -1
grep -q "^HTTP/1.1 404" <<<"$headers" && grep -qi "^content-type: application/problem+json" <<<"$headers"

step "The city lookup ignores case and stays within the state"
get "/v1/states/oh/cities/COLUMBUS/crashes?limit=1000" \
  | jq -e '(.data | length > 0) and ([.data[].state] | unique == ["OH"])' >/dev/null
echo "ok"

step "The API serves the committed OpenAPI document and the docs page"
diff <(get /openapi.json | jq -S .) <(jq -S . openapi.json)
curl --fail --silent --output /dev/null "$api/docs"
echo "ok"

step "Seeding again changes nothing"
before=$(db_count)
"${compose[@]}" run --rm --no-deps -T seed
after=$(db_count)
echo "rows before: $before, after: $after"
[ "$before" -eq 1000 ] && [ "$after" -eq 1000 ]

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
