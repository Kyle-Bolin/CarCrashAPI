import { z } from "@hono/zod-openapi";
import type { Context } from "hono";

/** RFC 9457 problem details. Every error response uses this shape. */
export const ProblemSchema = z
  .object({
    type: z.string().openapi({
      description:
        "A URI for the problem type. `about:blank` means the HTTP status says it all.",
      example: "about:blank",
    }),
    title: z.string().openapi({ example: "Not Found" }),
    status: z.number().int().openapi({ example: 404 }),
    detail: z
      .string()
      .optional()
      .openapi({ example: "No crash has the ID A-0." }),
    instance: z.string().optional().openapi({
      description: "The request path that produced the problem.",
      example: "/v1/crashes/A-0",
    }),
    errors: z
      .array(
        z.object({
          in: z.string().openapi({ example: "query" }),
          name: z.string().openapi({ example: "limit" }),
          message: z
            .string()
            .openapi({ example: "Too big: expected number to be <=1000" }),
        }),
      )
      .optional()
      .openapi({ description: "For 400 responses, each invalid parameter." }),
  })
  .openapi("Problem");

export type Problem = z.infer<typeof ProblemSchema>;

export const PROBLEM_CONTENT_TYPE = "application/problem+json";

const TITLES: Record<number, string> = {
  400: "Bad Request",
  404: "Not Found",
  500: "Internal Server Error",
};

export type ProblemStatus = 400 | 404 | 500;

export function problem(
  c: Context,
  status: ProblemStatus,
  detail?: string,
  errors?: Problem["errors"],
) {
  const body: Problem = {
    type: "about:blank",
    title: TITLES[status] ?? "Error",
    status,
    ...(detail && { detail }),
    instance: new URL(c.req.url).pathname,
    ...(errors && { errors }),
  };
  return c.json(body, status, { "Content-Type": PROBLEM_CONTENT_TYPE });
}

/** Documents a problem response in a route definition. */
export function problemResponse(description: string) {
  return {
    description,
    content: { [PROBLEM_CONTENT_TYPE]: { schema: ProblemSchema } },
  } as const;
}
