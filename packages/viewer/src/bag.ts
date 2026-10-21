// The PokéNav BAG page (runs/mockups/bag-inventory/variant-c.html, "C · Item ledger"): headline
// numbers and the bag's quantities by turn, one step chart per item grouped under the game's pocket
// labels. Reads only recorded state (resources.bag, resources.pc_items, money, party_owner) and the
// game's item_quantity_changed native actions.
import type { RunEvent } from "@pokebench/agent/events";
import { esc, num } from "./format.js";

type Of<T extends RunEvent["type"]> = Extract<RunEvent, { type: T }>;

// The game's pocket order (include/constants/item.h POCKET_ITEMS..POCKET_KEY_ITEMS).
export const POCKETS = [
  { id: "items", label: "ITEMS" },
  { id: "poke_balls", label: "POKé BALLS" },
  { id: "tm_hm", label: "TMs & HMs" },
  { id: "berries", label: "BERRIES" },
  { id: "key_items", label: "KEY ITEMS" },
] as const;
export type Pocket = (typeof POCKETS)[number]["id"];
const isPocket = (value: string | null): value is Pocket => POCKETS.some((pocket) => pocket.id === value);

export type Cause = "found" | "bought" | "sold" | "used" | "from_pc" | "to_pc";

export interface BagChange {
  readonly seq: number;
  readonly turn: number;
  readonly itemId: number;
  readonly name: string;
  readonly before: number;
  readonly after: number;
  readonly cause: Cause;
  // The state that showed this change, and the money that left in that step.
  readonly step: number;
  readonly moneyDrop: number;
}

interface Held {
  readonly quantity: number;
  readonly pocket: Pocket;
  readonly name: string;
  // Its first slot in its pocket: the order the game's bag lists it.
  readonly slot: number;
}

interface Snapshot {
  readonly seq: number;
  readonly key: string;
  readonly money: number | null;
  readonly bag: ReadonlyMap<number, Held>;
  // Null when the state did not record the item storage PC.
  readonly pc: ReadonlyMap<number, number> | null;
}

interface Pending {
  readonly seq: number;
  readonly turn: number;
  readonly itemId: number;
  readonly name: string;
  readonly before: number;
  readonly after: number;
}

function pendingOf(event: Of<"native_action">): Pending | null {
  const { item_id: itemId, item_name: name, before, after } = event.details;
  if (typeof itemId !== "number" || typeof before !== "number" || typeof after !== "number") return null;
  return { seq: event.seq, turn: event.turn, itemId, name: typeof name === "string" ? name : `ITEM ${String(itemId)}`, before, after };
}

type StateWithBag = Extract<Of<"state">, { started: boolean }>;

function snapshotOf(event: StateWithBag): Snapshot | null {
  const bag = event.resources?.bag;
  if (bag === null || bag === undefined) return null;
  const held = new Map<number, Held>();
  for (const item of bag) {
    const prior = held.get(item.item_id);
    held.set(item.item_id, { quantity: (prior?.quantity ?? 0) + item.quantity, pocket: isPocket(item.pocket) ? item.pocket : "items", name: item.name ?? `ITEM ${String(item.item_id)}`, slot: Math.min(item.slot, prior?.slot ?? item.slot) });
  }
  const pcItems = event.resources?.pc_items;
  let pc: Map<number, number> | null = null;
  if (pcItems !== null && pcItems !== undefined) {
    pc = new Map<number, number>();
    for (const item of pcItems) pc.set(item.item_id, (pc.get(item.item_id) ?? 0) + item.quantity);
  }
  const key = [...held].map(([id, h]) => `${String(id)}x${String(h.quantity)}`).sort().join(",");
  return { seq: event.seq, key, money: event.money, bag: held, pc };
}

