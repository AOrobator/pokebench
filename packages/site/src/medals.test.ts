import { describe, expect, it } from "vitest";
import { medals } from "./medals.js";

const n = (s: string, part: string): number => s.split(part).length - 1;

describe("medals", () => {
  it("draws earned badges as stars and the rest as missing stars", () => {
    const m = medals(5).value;
    expect(m).toContain('<span class="medals" role="img" aria-label="5 of 8 gym badges">');
    expect(n(m, '<i class="medal"></i>')).toBe(5);
    expect(n(m, '<i class="medal off"></i>')).toBe(3);
    expect(m).not.toContain("hof");
  });

  it("says badge in the singular for one", () => {
    expect(medals(1).value).toContain('aria-label="1 of 8 gym badges"');
  });

  it("shows eight stars and no crown for the Elite Four and the Champion", () => {
    for (const level of [9, 12, 13]) {
      const m = medals(level).value;
      expect(n(m, '<i class="medal"></i>')).toBe(8);
      expect(m).not.toContain("off");
      expect(m).not.toContain("hof");
      expect(m).toContain('aria-label="8 of 8 gym badges"');
    }
  });

  it("adds the crown after the eight stars only for the Hall of Fame", () => {
    const m = medals(14).value;
    expect(n(m, '<i class="medal"></i>')).toBe(8);
    expect(m.endsWith('<i class="medal hof" title="Hall of Fame"></i></span>')).toBe(true);
    expect(m).toContain('aria-label="8 of 8 gym badges and the Hall of Fame"');
  });

  it("rejects a level outside 0 to 14", () => {
    expect(() => medals(-1)).toThrow(RangeError);
    expect(() => medals(15)).toThrow(RangeError);
  });
});
