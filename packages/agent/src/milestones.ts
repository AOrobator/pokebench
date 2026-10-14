import {completedHeal} from "./activity.js";
import type { RunEvent } from "./events.js";
import type { GameStateSnapshot, StateSource } from "./game-state.js";

export type MilestoneKind = "story" | "navigation" | "legacy";
export interface SeenMilestone {
  readonly name: string;
  readonly serverTimestamp: number;
  readonly kind?: MilestoneKind;
  readonly origin?: "observed" | "present_at_start";
  readonly evidence?: readonly number[];
}

export interface MilestoneSource {
  poll(): Promise<SeenMilestone[]>;
  observe?(state: GameStateSnapshot, seq: number): SeenMilestone[];
  initialize?(start: "boot" | "save_state"): void;
}

interface Milestone {
  readonly name: string;
  readonly kind: MilestoneKind;
  readonly reached: (state: GameStateSnapshot) => boolean | null;
}
// Unknown observations cannot establish a negative baseline for a resumed run.
// The naming callback is shared with Pokémon nicknames; only verified Birch
// confirmation evidence establishes pregame ownership while that screen is open.
const knownPregame = (s: GameStateSnapshot): boolean => !s.started && (
  ["intro", "title", "main_menu", "birch_speech"].includes(s.screen)
  || s.story?.name_confirmed != null
);
const savedWorld = (s:GameStateSnapshot):boolean => s.started && s.screen!=="field_transition";
const place = (s: GameStateSnapshot, matches: (location: string) => boolean): boolean | null =>
  s.screen === "field_transition" ? null : s.started && s.location !== null ? matches(s.location) : knownPregame(s) ? false : null;
const at = (location: string) => (s: GameStateSnapshot) => place(s, (current) => current === location || (/^ROUTE \d+$/.test(location) && current === location.replace("ROUTE ", "ROUTE")));
const verifiedVisit = (label: string, map: readonly [number, number]) => (s: GameStateSnapshot): boolean | null =>
  s.screen === "field_transition" || s.screen === "unknown" ? null
    : s.map_id !== null && (s.map_id[0] !== map[0] || s.map_id[1] !== map[1]) ? false : at(label)(s);
const flag = (field:
  | "name_confirmed" | "clock_set" | "rival_battle_won" | "pokedex_received"
  | "running_shoes_received" | "starter_tutorial_complete" | "rustboro_gym_complete"
  | "rock_tomb_received"
) => (s: GameStateSnapshot): boolean | null =>
  s.screen === "field_transition" ? null : (field === "name_confirmed" || savedWorld(s)) ? (s.story?.[field] ?? null) : null;
const gymTrainer = (field: "rustboro_josh_defeated" | "rustboro_tommy_defeated" | "rustboro_marc_defeated") => (s: GameStateSnapshot): boolean | null =>
  savedWorld(s) && s.story?.rustboro_gym_complete === false ? (s.story[field] ?? null) : null;
const trainer = (field: "petalburg_woods_lyle_defeated" | "petalburg_woods_james_defeated" | "petalburg_woods_aqua_grunt_defeated" | "route116_joey_defeated" | "route116_jose_defeated" | "route116_jerry_defeated" | "route116_clark_defeated" | "route116_janice_defeated" | "route116_karen_defeated" | "route116_sarah_defeated" | "route116_dawson_defeated" | "route116_devan_defeated" | "route116_johnson_defeated" | "roxanne_defeated" | "route102_calvin_defeated" | "route102_rick_defeated" | "route102_tiana_defeated" | "route102_allen_defeated" | "route104_ivan_defeated" | "route104_billy_defeated" | "route104_haley_defeated" | "route104_winston_defeated" | "route104_cindy_defeated" | "route104_gina_mia_defeated" | "route104_darian_defeated") => (s:GameStateSnapshot):boolean|null => savedWorld(s) ? s.story?.[field] ?? null : null;
const countReached = (field:"pokemon_captures"|"evolved_pokemon") => (s:GameStateSnapshot):boolean|null => savedWorld(s) && s.game_stats?.[field]!=null ? s.game_stats[field]>0 : null;
const stage = (field:
  | "intro_stage" | "rival_stage" | "birch_lab_stage" | "petalburg_gym_stage" | "woods_stage",
  values: readonly number[],
) => (s: GameStateSnapshot): boolean | null =>
  savedWorld(s) && s.story?.[field] != null ? values.includes(s.story[field]) : null;
