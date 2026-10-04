# CarCrashAPI

[![CI](https://github.com/Kyle-Bolin/CarCrashAPI/actions/workflows/ci.yml/badge.svg)](https://github.com/Kyle-Bolin/CarCrashAPI/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Kyle-Bolin/CarCrashAPI?include_prereleases&sort=semver)](https://github.com/Kyle-Bolin/CarCrashAPI/releases)

A REST API for US car crash data, being rewritten from a 2023 Go/Gin prototype
into TypeScript on AWS. It is a portfolio project: the process (ADRs, tests, CI/CD,
infrastructure as code, observability) is as much the deliverable as the API.

> **Status: v1 runs locally.** The three endpoints of the Go prototype are rebuilt
> under `/v1` with an OpenAPI spec, interactive docs and a CSV loader. AWS
> deployment comes next (epic [#7](https://github.com/Kyle-Bolin/CarCrashAPI/issues/7)).

**Live demo:** _not deployed yet_. The link will be added when staging is up (epic [#7](https://github.com/Kyle-Bolin/CarCrashAPI/issues/7)).

## Architecture

The design below is the **proposal** in [ADR-002 (#13)](https://github.com/Kyle-Bolin/CarCrashAPI/issues/13). It is not final until the ADR is accepted, and this diagram should then be replaced by the one in `docs/adr/0002-aws-architecture.md`.

```mermaid
flowchart LR
    client([Client]) --> apigw[API Gateway<br/>HTTP API]
    subgraph vpc[VPC, private subnets, no NAT]
        lambda[Lambda<br/>Node, arm64]
        rds[(RDS PostgreSQL<br/>db.t4g.micro)]
        lambda -- IAM database auth --> rds
    end
    apigw --> lambda
```

Terraform will provision everything, and deploys will authenticate to AWS through
GitHub OIDC, with no stored keys.

## Tech stack

| Area | Choice |
|---|---|
| Language / runtime | TypeScript 7 (strict), Node 24 |
| Web framework | [Hono](https://hono.dev), shared by a Node server and an AWS Lambda entry point |
| Tests | Vitest, with an 80% coverage gate |
| Lint / format | Biome |
| Package manager | pnpm |
| CI | GitHub Actions: lint, typecheck, tests, build, CodeQL, dependency review, actionlint |
| Cloud / IaC | AWS and Terraform (planned) |

The stack decision is tracked in [ADR-001 (#12)](https://github.com/Kyle-Bolin/CarCrashAPI/issues/12).

## Quick start

You need [Docker](https://docs.docker.com/get-docker/) with Compose. This starts
PostgreSQL, applies the migrations, loads 1,000 sample crashes and starts the API:

```sh
cp .env.example .env
docker compose up
```

Then open <http://localhost:3000/docs> for interactive docs, or try:

```sh
curl "localhost:3000/v1/crashes?limit=2"
curl localhost:3000/v1/crashes/SYN-1
curl "localhost:3000/v1/states/oh/cities/columbus/crashes?limit=5"
curl -i localhost:3000/v1/crashes/A-0            # 404, application/problem+json
```

The sample crashes in `fixtures/crashes.csv` are **synthetic**, in the dataset's
exact CSV format (see [fixtures/README.md](fixtures/README.md)). CI runs these same
steps on every pull request (the "Docker smoke test" job).

## Endpoints

| Endpoint | Returns | Replaces (Go prototype) |
|---|---|---|
| `GET /v1/crashes?limit=` | `{ "data": [...] }`, newest first, `limit` 1 to 1000 (default 100) | `GET /crashes` (first 5,000 rows, unordered) |
| `GET /v1/crashes/{id}` | One crash, or a `404` problem | `GET /crashes/:id` (an array) |
| `GET /v1/states/{state}/cities/{city}/crashes?limit=` | `{ "data": [...] }`, city matched case-insensitively | `GET /crashesbycity/:city/:state` |
| `GET /healthz` | `{ "status": "ok" }` | none |
| `GET /openapi.json`, `GET /docs` | The OpenAPI 3.1 spec and its interactive docs | none |

Responses use camelCase keys, UTC ISO 8601 times and `null` for missing values.
Errors are [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) `application/problem+json`
with the right status (400, 404 or 500). The spec is also committed as
[`openapi.json`](openapi.json), and CI fails if it drifts from the code.

## Loading the real dataset

Download the US Accidents CSV from Kaggle (see the attribution below), then load all
of it or a subset. The loader converts each row's local time to UTC using its time
zone, and upserts by crash ID, so re-running it updates rows instead of duplicating
them. It reads `.csv` or `.csv.gz` files.

```sh
# Into the Compose database, from your machine (DATABASE_URL comes from .env)
pnpm data:load --file US_Accidents_March23.csv --states OH,CA --from 2021-01-01 --to 2023-03-31

# Or entirely in Docker, with the file in ./data
docker compose run --rm -v "$PWD/data:/data:ro" seed \
  node dist/cli/load.js --file /data/US_Accidents_March23.csv --states OH
```

Loading runs at roughly 30,000 rows per second on a laptop (measured on scaled-up
synthetic rows), so the full 7.7M rows take about five minutes and a few states take
seconds. The sample rows have IDs starting with `SYN-`; remove them with
`DELETE FROM crashes WHERE id LIKE 'SYN-%'` if you load real data alongside them.

## Development without Docker

You need Node 24 (see `.nvmrc`), pnpm (the version is pinned in `package.json`), and a
reachable PostgreSQL. The server validates its config and checks the database at
startup, so it exits if `DATABASE_URL` is missing or the database is down. Running
`docker compose up db` gives you just the database.

```sh
pnpm install --frozen-lockfile
pnpm db:migrate                   # apply migrations to DATABASE_URL
pnpm data:seed                    # load fixtures/crashes.csv
pnpm dev                          # http://localhost:3000, docs at /docs
```

Other commands:

```sh
pnpm lint
pnpm typecheck
pnpm test             # database tests skip unless TEST_DATABASE_URL is set
TEST_DATABASE_URL=$DATABASE_URL pnpm test:coverage   # everything, as CI runs it
pnpm build            # tsc to dist/
pnpm bundle:lambda    # esbuild to dist/lambda/index.mjs; pnpm test:lambda invokes it
pnpm openapi          # regenerate openapi.json after changing a route
```

## Database migrations

The schema lives in `src/schema.ts` and the SQL migrations in `drizzle/`. After changing the schema, run `pnpm db:generate` and commit the new migration. Apply migrations with `pnpm db:migrate` (it reads `DATABASE_URL`). The app never migrates on startup, so run it as its own step before starting the API; Compose does this in its `migrate` service.

## Project links

- **Roadmap:** [#2](https://github.com/Kyle-Bolin/CarCrashAPI/issues/2), with epics [#3](https://github.com/Kyle-Bolin/CarCrashAPI/issues/3) to [#9](https://github.com/Kyle-Bolin/CarCrashAPI/issues/9)
- **ADRs:** ADR-001 [#12](https://github.com/Kyle-Bolin/CarCrashAPI/issues/12), ADR-002 [#13](https://github.com/Kyle-Bolin/CarCrashAPI/issues/13), ADR-003 [#14](https://github.com/Kyle-Bolin/CarCrashAPI/issues/14). Accepted ADRs will live in `docs/adr/`.
- **API docs:** `/docs` on a running server, and [`openapi.json`](openapi.json) in the repo
- **Contributing:** `CONTRIBUTING.md` is planned in [#27](https://github.com/Kyle-Bolin/CarCrashAPI/issues/27). Meanwhile, see [CLAUDE.md](CLAUDE.md) for conventions.
- **Legacy Go prototype:** tag [`v0.1.0-go`](https://github.com/Kyle-Bolin/CarCrashAPI/tree/v0.1.0-go)

## Data attribution and license

The crash data comes from the Kaggle **US Accidents** dataset by Sobhan Moosavi
et al. (2016–2023). It is **not** covered by the code license. Kaggle lists it as
CC BY-NC-SA 4.0, which requires attribution, non-commercial use and share-alike
for redistributed subsets, such as test fixtures. The license still needs to be
confirmed against the Kaggle page. This project is a non-commercial portfolio demo.

The proposed scope (a subset of states, loaded by a re-runnable script) is in
[ADR-003](docs/adr/0003-data-scope.md), which is not accepted yet. The committed
sample in `fixtures/` is synthetic rather than a slice of the real data, so it
carries no dataset license.

If you use the data, please cite:

- Sobhan Moosavi, Mohammad Hossein Samavatian, Srinivasan Parthasarathy, and Rajiv Ramnath. "A Countrywide Traffic Accident Dataset." 2019.
- Sobhan Moosavi, Mohammad Hossein Samavatian, Srinivasan Parthasarathy, Radu Teodorescu, and Rajiv Ramnath. "Accident Risk Prediction based on Heterogeneous Sparse Data: New Dataset and Insights." In proceedings of the 27th ACM SIGSPATIAL International Conference on Advances in Geographic Information Systems, ACM, 2019.

The source code does not have a license yet, so all rights are reserved for now (`UNLICENSED` in `package.json`).

---

_This README is revisited as each epic lands and again at v1.0.0 ([#15](https://github.com/Kyle-Bolin/CarCrashAPI/issues/15))._
