// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Log, START, state, must } from "../test-support/events.js";
import { bagRun, itemChange, resources } from "../test-support/bag.js";
import { BagLedger, NO_ART, bagPage, bagRange, headline, parseBagArt, type BagArt, type BagChange } from "./bag.js";

function ledgerOf(log: Log): BagLedger {
  const ledger = new BagLedger();
  for (const event of log.events) ledger.add(event);
  return ledger;
}

const brief = (c: BagChange): string => `T${String(c.turn)} ${c.name} ${String(c.before)}→${String(c.after)} ${c.cause}`;
const RUN = "2026-10-17T13-15-36_qwen36-gpu1_e046";

function page(ledger: BagLedger, art: BagArt = NO_ART): Document {
  document.body.innerHTML = bagPage({ ledger, run: RUN, art });
  return document;
}

describe("BagLedger", () => {
  it("infers each change's cause from the recorded money and item storage PC, and skips Wally's lent tutorial bag", () => {
    const ledger = ledgerOf(bagRun());
    expect(ledger.changes.map(brief)).toEqual([
      "T10 POKé BALL 0→5 found",
      "T30 GREAT BALL 0→1 found",
      "T40 POKé BALL 5→6 bought",
      "T50 POTION 0→1 from_pc",
      "T60 GREAT BALL 1→0 sold",
      "T70 POTION 1→0 used",
      "T80 POKé BALL 6→5 to_pc",
    ]);
    expect(headline(ledger)).toEqual({ gained: 7, used: 1, spent: 200, buys: 1 });
    expect(ledger.lastTurn).toBe(80);
    expect(ledger.waiting).toBe(0);
  });

  it("never takes the lent bag as the player's bag, even when the tutorial is the last thing recorded", () => {
    const log = new Log();
    log.add(0, START);
    log.add(1, state({ turn: 1, resources: resources([[4, 5, "poke_balls", "POKé BALL"]]) }));
    log.add(2, itemChange(2, 4, "POKé BALL", 5, 1));
    log.add(3, itemChange(2, 13, "POTION", 0, 1));
    log.add(4, state({ turn: 2, in_battle: true, party_owner: "tutorial", resources: resources([[13, 1, "items", "POTION"], [4, 1, "poke_balls", "POKé BALL"]]) }));
    const ledger = ledgerOf(log);
    expect(ledger.changes).toEqual([]);
    expect(ledger.waiting).toBe(0);
    expect(ledger.latest?.bag.get(4)?.quantity).toBe(5);
    expect(ledger.latest?.bag.has(13)).toBe(false);
  });

  it("draws nothing of the tutorial loan before the state that shows it, at every prefix of the swap", () => {
    const log = bagRun();
    const ledger = new BagLedger();
    const drawn: string[] = [];
    for (const event of log.events) {
      ledger.add(event);
      if (event.turn >= 10 && event.turn <= 23) {
        drawn.push(`${JSON.stringify(headline(ledger))}|${[...page(ledger).querySelectorAll(".bg-lab, .bg-now, .bg-dot, .bg-dlab")].map((e) => `${e.className}:${e.textContent}:${e.getAttribute("title") ?? ""}`).join(",")}`);
      }
    }
    expect(new Set(drawn.slice(1)).size).toBe(1);
    expect(drawn.at(-1)).toContain('"gained":5,"used":0');
  });

  it("drops the swap back when the player's bag only reappears after the tutorial", () => {
    const log = new Log();
    log.add(0, START);
    log.add(1, state({ turn: 1, resources: resources([[4, 5, "poke_balls", "POKé BALL"]]) }));
    log.add(2, state({ turn: 2, in_battle: true, party_owner: "tutorial", resources: resources([[13, 1, "items", "POTION"], [4, 1, "poke_balls", "POKé BALL"]]) }));
    log.add(3, itemChange(3, 4, "POKé BALL", 1, 5));
    log.add(4, itemChange(3, 13, "POTION", 1, 0));
    log.add(5, state({ turn: 3, in_battle: false, party_owner: "player", resources: resources([[4, 5, "poke_balls", "POKé BALL"]]) }));
    log.add(6, itemChange(4, 4, "POKé BALL", 5, 4));
    log.add(7, state({ turn: 4, resources: resources([[4, 4, "poke_balls", "POKé BALL"]]) }));
    expect(ledgerOf(log).changes.map(brief)).toEqual(["T4 POKé BALL 5→4 used"]);
  });

  it("takes a state recorded before its action as the one that confirms it (human runs)", () => {
    const log = new Log();
    log.add(0, START);
    log.add(1, state({ turn: 1, money: 1000, resources: resources([], [[3, 1, "poke_balls", "GREAT BALL"]]) }));
    log.add(2, state({ turn: 2, money: 800, resources: resources([[13, 1, "items", "POTION"]], [[3, 1, "poke_balls", "GREAT BALL"]]) }));
    log.add(3, itemChange(2, 13, "POTION", 0, 1));
    const ledger = ledgerOf(log);
    expect(ledger.changes.map(brief)).toEqual(["T2 POTION 0→1 bought"]);
    expect(ledger.waiting).toBe(0);
    expect(headline(ledger)).toEqual({ gained: 1, used: 0, spent: 200, buys: 1 });
    log.add(4, state({ turn: 3, money: 800, resources: resources([[13, 1, "items", "POTION"], [3, 1, "poke_balls", "GREAT BALL"]], []) }));
    log.add(5, itemChange(3, 3, "GREAT BALL", 0, 1));
    log.add(6, state({ turn: 4, money: 800, resources: resources([[13, 1, "items", "POTION"], [3, 1, "poke_balls", "GREAT BALL"]], []) }));
    expect(ledgerOf(log).changes.map(brief)).toEqual(["T2 POTION 0→1 bought", "T3 GREAT BALL 0→1 from_pc"]);
  });

  it("counts a ball thrown in an ordinary battle as used, whatever is left in the bag", () => {
    const log = new Log();
    log.add(0, START);
    log.add(1, state({ turn: 1, resources: resources([[13, 1, "items", "POTION"], [4, 2, "poke_balls", "POKé BALL"]]) }));
    log.add(2, itemChange(2, 4, "POKé BALL", 2, 1));
    log.add(3, state({ turn: 2, in_battle: true, party_owner: "player", resources: resources([[13, 1, "items", "POTION"], [4, 1, "poke_balls", "POKé BALL"]]) }));
    expect(ledgerOf(log).changes.map(brief)).toEqual(["T2 POKé BALL 2→1 used"]);
  });

  it("does not read an unrecorded item storage PC as an empty one", () => {
    const log = new Log();
    log.add(0, START);
    log.add(1, state({ turn: 1, resources: resources([], [[13, 1, "items", "POTION"]]) }));
    log.add(2, itemChange(2, 13, "POTION", 0, 1));
    log.add(3, state({ turn: 2, resources: resources([[13, 1, "items", "POTION"]], null) }));
    log.add(4, itemChange(3, 13, "POTION", 1, 0));
    log.add(5, state({ turn: 3, resources: resources([], [[13, 1, "items", "POTION"]]) }));
    expect(ledgerOf(log).changes.map(brief)).toEqual(["T2 POTION 0→1 found", "T3 POTION 1→0 used"]);
  });

  it("counts one mart step's money once when it brings several items", () => {
    const log = new Log();
    log.add(0, START);
    log.add(1, state({ money: 1000, resources: resources([]) }));
    log.add(2, itemChange(2, 4, "POKé BALL", 0, 10));
    log.add(3, itemChange(2, 12, "PREMIER BALL", 0, 1));
    log.add(4, state({ turn: 2, money: 0, resources: resources([[4, 10, "poke_balls", "POKé BALL"], [12, 1, "poke_balls", "PREMIER BALL"]]) }));
    expect(headline(ledgerOf(log))).toEqual({ gained: 11, used: 0, spent: 1000, buys: 2 });
  });

  it("shows changes still waiting for a state, and ignores legacy states and malformed change details", () => {
    const log = new Log();
    log.add(0, START);
    log.add(1, { type: "state", turn: 1, screen: "overworld", location: "X", position: null, in_battle: false, party: [], money: null, badges: [], play_time_s: null } as unknown as Parameters<Log["add"]>[1]);
    log.add(2, state({ turn: 1, money: null, resources: null }));
    expect(ledgerOf(log).recorded).toBe(false);
    log.add(3, state({ turn: 2, money: null, resources: resources([[999, 2, "mystery", "ODD"]]) }));
    log.add(4, { ...itemChange(3, 13, "POTION", 0, 1), details: { item_id: "13" } });
    log.add(5, { ...itemChange(3, 13, "POTION", 0, 1), details: { item_id: 13, before: 0, after: 2 } });
    const ledger = ledgerOf(log);
    expect(ledger.recorded).toBe(true);
    expect(ledger.pocketOf(999)).toBe("items");
    expect(ledger.waiting).toBe(1);
    expect(ledger.changes).toEqual([]);
    expect(page(ledger).querySelector(".bg-lab")?.textContent).toBe("ODD");
    log.add(6, itemChange(4, 13, "POTION", 2, 1));
    log.add(7, state({ turn: 4, money: null, resources: resources([[999, 2, "mystery", "ODD"], [13, 1, "items", "POTION"]]) }));
    expect(ledgerOf(log).changes.map(brief)).toEqual(["T3 ITEM 13 0→2 found", "T4 POTION 2→1 used"]);
  });

  it("bumps its version only when the bag or its pending changes move", () => {
    const ledger = new BagLedger();
    const log = new Log();
    ledger.add(log.add(0, START));
    ledger.add(log.add(1, state({ resources: resources([]) })));
    const first = ledger.version;
    ledger.add(log.add(2, state({ turn: 2, resources: resources([]) })));
    expect(ledger.version).toBe(first);
    ledger.add(log.add(3, state({ turn: 3, resources: resources([[4, 1, "poke_balls", "POKé BALL"]]) })));
    expect(ledger.version).toBe(first + 1);
  });
});

