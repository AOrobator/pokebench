// The PokéNav BAG page (runs/mockups/bag-inventory/variant-c.html, "C · Item ledger"): headline
// numbers and the bag's quantities by turn, one step chart per item grouped under the game's pocket
// labels. Reads only recorded state (resources.bag, resources.pc_items, money, party_owner) and the
// game's item_quantity_changed native actions.
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
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

const Natural = Type.Integer({ minimum: 0 });
const HeldSchema = Type.Object({ quantity: Natural, pocket: Type.Enum(POCKETS.map(p => p.id)), name: Type.String(), slot: Natural });
const SnapshotSchema = Type.Object({ seq: Natural, key: Type.String(), money: Type.Union([Natural, Type.Null()]), bag: Type.Array(Type.Tuple([Natural, HeldSchema])), pc: Type.Union([Type.Array(Type.Tuple([Natural, Natural])), Type.Null()]) });
const PendingSchema = Type.Object({ seq: Natural, turn: Natural, itemId: Natural, name: Type.String(), before: Natural, after: Natural });
const CheckpointSchema = Type.Object({
  changes: Type.Array(Type.Intersect([PendingSchema, Type.Object({ cause: Type.Enum(["found", "bought", "sold", "used", "from_pc", "to_pc"]), step: Natural, moneyDrop: Type.Number() })])),
  latest: Type.Union([SnapshotSchema, Type.Null()]), beforeLatest: Type.Union([SnapshotSchema, Type.Null()]),
  firstTurn: Type.Union([Natural, Type.Null()]), lastTurn: Natural, recorded: Type.Boolean(), version: Natural, pockets: Type.Array(Type.Tuple([Natural, Type.Enum(POCKETS.map(p => p.id))])),
  pending: Type.Array(PendingSchema), inTutorial: Type.Boolean(), leftTutorial: Type.Boolean(),
  shop: Type.Union([Type.Object({ itemId: Natural, quantity: Natural, money: Type.Union([Natural, Type.Null()]), changeSeq: Type.Union([Natural, Type.Null()]) }), Type.Null()]),
  totals: Type.Object({ gained: Natural, used: Natural, spent: Natural, buys: Natural }),
});
export type BagCheckpoint = Static<typeof CheckpointSchema>;
type SavedSnapshot = NonNullable<BagCheckpoint["latest"]>;
const saveSnapshot = (s: Snapshot | null): SavedSnapshot | null => s === null ? null : { ...s, bag: [...s.bag], pc: s.pc === null ? null : [...s.pc] };
const loadSnapshot = (s: SavedSnapshot | null): Snapshot | null => s === null ? null : { ...s, bag: new Map(s.bag), pc: s.pc === null ? null : new Map(s.pc) };

export class BagLedger {
  readonly changes: BagChange[] = [];
  latest: Snapshot | null = null;
  firstTurn: number | null = null;
  lastTurn = 0;
  recorded = false;
  version = 0;
  readonly totals: { gained: number; used: number; spent: number; buys: number } = { gained: 0, used: 0, spent: 0, buys: 0 };
  private shop: BagCheckpoint["shop"] = null;

  checkpoint(): BagCheckpoint {
    return { changes: this.changes.map(c => ({ ...c })), latest: saveSnapshot(this.latest), beforeLatest: saveSnapshot(this.beforeLatest), firstTurn: this.firstTurn, lastTurn: this.lastTurn, recorded: this.recorded, version: this.version, pockets: [...this.pockets], pending: this.pending.map(p => ({ ...p })), inTutorial: this.inTutorial, leftTutorial: this.leftTutorial, shop: this.shop === null ? null : { ...this.shop }, totals: { ...this.totals } };
  }