const clockSet = (s: GameStateSnapshot): boolean | null => {
  if (s.story !== undefined) return flag("clock_set")(s);
  if (!savedWorld(s)) return null;
  const value = s.world_context?.triggers.find((t) => t.variable === 0x4092)?.current_value;
  return value == null || value < 0 || value > 7 ? null : value === 6 || value === 7;
};

const house = (location: string | null, floor: "1F" | "2F"): string | null => {
  const match = location?.match(new RegExp(`^LITTLEROOT TOWN (BRENDANS|MAYS) HOUSE ${floor}$`));
  return match?.[1] ?? null;
};
const stableRoute = (s: GameStateSnapshot): boolean => savedWorld(s) && s.screen !== "unknown";
export const postClockHomeWitness = (s: GameStateSnapshot): string | null =>
  stableRoute(s) && s.story?.clock_set === false && [4, 5].includes(s.story.intro_stage ?? -1)
    ? house(s.location, "1F") ?? house(s.location, "2F") : null;
const routeProof = (name: string, states: readonly GameStateSnapshot[]): boolean => {
  const first = states[0];
  const last = states.at(-1);
  if (first === undefined || last === undefined) return false;
  const home = postClockHomeWitness(first);
  if (name === "PLAYER_HOUSE_EXITED_AFTER_CLOCK") {
    const previous = states[1];
    return states.length === 3 && home !== null && previous !== undefined && stableRoute(previous)
      && house(previous.location, "1F") === home && clockSet(previous) === true
      && stableRoute(last) && last.location === "LITTLEROOT TOWN" && clockSet(last) === true;
  }
  return states.length === 2 && home !== null && stableRoute(last) && clockSet(last) === true
    && house(last.location, "1F") !== null && house(last.location, "1F") !== home;
};
const routeNames = new Set(["PLAYER_HOUSE_EXITED_AFTER_CLOCK", "RIVAL_HOUSE_ENTERED"]);