describe("bag page", () => {
  it("shows the headline, the game's pocket labels in order with empty ones grey, and a shared turn axis", () => {
    const doc = page(ledgerOf(bagRun()));
    expect([...doc.querySelectorAll(".bg-kpi")].map((k) => k.textContent)).toEqual(["7ITEMS GAINED", "1USED OR TOSSED", "¥200SPENT AT MARTS (1 BUY)"]);
    expect([...doc.querySelectorAll(".bg-pk")].map((p) => `${p.querySelector(".bg-pn")?.textContent ?? ""}|${p.querySelector(".bg-pm")?.textContent ?? ""}|${String(p.classList.contains("empty"))}`)).toEqual([
      "ITEMS|EMPTY|true",
      "POKé BALLS|1 KIND · 5|false",
      "TMs & HMs|EMPTY|true",
      "BERRIES|EMPTY|true",
      "KEY ITEMS|EMPTY|true",
    ]);
    expect(doc.querySelectorAll(".bg-pk img, .bg-pk i")).toHaveLength(0);
    expect([...doc.querySelectorAll(".bg-lab")].map((l) => l.textContent)).toEqual(["POTION", "POKé BALL", "GREAT BALL"]);
    expect([...doc.querySelectorAll(".bg-now")].map((n) => n.textContent)).toEqual(["0", "5", "0"]);
    expect([...doc.querySelectorAll(".bg-axis span")].map((s) => s.textContent)).toEqual(["T0", "T10", "T30", "T40", "T50", "T60", "T70", "T80"]);
    expect(doc.querySelector(".bg-legend")?.textContent).toBe("found / givenboughtused, sold or stored");
    expect(doc.querySelector(".bg-inf")?.textContent).toContain("BOUGHT is inferred");
    const ball = must(doc.querySelectorAll(".bg-track")[1]);
    expect([...ball.querySelectorAll(".bg-dot")].map((d) => d.className)).toEqual(["bg-dot got", "bg-dot buy", "bg-dot use"]);
    expect([...ball.querySelectorAll(".bg-dlab")].map((d) => d.textContent)).toEqual(["5", "6", "5"]);
    expect(ball.querySelector("path:not(.area)")?.getAttribute("d")).toBe("M0,100.0H125.0V16.7H500.0V0.0H1000.0V16.7H1000");
  });

  it("has no tutorial band, no tutorial count and no change list", () => {
    const doc = page(ledgerOf(bagRun()));
    expect(doc.body.textContent).not.toMatch(/tutorial|Wally/i);
    expect(doc.querySelectorAll(".bg-band, .bg-row, [data-bag-jump]")).toHaveLength(0);
    expect(doc.body.textContent).not.toContain("CHANGES");
  });

  it("uses the game's item icons only where they were built", () => {
    const art = parseBagArt({ items: [4, 13, "x", 1.5] });
    expect([...art]).toEqual([4, 13]);
    const doc = page(ledgerOf(bagRun()), art);
    expect([...doc.querySelectorAll(".bg-lab img")].map((i) => i.getAttribute("src"))).toEqual(["/sprites/bag/items/13.png", "/sprites/bag/items/4.png"]);
    expect(doc.querySelectorAll(".bg-lab .bg-noicon")).toHaveLength(1);
    expect(parseBagArt(null)).toEqual(NO_ART);
    expect(bagRange({ ledger: ledgerOf(bagRun()), run: RUN, art })).toBe("RUN e046 · T0–T80");
    expect(bagRange({ ledger: ledgerOf(bagRun()), run: null, art })).toBe("");
  });

  it("lists held items in the game's slot order, not by item id", () => {
    const log = new Log();
    log.add(0, START);
    log.add(1, state({ turn: 1, resources: resources([[4, 5, "poke_balls", "POKé BALL"], [3, 1, "poke_balls", "GREAT BALL"]]) }));
    expect([...page(ledgerOf(log)).querySelectorAll(".bg-lab")].map((l) => l.textContent)).toEqual(["POKé BALL", "GREAT BALL"]);
  });

  it("says when nothing is recorded yet, and draws a bag that never changed", () => {
    const empty = new Log();
    empty.add(0, START);
    expect(page(ledgerOf(empty)).querySelector(".nodata")?.textContent).toContain("No bag recorded yet");
    empty.add(1, state({ turn: 1, resources: resources([[4, 2, "poke_balls", "POKé BALL"]]) }));
    const doc = page(ledgerOf(empty));
    expect(doc.querySelector(".bg-now")?.textContent).toBe("2");
    expect([...doc.querySelectorAll(".bg-axis span")].map((s) => s.textContent)).toEqual(["T0", "T1"]);
    expect(doc.querySelector(".bg-legend")?.textContent).toBe("found / given");
  });
});
