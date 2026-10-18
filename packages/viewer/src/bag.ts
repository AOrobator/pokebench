// The PokéNav BAG page (runs/mockups/bag-inventory/variant-c.html, "C · Item ledger"): the bag's
// quantities by turn, one step chart per item grouped by pocket, and every recorded
// item_quantity_changed event newest first with an inferred cause and a jump to its turn.
// Reads only recorded state (resources.bag, resources.pc_items, money, location, in_battle).
import type { RunEvent } from "@pokebench/agent/events";
import { esc, eventMs, num } from "./format.js";

type Of<T extends RunEvent["type"]> = Extract<RunEvent, { type: T }>;
type Resources = NonNullable<Extract<Of<"state">, { started: boolean }>["resources"]>;
type RecordedItem = NonNullable<Resources["bag"]>[number];

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

// pokeemerald item ids DoWallyTutorialBagMenu (src/item_menu.c) puts in the swapped-out bag.
const ITEM_POKE_BALL = 4;
const ITEM_POTION = 13;

export type Cause = "found" | "bought" | "sold" | "used" | "from_pc" | "to_pc" | "tutorial" | "restored";

export interface BagChange {
  readonly seq: number;
  readonly turn: number;
  readonly ms: number;
  readonly itemId: number;
  readonly name: string;
  readonly before: number;
  readonly after: number;
  readonly delta: number;
  readonly cause: Cause;
  readonly note: string;
  readonly place: string | null;
  // The state that showed this change, and the money that left the bag's owner in that step.
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
  readonly pc: ReadonlyMap<number, number>;
  readonly place: string | null;
  readonly inBattle: boolean;
}

interface Pending {
  readonly seq: number;
  readonly turn: number;
  readonly ms: number;
  readonly itemId: number;
  readonly name: string;
  readonly before: number;
  readonly after: number;
}

export interface TutorialWindow {
  readonly start: number;
  end: number | null;
}

function pendingOf(event: Of<"native_action">): Pending | null {
  const { item_id: itemId, item_name: name, before, after } = event.details;
  if (typeof itemId !== "number" || typeof before !== "number" || typeof after !== "number") return null;
  return { seq: event.seq, turn: event.turn, ms: eventMs(event), itemId, name: typeof name === "string" ? name : `ITEM ${String(itemId)}`, before, after };
}

function snapshotOf(event: Of<"state">): Snapshot | null {
  if (!("started" in event)) return null;
  const bag = event.resources?.bag;
  if (bag === null || bag === undefined) return null;
  const held = new Map<number, Held>();
  for (const item of bag) {
    held.set(item.item_id, { quantity: (held.get(item.item_id)?.quantity ?? 0) + item.quantity, pocket: isPocket(item.pocket) ? item.pocket : "items", name: item.name ?? `ITEM ${String(item.item_id)}`, slot: Math.min(item.slot, held.get(item.item_id)?.slot ?? item.slot) });
  }
  const pc = new Map<number, number>();
  for (const item of event.resources?.pc_items ?? ([] as RecordedItem[])) pc.set(item.item_id, (pc.get(item.item_id) ?? 0) + item.quantity);
  const place = event.location_display ?? event.location;
  const key = [...held].map(([id, h]) => `${String(id)}x${String(h.quantity)}`).sort().join(",");
  return { seq: event.seq, key, money: event.money, bag: held, pc, place: place === null ? null : event.in_battle ? `${place} · battle` : place, inBattle: event.in_battle };
}

// The ITEMS and POKé BALLS pockets: the two the Wally tutorial swaps out.
function swapKey(snapshot: Snapshot): string {
  return [...snapshot.bag].filter(([, held]) => held.pocket === "items" || held.pocket === "poke_balls").map(([id, held]) => `${String(id)}x${String(held.quantity)}`).sort().join(",");
}
const WALLY_BAG = [`${String(ITEM_POKE_BALL)}x1`, `${String(ITEM_POTION)}x1`].sort().join(",");

