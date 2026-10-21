import type { GameStateSnapshot } from "../game-state.js";
import type { CompletedCall } from "./types.js";

// same-target-no-progress-v1: repeated walks to one target that keep ending near where the first began.
export const SAME_TARGET_CALLS = 4;
export const SAME_TARGET_TILES = 3;

type Tile = { readonly x: number; readonly y: number };
type Ending = "field" | "battle" | "locked";

interface Counted {
  readonly seq: number;
  readonly tile: Tile;
  readonly ending: Ending;
  readonly said: string | null;
  readonly location: string | null;
}

interface Episode {
  readonly target: Tile;
  readonly map: readonly [number, number];
  readonly anchor: Tile;
  readonly turn: number;
  readonly tools: string[];
  readonly counted: Counted[];
}

export interface SameTargetWarning {
  readonly key: string;
  readonly text: string;
  readonly calls: number;
  readonly evidence: readonly number[];
}

export interface SameTargetStep {
  readonly warning: SameTargetWarning | null;
  // Whether the target of the open warning was reset by this call.
  readonly cleared: boolean;
}

const mapKey = (map: readonly [number, number]): string => `${String(map[0])},${String(map[1])}`;
const tileKey = (tile: Tile, map: readonly [number, number]): string => `${String(tile.x)},${String(tile.y)}@${mapKey(map)}`;
const distance = (a: Tile, b: Tile): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const tileText = (tile: Tile): string => `(${String(tile.x)},${String(tile.y)})`;
const integer = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

function located(state: GameStateSnapshot | undefined): (GameStateSnapshot & { map_id: [number, number]; position: Tile }) | null {
  return state !== undefined && state.started && state.map_id != null && state.position != null
    ? state as GameStateSnapshot & { map_id: [number, number]; position: Tile }
    : null;
}

// Where a call left the player: a free field, a battle (its position is the tile the battle started on), or a locked field.
function ending(state: GameStateSnapshot): Ending | null {
  if (state.in_battle) return "battle";
  if (state.field_controls_locked === true) return "locked";
  return state.screen === "overworld" && state.field_controls_locked === false ? "field" : null;
}

function mapArg(value: unknown): [number, number] | null {
  return Array.isArray(value) && value.length === 2 && integer(value[0]) && integer(value[1]) ? [value[0], value[1]] : null;
}

// The tile a walk heads for: navigate_to's coordinates, a navigate_to_target warp or interaction tile, or an object's
// tile as the state the call began from showed it. A map connection has no tile.
function targetOf(call: CompletedCall, start: GameStateSnapshot): Tile | null {
  if (call.name === "navigate_to") {
    const { x, y } = call.args;
    return integer(x) && integer(y) ? { x, y } : null;
  }
  const target = call.args["target"];
  if (target === null || typeof target !== "object") return null;
  const t = target as Record<string, unknown>;
  if ((t["kind"] === "warp" || t["kind"] === "interaction") && integer(t["x"]) && integer(t["y"])) return { x: t["x"], y: t["y"] };
  if (t["kind"] !== "object") return null;
  // The same listing navigate_to_target resolves an object from, then the nearby objects.
  const object = start.interaction_targets?.find((o) => o.kind === "object" && o.local_id === t["local_id"])
    ?? start.world_context?.objects.find((o) => o.local_id === t["local_id"]);
  return object === undefined ? null : { x: object.x, y: object.y };
}

function navigationLine(text: string): string | null {
  return text.split("\n").find((line) => line.startsWith("Navigation: ")) ?? null;
}

function list(items: readonly string[]): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")}, and ${items.at(-1) ?? ""}`;
}

// Counts per target from recorded game state only. The coordinator owns the episode and its notices.
export class SameTargetNoProgress {
  private readonly episodes = new Map<string, Episode>();
  private map: string | null = null;
  private story: Record<string, unknown> | null = null;

  constructor(private readonly supervised: boolean) {}

  reset(): void {
    this.episodes.clear();
    this.map = null;
  }