// Legacy names retain their old meaning; exact confirmation/exit have new IDs.
// Flags and stage meanings are traced in docs/findings/story-milestones.md.
export const MILESTONES: readonly Milestone[] = [
  { name: "GAME_RUNNING", kind: "legacy", reached: () => true },
  // Birch owns the introduction after accepting NEW GAME. A shared naming
  // callback or a resumed overworld is not evidence of this in-run transition.
  { name: "NEW_GAME_CREATED", kind: "story", reached: (s) => s.screen === "birch_speech" ? true : ["intro", "title", "main_menu"].includes(s.screen) ? false : null },
  { name: "PLAYER_NAME_CONFIRMED", kind: "story", reached: flag("name_confirmed") },
  { name: "PLAYER_NAME_SET", kind: "legacy", reached: (s) => s.screen === "field_transition" ? null : s.started ? s.name !== null ? true : null : knownPregame(s) ? false : null },
  { name: "FIRST_TRUCK_EXIT", kind: "story", reached: (s) => place(s, (location) => location !== "INSIDE OF TRUCK") },
  { name: "INTRO_CUTSCENE_COMPLETE", kind: "legacy", reached: (s) => place(s, (location) => location !== "INSIDE OF TRUCK") },
  { name: "LITTLEROOT_TOWN", kind: "navigation", reached: at("LITTLEROOT TOWN") },
  { name: "PLAYER_HOUSE_ENTERED", kind: "navigation", reached: (s) => place(s, (location) => /^LITTLEROOT TOWN (BRENDANS|MAYS) HOUSE 1F$/.test(location)) },
  { name: "MOM_CLOCK_INSTRUCTION", kind: "story", reached: stage("intro_stage", [4, 5, 6, 7]) },
  { name: "PLAYER_BEDROOM", kind: "navigation", reached: (s) => place(s, (location) => /^LITTLEROOT TOWN (BRENDANS|MAYS) HOUSE 2F$/.test(location)) },
  { name: "CLOCK_SET", kind: "story", reached: clockSet },
  { name: "MOM_RIVAL_INSTRUCTION", kind: "story", reached: stage("intro_stage", [7]) },
  { name: "PLAYER_HOUSE_EXITED_AFTER_CLOCK", kind: "navigation", reached: (s) => clockSet(s) === true ? at("LITTLEROOT TOWN")(s) : null },
  { name: "RIVAL_HOUSE_ENTERED", kind: "navigation", reached: (s) => clockSet(s) === true ? place(s, (location) => house(location, "1F") !== null) : null },
  { name: "RIVAL_BEDROOM_REACHED", kind: "navigation", reached: (s) => stableRoute(s) ? stage("rival_stage", [2, 3, 4])(s) : null },
  { name: "RIVAL_MET", kind: "story", reached: stage("rival_stage", [3, 4]) },
  { name: "ROUTE_101", kind: "navigation", reached: at("ROUTE 101") },
  { name: "STARTER_CHOSEN", kind: "story", reached: (s) => savedWorld(s) ? s.party.length > 0 : null },
  { name: "BIRCH_RESCUE_COMPLETE", kind: "story", reached: stage("birch_lab_stage", [2, 3, 4, 5]) },
  { name: "BIRCH_STARTER_HANDOFF_COMPLETE", kind: "story", reached: stage("birch_lab_stage", [3, 4, 5]) },
  { name: "OLDALE_TOWN", kind: "navigation", reached: at("OLDALE TOWN") },
  { name: "ROUTE_103", kind: "navigation", reached: at("ROUTE 103") },
  { name: "RIVAL_BATTLE_WON", kind: "story", reached: flag("rival_battle_won") },
  { name: "RECEIVED_POKEDEX", kind: "story", reached: flag("pokedex_received") },
  { name: "STARTER_TUTORIAL_COMPLETE", kind: "story", reached: flag("starter_tutorial_complete") },
  { name: "RUNNING_SHOES_RECEIVED", kind: "story", reached: flag("running_shoes_received") },
  { name: "FIRST_POKEMON_CAUGHT", kind: "story", reached: countReached("pokemon_captures") },
  { name: "FIRST_EVOLUTION", kind: "story", reached: countReached("evolved_pokemon") },
  { name: "FIRST_POKECENTER_HEAL", kind: "story", reached: () => null },
  { name: "ROUTE_102", kind: "navigation", reached: at("ROUTE 102") },
  { name: "ROUTE_102_TRAINER_CALVIN_DEFEATED", kind: "story", reached: trainer("route102_calvin_defeated") },
  { name: "ROUTE_102_TRAINER_RICK_DEFEATED", kind: "story", reached: trainer("route102_rick_defeated") },
  { name: "ROUTE_102_TRAINER_TIANA_DEFEATED", kind: "story", reached: trainer("route102_tiana_defeated") },
  { name: "ROUTE_102_TRAINER_ALLEN_DEFEATED", kind: "story", reached: trainer("route102_allen_defeated") },
  { name: "PETALBURG_CITY", kind: "navigation", reached: at("PETALBURG CITY") },
  { name: "DAD_FIRST_MEETING", kind: "story", reached: stage("petalburg_gym_stage", [1, 2, 3, 4, 5, 6, 7, 8]) },
  { name: "WALLY_TUTORIAL_COMPLETE", kind: "story", reached: stage("petalburg_gym_stage", [2, 3, 4, 5, 6, 7, 8]) },
  { name: "ROUTE_104", kind: "navigation", reached: at("ROUTE 104") },
  { name: "ROUTE_104_TRAINER_IVAN_DEFEATED", kind: "story", reached: trainer("route104_ivan_defeated") },
  { name: "ROUTE_104_TRAINER_BILLY_DEFEATED", kind: "story", reached: trainer("route104_billy_defeated") },
  { name: "ROUTE_104_TRAINER_HALEY_DEFEATED", kind: "story", reached: trainer("route104_haley_defeated") },
  { name: "ROUTE_104_TRAINER_WINSTON_DEFEATED", kind: "story", reached: trainer("route104_winston_defeated") },
  { name: "ROUTE_104_TRAINER_CINDY_DEFEATED", kind: "story", reached: trainer("route104_cindy_defeated") },
  { name: "ROUTE_104_TRAINER_GINA_MIA_DEFEATED", kind: "story", reached: trainer("route104_gina_mia_defeated") },
  { name: "ROUTE_104_TRAINER_DARIAN_DEFEATED", kind: "story", reached: trainer("route104_darian_defeated") },
  { name: "PETALBURG_WOODS", kind: "navigation", reached: at("PETALBURG WOODS") },
  { name: "PETALBURG_WOODS_TRAINER_LYLE_DEFEATED", kind: "story", reached: trainer("petalburg_woods_lyle_defeated") },
  { name: "PETALBURG_WOODS_TRAINER_JAMES_DEFEATED", kind: "story", reached: trainer("petalburg_woods_james_defeated") },
  { name: "PETALBURG_WOODS_TRAINER_AQUA_GRUNT_DEFEATED", kind: "story", reached: trainer("petalburg_woods_aqua_grunt_defeated") },
  { name: "TEAM_AQUA_WOODS_EVENT_COMPLETE", kind: "story", reached: stage("woods_stage", [1]) },
  { name: "RUSTBORO_CITY", kind: "navigation", reached: at("RUSTBORO CITY") },
  { name: "ROUTE_115", kind: "navigation", reached: verifiedVisit("ROUTE 115", [0, 30]) },
  { name: "ROUTE_116", kind: "navigation", reached: verifiedVisit("ROUTE 116", [0, 31]) },
  { name: "ROUTE_116_TRAINER_JOEY_DEFEATED", kind: "story", reached: trainer("route116_joey_defeated") },
  { name: "ROUTE_116_TRAINER_JOSE_DEFEATED", kind: "story", reached: trainer("route116_jose_defeated") },
  { name: "ROUTE_116_TRAINER_JERRY_DEFEATED", kind: "story", reached: trainer("route116_jerry_defeated") },
  { name: "ROUTE_116_TRAINER_CLARK_DEFEATED", kind: "story", reached: trainer("route116_clark_defeated") },
  { name: "ROUTE_116_TRAINER_JANICE_DEFEATED", kind: "story", reached: trainer("route116_janice_defeated") },
  { name: "ROUTE_116_TRAINER_KAREN_DEFEATED", kind: "story", reached: trainer("route116_karen_defeated") },
  { name: "ROUTE_116_TRAINER_SARAH_DEFEATED", kind: "story", reached: trainer("route116_sarah_defeated") },
  { name: "ROUTE_116_TRAINER_DAWSON_DEFEATED", kind: "story", reached: trainer("route116_dawson_defeated") },
  { name: "ROUTE_116_TRAINER_DEVAN_DEFEATED", kind: "story", reached: trainer("route116_devan_defeated") },
  { name: "ROUTE_116_TRAINER_JOHNSON_DEFEATED", kind: "story", reached: trainer("route116_johnson_defeated") },
  { name: "RUSTURF_TUNNEL", kind: "navigation", reached: verifiedVisit("RUSTURF TUNNEL", [24, 4]) },
  { name: "RUSTBORO_CITY_GYM", kind: "navigation", reached: at("RUSTBORO CITY GYM") },
  { name: "RUSTBORO_GYM_TRAINER_JOSH_DEFEATED", kind: "story", reached: gymTrainer("rustboro_josh_defeated") },
  { name: "RUSTBORO_GYM_TRAINER_TOMMY_DEFEATED", kind: "story", reached: gymTrainer("rustboro_tommy_defeated") },
  { name: "RUSTBORO_GYM_TRAINER_MARC_DEFEATED", kind: "story", reached: gymTrainer("rustboro_marc_defeated") },
  { name: "ROXANNE_DEFEATED", kind: "story", reached: trainer("roxanne_defeated") },
  { name: "RUSTBORO_GYM_COMPLETE", kind: "story", reached: flag("rustboro_gym_complete") },
  { name: "STONE_BADGE", kind: "story", reached: (s) => savedWorld(s) ? s.badges.includes("STONE") : null },
  { name: "ROCK_TOMB_RECEIVED", kind: "story", reached: flag("rock_tomb_received") },
];
export const MILESTONE_ORDER = MILESTONES.map((m) => m.name);