export class BagLedger {
  readonly changes: BagChange[] = [];
  latest: Snapshot | null = null;
  lastTurn = 0;
  recorded = false;
  version = 0;
  private readonly pockets = new Map<number, Pocket>();
  private pending: Pending[] = [];
  private inTutorial = false;
  // Set by the first player state after the tutorial until the next state: human runs record the
  // game's swap-back actions after that state, and they are not the player's changes either.
  // Agent runs record a real change before the state that shows it, so it never matches.
  private leftTutorial = false;
  // The player-bag snapshot before `latest`, for actions recorded after the state that shows them.
  private beforeLatest: Snapshot | null = null;

  add(event: RunEvent): void {
    this.lastTurn = Math.max(this.lastTurn, event.turn);
    if (event.type === "native_action" && event.kind === "item_quantity_changed") {
      const pending = pendingOf(event);
      if (pending === null) return;
      // Human runs record the state first and poll the game's actions after it: when the latest
      // player state already shows `after` and the one before it `before`, that state confirms it.
      const qty = (snapshot: Snapshot | null): number => snapshot?.bag.get(pending.itemId)?.quantity ?? 0;
      // Right after the tutorial, an action the restored bag already shows is the swap back.
      if (this.leftTutorial && qty(this.latest) === pending.after) return;
      if (this.latest !== null && !this.inTutorial && this.pending.length === 0 && qty(this.latest) === pending.after && qty(this.beforeLatest) === pending.before) {
        this.resolve([pending], this.beforeLatest, this.latest);
        this.version += 1;
        return;
      }
      this.pending.push(pending);
      return;
    }
    if (event.type !== "state" || !("started" in event)) return;
    this.leftTutorial = false;
    // Wally's catch tutorial (party_owner "tutorial", read from the game's BATTLE_TYPE_WALLY_TUTORIAL
    // flag) swaps in a lent bag and swaps the player's back afterwards: neither is the player's bag,
    // so item changes shown in those states are dropped and the lent bag is never a snapshot.
    if (event.party_owner === "tutorial") {
      this.pending = [];
      this.inTutorial = true;
      return;
    }
    const snapshot = snapshotOf(event);
    if (snapshot === null) return;
    const previous = this.latest;
    // The player's bag coming back after the tutorial is the swap back, not a gain.
    if (this.inTutorial && previous?.key === snapshot.key) this.pending = [];
    this.leftTutorial = this.inTutorial;
    this.inTutorial = false;
    for (const [id, held] of snapshot.bag) this.pockets.set(id, held.pocket);
    this.recorded = true;
    this.beforeLatest = previous;
    this.latest = snapshot;
    if (previous?.key !== snapshot.key || this.pending.length > 0) this.version += 1;
    if (this.pending.length === 0) return;
    const group = this.pending;
    this.pending = [];
    this.resolve(group, previous, snapshot);
  }

  pocketOf(itemId: number): Pocket {
    return this.pockets.get(itemId) ?? "items";
  }

  // Item changes still waiting for the state that shows their result. They are never drawn: until
  // that state arrives a change may be Wally's tutorial loan, which only that state can rule out.
  get waiting(): number {
    return this.pending.length;
  }

  private resolve(group: readonly Pending[], previous: Snapshot | null, next: Snapshot): void {
    const before = previous?.money ?? null;
    const moneyDrop = before === null || next.money === null ? 0 : before - next.money;
    const pcBefore = previous?.pc ?? null;
    const pcAfter = next.pc;
    for (const p of group) {
      const delta = p.after - p.before;
      const pcMoved = pcBefore === null || pcAfter === null ? 0 : (pcBefore.get(p.itemId) ?? 0) - (pcAfter.get(p.itemId) ?? 0);
      let cause: Cause;
      if (delta > 0) cause = pcMoved >= delta ? "from_pc" : moneyDrop > 0 ? "bought" : "found";
      else cause = -pcMoved >= -delta ? "to_pc" : moneyDrop < 0 ? "sold" : "used";
      this.changes.push({ seq: p.seq, turn: p.turn, itemId: p.itemId, name: p.name, before: p.before, after: p.after, cause, step: next.seq, moneyDrop });
    }
  }
}