  static restore(value: unknown): BagLedger {
    if (!Value.Check(CheckpointSchema, value)) throw new Error("Invalid saved bag summary");
    const ledger = new BagLedger();
    for (const change of value.changes) ledger.changes.push(change);
    ledger.latest = loadSnapshot(value.latest); ledger.beforeLatest = loadSnapshot(value.beforeLatest);
    ledger.firstTurn = value.firstTurn; ledger.lastTurn = value.lastTurn; ledger.recorded = value.recorded; ledger.version = value.version;
    for (const [id, pocket] of value.pockets) ledger.pockets.set(id, pocket);
    ledger.pending = value.pending; ledger.inTutorial = value.inTutorial; ledger.leftTutorial = value.leftTutorial;
    ledger.shop = value.shop; Object.assign(ledger.totals, value.totals);
    return ledger;
  }

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
    if (event.type === "native_action" && event.kind === "menu_changed") {
      const d = event.details;
      if (d.phase === "shop_purchase_confirmation") {
        this.shop = d.action === "buy_item" && d.selected === "YES" && typeof d.item_id === "number" && typeof d.quantity === "number"
          ? { itemId: d.item_id, quantity: d.quantity, money: this.latest?.money ?? null, changeSeq: null } : null;
      }
    }
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
    // shop.c adds the item before BuyMenuSubtractMoney runs after its receipt message.
    // Only a matching native purchase confirmation can associate a later debit.
    if (this.shop !== null) {
      const shop = this.shop;
      if (shop.changeSeq !== null && shop.money !== null && snapshot.money !== null && snapshot.money < shop.money && event.screen === "shop_menu") {
        const index = this.changes.findIndex(c => c.seq === shop.changeSeq);
        const change = this.changes[index];
        if (change !== undefined) {
          const paid = shop.money - snapshot.money;
          this.changes[index] = { ...change, step: snapshot.seq, moneyDrop: paid };
          this.totals.spent += paid; this.version += 1;
        }
        this.shop = null;
      } else if (event.screen !== "shop_menu") this.shop = null;
    }
    // The player's bag coming back after the tutorial is the swap back, not a gain.
    if (this.inTutorial && previous?.key === snapshot.key) this.pending = [];
    this.leftTutorial = this.inTutorial;
    this.inTutorial = false;
    for (const [id, held] of snapshot.bag) this.pockets.set(id, held.pocket);
    this.firstTurn ??= event.turn;
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
      const purchase = delta > 0 && this.shop?.changeSeq === null && this.shop.itemId === p.itemId && this.shop.quantity === delta;
      if (purchase && this.shop !== null) {
        cause = "bought";
        if (moneyDrop > 0) this.shop = null;
        else this.shop.changeSeq = p.seq;
      }
      if (cause === "found" || cause === "bought") this.totals.gained += Math.abs(delta);
      if (cause === "used") this.totals.used += Math.abs(delta);
      if (cause === "bought") {
        this.totals.buys += 1;
        if (!this.changes.some(c => c.cause === "bought" && c.step === next.seq)) this.totals.spent += Math.max(0, moneyDrop);
      }
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
  return { ...ledger.totals };
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
const TRACK_TOP = 12;
const TRACK_SPAN = 32;

function track(series: Series, x: (turn: number) => number): string {
  const max = series.steps.reduce((max, step) => Math.max(max, step.after), Math.max(1, series.start));
  const y = (q: number): number => 90 - (q / max) * 80;
  let line = `M0,${y(series.start).toFixed(1)}`;
  for (const step of series.steps) line += `H${(x(step.turn) * 10).toFixed(1)}V${y(step.after).toFixed(1)}`;
  line += "H1000";
  let lastLabel = -100;
  const dots = series.steps.map((step, index) => {
    const at = `left:${pct(x(step.turn))};top:${(TRACK_TOP + (1 - step.after / max) * TRACK_SPAN).toFixed(1)}px`;
    const showLabel = x(step.turn) - lastLabel >= 9 || index === series.steps.length - 1;
    if (showLabel) lastLabel = x(step.turn);
    const label = showLabel ? `<span class="bg-dlab" style="${at}">${String(step.after)}</span>` : "";
    return `<i class="bg-dot ${DOT[step.cause]}" style="${at}" title="T${String(step.turn)} · ${LABEL[step.cause]} · ${String(step.before)} → ${String(step.after)}"></i>${label}`;
  }).join("");
  const description = `${series.name}: scale 0 to ${String(max)}, now ${String(series.now)}. ` + series.steps.map(s => `Turn ${String(s.turn)}: ${String(s.before)} to ${String(s.after)}, ${LABEL[s.cause]}`).join("; ");
  return `<div class="bg-track" role="img" aria-label="${esc(description)}"><span class="bg-scale bg-max">${String(max)}</span><span class="bg-scale bg-zero">0</span><div class="bg-plot"><svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="${line}V100H0Z"/><path d="${line}"/></svg>${dots}</div></div>`;
}

// Turn labels for the shared axis: the ends plus change turns that do not crowd an earlier label.
function axisTurns(first: number, last: number, changes: readonly BagChange[]): number[] {
  const turns = [...new Set([first, last])];
  for (const change of [...changes].sort((a, b) => a.turn - b.turn)) {
    if (turns.every((t) => Math.abs(t - change.turn) / Math.max(1, last - first) >= 0.1)) turns.push(change.turn);
  }
  return turns.sort((a, b) => a - b);
}

export interface BagPageInput {
  readonly ledger: BagLedger;
  readonly run: string | null;
  readonly art: BagArt;
}

export function bagRange({ ledger, run }: BagPageInput): string {
  return run === null ? "" : `RUN ${esc(run.split("_").at(-1) ?? "")} · T${String(ledger.firstTurn ?? 0)}–T${String(ledger.lastTurn)}`;
}

export function bagPage({ ledger, art }: BagPageInput): string {
  if (!ledger.recorded) return '<p class="nodata">No bag recorded yet. Runs record the bag in every state once the game has started (resources.bag).</p>';
  const changes = ledger.changes;
  const first = ledger.firstTurn ?? 0;
  const last = Math.max(first, ledger.lastTurn);
  const x = (turn: number): number => Math.min(100, Math.max(0, ((turn - first) / Math.max(1, last - first)) * 100));
  const head = headline(ledger);
  const kpis = [
    [ledger.latest?.money === null || ledger.latest?.money === undefined ? "UNKNOWN" : yen(ledger.latest.money), "CASH NOW"],
    [String(head.gained), "ITEMS GAINED"],
    [String(head.used), "USED OR REMOVED"],
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
  const axis = `<div></div><div class="bg-axis"><div class="bg-axis-plot">${axisTurns(first, last, changes).map((t) => `<span style="left:${pct(x(t))}">T${String(t)}</span>`).join("")}</div></div><div></div>`;
  const kinds = new Set(changes.map((c) => DOT[c.cause]));
  const legend = [
    '<span><i></i>found / given</span>',
    kinds.has("buy") ? '<span><i class="buy"></i>bought</span>' : "",
    kinds.has("use") ? '<span><i class="use"></i>used, sold or stored</span>' : "",
  ].join("");
  return `<div class="bg-kpis">${kpis}</div><p class="bg-inf">Complete history through T${String(ledger.lastTurn)} · ${String(changes.length)} recorded quantity changes · scales start at 0.</p><h4>QUANTITY BY TURN · HELD NOW →</h4><div class="bg-sm">${axis}${grid}</div><div class="bg-legend">${legend}</div><p class="bg-inf">Full recorded history · ${String(changes.length)} quantity changes. Each row shows its own 0–maximum scale; the right column is held now. BOUGHT uses a matching shop confirmation and its later debit, or a same-step money drop. Other causes are inferred; removals may include use, gifts or tossing. Checkpoint starting items are a baseline, not gains.</p>`;
}
