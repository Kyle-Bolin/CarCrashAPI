import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { checkDatabase } from "./db.js";

describe("checkDatabase", () => {
  it("rejects when nothing is listening", async () => {
    const server = createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    await new Promise((resolve) => server.close(resolve));

    await expect(
      checkDatabase(`postgres://u:p@127.0.0.1:${port}/db`, 1000),
    ).rejects.toThrow();
  });
});
