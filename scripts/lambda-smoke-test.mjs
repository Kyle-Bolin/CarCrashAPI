// Loads the esbuild Lambda bundle and invokes it with API Gateway HTTP API events, so a
// bundle that only fails at runtime (such as a CommonJS `require` in an ESM bundle) fails
// CI instead of production. Run after `pnpm bundle:lambda`; needs no database.
process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:1/unused";
const { handler } = await import(
  new URL("../dist/lambda/index.mjs", import.meta.url).href
);

function event(path) {
  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: path,
    rawQueryString: "",
    headers: { host: "example.execute-api.us-east-1.amazonaws.com" },
    requestContext: {
      http: {
        method: "GET",
        path,
        protocol: "HTTP/1.1",
        sourceIp: "192.0.2.1",
      },
      domainName: "example.execute-api.us-east-1.amazonaws.com",
      stage: "$default",
    },
    isBase64Encoded: false,
  };
}

const checks = [
  ["/healthz", 200, '"status":"ok"'],
  ["/openapi.json", 200, '"openapi":"3.1.0"'],
  ["/nope", 404, "application/problem+json"],
];
let failed = false;
for (const [path, status, expected] of checks) {
  const res = await handler(event(path), {});
  const text = `${res.headers?.["content-type"] ?? ""} ${res.body}`;
  const ok = res.statusCode === status && text.includes(expected);
  console.log(`${ok ? "ok  " : "FAIL"} GET ${path} -> ${res.statusCode}`);
  failed ||= !ok;
}
process.exit(failed ? 1 : 0);