export interface Headline {
  readonly gained: number;
  readonly used: number;
  readonly spent: number;
  readonly buys: number;
}

export function headline(ledger: BagLedger): Headline {
  const changes = ledger.changes;
  const sum = (causes: readonly Cause[]): number => changes.filter((c) => causes.includes(c.cause)).reduce((total, c) => total + Math.abs(c.after - c.before), 0);
  const bought = ledger.changes.filter((c) => c.cause === "bought");
  // One mart purchase can bring several items in one step; count each step's money drop once.
  const spent = new Map(bought.map((c) => [c.step, c.moneyDrop]));
  return { gained: sum(["found", "bought"]), used: sum(["used"]), spent: [...spent.values()].reduce((a, b) => a + b, 0), buys: bought.length };
}

// Item ids `just bag-art` built icons for; empty when the art was never built.
export type BagArt = ReadonlySet<number>;
export const NO_ART: BagArt = new Set();

export function parseBagArt(value: unknown): BagArt {
  const record: { items?: unknown } = typeof value === "object" && value !== null ? value : {};
  return new Set(Array.isArray(record.items) ? (record.items as unknown[]).filter((id): id is number => Number.isInteger(id)) : []);
}

const itemIcon = (art: BagArt, itemId: number): string => art.has(itemId) ? `<img class="pix" alt="" src="/sprites/bag/items/${String(itemId)}.png" width="24" height="24">` : '<span class="bg-noicon" aria-hidden="true"></span>';
const yen = (n: number): string => `¥${num(n)}`;

interface Series {
  readonly itemId: number;
  readonly name: string;
  readonly pocket: Pocket;
  readonly start: number;
  readonly steps: readonly BagChange[];
  readonly now: number;
}

function seriesOf(ledger: BagLedger, changes: readonly BagChange[]): Series[] {
  const byItem = new Map<number, BagChange[]>();
  for (const change of changes) {
    const list = byItem.get(change.itemId);
    if (list === undefined) byItem.set(change.itemId, [change]);
    else list.push(change);
  }
  for (const [id] of ledger.latest?.bag ?? new Map<number, Held>()) if (!byItem.has(id)) byItem.set(id, []);
  return [...byItem].map(([itemId, list]) => {
    const held = ledger.latest?.bag.get(itemId);
    return {
      itemId,
      name: held?.name ?? list[0]?.name ?? `ITEM ${String(itemId)}`,
      pocket: ledger.pocketOf(itemId),
      start: list[0]?.before ?? held?.quantity ?? 0,
      steps: list,
      now: held?.quantity ?? list.at(-1)?.after ?? 0,
    };
  });
}

const pct = (n: number): string => `${n.toFixed(2)}%`;
const DOT: Record<Cause, string> = { found: "got", from_pc: "got", bought: "buy", used: "use", sold: "use", to_pc: "use" };
const LABEL: Record<Cause, string> = { found: "FOUND / GIVEN", bought: "BOUGHT", sold: "SOLD", used: "USED / TOSSED", from_pc: "FROM PC", to_pc: "TO PC" };
const TRACK_TOP = 4;
const TRACK_SPAN = 30;

function track(series: Series, x: (turn: number) => number): string {
  const max = Math.max(1, series.start, ...series.steps.map((s) => s.after));
  const y = (q: number): number => 100 - (q / max) * 100;
  let line = `M0,${y(series.start).toFixed(1)}`;
  for (const step of series.steps) line += `H${(x(step.turn) * 10).toFixed(1)}V${y(step.after).toFixed(1)}`;
  line += "H1000";
  const dots = series.steps.map((step) => {
    const at = `left:${pct(x(step.turn))};top:${(TRACK_TOP + (1 - step.after / max) * TRACK_SPAN).toFixed(1)}px`;
    return `<i class="bg-dot ${DOT[step.cause]}" style="${at}" title="T${String(step.turn)} · ${LABEL[step.cause]} · ${String(step.before)} → ${String(step.after)}"></i><span class="bg-dlab" style="${at}">${String(step.after)}</span>`;
  }).join("");
  return `<div class="bg-track"><svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="${line}V100H0Z"/><path d="${line}"/></svg>${dots}</div>`;
}