export class StateMilestones implements MilestoneSource {
  private readonly seen = new Set<string>();
  private home: { readonly state: GameStateSnapshot; readonly seq: number } | null = null;
  private previous: { readonly state: GameStateSnapshot; readonly seq: number } | null = null;
  private truckSeq: number | null = null;
  private sawTruck = false;
  private resumed = false;
  private readonly negativeBaseline = new Set<string>();

  constructor(private readonly state: StateSource, private readonly now: () => number = () => Date.now()) {}
  initialize(start: "boot" | "save_state"): void { this.resumed = start === "save_state"; }

  observe(state: GameStateSnapshot, seq?: number): SeenMilestone[] {
    const serverTimestamp = this.now() / 1000;
    if (savedWorld(state) && state.location === "INSIDE OF TRUCK") {
      this.sawTruck = true;
      this.truckSeq ??= seq ?? null;
    }
    if (seq !== undefined && this.home === null && postClockHomeWitness(state) !== null) this.home = { state, seq };
    const routeEvidence = new Map<string, number[]>();
    if (seq !== undefined && this.home !== null) {
      if (routeProof("RIVAL_HOUSE_ENTERED", [this.home.state, state])) routeEvidence.set("RIVAL_HOUSE_ENTERED", [this.home.seq, seq]);
      if (this.previous !== null && routeProof("PLAYER_HOUSE_EXITED_AFTER_CLOCK", [this.home.state, this.previous.state, state])) routeEvidence.set("PLAYER_HOUSE_EXITED_AFTER_CLOCK", [this.home.seq, this.previous.seq, seq]);
    }
    const fresh = MILESTONES.filter((m) => {
      if (this.seen.has(m.name)) return false;
      const reached = m.reached(state);
      if (reached === false) this.negativeBaseline.add(m.name);
      return reached === true && (!routeNames.has(m.name) || routeEvidence.has(m.name)) && (m.name !== "FIRST_TRUCK_EXIT" || this.sawTruck);
    });
    if (seq !== undefined && savedWorld(state) && state.location !== null) this.previous = { state, seq };
    for (const m of fresh) this.seen.add(m.name);
    return fresh.map((m) => ({
      name: m.name, serverTimestamp, kind: m.kind,
      origin: !routeNames.has(m.name) && this.resumed && m.name !== "GAME_RUNNING" && !this.negativeBaseline.has(m.name) ? "present_at_start" : "observed",
      ...(seq === undefined ? {} : { evidence: routeEvidence.get(m.name) ?? (m.name === "FIRST_TRUCK_EXIT" && this.truckSeq !== null ? [this.truckSeq, seq] : [seq]) }),
    }));
  }
  async poll(): Promise<SeenMilestone[]> { return this.observe(await this.state.read()); }
}

