import type { Button } from "./events.js";
import type { GameStateSnapshot } from "./game-state.js";
import { COUNTER, EDGE_WALLS, GAME_RULE, LEDGES, OPPOSITE, type Direction } from "./tile-rules.js";

// blocked-batch-result-v1: a batch of one repeated direction that left the player on its tile,
// with field controls free in both snapshots, says so and names what the readout shows on the way.
// Each map fact is named only when the run's switches draw it for the model: ledges (ledge-hops-v1),
// edge walls (one-way-tiles-v1), counters (counter-talk-v1) and map connections (world-destinations-v1).
export interface BlockedBatchFacts { readonly position: boolean; readonly liveMap?: boolean; readonly ledges?: boolean; readonly edgeWalls?: boolean; readonly counters?: boolean; readonly topology?: boolean; readonly elevation?: boolean }

type Point = { readonly x: number; readonly y: number };
type Tile = { readonly collision: number; readonly behavior: number; readonly elevation: number };
const STEP: Readonly<Record<Direction, Point>> = { UP: { x: 0, y: -1 }, DOWN: { x: 0, y: 1 }, LEFT: { x: -1, y: 0 }, RIGHT: { x: 1, y: 0 } };
const WHERE: Readonly<Record<Direction, string>> = { UP: "above", DOWN: "below", LEFT: "to the left", RIGHT: "to the right" };
const SIDE: Readonly<Record<Direction, string>> = { UP: "top", DOWN: "bottom", LEFT: "left", RIGHT: "right" };
const COMPASS: Readonly<Record<Direction, "NORTH" | "SOUTH" | "WEST" | "EAST">> = { UP: "NORTH", DOWN: "SOUTH", LEFT: "WEST", RIGHT: "EAST" };
const isDirection = (button: Button | undefined): button is Direction => button === "UP" || button === "DOWN" || button === "LEFT" || button === "RIGHT";
const at = (p: Point): string => `(${String(p.x)},${String(p.y)})`;

/** The repeated direction of a batch of two or more presses, or null. */
export function repeatedDirection(buttons: readonly Button[]): Direction | null {
  const first = buttons[0];
  return buttons.length >= 2 && isDirection(first) && buttons.every(button => button === first) ? first : null;
}

// "terrain" never lets this direction through from here. "occupied" is a warp or object on the
// next tile: it is described, not claimed as the blocker (object elevation is not read, and a warp
// is not an obstacle). "unknown" names no cause. Elevation and slopes are named only with elevation-aware-map-v1,
// whose map draws L where IsElevationMismatchAt refuses the step.
// pokeemerald PLAYER_AVATAR_FLAG_ON_FOOT and PLAYER_AVATAR_FLAG_SURFING: water stops only a walker.
const ON_FOOT = 1 << 0, SURFING = 1 << 3, MUDDY_SLOPE = 0xd0;
// elevation-aware-map-v1: the server draws L only when the avatar flags were read and show no surfing.
const surfing = (state: GameStateSnapshot): boolean => { const flags = state.running?.avatar_flags ?? null; return flags === null || (flags & SURFING) !== 0; };
const onFoot = (state: GameStateSnapshot): boolean => {
  const flags = state.running?.avatar_flags ?? null;
  return flags !== null && (flags & ON_FOOT) !== 0 && (flags & SURFING) === 0;
};

interface Blocker { readonly text: string; readonly kind: "terrain" | "occupied" | "unknown" }

