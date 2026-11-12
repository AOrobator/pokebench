import { describe, expect, it } from "vitest";
import { hms, progress, usd } from "./format.js";

describe("hms", () => {
  it("writes hours:minutes:seconds", () => {
    expect(hms(0)).toBe("0:00:00");
    expect(hms(62_190)).toBe("17:16:30");
    expect(hms(8984)).toBe("2:29:44");
  });

  it("rounds fractional seconds down", () => {
    expect(hms(59.9)).toBe("0:00:59");
  });
});

describe("usd", () => {
  it("writes dollars with cents and thousands separators", () => {
    expect(usd(9.56)).toBe("$9.56");
    expect(usd(780)).toBe("$780.00");
    expect(usd(1234.5)).toBe("$1,234.50");
  });
});

describe("progress", () => {
  it("names badges, the Elite Four, the Champion and the Hall of Fame", () => {
    expect(progress(1)).toBe("1 gym badge");
    expect(progress(5)).toBe("5 gym badges");
    expect(progress(9)).toBe("Beat 1 of the Elite Four");
    expect(progress(11)).toBe("Beat 3 of the Elite Four");
    expect(progress(12)).toBe("Beat the Elite Four");
    expect(progress(13)).toBe("Beat the Champion");
    expect(progress(14)).toBe("Beat the game");
  });

  it("rejects a level outside 1 to 14", () => {
    expect(() => progress(0)).toThrow(RangeError);
    expect(() => progress(15)).toThrow(RangeError);
  });
});
