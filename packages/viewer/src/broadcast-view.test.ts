// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { actionHtml, badgesHtml, laneHtml, laneMarks, partyHtml, runPill, thinkingHtml } from "./broadcast-view.js";

const press = (t: number, ...b: string[]) => ({ t, b });
const mark = (now: number, presses: { t: number; b: string[] }[], extra: Partial<Parameters<typeof laneMarks>[0]> = {}) => laneMarks({ now, width: 600, presses, tools: [], miles: [], ...extra });

describe("the press lane", () => {
  it("puts the newest press at the NOW edge and scrolls older ones left", () => {
    const [newest, older] = mark(100, [press(70, "A"), press(100, "B")]).filter(m => m.kind === "chip");
    expect(newest).toMatchObject({ x: 600, fresh: true });
    expect(older).toMatchObject({ x: 300, fresh: false });
  });

  it("glows a press for 1.2 s only", () => {
    expect(mark(101.1, [press(100, "A")])[0]).toMatchObject({ fresh: true });
    expect(mark(101.3, [press(100, "A")])[0]).toMatchObject({ fresh: false });
  });

  it("never lets chips overlap: a burst pushes older ones at least 30 px left", () => {
    const xs = mark(100, [press(99.9, "A"), press(99.95, "B"), press(99.99, "UP"), press(100, "DOWN")]).flatMap(m => m.kind === "chip" ? [m.x] : []);
    for (const [i, x] of xs.entries()) if (i > 0) expect((xs[i - 1] ?? 0) - x).toBeGreaterThanOrEqual(30);
  });

  it("gives a two-button chip the room its width needs", () => {
    const xs = mark(100, [press(100, "A"), press(100, "UP", "A")].reverse()).flatMap(m => m.kind === "chip" ? [m.x] : []);
    expect((xs[0] ?? 0) - (xs[1] ?? 0)).toBeGreaterThanOrEqual(30);
    const wide = mark(100, [press(99.9, "A"), press(100, "UP", "A", "B")]).flatMap(m => m.kind === "chip" ? [m.x] : []);
    expect((wide[0] ?? 0) - (wide[1] ?? 0)).toBeGreaterThan(30);
  });

  it("stops at the lane's left end", () => {
    const many = Array.from({ length: 40 }, (_, i) => press(100, i % 2 === 0 ? "A" : "B"));
    expect(mark(100, many).every(m => m.x >= 0)).toBe(true);
  });

  it("draws tool ticks, stars for each milestone and a label for the newest alone", () => {
    const html = laneHtml(laneMarks({ now: 100, width: 600, presses: [press(100, "A")], tools: [{ t: 90 }], miles: [{ t: 40, name: "OLD_ONE" }, { t: 90, name: "FEATHER_BADGE" }] }));
    expect(html.match(/class="tool"/g)).toHaveLength(1);
    expect(html.match(/class="mstar"/g)).toHaveLength(2);
    expect(html).toContain("FEATHER BADGE");
    expect(html).not.toContain("OLD ONE");
  });

  it("flips a label that would run off the left end", () => {
    expect(laneHtml(laneMarks({ now: 100, width: 600, presses: [], tools: [], miles: [{ t: 41, name: "FEATHER_BADGE" }] }))).toContain('class="mile right"');
  });

  it("draws arrows as SVG and START/SELECT as two letters, and keeps other buttons as text", () => {
    const html = laneHtml(mark(100, [press(96, "L"), press(97, "SELECT"), press(98, "START"), press(99, "RIGHT"), press(100, "A")]));
    expect(html.match(/<svg/g)).toHaveLength(1);
    expect(html).toContain(">SE<");
    expect(html).toContain(">ST<");
    expect(html).toContain(">L<");
    expect(html).toContain('class="chip new"');
  });
});

describe("the panels", () => {
  it("escapes everything the log can say", () => {
    expect(thinkingHtml(["<b>&"])).toBe("<p>&lt;b&gt;&amp;</p>");
    expect(actionHtml({ name: "<x>", detail: "a&b" })).toBe("<code>&lt;x&gt;</code> a&amp;b");
    expect(partyHtml([{ name: "<M>", level: 1, hp: 1, maxHp: 2 }])).toContain("&lt;M&gt;");
  });

  it("colors HP by how much is left and survives an unreadable slot", () => {
    const hp = (cur: number) => partyHtml([{ name: "M", level: 5, hp: cur, maxHp: 100 }]);
    expect(hp(60)).toContain("#38c060");
    expect(hp(30)).toContain("#e8c030");
    expect(hp(15)).toContain("#e04848");
    expect(hp(15)).toContain("15/100");
    expect(partyHtml([{ name: null, level: null, hp: null, maxHp: null }])).toContain("???");
  });

  it("packs a full party in two columns", () => {
    const mon = { name: "M", level: 5, hp: 1, maxHp: 2 };
    expect(partyHtml([mon, mon, mon])).not.toContain("mons two");
    expect(partyHtml([mon, mon, mon, mon])).toContain("mons two");
  });

  it("shows badges earned, next dashed and the rest empty, in game order", () => {
    const html = badgesHtml(["STONE", "KNUCKLE"]);
    expect(html.match(/class="bdg got"/g)).toHaveLength(2);
    expect(html.match(/class="bdg live"/g)).toHaveLength(1);
    expect(html.match(/class="bdg"/g)).toHaveLength(5);
    expect(badgesHtml(["STONE", "KNUCKLE", "DYNAMO", "HEAT", "BALANCE", "FEATHER", "MIND", "RAIN"])).not.toContain("live");
  });

  it("labels the run by how it started", () => {
    expect(runPill({ kind: "boot", save: null })).toBe("FROM BOOT");
    expect(runPill({ kind: "save", save: "FORTREE" })).toBe("PRACTICE RUN · FROM FORTREE SAVE");
    expect(runPill({ kind: "save", save: null })).toBe("PRACTICE RUN · FROM A SAVE");
  });
});
