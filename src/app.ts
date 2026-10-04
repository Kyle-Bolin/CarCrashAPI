import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { CrashListSchema, CrashSchema } from "./crashes/model.js";
import type { CrashStore } from "./crashes/store.js";
import { problem, problemResponse } from "./problem.js";

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 1000;

export const OPENAPI_CONFIG = {
  openapi: "3.1.0",
  info: {
    title: "CarCrashAPI",
    version: "1.0.0",
    description: [
      "Read-only REST API over the US Accidents dataset (Sobhan Moosavi et al., 2016–2023).",
      "",
      "Times are UTC. A value the dataset doesn't have is `null`. Errors use RFC 9457",
      "`application/problem+json`. Local development serves 1,000 synthetic crashes",
      "in the dataset's format.",
    ].join("\n"),
  },
  tags: [
    { name: "Crashes", description: "Look up crashes." },
    { name: "Health", description: "Service status." },
  ],
};

const limitQuery = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .openapi({
      param: { name: "limit", in: "query" },
      description: `How many crashes to return, from 1 to ${MAX_LIMIT}. Defaults to ${DEFAULT_LIMIT}.`,
      example: 25,
    }),
});

const badRequest = problemResponse("A parameter is invalid.");
const serverError = problemResponse("The server failed to handle the request.");

const healthRoute = createRoute({
  method: "get",
  path: "/healthz",
  tags: ["Health"],
  summary: "Health check",
  description: "Returns ok while the server is running.",
  responses: {
    200: {
      description: "The server is running.",
      content: {
        "application/json": { schema: z.object({ status: z.literal("ok") }) },
      },
    },
  },
});

const listRoute = createRoute({
  method: "get",
  path: "/v1/crashes",
  tags: ["Crashes"],
  summary: "List crashes",
  description: "Newest crashes first. Crashes with no start time come last.",
  request: { query: limitQuery },
  responses: {
    200: {
      description: "The crashes.",
      content: { "application/json": { schema: CrashListSchema } },
    },
    400: badRequest,
    500: serverError,
  },
});

const getRoute = createRoute({
  method: "get",
  path: "/v1/crashes/{id}",
  tags: ["Crashes"],
  summary: "Get a crash",
  request: {
    params: z.object({
      id: z
        .string()
        .min(1)
        .max(64)
        .openapi({ param: { name: "id", in: "path" }, example: "A-2716600" }),
    }),
  },
  responses: {
    200: {
      description: "The crash.",
      content: { "application/json": { schema: CrashSchema } },
    },
    400: badRequest,
    404: problemResponse("No crash has this ID."),
    500: serverError,
  },
});

const cityRoute = createRoute({
  method: "get",
  path: "/v1/states/{state}/cities/{city}/crashes",
  tags: ["Crashes"],
  summary: "List crashes in a city",
  description:
    "Matches the city name case-insensitively, newest crashes first. A city with no crashes returns an empty list.",
  request: {
    params: z.object({
      state: z
        .string()
        .regex(/^[A-Za-z]{2}$/, "Must be a two-letter state code")
        .openapi({
          param: { name: "state", in: "path" },
          description: "Two-letter state code, in any case.",
          example: "OH",
        }),
      city: z
        .string()
        .min(1)
        .max(100)
        .openapi({ param: { name: "city", in: "path" }, example: "Columbus" }),
    }),
    query: limitQuery,
  },
  responses: {
    200: {
      description: "The crashes.",
      content: { "application/json": { schema: CrashListSchema } },
    },
    400: badRequest,
    500: serverError,
  },
});

export type AppDependencies = { crashes: CrashStore };

export function createApp({ crashes }: AppDependencies) {
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        return problem(
          c,
          400,
          "The request has invalid parameters.",
          result.error.issues.map((issue) => ({
            in: result.target,
            name: issue.path.join("."),
            message: issue.message,
          })),
        );
      }
    },
  });

  // A public, read-only API: any site may call it, or load its spec, from the browser.
  const anyOrigin = cors({ origin: "*", allowMethods: ["GET"] });
  app.use("/v1/*", anyOrigin);
  app.use("/openapi.json", anyOrigin);

  app.openapi(healthRoute, (c) => c.json({ status: "ok" as const }, 200));

  app.openapi(listRoute, async (c) => {
    const { limit } = c.req.valid("query");
    return c.json({ data: await crashes.list(limit) }, 200);
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid("param");
    const crash = await crashes.get(id);
    if (!crash) return problem(c, 404, `No crash has the ID ${id}.`);
    return c.json(crash, 200);
  });

  app.openapi(cityRoute, async (c) => {
    const { state, city } = c.req.valid("param");
    const { limit } = c.req.valid("query");
    return c.json({ data: await crashes.listByCity(state, city, limit) }, 200);
  });

  app.doc31("/openapi.json", OPENAPI_CONFIG);
  app.get("/docs", Scalar({ url: "/openapi.json", pageTitle: "CarCrashAPI" }));
  app.get("/", (c) => c.redirect("/docs"));

  app.notFound((c) =>
    problem(
      c,
      404,
      `No route matches ${c.req.method} ${new URL(c.req.url).pathname}.`,
    ),
  );

  app.onError((error, c) => {
    if (error instanceof HTTPException && error.status < 500) {
      return problem(c, error.status === 404 ? 404 : 400, error.message);
    }
    console.error(error);
    return problem(c, 500, "Something went wrong on our side.");
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