// Shared native evidence qualification for objective completion and run targets.
export function qualifiedNativeMilestone(event:Extract<RunEvent,{type:"milestone"}>,states:readonly (RunEvent|undefined)[]):boolean {
 if(event.name==="FIRST_POKECENTER_HEAL") {
  const baseline=states[0],accepted=states[1],finished=states[2];
  return event.kind==="story"&&event.origin==="observed"&&states.length===3&&states.every((s,i)=>s?.type==="state"&&"started" in s&&s.run===event.run&&s.seq<event.seq&&s.seq===event.evidence?.[i]&&(i===0||s.seq>(states[i-1]?.seq??Infinity)))&&baseline?.type==="state"&&"started" in baseline&&accepted?.type==="state"&&"started" in accepted&&finished?.type==="state"&&"started" in finished&&baseline.game_stats?.used_pokecenter!=null&&accepted.game_stats?.used_pokecenter!=null&&accepted.game_stats.used_pokecenter>baseline.game_stats.used_pokecenter&&finished.game_stats?.used_pokecenter===accepted.game_stats.used_pokecenter&&completedHeal(finished);
 }
 const definition=MILESTONES.find(item=>item.name===event.name);
 const last=states.at(-1);
 return definition!==undefined&&definition.kind!=="legacy"&&event.kind===definition.kind&&event.origin!==undefined&&states.length>0&&states.every(state=>state?.type==="state"&&"started" in state&&state.run===event.run&&state.seq<event.seq)&&last?.type==="state"&&"started" in last&&definition.reached(last)===true&&(!routeNames.has(event.name)||(event.origin==="observed"&&event.evidence?.length===states.length&&states.every((state,index)=>event.evidence?.[index]===state?.seq)&&states.every((state,index)=>index===0||(state !== undefined && state.seq > (states[index-1]?.seq ?? Infinity)))&&routeProof(event.name,states.filter((state):state is Extract<RunEvent,{type:"state"}> & GameStateSnapshot=>state?.type==="state"&&"started" in state))))&&(event.name!=="FIRST_TRUCK_EXIT"||(states.length===2&&states[0]?.type==="state"&&"location" in states[0]&&"started" in states[0]&&states[0].screen!=="field_transition"&&states[0].location==="INSIDE OF TRUCK"));
}
