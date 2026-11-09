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
    return ["opus-rq-master-ball-v1", "Before pursuing the submarine, pick up the MASTER BALL at (15,9) in AQUA HIDEOUT B1F. The two balls on the right are traps. From (3,15), take the warp panel at (3,20) first. Then take the panels at (42,5), (45,9), (42,13), and (42,17). Approach the Master Ball at (15,9) from below."];
  }
  if (catching) {
    if (stored) return ["opus-rq-catch-v1", "RAYQUAZA is in Pokémon storage. Withdraw it into your party."];
    if (!reached.has("RAYQUAZA_ENCOUNTER_RETIRED") && inBag(s, MASTER_BALL)) {
      if (features["rq-mach-dash-v1"] && s.bike?.registered === MACH_BIKE &&
          s.map_id?.[0] === 24 && s.position !== null) {
        const {x, y} = s.position;
        const floor = s.map_id[1];
        const routes = [
          {floor:79, x:6, y:13, route:"U1 L9 U4 R2 U3 L1 U3 R3 D2 R5 U3", after:"If stopped short, navigate to the stairs at (10,1)."},
          {floor:80, x:10, y:2, route:"D1 R4 D11 L10 U4 R2 U8", after:"This crosses the cracks to 3F. If you fall, return to the 1F stairs at (10,1) and retry."},
          {floor:81, x:3, y:2, route:"D7 L2 D6 R1 D1 R10 U5 L1 U6", after:"If stopped short, navigate to the stairs at (11,1)."},
          {floor:82, x:11, y:2, route:"D14 L8 U8 R2", after:"The last crack deliberately drops you to the 3F pocket at (7,4)."},
          {floor:84, x:3, y:2, route:"L5 D3 R1 D4 L1 D4 R5 D1 R7 U5 L1 U6 L2 U1", after:"If stopped short, navigate to the summit stairs at (10,1)."},
        ];
        const dash = routes.find(row => row.floor === floor && row.x === x && row.y === y);
        if (dash !== undefined) {
          const mount = s.bike.riding === "MACH BIKE" ? "" : "Press SELECT to mount the registered MACH BIKE without moving. ";
          return ["opus-rq-catch-v1", mount + "From this tile, call mach_dash with route exactly " + dash.route + ". " + dash.after];
        }
        if (floor === 79) return ["opus-rq-catch-v1", "On Sky Pillar 1F, use the stairs at (10,1)."];
        if (floor === 81 && (x === 6 || x === 7) && y === 4) return ["opus-rq-catch-v1", "This is the intentional drop pocket. From (6,4), first navigate to (7,4). Then take the stairs at (7,1)."];
        if (floor === 82 && x === 7 && y === 2) return ["opus-rq-catch-v1", "From the 3F pocket return, take the stairs at (3,1) to 5F."];
      }
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
