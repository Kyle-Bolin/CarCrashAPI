import { describe, expect, it } from "vitest";
import { parseLoadArgs } from "./args.js";

describe("parseLoadArgs", () => {
  it("reads the file and optional filters", () => {
    expect(
      parseLoadArgs([
        "--file",
        "data.csv.gz",
        "--states",
        " oh, ca ,",
        "--from",
        "2021-01-01",
        "--to",
        "2021-12-31",
      ]),
    ).toEqual({
      file: "data.csv.gz",
      states: ["OH", "CA"],
      from: "2021-01-01",
      to: "2021-12-31",
    });
  });

  it("needs only --file", () => {
    expect(parseLoadArgs(["--file", "data.csv"])).toEqual({ file: "data.csv" });
  });

  it.each([
    [[], "--file: is required"],
    [["--file", "x", "--states", "Ohio"], "--states: must be two-letter codes"],
    [
      ["--file", "x", "--states", ","],
      "--states: must name at least one state",
    ],
    [["--file", "x", "--from", "01/02/2021"], "--from: must be a date"],
    [["--file", "x", "--to", "2021-13-45"], "--to: must be a real date"],
    [
      ["--file", "x", "--from", "2022-01-01", "--to", "2021-01-01"],
      "--from: must not be after --to",
    ],
  ])("rejects %j", (argv, message) => {
    expect(() => parseLoadArgs(argv)).toThrow(message);
  });

  it("rejects unknown options and shows usage", () => {
    expect(() => parseLoadArgs(["--file", "x", "--state", "OH"])).toThrow(
      /Unknown option '--state'[\s\S]*Usage: data:load/,
    );
  });
});
