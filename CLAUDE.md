# CarCrashAPI

A REST API for US car crash data. It is being rewritten from a 2023 Go/Gin prototype (preserved at tag `v0.1.0-go`) into TypeScript on AWS. This is a portfolio project, so process quality (tests, CI, ADRs, IaC) matters as much as features.

- **Roadmap:** issue #2. Work is organized as epics (#3–#9) with sub-issues; #2 lists the critical path.
- **Decisions:** ADRs live in `docs/adr/` (ADR-001 stack, ADR-002 AWS, ADR-003 data; issues #12–#14).
- **Known legacy defects** to fix rather than port are listed in epic #4.

## Stack

Node 24 (`.nvmrc`), pnpm 12 (`packageManager` in `package.json`), TypeScript 7 in strict mode, Hono, Vitest, Biome. ESM with `NodeNext` resolution, so relative imports use a `.js` suffix (`import { app } from "./app.js"`).

## Commands

```sh
pnpm install --frozen-lockfile
pnpm dev                # watch mode, http://localhost:3000
pnpm lint               # Biome check, the same as CI (`pnpm format` fixes formatting)
pnpm typecheck
pnpm test               # or test:coverage, which fails below 80% coverage
pnpm build              # tsc to dist/
pnpm bundle:lambda      # esbuild to dist/lambda/index.mjs
```

## Layout

- `src/app.ts`: the Hono app and routes, shared by both entry points
- `src/server.ts`: the Node server entry point. `src/lambda.ts`: the AWS Lambda entry point
- `src/**/*.test.ts`: tests, next to the code they cover
- `infra/` (planned): Terraform, with `bootstrap/`, `modules/` and `envs/{staging,prod}`
- `.github/workflows/`: CI, CodeQL, dependency review, actionlint, Terraform, deploy, and the Claude issue routine

## Conventions

- One issue per PR, on a branch like `claude/issue-<number>-<slug>`, with `Closes #<number>` in the body.
- PR titles are Conventional Commits. CI enforces this, and squash merges make the title the commit message.
- Pin third-party GitHub Actions to a full commit SHA with the version in a comment (`uses: owner/action@<sha> # v1.2.3`).
- Workflows default to `permissions: contents: read`. AWS access goes through GitHub OIDC only, never stored keys.
- Keep secrets out of the repo. `.env` is git-ignored; document variables in `.env.example`.
- No manual verification steps. If existing checks can't verify a change (Docker, cloud resources, a UI), add or extend a CI job in the same PR that does. A PR should never ask its reviewer to check something by hand.

## Gotchas

- Cloud sessions have Docker installed but not running. Start it with `dockerd > /tmp/dockerd.log 2>&1 &`. The sandbox's HTTPS proxy can still break downloads inside image builds (self-signed certificate errors), so let CI build and test the image.
- pnpm 12 refuses to install a dependency whose build script hasn't been approved. Approve it with `pnpm approve-builds <pkg>`, which records it under `allowBuilds` in `pnpm-workspace.yaml`.
- `create_crashes.sql` is the legacy schema. It disagrees with the legacy queries on column names (see epic #4) and will be replaced by migrations (#18).