// Turn labels for the shared axis: the ends plus change turns that do not crowd an earlier label.
function axisTurns(last: number, changes: readonly BagChange[]): number[] {
  const turns = [0, last];
  for (const change of [...changes].sort((a, b) => a.turn - b.turn)) {
    if (turns.every((t) => Math.abs(t - change.turn) / last >= 0.1)) turns.push(change.turn);
  }
  return turns.sort((a, b) => a - b);
}

export interface BagPageInput {
  readonly ledger: BagLedger;
  readonly run: string | null;
  readonly art: BagArt;
}

export function bagRange({ ledger, run }: BagPageInput): string {
  return run === null ? "" : `RUN ${esc(run.split("_").at(-1) ?? "")} · T0–T${String(ledger.lastTurn)}`;
}

export function bagPage({ ledger, art }: BagPageInput): string {
  if (!ledger.recorded) return '<p class="nodata">No bag recorded yet. Runs record the bag in every state once the game has started (resources.bag).</p>';
  const changes = ledger.changes;
  const last = Math.max(1, ledger.lastTurn);
  const x = (turn: number): number => Math.min(100, Math.max(0, (turn / last) * 100));
  const head = headline(ledger);
  const kpis = [
    [String(head.gained), "ITEMS GAINED"],
    [String(head.used), "USED OR TOSSED"],
    [yen(head.spent), `SPENT AT MARTS (${String(head.buys)} ${head.buys === 1 ? "BUY" : "BUYS"})`],
  ].map(([value, label]) => `<div class="bg-kpi"><b>${value ?? ""}</b><span>${label ?? ""}</span></div>`).join("");
  const series = seriesOf(ledger, changes);
  // Held items in the game's bag order, then items the bag no longer holds.
  const slot = (s: Series): number => ledger.latest?.bag.get(s.itemId)?.slot ?? Number.MAX_SAFE_INTEGER;
  const grid = POCKETS.map((pocket) => {
    const rows = series.filter((s) => s.pocket === pocket.id).sort((a, b) => slot(a) - slot(b) || a.itemId - b.itemId);
    const held = rows.filter((s) => s.now > 0);
    const total = held.reduce((sum, s) => sum + s.now, 0);
    const meta = held.length === 0 ? "EMPTY" : `${String(held.length)} ${held.length === 1 ? "KIND" : "KINDS"} · ${String(total)}`;
    const header = `<div class="bg-pk${held.length === 0 ? " empty" : ""}" data-pocket="${pocket.id}"><span class="bg-pn">${esc(pocket.label)}</span><span class="bg-pm">${meta}</span></div>`;
    return header + rows.map((s) => `<div class="bg-lab">${itemIcon(art, s.itemId)}<span>${esc(s.name)}</span></div>${track(s, x)}<div class="bg-now">${String(s.now)}</div>`).join("");
  }).join("");
  const axis = `<div></div><div class="bg-axis">${axisTurns(last, changes).map((t) => `<span style="left:${pct(x(t))}">T${String(t)}</span>`).join("")}</div><div></div>`;
  const kinds = new Set(changes.map((c) => DOT[c.cause]));
  const legend = [
    '<span><i></i>found / given</span>',
    kinds.has("buy") ? '<span><i class="buy"></i>bought</span>' : "",
    kinds.has("use") ? '<span><i class="use"></i>used, sold or stored</span>' : "",
  ].join("");
  return `<div class="bg-kpis">${kpis}</div><h4>QUANTITY BY TURN · BY POCKET</h4><div class="bg-sm">${grid}${axis}</div><div class="bg-legend">${legend}</div><p class="bg-inf">BOUGHT is inferred when money drops in the step the item arrives. The run records the quantities, not why they changed.</p>`;
}
