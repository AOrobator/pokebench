import { describe, expect, it } from "vitest";
import { TIERS, cardHtml, cardInputFor, clockParts, parseCardArt, placeText, tierOf, trainerFor, type CardArt, type CardInput } from "./trainer-card.js";
import { run as recorded } from "../test-support/workbench.js";
import type { PlateFacts } from "./workbench-view.js";

const ART: CardArt = { trainers: ["brendan", "may", "birch", "norman"], icons: new Set([280, 412]), egg: 412 };
const FACTS: PlateFacts = { live: true, elapsed: 2_800_000, reached: { index: 26, label: "Rival waits in Oldale", split: { name: "X", elapsedMs: 2_790_000, segmentMs: 0, seq: 9, turn: 3, inputTokens: 0, outputTokens: 0 } }, level: 27, total: 45, recovered: false, fresh: false, cap: 3_600_000 };
function input(over: Partial<CardInput> = {}): CardInput {
  return { runId: "run-a", title: "bundle-v-control-dryrun-cook", arm: "bundle", trial: "trial 2/4", card: { name: "RED", location: "OLDALE TOWN", party: [{ speciesId: 280, level: 7, egg: false }, { speciesId: 280, level: 1, egg: true }, { speciesId: 9, level: 3, egg: false }] }, facts: FACTS, status: "watching", trainer: "may", ...over };
}

describe("trainer card art manifest", () => {
  it("accepts the build's manifest and refuses anything else", () => {
    const good = { version: 1, tiers: [...TIERS], trainers: ["brendan", "may"], icons: [1, 280, 412], egg: 412, proof: {}, source: {} };
    const art = parseCardArt(good);
    expect(art?.trainers).toEqual(["brendan", "may"]); expect(art?.icons.has(280)).toBe(true); expect(art?.egg).toBe(412);
    for (const bad of [null, "x", { ...good, version: 2 }, { ...good, trainers: [] }, { ...good, trainers: ["../x"] }, { ...good, icons: [0] }, { ...good, icons: [413] }, { ...good, icons: [1.5] }, { ...good, egg: "412" }, { ...good, tiers: ["green"] }])
      expect(parseCardArt(bad)).toBeNull();
  });
});

describe("trainer card choices", () => {
  it("colours the card by STORY progress in 20% steps", () => {
    expect([0, 8, 9, 18, 27, 36, 45].map(l => tierOf(l, 45))).toEqual(["green", "green", "bronze", "copper", "silver", "gold", "gold"]);
    expect(tierOf(0, 0)).toBe("green");
  });
  it("picks a stable trainer per experiment and arm, never the same one for two arms", () => {
    const arms = ["control", "bundle"], trainers = ["brendan", "may", "birch", "wally", "roxanne", "brawly", "wattson", "flannery", "norman", "winona", "sidney", "phoebe", "glacia", "drake"];
    expect(trainerFor("bundle-v-control-dryrun-cook", "bundle", arms, trainers)).toBe("norman");
    expect(trainerFor("bundle-v-control-dryrun-cook", "control", arms, trainers)).toBe("may");
    const all = ["a", "b", "c", "d"].map(arm => trainerFor("exp", arm, ["a", "b", "c", "d"], ["x", "y", "z", "w"]));
    expect(new Set(all).size).toBe(4);
    expect(trainerFor("exp", "e", ["a", "b", "e"], ["x", "y"])).toMatch(/^[xy]$/);
    expect(trainerFor("exp", "solo", [], ["x", "y"])).toMatch(/^[xy]$/);
  });
  it("writes places the way the game's signs do", () => {
    expect(placeText("OLDALE TOWN")).toBe("Oldale Town"); expect(placeText("ROUTE101")).toBe("Route 101"); expect(placeText("LITTLEROOT TOWN BRENDANS HOUSE 2F")).toBe("Littleroot Town Brendans House 2F"); expect(placeText(null)).toBe("");
  });
  it("gives the clock text and time bar for in-place updates", () => {
    expect(clockParts(FACTS, "wide")).toEqual({ text: "46:40/1:00:00", width: "77.8%" });
    expect(clockParts(FACTS, "mini")).toEqual({ text: "46:40", width: "77.8%" });
    expect(clockParts({ ...FACTS, cap: null }, "wide")).toEqual({ text: "46:40", width: "0.0%" });
  });
});

