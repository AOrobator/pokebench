import { describe, expect, it } from "vitest";
import { byteRange } from "./reports.js";

describe("a video's byte ranges", () => {
  it.each([
    [undefined, null], ["", null], ["bytes=-", null], ["items=0-1", null],
    ["bytes=0-1", { start: 0, end: 1 }], ["bytes=5-", { start: 5, end: 99 }], ["bytes=-10", { start: 90, end: 99 }],
    ["bytes=90-500", { start: 90, end: 99 }], ["bytes=-500", { start: 0, end: 99 }],
    ["bytes=100-", "unsatisfiable"], ["bytes=9-3", "unsatisfiable"],
  ])("reads %s", (header, range) => {
    expect(byteRange(header, 100)).toEqual(range);
  });
});
