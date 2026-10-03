# ADR-001: Application stack

- **Status:** Proposed
- **Date:** 2026-10-02
- **Issue:** #12

## Context

CarCrashAPI is being rewritten from a 2023 Go/Gin prototype (tag `v0.1.0-go`) into TypeScript on AWS (roadmap: #2). The stack has to satisfy these constraints:

- **Runs on AWS Lambda and locally.** The same application code should run as a Node server for development and as a Lambda handler in deployment (see ADR-002 for the AWS decision).
- **Runtime must be available on Lambda.** Node.js 24 is the current LTS line and has a managed Lambda runtime.
- **The API contract is generated, not hand-written.** An OpenAPI spec derived from the request/response schemas avoids drift between code and docs.
- **Postgres with versioned migrations.** The legacy schema (`create_crashes.sql`) disagrees with the legacy queries (epic #4), so schema changes must be tracked and reviewable.
- **Cold start and bundle size matter** on Lambda.
- **Portfolio project.** Strict typing, fast tests and a one-command lint/format keep process quality visible.

The scaffold from #16 already uses the proposed stack, so this ADR records the decision it assumed.

## Options considered

### Runtime and package manager

- **Node.js 24 LTS with pnpm (proposed).** Matches an available Lambda runtime. pnpm gives a strict, fast, lockfile-based install.
- Older Node LTS lines: available on Lambda but closer to end of life, with no benefit for a new project.

### HTTP framework

- **Hono + `@hono/zod-openapi` (proposed).** A small, dependency-light framework built on web-standard `Request`/`Response`. One app runs under `@hono/node-server` locally and an AWS Lambda adapter in deployment. Routes defined with zod schemas generate the OpenAPI document and validate input. The ecosystem is smaller than Fastify's.
- **Fastify.** Mature, fast, with a larger plugin ecosystem and built-in JSON-schema validation. Running on Lambda needs an adapter layer, and its default schema tooling is JSON Schema rather than zod, so OpenAPI generation needs extra plugins.
- **Express.** Familiar and ubiquitous, but dated: weaker TypeScript support, no built-in validation, and a heavier fit for Lambda.

### Database access

- **Drizzle ORM + drizzle-kit migrations, `pg` driver (proposed).** Schema is defined as TypeScript, queries are typed and close to SQL, and drizzle-kit generates SQL migrations. The runtime is light, which suits Lambda cold starts.
- **Prisma.** Popular with strong tooling, but it brings a query engine and generated client that add bundle size and cold-start cost on Lambda. This should be measured before ruling it out, but the Lambda fit is a known concern.
- **Kysely.** A typed query builder with a small footprint. It has no schema-as-code, so migrations and types would be maintained by hand or with extra tooling.

### Tooling

- **Vitest** for tests (native ESM and TypeScript, built-in coverage), **Biome** for lint and format in one fast tool, and a **strict `tsconfig`** (`strict`, `noUncheckedIndexedAccess`, `NodeNext`). The alternatives (Jest, ESLint + Prettier) work, but need more configuration for ESM and TypeScript and run slower.

## Decision

Proposed: adopt the stack as listed.

- Node.js 24 LTS, pnpm
- Hono with `@hono/zod-openapi`
- Drizzle ORM, drizzle-kit migrations and the `pg` driver
- Vitest, Biome and a strict TypeScript configuration

**Recommendation:** accept. Hono is the best fit for "same app on Node and Lambda, OpenAPI from zod", and Drizzle keeps the schema in code with a small Lambda footprint. Fastify and Prisma remain credible, and the reasons to revisit them are below.

## Consequences

- **Good:** one codebase serves local development and Lambda. The OpenAPI spec and request validation come from a single set of zod schemas. Migrations are generated and versioned, which addresses the schema drift described in epic #4.
- **Bad:** Hono's ecosystem is smaller, so some integrations will be written by hand. Drizzle is younger than Prisma, with fewer guides and a less polished migration workflow.
- **Follow-ups:**
  - `@hono/zod-openapi`, Drizzle and `pg` are not yet dependencies. They arrive with the issues that need them (migrations: #18).
  - Revisit Prisma if Drizzle's migration tooling proves inadequate, and Fastify if a needed plugin has no Hono equivalent.
  - Database hosting and connection handling from Lambda belong to ADR-002 (#13).
