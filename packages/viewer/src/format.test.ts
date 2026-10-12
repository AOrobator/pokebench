import { describe, expect, it } from "vitest";
import { clip, esc, eventMs, hms, num, signedDelta } from "./format.js";

describe("format", () => {
  it.each([
    [0, "0:00:00"],
    [65.9, "0:01:05"],
    [3723, "1:02:03"],
    [-4, "0:00:00"],
  ])("hms(%s) = %s", (seconds, text) => {
    expect(hms(seconds)).toBe(text);
  });

  it("escapes HTML-significant characters", () => {
    expect(esc(`<b a="1">'&'</b>`)).toBe("&lt;b a=&quot;1&quot;&gt;&#39;&amp;&#39;&lt;/b&gt;");
  });

  it("groups thousands", () => {
    expect(num(1234567)).toBe("1,234,567");
  });

  it("clips and flattens whitespace", () => {
    expect(clip("a  b\nc", 10)).toBe("a b c");
    expect(clip("abcdefghijk", 5)).toBe("abcd…");
  });

  it("signs a delta in m:ss and drops a zero hour", () => {
    expect(signedDelta(-75)).toBe("−1:15");
    expect(signedDelta(75)).toBe("+1:15");
    expect(signedDelta(3725)).toBe("+1:02:05");
    expect(signedDelta(0)).toBe("±0:00");
  });

  it("reads an event's Eastern timestamp as epoch ms", () => {
    expect(eventMs({ t: "2026-10-11T22:16:28.746-04:00" })).toBe(Date.parse("2026-10-12T02:16:28.746Z"));
  });
});
