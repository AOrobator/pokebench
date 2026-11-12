import { describe, expect, it } from "vitest";
import { count, hms, milestoneLabel, progress, progressLong, size, span, usd } from "./format.js";

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

describe("progressLong", () => {
  it("names the last badge, and says so when the gyms were taken out of order", () => {
    expect(progressLong(1)).toBe("1 gym badge (Stone)");
    expect(progressLong(5, "BALANCE_BADGE")).toBe("5 gym badges (Balance)");
    expect(progressLong(4, "KNUCKLE_BADGE")).toBe("4 gym badges (last one: Knuckle)");
  });

  it("names the last Elite Four member beaten, and the Hall of Fame", () => {
    expect(progressLong(11, "ELITE_FOUR_GLACIA_DEFEATED")).toBe("Beat 3 of the Elite Four (through Glacia)");
    expect(progressLong(9)).toBe("Beat 1 of the Elite Four (through Sidney)");
    expect(progressLong(12)).toBe("Beat the Elite Four");
    expect(progressLong(13)).toBe("Beat the Champion");
    expect(progressLong(14)).toBe("Beat the game (Hall of Fame)");
  });

  it("rejects a level outside 1 to 14", () => {
    expect(() => progressLong(0)).toThrow(RangeError);
  });
});

describe("span", () => {
  it("writes minutes:seconds under an hour and hours:minutes:seconds from an hour", () => {
    expect(span(0)).toBe("0:00");
    expect(span(161)).toBe("2:41");
    expect(span(1579)).toBe("26:19");
    expect(span(3742)).toBe("1:02:22");
    expect(span(8700)).toBe("2:25:00");
  });
});

describe("size", () => {
  it("writes bytes in B, kB, MB and GB with about two significant digits", () => {
    expect(size(783)).toBe("783 B");
    expect(size(2165)).toBe("2.2 kB");
    expect(size(935448)).toBe("935 kB");
    expect(size(1052216)).toBe("1.1 MB");
    expect(size(107997516)).toBe("108 MB");
    expect(size(2_500_000_000)).toBe("2.5 GB");
  });
});

describe("count", () => {
  it("writes whole numbers with thousands separators", () => {
    expect(count(4124)).toBe("4,124");
    expect(count(262144)).toBe("262,144");
    expect(count(7)).toBe("7");
  });
});

describe("milestoneLabel", () => {
  it("names badges with their gym number and the league by who was beaten", () => {
    expect(milestoneLabel("STONE_BADGE")).toBe("Stone Badge (gym 1)");
    expect(milestoneLabel("RAIN_BADGE")).toBe("Rain Badge (gym 8)");
    expect(milestoneLabel("ELITE_FOUR_DRAKE_DEFEATED")).toBe("Elite Four: Drake");
    expect(milestoneLabel("WALLACE_DEFEATED")).toBe("Champion Wallace");
    expect(milestoneLabel("GAME_CLEAR_CONFIRMED")).toBe("Hall of Fame");
  });
});