function blocker(state: GameStateSnapshot, here: Point, direction: Direction, show: BlockedBatchFacts): Blocker | null {
  const grid = state.navigation_grid;
  const next = { x: here.x + STEP[direction].x, y: here.y + STEP[direction].y };
  const named = show.position ? `The tile ${WHERE[direction]}, ${at(next)},` : `The tile ${WHERE[direction]}`;
  const plain = show.position ? `the tile ${WHERE[direction]}, ${at(next)}` : `the tile ${WHERE[direction]}`;
  if (grid == null) return { text: `The readout has no map of the tile ${WHERE[direction]}; what stopped you is not known.`, kind: "unknown" };
  const tileAt = (p: Point): Tile | undefined => grid.tiles.find(t => t.x === p.x && t.y === p.y);
  const same = (p: Point): boolean => p.x === next.x && p.y === next.y;
  const map = state.map_id;
  const object = (state.world_context?.objects ?? []).find(o => same(o) && map !== null && o.map_id[0] === map[0] && o.map_id[1] === map[1]);
  if (object !== undefined) return { text: `${named} has a person or object on it (object id ${String(object.local_id)}).`, kind: "occupied" };
  if (grid.objects.some(same)) return { text: `${named} has a person or object on it.`, kind: "occupied" };
  if (grid.warps.some(same)) return { text: `${named} is a warp (W on the local map) that did not activate from this side.`, kind: "occupied" };
  const own = tileAt(here);
  if (show.edgeWalls === true && own !== undefined && own.collision === 0 && (EDGE_WALLS.get(own.behavior)?.includes(direction) ?? false)) {
    return { text: `Your tile${show.position ? `, ${at(here)},` : ""} has an edge wall on its ${SIDE[direction]} side`, kind: "terrain" };
  }
  const tile = tileAt(next);
  if (tile === undefined) {
    const topology = state.topology;
    const outside = show.topology === true && topology != null && (next.x < 0 || next.y < 0 || next.x >= topology.width || next.y >= topology.height);
    if (outside && !topology.connections.some(c => c.direction === COMPASS[direction])) {
      const compass = COMPASS[direction].toLowerCase();
      return { text: `You are at the ${compass} edge of this map and it has no connection to the ${compass}`, kind: "terrain" };
    }
    return { text: `${named} is outside the readout's map window; what stopped you is not known.`, kind: "unknown" };
  }
  // The game hops a ledge pressed in its own direction (ShouldJumpLedge), whatever its collision bits.
  const ledge = LEDGES.get(tile.behavior);
  if (ledge === direction) {
    return { text: show.ledges === true ? `${named} is a ledge you can hop over moving ${ledge}; what stopped you is not known.` : `${named} is drawn as # on the local map; what stopped you is not known.`, kind: "unknown" };
  }
  if (ledge !== undefined && show.ledges === true) return { text: `${named} is a ledge you can only hop over moving ${ledge}`, kind: "terrain" };
  if (tile.collision !== 0) return { text: show.counters === true && tile.behavior === COUNTER ? `${named} is a counter (collision)` : `${named} is a collision tile (# on the local map)`, kind: "terrain" };
  if (tile.behavior >= 0x10 && tile.behavior <= 0x15) {
    return onFoot(state)
      ? { text: `${named} is water (~ on the local map); you cannot walk onto it`, kind: "terrain" }
      : { text: `${named} is water (~ on the local map); what stopped you is not known.`, kind: "unknown" };
  }
  if (show.edgeWalls === true && (EDGE_WALLS.get(tile.behavior)?.includes(OPPOSITE[direction]) ?? false)) return { text: `${named} has an edge wall on its ${SIDE[OPPOSITE[direction]]} side`, kind: "terrain" };
  if (show.elevation === true && !surfing(state) && GAME_RULE.mismatch(grid.elevation, tile.elevation)) {
    return { text: `${named} is at elevation ${String(tile.elevation)} while you are at elevation ${String(grid.elevation)} (L on the local map), and the game refuses a step onto a tile at another elevation`, kind: "terrain" };
  }
  // pokeemerald ForcedMovement_MuddySlope: on foot the slope slides the player back south.
  if (show.elevation === true && direction === "UP" && tile.behavior === MUDDY_SLOPE && onFoot(state)) return { text: `${named} is a muddy slope, which slides a walker back down`, kind: "terrain" };
  return { text: `The readout shows nothing blocking ${plain}; what stopped you is not known.`, kind: "unknown" };
}

/**
 * The result for a repeated-direction batch that did not move the player, or null when the
 * caller's ordinary text applies. Both snapshots must be on the same map and tile with free
 * field controls, and the player must end facing the pressed direction.
 */
export function blockedBatchResult(before: GameStateSnapshot, after: GameStateSnapshot, buttons: readonly Button[], show: BlockedBatchFacts): string | null {
  const direction = repeatedDirection(buttons);
  if (direction === null || before.position === null || after.position === null || after.facing !== direction.toLowerCase()) return null;
  if (before.position.x !== after.position.x || before.position.y !== after.position.y || before.map_id === null || after.map_id === null || before.map_id[0] !== after.map_id[0] || before.map_id[1] !== after.map_id[1]) return null;
  const free = (s: GameStateSnapshot): boolean => s.started && s.screen === "overworld" && !s.in_battle && s.field_controls_locked === false && s.active_ui == null;
  if (!free(before) || !free(after)) return null;
  const pressed = `${direction} ×${String(buttons.length)}`;
  const here = before.position;
  const tile = show.position ? `at ${at(here)}` : "on the same tile";
  const found = show.liveMap === true ? blocker(before, here, direction, show) : null;
  const head = before.facing !== null && before.facing !== after.facing
    ? `${show.position ? `turned ${before.facing} -> ${after.facing}` : "turned"} but did not move: ${pressed} left you ${tile}${show.position ? `, now facing ${after.facing}` : ""}.`
    : `${found !== null && found.kind === "terrain" ? "blocked" : "no movement"}: ${pressed} did not move you; you are still ${tile}${show.position ? ` facing ${after.facing}` : ""}.`;
  if (found === null) return head;
  return `${head} ${found.kind === "terrain" ? `${found.text}, so ${direction} cannot move you from here.` : found.text}`;
}

/**
 * elevation-aware-map-v1: a single direction press that neither moved nor turned the player, with
 * free field controls in both snapshots, names its terrain cause; null when none is known.
 */
export function refusedPressResult(before: GameStateSnapshot, after: GameStateSnapshot, buttons: readonly Button[], show: BlockedBatchFacts): string | null {
  const direction = buttons.length === 1 && isDirection(buttons[0]) ? buttons[0] : null;
  if (direction === null || show.liveMap !== true || before.position === null || after.position === null || after.facing !== direction.toLowerCase() || before.facing !== after.facing) return null;
  const found = blocker(before, before.position, direction, show);
  if (found === null || found.kind !== "terrain") return null;
  const tile = show.position ? `at ${at(before.position)} facing ${after.facing}` : "on the same tile";
  return `blocked: ${direction} did not move you; you are still ${tile}. ${found.text}, so ${direction} cannot move you from here.`;
}
