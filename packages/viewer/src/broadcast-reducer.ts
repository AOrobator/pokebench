// Cuts one run's log down to the broadcast feed, a line at a time. Each event type is checked against only the
// fields the page uses, and a line that fails is skipped, so a run from a newer build still plays.
import { Type, type Static, type TSchema } from "typebox";
import { Value } from "typebox/value";
import type { BroadcastHeader, BroadcastItem, BroadcastMon } from "./broadcast-feed.js";

const Name = Type.Union([Type.String(), Type.Null()]);
const Num = Type.Union([Type.Number(), Type.Null()]);
const Base = { t: Type.String(), turn: Type.Optional(Type.Integer()) };
const Start = Type.Object({ ...Base, model: Type.Object({ id: Type.String() }), start_state: Type.Object({ kind: Type.String() }) });
const Press = Type.Object({ ...Base, buttons: Type.Array(Type.String()) });
const Delta = Type.Object({ ...Base, thinking: Type.Optional(Type.String()) });
const Assistant = Type.Object({
  ...Base, thinking: Type.Optional(Type.String()), text: Type.Optional(Type.String()),
  usage: Type.Optional(Type.Object({ input: Type.Number(), output: Type.Number(), cache_read: Type.Optional(Type.Number()), cache_write: Type.Optional(Type.Number()) })),
});
const Call = Type.Object({ ...Base, name: Type.String(), args: Type.Record(Type.String(), Type.Unknown()) });
const Result = Type.Object({ ...Base, frames: Type.Optional(Type.Array(Type.Object({ path: Type.String() }))) });
const Milestone = Type.Object({ ...Base, name: Type.String(), origin: Type.Optional(Type.String()) });
const Mon = Type.Object({ species: Type.Optional(Name), level: Type.Optional(Num), hp: Type.Optional(Num), max_hp: Type.Optional(Num) });
const Battler = Type.Object({ position: Type.Optional(Num), species: Type.Optional(Name) });
const State = Type.Object({
  ...Base, location: Type.Optional(Name), in_battle: Type.Optional(Type.Boolean()),
  badges: Type.Optional(Type.Array(Type.String())), party: Type.Optional(Type.Array(Mon)),
  trainer_opponent: Type.Optional(Type.Union([Type.Null(), Type.Object({ name: Type.Optional(Name), battle_active: Type.Optional(Type.Boolean()) })])),
  battle: Type.Optional(Type.Union([Type.Null(), Type.Object({ battlers: Type.Optional(Type.Array(Battler)) })])),
});
const Stamp = Type.Object(Base);

const WANTED = new Set(["run_start", "turn_start", "assistant_delta", "assistant", "tool_call", "tool_result", "button_press", "state", "milestone", "run_end"]);
const TYPE_AT_HEAD = /"type":"([a-z_]+)"/;
// Whether a line matters, from its first bytes: `type` comes before any large field, so most of the log is never parsed.
export function wantedLine(head: string): boolean {
  return WANTED.has(TYPE_AT_HEAD.exec(head)?.[1] ?? "");
}

const check = <S extends TSchema>(schema: S, value: unknown): Static<S> | null => Value.Check(schema, value) ? value : null;
const seconds = (ms: number): number => Math.round(ms / 10) / 100;
const text = (value: unknown): string => typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
const record = (value: unknown): Readonly<Record<string, unknown>> => typeof value === "object" && value !== null ? value as Record<string, unknown> : {};

const place = (spot: Readonly<Record<string, unknown>>): string => text(spot.x) === "" || text(spot.y) === "" ? "" : ` (${text(spot.x)},${text(spot.y)})`;

function detailOf(name: string, args: Readonly<Record<string, unknown>>): string {
  if (name === "battle_action") return [text(args.action).toUpperCase(), text(args.move) || text(args.item) || text(args.target) || text(args.species)].filter(part => part !== "").join(" → ");
  if (name === "press") return Array.isArray(args.buttons) ? args.buttons.map(text).join(" ") : "";
  if (name === "navigate_to") return `to${place(args)}`;
  if (name === "navigate_to_target") {
    const target = record(args.target);
    return target.kind === "connection" ? `to ${text(target.direction)} exit` : `to ${text(target.kind)}${place(target)}`;
  }
  if (name === "select_menu_option") return text(args.option);
  if (name === "learn_move") return `forget ${text(args.forget)}`;
  return "";
}

