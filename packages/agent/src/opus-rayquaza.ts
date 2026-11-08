import type {AgentMessage} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {RunRecorder} from "./recorder.js";

export const OPUS_RAYQUAZA_SWITCHES = [
  "opus-rq-mach-bike-v1", "opus-rq-master-ball-v1", "opus-rq-catch-v1", "opus-rq-moveset-v1",
] as const;

type Decision = typeof OPUS_RAYQUAZA_SWITCHES[number];
type State = Extract<RunEvent, {type:"state"; started:boolean}>;
type Transform = (messages: AgentMessage[]) => Promise<AgentMessage[]>;
type Note = readonly [Decision, string];

// Map IDs from pokeemerald data/maps/map_groups.json. Item IDs from include/constants/items.h.
const MACH_BIKE = 259, MASTER_BALL = 1, TM40 = 328, HM07 = 345;
const onMap = (s: State, group: number, number: number): boolean =>
  s.map_id?.[0] === group && s.map_id[1] === number;
const inBag = (s: State, item: number): boolean =>
  s.resources?.bag?.some(entry => entry.item_id === item && entry.quantity > 0) === true;

function decision(features: FeatureSet, s: State, reached: ReadonlySet<string>): Note | null {
  if (!s.started || reached.has("ELITE_FOUR_CHALLENGE_ENTERED")) return null;
  const rayquaza = s.party.find(pokemon => pokemon.species === "RAYQUAZA");
  const stored = s.resources?.storage?.occupied.some(slot => slot.pokemon.species === "RAYQUAZA") === true;
  const catching = features["opus-rq-catch-v1"] && reached.has("SOOTOPOLIS_CRISIS_RESOLVED") && rayquaza === undefined;
  if (catching && onMap(s, 24, 85) && inBag(s, MASTER_BALL) &&
      s.battle?.active === true && s.battle.battlers?.some(battler => battler.position === 1 && battler.species === "RAYQUAZA")) {
    return ["opus-rq-catch-v1", "Use the MASTER BALL on RAYQUAZA now."];
  }
  if (s.screen !== "overworld" || s.in_battle || s.field_controls_locked !== false ||
      s.active_ui != null || s.world_context?.dialogue != null || s.world_context?.message != null) return null;

  if (features["opus-rq-mach-bike-v1"] && s.bike != null &&
      (onMap(s, 0, 2) || onMap(s, 10, 1)) && s.bike.registered !== MACH_BIKE) {
    return ["opus-rq-mach-bike-v1", s.bike.owned.includes(MACH_BIKE)
      ? "Register the MACH BIKE to SELECT for travel."
      : "Get the MACH BIKE from RYDEL’S CYCLES, east of the MAUVILLE POKéMON CENTER. Register it to SELECT for travel."];
  }
  if (features["opus-rq-master-ball-v1"] && onMap(s, 24, 24) && s.resources?.bag != null &&
      !inBag(s, MASTER_BALL) && !reached.has("MASTER_BALL_OBTAINED") && !reached.has("AQUA_HIDEOUT_ESCAPE_COMPLETE")) {
    return ["opus-rq-master-ball-v1", "Before pursuing the submarine, pick up the MASTER BALL at (15,9) in AQUA HIDEOUT B1F. The two balls on the right are traps."];
  }
  if (catching) {
    if (stored) return ["opus-rq-catch-v1", "RAYQUAZA is in Pokémon storage. Withdraw it into your party."];
    if (!reached.has("RAYQUAZA_ENCOUNTER_RETIRED") && inBag(s, MASTER_BALL)) {
      const direction = onMap(s, 24, 85)
        ? "Approach (14,7) on the summit, face north, and interact with RAYQUAZA. Use the MASTER BALL."
        : "Return to SKY PILLAR off ROUTE 131 and catch RAYQUAZA with the MASTER BALL before entering the League. The post-crisis climb needs the MACH BIKE at speed on cracked floors.";
      return ["opus-rq-catch-v1", direction + " Keep RAYQUAZA in your party."];
    }
  }
  if (features["opus-rq-moveset-v1"] && s.badges.includes("RAIN") && rayquaza?.moves != null) {
    const moves = rayquaza.moves.map(move => move.name);
    const aerialAce = !moves.includes("AERIAL ACE") && inBag(s, TM40);
    const waterfall = !moves.includes("WATERFALL") && inBag(s, HM07);
    if (aerialAce || waterfall) {
      return ["opus-rq-moveset-v1", [
        "Prepare RAYQUAZA’s League moveset.",
        ...(aerialAce ? ["Teach AERIAL ACE over EXTREMESPEED."] : []),
        ...(waterfall ? ["Teach WATERFALL over REST."] : []),
        "Keep FLY and OUTRAGE.",
      ].join(" ")];
    }
  }
  return null;
}

export function opusRayquazaContext(
  features: FeatureSet, recorder: Pick<RunRecorder, "subscribe" | "recordMilestoneHint">, transform: Transform,
): Transform {
  if (!OPUS_RAYQUAZA_SWITCHES.some(id => features[id])) return transform;
  let state: State | null = null;
  const recorded = new Set<string>();
  const reached = new Set<string>();
  recorder.subscribe(event => {
    if (event.type === "state") state = "started" in event ? event : null;
    if (event.type === "milestone") reached.add(event.name);
  }, true, true);
  return async messages => {
    const output = await transform(messages);
    const note = state === null ? null : decision(features, state, reached);
    const text = note === null ? null : `OPUS RAYQUAZA LANE: ${note[1]}`;
    if (note !== null && text !== null && !recorded.has(text)) {
      recorder.recordMilestoneHint({milestone: note[0], text});
      recorded.add(text);
    }
    return text === null ? output : [...output, {role:"user", content:text, timestamp:Date.now()}];
  };
}
