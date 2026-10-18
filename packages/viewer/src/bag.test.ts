// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Log, START, state, must } from "../test-support/events.js";
import { bagRun, itemChange, resources } from "../test-support/bag.js";
import { BagLedger, NO_ART, bagPage, bagRange, easternTime, headline, parseBagArt, type BagChange } from "./bag.js";

function ledgerOf(log: Log): BagLedger {
  const ledger = new BagLedger();
  for (const event of log.events) ledger.add(event);
  return ledger;
}

const brief = (c: BagChange): string => `T${String(c.turn)} ${c.name} ${String(c.before)}→${String(c.after)} ${c.cause} · ${c.note} · ${c.place ?? "-"}`;

function page(ledger: BagLedger, canJump = true, art = NO_ART): Document {
  document.body.innerHTML = bagPage({ ledger, run: "2026-10-17T13-15-36_qwen36-gpu1_e046", art, canJump });
  return document;
}

describe("BagLedger", () => {
  it("infers each change's cause from the recorded money, item storage PC and Wally's tutorial swap", () => {
    const ledger = ledgerOf(bagRun());
    expect(ledger.changes.map(brief)).toEqual([
      "T10 POKé BALL 0→5 found · no money change · LITTLEROOT TOWN PROFESSOR BIRCHS LAB",
      "T20 POKé BALL 5→1 tutorial · game swaps the bag for Wally's catch · ROUTE102 · battle",
      "T20 POTION 0→1 tutorial · lent, not earned · ROUTE102 · battle",
      "T22 POKé BALL 1→5 restored · end of Wally's catch tutorial · ROUTE102 · battle",
      "T22 POTION 1→0 restored · the lent POTION goes back · ROUTE102 · battle",
      "T30 GREAT BALL 0→1 found · no money change · PETALBURG WOODS",
      "T40 POKé BALL 5→6 bought · ¥3,000 → ¥2,800 (−200) · OLDALE TOWN MART",
      "T50 POTION 0→1 from_pc · ITEM STORAGE PC ×1 → ×0 · PLAYERS HOUSE",
      "T60 GREAT BALL 1→0 sold · ¥2,800 → ¥3,100 (+300) · OLDALE TOWN MART",
      "T70 POTION 1→0 used · no money change · ROUTE104 · battle",
      "T80 POKé BALL 6→5 to_pc · ITEM STORAGE PC ×0 → ×1 · PLAYERS HOUSE",
    ]);
    expect(ledger.tutorials).toEqual([{ start: 20, end: 22 }]);
    expect(headline(ledger)).toEqual({ gained: 7, used: 1, spent: 200, buys: 1, swaps: 1 });
    expect(ledger.lastTurn).toBe(80);
    expect(ledger.unresolved).toEqual([]);
  });

  it("counts one mart step's money once when it brings several items", () => {
    const log = new Log();
    log.add(0, START);
    log.add(1, state({ money: 1000, resources: resources([]) }));
    log.add(2, itemChange(2, 4, "POKé BALL", 0, 10));
    log.add(3, itemChange(2, 12, "PREMIER BALL", 0, 1));
    log.add(4, state({ turn: 2, money: 0, resources: resources([[4, 10, "poke_balls", "POKé BALL"], [12, 1, "poke_balls", "PREMIER BALL"]]) }));
    expect(headline(ledgerOf(log))).toEqual({ gained: 11, used: 0, spent: 1000, buys: 2, swaps: 0 });
  });

  it("closes a tutorial window that leaves battle without restoring, and keeps changes inside it as tutorial", () => {
    const log = new Log();
    log.add(0, START);
    log.add(1, state({ turn: 1, resources: resources([[4, 3, "poke_balls", "POKé BALL"]]) }));
    log.add(2, itemChange(2, 4, "POKé BALL", 3, 1));
    log.add(3, itemChange(2, 13, "POTION", 0, 1));
    log.add(4, state({ turn: 2, in_battle: true, resources: resources([[13, 1, "items", "POTION"], [4, 1, "poke_balls", "POKé BALL"]]) }));
    log.add(5, itemChange(3, 4, "POKé BALL", 1, 0));
    log.add(6, state({ turn: 3, in_battle: true, resources: resources([[13, 1, "items", "POTION"]]) }));
    log.add(7, itemChange(4, 13, "POTION", 1, 0));
    log.add(8, state({ turn: 4, in_battle: false, resources: resources([]) }));
    const ledger = ledgerOf(log);
    expect(ledger.changes.map((c) => `${c.name} ${c.cause}`)).toEqual(["POKé BALL tutorial", "POTION tutorial", "POKé BALL tutorial", "POTION used"]);
    expect(ledger.tutorials).toEqual([{ start: 2, end: 4 }]);
  });

  it("shows changes still waiting for a state, and ignores legacy states and malformed change details", () => {
    const log = new Log();
    log.add(0, START);
    log.add(1, { type: "state", turn: 1, screen: "overworld", location: "X", position: null, in_battle: false, party: [], money: null, badges: [], play_time_s: null } as unknown as Parameters<Log["add"]>[1]);
    log.add(2, state({ turn: 1, money: null, resources: null }));
    expect(ledgerOf(log).recorded).toBe(false);
    log.add(3, state({ turn: 2, money: null, location: null, resources: resources([[999, 2, "mystery", "ODD"]]) }));
    log.add(4, { ...itemChange(3, 13, "POTION", 0, 1), details: { item_id: "13" } });
    log.add(5, { ...itemChange(3, 13, "POTION", 0, 1), details: { item_id: 13, before: 0, after: 2 } });
    const ledger = ledgerOf(log);
    expect(ledger.recorded).toBe(true);
    expect(ledger.pocketOf(999)).toBe("items");
    expect(ledger.unresolved.map(brief)).toEqual(["T3 ITEM 13 0→2 found · waiting for the next recorded state · -"]);
    log.add(6, itemChange(4, 13, "POTION", 2, 1));
    log.add(7, state({ turn: 4, money: null, location: null, resources: resources([[999, 2, "mystery", "ODD"], [13, 1, "items", "POTION"]]) }));
    expect(ledgerOf(log).changes.map(brief)).toEqual(["T3 ITEM 13 0→2 found · money not recorded · -", "T4 POTION 2→1 used · money not recorded · -"]);
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
  it("shows the headline, every pocket in the game's order with empty ones faded, and a shared turn axis", () => {
    const doc = page(ledgerOf(bagRun()));
    expect([...doc.querySelectorAll(".bg-kpi")].map((k) => k.textContent)).toEqual(["7ITEMS GAINED", "1USED OR TOSSED", "¥200SPENT AT MARTS (1 BUY)", "1TUTORIAL SWAP (NOT A LOSS)"]);
    expect([...doc.querySelectorAll(".bg-pk")].map((p) => `${p.querySelector(".bg-pn")?.textContent ?? ""}|${p.querySelector(".bg-pm")?.textContent ?? ""}|${String(p.classList.contains("empty"))}`)).toEqual([
      "ITEMS|0 KINDS · 0|false",
      "POKé BALLS|1 KIND · 5|false",
      "TMs & HMs|EMPTY|true",
      "BERRIES|EMPTY|true",
      "KEY ITEMS|EMPTY|true",
    ]);
    expect([...doc.querySelectorAll(".bg-lab")].map((l) => l.textContent)).toEqual(["POTION", "POKé BALL", "GREAT BALL"]);
    expect([...doc.querySelectorAll(".bg-now")].map((n) => n.textContent)).toEqual(["0", "5", "0"]);
    expect([...doc.querySelectorAll(".bg-axis span")].map((s) => s.textContent)).toEqual(["T0", "T10", "T30", "T40", "T50", "T60", "T70", "T80"]);
    expect(doc.querySelectorAll(".bg-band")).toHaveLength(3);
    expect(must(doc.querySelector<HTMLElement>(".bg-band")).style.left).toBe("25.00%");
    expect(doc.querySelector(".bg-legend")?.textContent).toBe("found / givenboughtused, sold or storedWally's tutorial bag T20–T22");
    const ball = must(doc.querySelectorAll(".bg-track")[1]);
    expect([...ball.querySelectorAll(".bg-dot")].map((d) => d.className)).toEqual(["bg-dot got", "bg-dot tut", "bg-dot tut", "bg-dot buy", "bg-dot use"]);
    expect([...ball.querySelectorAll(".bg-dlab")].map((d) => d.textContent)).toEqual(["5", "6", "5"]);
    expect(ball.querySelector("path:not(.area)")?.getAttribute("d")).toBe("M0,100.0H125.0V16.7H250.0V83.3H275.0V16.7H500.0V0.0H1000.0V16.7H1000");
  });

  it("lists every change newest first with its time in New York, place, cause and a jump", () => {
    const ledger = ledgerOf(bagRun());
    const doc = page(ledger);
    const rows = [...doc.querySelectorAll(".bg-row")];
    expect(rows).toHaveLength(11);
    expect(rows[0]?.querySelector(".nm")?.textContent).toBe("POKé BALLPLAYERS HOUSE");
    expect(rows[0]?.querySelector(".cz")?.textContent).toBe("TO PC");
    expect(rows[0]?.querySelector(".ch")?.textContent).toBe("6 → 5−1");
    expect(rows.filter((r) => r.classList.contains("tut"))).toHaveLength(4);
    const jump = must(rows[4]?.querySelector<HTMLButtonElement>("[data-bag-jump]"));
    expect(jump.textContent).toBe("▶ T40");
    expect(jump.disabled).toBe(false);
    expect(Number(jump.dataset.bagJump)).toBe(ledger.changes.find((c) => c.turn === 40)?.seq);
    expect(rows[4]?.querySelector(".tm")?.textContent).toBe(`${easternTime(must(ledger.changes.find((c) => c.turn === 40)).ms)}T40`);
    expect(page(ledger, false).querySelector<HTMLButtonElement>("[data-bag-jump]")?.disabled).toBe(true);
    expect(bagRange({ ledger, run: "2026-10-17T13-15-36_qwen36-gpu1_e046", art: NO_ART, canJump: true })).toBe("RUN e046 · T0–T80");
    expect(bagRange({ ledger, run: null, art: NO_ART, canJump: true })).toBe("");
  });

  it("uses the game's item and pocket art only where it was built", () => {
    const art = parseBagArt({ items: [4, 13, "x", 1.5], pockets: ["items", "poke_balls", "pc"] });
    expect([...art.items]).toEqual([4, 13]);
    expect([...art.pockets]).toEqual(["items", "poke_balls"]);
    const doc = page(ledgerOf(bagRun()), true, art);
    expect([...doc.querySelectorAll(".bg-pk img")].map((i) => i.getAttribute("src"))).toEqual(["/sprites/bag/pockets/items.png", "/sprites/bag/pockets/poke_balls.png"]);
    expect([...doc.querySelectorAll(".bg-lab img")].map((i) => i.getAttribute("src"))).toEqual(["/sprites/bag/items/13.png", "/sprites/bag/items/4.png"]);
    expect(doc.querySelectorAll(".bg-lab .bg-noicon")).toHaveLength(1);
    expect(parseBagArt(null)).toEqual(NO_ART);
  });

  it("says when nothing is recorded yet, and when the bag never changed", () => {
    const empty = new Log();
    empty.add(0, START);
    expect(page(ledgerOf(empty)).querySelector(".nodata")?.textContent).toContain("No bag recorded yet");
    empty.add(1, state({ turn: 1, resources: resources([[4, 2, "poke_balls", "POKé BALL"]]) }));
    const doc = page(ledgerOf(empty));
    expect(doc.querySelector(".bg-log")).toBeNull();
    expect(doc.querySelector(".nodata")?.textContent).toBe("No item changes recorded.");
    expect(doc.querySelector(".bg-now")?.textContent).toBe("2");
    expect([...doc.querySelectorAll(".bg-axis span")].map((s) => s.textContent)).toEqual(["T0", "T1"]);
    expect(doc.querySelector(".bg-legend")?.textContent).toBe("found / given");
  });

  it("lists held items in the game's slot order, not by item id", () => {
    const log = new Log();
    log.add(0, START);
    log.add(1, state({ turn: 1, resources: resources([[4, 5, "poke_balls", "POKé BALL"], [3, 1, "poke_balls", "GREAT BALL"]]) }));
    expect([...page(ledgerOf(log)).querySelectorAll(".bg-lab")].map((l) => l.textContent)).toEqual(["POKé BALL", "GREAT BALL"]);
  });

  it("writes New York clock times", () => {
    expect(easternTime(Date.parse("2026-10-17T18:24:14Z"))).toBe("14:24:14 ET");
    expect(easternTime(Date.parse("2026-10-17T04:05:06Z"))).toBe("00:05:06 ET");
  });
});