function foeOf(state: Static<typeof State>): string | null {
  if (state.in_battle !== true) return null;
  const trainer = state.trainer_opponent;
  if (trainer?.battle_active === true && typeof trainer.name === "string") return trainer.name;
  const wild = state.battle?.battlers?.find(battler => battler.position === 1)?.species;
  return typeof wild === "string" ? `WILD ${wild}` : null;
}

const monOf = (mon: Static<typeof Mon>): BroadcastMon => ({ name: mon.species ?? null, level: mon.level ?? null, hp: mon.hp ?? null, maxHp: mon.max_hp ?? null });

export interface BroadcastReducer {
  readonly items: readonly BroadcastItem[];
  readonly header: BroadcastHeader | null;
  readonly ended: boolean;
  add(line: string): void;
}

export function createBroadcastReducer(): BroadcastReducer {
  const items: BroadcastItem[] = [];
  let header: BroadcastHeader | null = null, ended = false, started = 0, streamed = { turn: -1, text: "" }, shown = "";
  const at = (stamp: string): number => seconds(Date.parse(stamp) - started);
  const startOf = (run: string, event: Static<typeof Start>): void => {
    started = Date.parse(event.t);
    header = { run, model: event.model.id, started: event.t, kind: event.start_state.kind === "boot" ? "boot" : "save", save: null };
  };
  const stateOf = (state: Static<typeof State>): void => {
    const where = state.location ?? null;
    if (header?.kind === "save" && header.save === null && where !== null) header = { ...header, save: where.replace(/\s+(CITY|TOWN)$/, "") };
    const view = { where, foe: foeOf(state), badges: state.badges ?? [], party: (state.party ?? []).map(monOf) };
    const key = JSON.stringify(view);
    if (key === shown) return;
    shown = key;
    items.push({ k: "state", t: at(state.t), ...view });
  };
  const assistantOf = (event: Static<typeof Assistant>, turn: number): void => {
    const whole = event.thinking !== undefined && event.thinking !== "" ? event.thinking : event.text ?? "";
    if (whole !== "" && !(streamed.turn === turn && streamed.text === whole)) items.push({ k: "thought", t: at(event.t), turn, d: whole });
    if (event.usage !== undefined) items.push({ k: "use", t: at(event.t), input: event.usage.input, output: event.usage.output, cacheRead: event.usage.cache_read ?? 0, cacheWrite: event.usage.cache_write ?? 0 });
  };
  const handle = (type: unknown, run: unknown, value: unknown): void => {
    if (type === "run_start") { const event = check(Start, value); if (event !== null && typeof run === "string") startOf(run, event); return; }
    if (header === null) return;
    const stamp = check(Stamp, value);
    if (stamp === null) return;
    const turn = stamp.turn ?? 0, t = at(stamp.t);
    if (type === "turn_start") items.push({ k: "turn", t, turn });
    else if (type === "assistant_delta") {
      const d = check(Delta, value)?.thinking ?? "";
      if (d === "") return;
      streamed = { turn, text: streamed.turn === turn ? streamed.text + d : d };
      items.push({ k: "think", t, turn, d });
    } else if (type === "assistant") { const event = check(Assistant, value); if (event !== null) assistantOf(event, turn); }
    else if (type === "tool_call") { const event = check(Call, value); if (event !== null) items.push({ k: "tool", t, turn, name: event.name, detail: detailOf(event.name, event.args) }); }
    else if (type === "tool_result") { const path = check(Result, value)?.frames?.at(-1)?.path; if (path !== undefined) items.push({ k: "frame", t, f: path.replace(/^frames\//, "") }); }
    else if (type === "button_press") { const b = check(Press, value)?.buttons ?? []; if (b.length > 0) items.push({ k: "press", t, b }); }
    else if (type === "state") { const event = check(State, value); if (event !== null) stateOf(event); }
    else if (type === "milestone") { const event = check(Milestone, value); if (event !== null && event.origin !== "present_at_start" && event.name !== "GAME_RUNNING") items.push({ k: "mile", t, name: event.name }); }
    else if (type === "run_end") { ended = true; items.push({ k: "end", t }); }
  };
  return {
    items,
    get header() { return header; },
    get ended() { return ended; },
    add(line) {
      let value: unknown;
      try { value = JSON.parse(line); } catch { return; }
      const event = record(value);
      handle(event.type, event.run, value);
    },
  };
}