const yen = (n: number): string => `¥${num(n)}`;

export class BagLedger {
  readonly changes: BagChange[] = [];
  readonly tutorials: TutorialWindow[] = [];
  latest: Snapshot | null = null;
  lastTurn = 0;
  recorded = false;
  version = 0;
  private readonly pockets = new Map<number, Pocket>();
  private pending: Pending[] = [];
  private saved: string | null = null;

  add(event: RunEvent): void {
    this.lastTurn = Math.max(this.lastTurn, event.turn);
    if (event.type === "native_action" && event.kind === "item_quantity_changed") {
      const pending = pendingOf(event);
      if (pending !== null) {
        this.pending.push(pending);
        this.version += 1;
      }
      return;
    }
    if (event.type !== "state") return;
    const snapshot = snapshotOf(event);
    if (snapshot === null) return;
    const previous = this.latest;
    for (const [id, held] of snapshot.bag) this.pockets.set(id, held.pocket);
    this.recorded = true;
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

  // Item changes still waiting for the state that shows their result, with causes from what is known.
  get unresolved(): BagChange[] {
    return this.pending.map((p) => this.change(p, p.after > p.before ? "found" : "used", "waiting for the next recorded state", this.latest, 0));
  }

  private change(p: Pending, cause: Cause, note: string, shown: Snapshot | null, moneyDrop: number): BagChange {
    return { seq: p.seq, turn: p.turn, ms: p.ms, itemId: p.itemId, name: p.name, before: p.before, after: p.after, delta: p.after - p.before, cause, note, place: shown?.place ?? null, step: shown?.seq ?? -1, moneyDrop };
  }

  private resolve(group: readonly Pending[], previous: Snapshot | null, next: Snapshot): void {
    const open = this.tutorials.at(-1);
    const swapped = previous !== null && next.inBattle && swapKey(next) === WALLY_BAG && swapKey(previous) !== WALLY_BAG;
    if (swapped) {
      this.saved = swapKey(previous);
      this.tutorials.push({ start: group[0]?.turn ?? this.lastTurn, end: null });
      for (const p of group) this.changes.push(this.change(p, "tutorial", p.after > p.before ? "lent, not earned" : "game swaps the bag for Wally's catch", next, 0));
      return;
    }
    if (open !== undefined && open.end === null && this.saved !== null) {
      const restored = swapKey(next) === this.saved;
      if (restored || !next.inBattle) {
        open.end = group.at(-1)?.turn ?? this.lastTurn;
        this.saved = null;
      }
      if (restored) {
        for (const p of group) this.changes.push(this.change(p, "restored", p.after > p.before ? "end of Wally's catch tutorial" : `the lent ${p.name} goes back`, next, 0));
        return;
      }
      if (next.inBattle) {
        for (const p of group) this.changes.push(this.change(p, "tutorial", "during Wally's catch tutorial", next, 0));
        return;
      }
    }
    const before = previous?.money ?? null;
    const after = next.money;
    const moneyDrop = before === null || after === null ? 0 : before - after;
    const money = before === null || after === null ? "money not recorded" : moneyDrop === 0 ? "no money change" : `${yen(before)} → ${yen(after)} (${moneyDrop > 0 ? "−" : "+"}${num(Math.abs(moneyDrop))})`;
    for (const p of group) {
      const delta = p.after - p.before;
      const pcBefore = previous?.pc.get(p.itemId) ?? 0;
      const pcAfter = next.pc.get(p.itemId) ?? 0;
      const pcNote = `ITEM STORAGE PC ×${String(pcBefore)} → ×${String(pcAfter)}`;
      let cause: Cause;
      if (delta > 0) cause = previous !== null && pcBefore - pcAfter >= delta ? "from_pc" : moneyDrop > 0 ? "bought" : "found";
      else cause = previous !== null && pcAfter - pcBefore >= -delta ? "to_pc" : moneyDrop < 0 ? "sold" : "used";
      this.changes.push(this.change(p, cause, cause === "from_pc" || cause === "to_pc" ? pcNote : money, next, moneyDrop));
    }
  }
}

export interface Headline {
  readonly gained: number;
  readonly used: number;
  readonly spent: number;
  readonly buys: number;
  readonly swaps: number;
}

export function headline(ledger: BagLedger): Headline {
  const changes = [...ledger.changes, ...ledger.unresolved];
  const sum = (causes: readonly Cause[]): number => changes.filter((c) => causes.includes(c.cause)).reduce((total, c) => total + Math.abs(c.delta), 0);
  const bought = ledger.changes.filter((c) => c.cause === "bought");
  // One mart purchase can bring several items in one step; count each step's money drop once.
  const spent = new Map(bought.map((c) => [c.step, c.moneyDrop]));
  return { gained: sum(["found", "bought"]), used: sum(["used"]), spent: [...spent.values()].reduce((a, b) => a + b, 0), buys: bought.length, swaps: ledger.tutorials.length };
}

export interface BagArt {
  readonly items: ReadonlySet<number>;
  readonly pockets: ReadonlySet<string>;
}

export const NO_ART: BagArt = { items: new Set(), pockets: new Set() };

export function parseBagArt(value: unknown): BagArt {
  const record: { items?: unknown; pockets?: unknown } = typeof value === "object" && value !== null ? value : {};
  const items = Array.isArray(record.items) ? (record.items as unknown[]).filter((id): id is number => Number.isInteger(id)) : [];
  const pockets = Array.isArray(record.pockets) ? (record.pockets as unknown[]).filter((p): p is string => typeof p === "string" && isPocket(p)) : [];
  return { items: new Set(items), pockets: new Set(pockets) };
}

const itemIcon = (art: BagArt, itemId: number): string => art.items.has(itemId) ? `<img class="pix" alt="" src="/sprites/bag/items/${String(itemId)}.png" width="24" height="24">` : '<span class="bg-noicon" aria-hidden="true"></span>';

const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const easternTime = (ms: number): string => `${ET.format(ms)} ET`;

interface Step {
  readonly turn: number;
  readonly quantity: number;
  readonly change: BagChange;
}

interface Series {
  readonly itemId: number;
  readonly name: string;
  readonly pocket: Pocket;
  readonly start: number;
  readonly steps: readonly Step[];
  readonly now: number;
}

function seriesOf(ledger: BagLedger, changes: readonly BagChange[]): Series[] {
  const byItem = new Map<number, BagChange[]>();
  for (const change of changes) byItem.set(change.itemId, [...(byItem.get(change.itemId) ?? []), change]);
  for (const [id] of ledger.latest?.bag ?? new Map<number, Held>()) if (!byItem.has(id)) byItem.set(id, []);
  return [...byItem].map(([itemId, list]) => {
    const held = ledger.latest?.bag.get(itemId);
    const first = list[0];
    const last = list.at(-1);
    return {
      itemId,
      name: held?.name ?? first?.name ?? `ITEM ${String(itemId)}`,
      pocket: ledger.pocketOf(itemId),
      start: first?.before ?? held?.quantity ?? 0,
      steps: list.map((change) => ({ turn: change.turn, quantity: change.after, change })),
      now: held?.quantity ?? last?.after ?? 0,
    };
  });
}

const pct = (n: number): string => `${n.toFixed(2)}%`;
const DOT: Record<Cause, string> = { found: "got", from_pc: "got", bought: "buy", tutorial: "tut", restored: "tut", used: "use", sold: "use", to_pc: "use" };
const CHIP: Record<Cause, string> = { found: "FOUND / GIVEN", bought: "BOUGHT", sold: "SOLD", used: "USED / TOSSED", from_pc: "FROM PC", to_pc: "TO PC", tutorial: "TUTORIAL BAG", restored: "BAG RESTORED" };
const TRACK_TOP = 4;
const TRACK_SPAN = 30;

function track(series: Series, x: (turn: number) => number, bands: string): string {
  const max = Math.max(1, series.start, ...series.steps.map((s) => s.quantity));
  const y = (q: number): number => 100 - (q / max) * 100;
  let line = `M0,${y(series.start).toFixed(1)}`;
  for (const step of series.steps) line += `H${(x(step.turn) * 10).toFixed(1)}V${y(step.quantity).toFixed(1)}`;
  line += "H1000";
  const dots = series.steps.map((step) => {
    const top = `${(TRACK_TOP + (1 - step.quantity / max) * TRACK_SPAN).toFixed(1)}px`;
    const tutorial = step.change.cause === "tutorial" || step.change.cause === "restored";
    const label = tutorial ? "" : `<span class="bg-dlab" style="left:${pct(x(step.turn))};top:${top}">${String(step.quantity)}</span>`;
    return `<i class="bg-dot ${DOT[step.change.cause]}" style="left:${pct(x(step.turn))};top:${top}" title="T${String(step.turn)} · ${esc(CHIP[step.change.cause])} · ${String(step.change.before)} → ${String(step.quantity)}"></i>${label}`;
  }).join("");
  return `<div class="bg-track">${bands}<svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="${line}V100H0Z"/><path d="${line}"/></svg>${dots}</div>`;
}

// Turn labels for the shared axis: the ends plus change turns that do not crowd an earlier label.
function axisTurns(last: number, changes: readonly BagChange[]): number[] {
  const turns = [0, last];
  for (const change of [...changes].sort((a, b) => a.turn - b.turn)) {
    if (change.cause === "tutorial" || change.cause === "restored") continue;
    if (turns.every((t) => Math.abs(t - change.turn) / Math.max(1, last) >= 0.1)) turns.push(change.turn);
  }
  return turns.sort((a, b) => a - b);
}

export interface BagPageInput {
  readonly ledger: BagLedger;
  readonly run: string | null;
  readonly art: BagArt;
  readonly canJump: boolean;
}

export function bagRange(input: BagPageInput): string {
  const short = input.run?.split("_").at(-1) ?? "";
  return input.run === null ? "" : `RUN ${esc(short)} · T0–T${String(input.ledger.lastTurn)}`;
}

export function bagPage({ ledger, art, canJump }: BagPageInput): string {
  if (!ledger.recorded) return '<p class="nodata">No bag recorded yet. Runs record the bag in every state once the game has started (resources.bag).</p>';
  const changes = [...ledger.changes, ...ledger.unresolved];
  const last = Math.max(1, ledger.lastTurn);
  const x = (turn: number): number => Math.min(100, Math.max(0, (turn / last) * 100));
  const head = headline(ledger);
  const kpis = [
    [String(head.gained), "ITEMS GAINED"],
    [String(head.used), "USED OR TOSSED"],
    [yen(head.spent), `SPENT AT MARTS (${String(head.buys)} ${head.buys === 1 ? "BUY" : "BUYS"})`],
    [String(head.swaps), `TUTORIAL ${head.swaps === 1 ? "SWAP" : "SWAPS"} (NOT A LOSS)`],
  ].map(([value, label]) => `<div class="bg-kpi"><b>${value ?? ""}</b><span>${label ?? ""}</span></div>`).join("");
  const bands = ledger.tutorials.map((w) => `<span class="bg-band" style="left:${pct(x(w.start))};width:${pct(x(w.end ?? last) - x(w.start))}" title="Wally's tutorial bag T${String(w.start)}–T${String(w.end ?? last)}"></span>`).join("");
  const series = seriesOf(ledger, changes);
  const grid = POCKETS.map((pocket) => {
    // Held items in the game's bag order, then items the bag no longer holds.
    const slot = (s: Series): number => ledger.latest?.bag.get(s.itemId)?.slot ?? Number.MAX_SAFE_INTEGER;
    const rows = series.filter((s) => s.pocket === pocket.id).sort((a, b) => slot(a) - slot(b) || a.itemId - b.itemId);
    const held = rows.filter((s) => s.now > 0);
    const total = held.reduce((sum, s) => sum + s.now, 0);
    const meta = rows.length === 0 ? "EMPTY" : `${String(held.length)} ${held.length === 1 ? "KIND" : "KINDS"} · ${String(total)}`;
    const icon = art.pockets.has(pocket.id) ? `<img class="pix" alt="" src="/sprites/bag/pockets/${pocket.id}.png" width="28" height="28">` : "";
    const header = `<div class="bg-pk${rows.length === 0 ? " empty" : ""}" data-pocket="${pocket.id}">${icon}<span class="bg-pn">${esc(pocket.label)}</span><span class="bg-pm">${meta}</span></div>`;
    return header + rows.map((s) => `<div class="bg-lab">${itemIcon(art, s.itemId)}<span>${esc(s.name)}</span></div>${track(s, x, bands)}<div class="bg-now">${String(s.now)}</div>`).join("");
  }).join("");
  const axis = `<div></div><div class="bg-axis">${axisTurns(last, changes).map((t) => `<span style="left:${pct(x(t))}">T${String(t)}</span>`).join("")}</div><div></div>`;
  const causes = new Set(changes.map((c) => DOT[c.cause]));
  const legend = [
    '<span><i></i>found / given</span>',
    causes.has("buy") ? '<span><i class="buy"></i>bought</span>' : "",
    causes.has("use") ? '<span><i class="use"></i>used, sold or stored</span>' : "",
    ...ledger.tutorials.map((w) => `<span><i class="bnd"></i>Wally's tutorial bag T${String(w.start)}–T${String(w.end ?? last)}</span>`),
  ].join("");
  const rows = [...changes].sort((a, b) => b.seq - a.seq).map((c) => {
    const tutorial = c.cause === "tutorial" || c.cause === "restored";
    const sign = c.delta > 0 ? "+" : "−";
    const jump = canJump ? "" : ' disabled title="Jumps work on a replay, not a live run"';
    return `<div class="bg-row${tutorial ? " tut" : ""}"><div class="tm">${easternTime(c.ms)}<span>T${String(c.turn)}</span></div>${itemIcon(art, c.itemId)}<div class="nm">${esc(c.name)}<span>${esc(c.place ?? "place not recorded")}</span></div><div class="ch">${String(c.before)} → ${String(c.after)}<span class="dl ${c.delta > 0 ? "up" : "dn"}">${sign}${String(Math.abs(c.delta))}</span></div><div class="cause"><span class="cz ${DOT[c.cause]}">${CHIP[c.cause]}</span><span>${esc(c.note)}</span></div><button type="button" class="jump" data-bag-jump="${String(c.seq)}" aria-label="Jump the replay to turn ${String(c.turn)}"${jump}>▶ T${String(c.turn)}</button></div>`;
  }).join("");
  const log = rows === "" ? '<p class="nodata">No item changes recorded.</p>' : `<div class="bg-log">${rows}</div>`;
  return `<div class="bg-kpis">${kpis}</div><h4>QUANTITY BY TURN · BY POCKET</h4><div class="bg-sm">${grid}${axis}</div><div class="bg-legend">${legend}</div><h4>CHANGES · NEWEST FIRST</h4>${log}<p class="bg-inf">Causes are inferred: BOUGHT when money drops in the step the item arrives, FROM PC / TO PC when the item storage PC changes by as much, TUTORIAL BAG when the game swaps the bag for one POTION and one POKé BALL in battle (Wally's catch tutorial) and BAG RESTORED when it swaps back. The run records the quantities, not why they changed.</p>`;
}