describe("trainer card markup", () => {
  it("draws the wide card: tab, trainer, name and type, line two, bars, six boxes of party", () => {
    const html = cardHtml(input(), ART, "wide");
    expect(html).toContain('data-watch="run-a"'); expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("/sprites/card/wide-silver.png"); expect(html).toContain('src="/sprites/trainers/may.png"');
    expect(html).toContain('data-gt="bundle-v-control-dryrun-cook" data-c="tab"'); expect(html).toContain(">RED<"); expect(html).toContain(">BUNDLE<"); expect(html).toContain("--tyc:#7a3fb8");
    expect(html).toContain("Rival waits in Oldale"); expect(html).toContain("Oldale Town"); expect(html).toContain("trial 2/4");
    expect(html).toContain(">27/45<"); expect(html).toContain('width:60.0%');
    expect(html.match(/class="tc-mon/g)).toHaveLength(2); expect(html).toContain("/sprites/icons/280.png"); expect(html).toContain("/sprites/icons/412.png"); expect(html).not.toContain("/sprites/icons/9.png");
    expect(html).toContain('title="Lv7"'); expect(html).toContain('title="Egg"');
    expect(html).toContain('data-gt="WATCHING"'); expect(html).not.toContain("NEW MILESTONE!"); expect(html).not.toContain(' new"');
    expect(html).toContain("data-clock"); expect(html).toContain("data-time-bar"); expect(html).not.toContain("46:40");
  });
  it("on a new milestone, the wide card glows and the badge takes the corner with the blinking dot", () => {
    const html = cardHtml(input({ facts: { ...FACTS, fresh: true } }), ART, "wide");
    expect(html).toContain('class="tc tc-wide tc-new"'); expect(html).toContain('data-gt="NEW MILESTONE!" data-c="badge"'); expect(html).toContain('class="tc-dot"'); expect(html).not.toContain('data-gt="WATCHING"');
  });
  it("the mini card keeps the state in the corner and puts the badge at the bottom; it shows the lead Pokémon", () => {
    const plain = cardHtml(input({ status: "live" }), ART, "mini");
    expect(plain).toContain("/sprites/card/mini-silver.png"); expect(plain).toContain('data-gt="LIVE"'); expect(plain).toContain('aria-pressed="false"'); expect(plain.match(/class="tc-mon/g)).toHaveLength(1);
    const fresh = cardHtml(input({ status: "live", facts: { ...FACTS, fresh: true } }), ART, "mini");
    expect(fresh).toContain("/sprites/card/mini-ribbon-silver.png"); expect(fresh).toContain('data-gt="LIVE"'); expect(fresh).toContain('class="tc-ribbon"'); expect(fresh).toContain("NEW MILESTONE!");
  });
  it("a paused run says PAUSED without the live dot; missing data never breaks the card", () => {
    const html = cardHtml(input({ status: "paused", card: null, arm: null, trial: null, facts: { ...FACTS, reached: null, level: 0 } }), ART, "wide");
    expect(html).toContain('data-gt="PAUSED"'); expect(html).not.toContain('class="tc-dot"'); expect(html).toContain("No milestone yet"); expect(html).toContain("/sprites/card/wide-green.png"); expect(html).not.toContain("TYPE/");
    expect(html.match(/class="tc-mon/g)).toBeNull();
  });
  it("escapes everything that comes from a run", () => {
    const html = cardHtml(input({ title: 'x"<script>', runId: 'r"1', card: { name: "<i>", location: "<s>", party: [] } }), ART, "wide");
    expect(html).not.toContain("<script>"); expect(html).not.toContain("<i>"); expect(html).not.toContain("<s>"); expect(html).toContain("&quot;");
  });
});

describe("one card per workbench run, shared by the viewer and the comparisons page", () => {
  const exp = (arm: string, trial: number) => ({ id: "bundle-v-control-dryrun-cook", arm, trial, of: 4 });
  it("titles by experiment, picks the trainer among the experiment's arms and reads the trial", () => {
    const bundle = recorded({ id: "b", status: "live", experiment: exp("bundle", 2), card: { name: "RED", location: "OLDALE TOWN", party: [] } });
    const control = recorded({ id: "c", status: "live", experiment: exp("control", 1) });
    const input = cardInputFor(bundle, 1000, 1000, "live", [bundle, control, recorded({ id: "z", experiment: null })], { ...ART, trainers: ["brendan", "may", "birch", "wally", "roxanne", "brawly", "wattson", "flannery", "norman", "winona", "sidney", "phoebe", "glacia", "drake"] });
    expect(input).toMatchObject({ runId: "b", title: "bundle-v-control-dryrun-cook", arm: "bundle", trial: "trial 2/4", status: "live", trainer: "norman", card: { name: "RED" } });
    const plain = cardInputFor(recorded({ id: "p", experiment: null, card: undefined }), 1000, 1000, "paused", [], ART);
    expect(plain).toMatchObject({ title: "Model <img onerror=x>", arm: null, trial: null, card: null, status: "paused" });
    expect(cardInputFor(recorded({ id: "q", experiment: null, model: null }), 1000, 1000, "live", [], ART).title).toBe("q");
  });
  it("draws a link instead of a button when given a destination", () => {
    const html = cardHtml(input(), ART, "wide", "/#run=run-a");
    expect(html.startsWith('<a class="tc tc-wide" href="/#run=run-a" data-watch="run-a"')).toBe(true); expect(html).not.toContain("aria-pressed"); expect(html.endsWith("</a>")).toBe(true);
  });
});