  // A map change or a changed known story value clears every target. True when it cleared any.
  state(state: GameStateSnapshot): boolean {
    let clear = false;
    if (state.started && state.map_id != null && this.map !== null && mapKey(state.map_id) !== this.map) clear = true;
    const story = state.story;
    if (story != null) {
      const before = this.story;
      if (before !== null && Object.entries(story).some(([key, value]) => value != null && before[key] != null && before[key] !== value)) clear = true;
      this.story = { ...(before ?? {}), ...Object.fromEntries(Object.entries(story).filter(([, value]) => value != null)) };
    }
    if (!clear) return false;
    const had = this.episodes.size > 0;
    this.reset();
    return had;
  }

  complete(call: CompletedCall, turn: number, open: string | null): SameTargetStep {
    const end = located(call.state);
    // An open warning goes stale once a call other than a walk to its own target leaves the player in a free field
    // 4 or more tiles from its anchor; a walk to that target is judged by the displacement reset below.
    const stale = (): boolean => {
      const warned = open === null ? undefined : this.episodes.get(open);
      if (open === null || warned === undefined || end === null || ending(end) !== "field" || mapKey(end.map_id) !== mapKey(warned.map) || distance(end.position, warned.anchor) <= SAME_TARGET_TILES) return false;
      this.episodes.delete(open);
      return true;
    };
    if (call.isError || (call.name !== "navigate_to" && call.name !== "navigate_to_target")) return { warning: null, cleared: stale() };
    const start = located(call.startState ?? call.beforeState);
    if (start === null) return { warning: null, cleared: stale() };
    const target = targetOf(call, start);
    const map = call.args["map_id"] === undefined ? start.map_id : mapArg(call.args["map_id"]);
    if (target === null || map === null || mapKey(map) !== mapKey(start.map_id)) return { warning: null, cleared: stale() };
    const key = tileKey(target, map);
    const cleared = key !== open && stale();
    let episode = this.episodes.get(key);
    if (episode === undefined) {
      episode = { target, map, anchor: start.position, turn, tools: [], counted: [] };
      this.episodes.set(key, episode);
      this.map = mapKey(map);
    }
    const how = end === null ? null : ending(end);
    if (end === null || how === null || mapKey(end.map_id) !== mapKey(map)) return { warning: null, cleared };
    const reach = call.name === "navigate_to" ? 0 : 1;
    if (distance(end.position, target) <= reach) {
      this.reset();
      return { warning: null, cleared: cleared || open !== null };
    }
    if (distance(end.position, episode.anchor) > SAME_TARGET_TILES) {
      this.episodes.delete(key);
      return { warning: null, cleared: cleared || key === open };
    }
    if (!episode.tools.includes(call.name)) episode.tools.push(call.name);
    episode.counted.push({ seq: call.seq ?? 0, tile: end.position, ending: how, said: navigationLine(call.text), location: end.location });
    const calls = episode.counted.length;
    if (calls % SAME_TARGET_CALLS !== 0) return { warning: null, cleared };
    const first = episode.counted[0]?.seq ?? 0;
    return { warning: { key, text: this.text(episode, calls), calls, evidence: [first, call.seq ?? 0] }, cleared };
  }

  private text(episode: Episode, calls: number): string {
    const latest = episode.counted.slice(-SAME_TARGET_CALLS);
    const map = `map ${episode.map.join("/")}`;
    const name = latest.at(-1)?.location ?? null;
    const place = name === null ? map : `${name} (${map})`;
    const ends = latest.map((c) => `${tileText(c.tile)}${c.ending === "battle" ? " when a battle began" : c.ending === "locked" ? " when field controls were locked" : ""}`);
    const said = [...new Set(latest.flatMap((c) => c.said === null ? [] : [c.said]))];
    const battles = episode.counted.filter((c) => c.ending === "battle").length;
    return [
      `${this.supervised ? "SUPERVISOR: " : ""}Since turn ${String(episode.turn)}, when you were at ${tileText(episode.anchor)}, ${String(calls)} of your ${episode.tools.join(" and ")} calls to ${tileText(episode.target)} on ${place} have ended within ${String(SAME_TARGET_TILES)} tiles of ${tileText(episode.anchor)}.`,
      `The latest ${String(latest.length)} ended at ${list(ends)}.`,
      ...(said.length === 0 ? [] : [`Their results said: ${said.map((s) => `"${s}"`).join("; ")}.`]),
      ...(calls > SAME_TARGET_CALLS && battles > 0 ? [`${String(battles)} of the ${String(calls)} stopped when a battle began.`] : []),
    ].join(" ");
  }
}
