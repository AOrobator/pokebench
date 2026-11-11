import { describe, expect, it } from "vitest";
import { isMain } from "./is-main.js";

describe("isMain", () => {
  it("is true for the module node started", () => {
    expect(isMain({ main: true }, "26.13.1")).toBe(true);
  });

  it("is false for an imported module", () => {
    expect(isMain({ main: false }, "26.13.1")).toBe(false);
  });

  it("refuses a Node without import.meta.main instead of exiting 0 without running", () => {
    expect(() => isMain({}, "20.20.2")).toThrow(
      "Node 20.20.2 cannot tell which module it started (import.meta.main arrived in Node 24.2). PokeBench needs Node 26 or newer.",
    );
  });

  it("reads the running Node's version by default", () => {
    expect(() => isMain({})).toThrow(`Node ${process.versions.node} cannot tell`);
  });
});
