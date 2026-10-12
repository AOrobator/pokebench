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
  readonly reached: (state: GameStateSnapshot) => boolean;
}
const at = (location: string) => (state: GameStateSnapshot) => state.started && state.location === location;
const flag = (field: "name_confirmed" | "clock_set" | "rival_battle_won" | "pokedex_received" | "running_shoes_received" | "starter_tutorial_complete" | "rustboro_gym_complete" | "rock_tomb_received") => (s: GameStateSnapshot) => s.story?.[field] === true && (field === "name_confirmed" || s.started);
const stage = (field: "intro_stage" | "rival_stage" | "birch_lab_stage" | "petalburg_gym_stage" | "woods_stage", values: readonly number[]) => (s: GameStateSnapshot) => s.started && s.story?.[field] != null && values.includes(s.story[field]);

// Legacy names retain their old meaning; exact confirmation/exit have new IDs.
// Flags and stage meanings are traced in docs/findings/story-milestones.md.
export const MILESTONES: readonly Milestone[] = [
  { name: "GAME_RUNNING", kind: "legacy", reached: () => true },
  { name: "PLAYER_NAME_CONFIRMED", kind: "story", reached: flag("name_confirmed") },
  { name: "PLAYER_NAME_SET", kind: "legacy", reached: (s) => s.started && s.name !== null },
  { name: "FIRST_TRUCK_EXIT", kind: "story", reached: (s) => s.started && s.location !== null && s.location !== "INSIDE OF TRUCK" },
  { name: "INTRO_CUTSCENE_COMPLETE", kind: "legacy", reached: (s) => s.started && s.location !== null && s.location !== "INSIDE OF TRUCK" },
  { name: "LITTLEROOT_TOWN", kind: "navigation", reached: at("LITTLEROOT TOWN") },
  { name: "PLAYER_HOUSE_ENTERED", kind: "navigation", reached: (s) => s.started && /^LITTLEROOT TOWN (BRENDANS|MAYS) HOUSE 1F$/.test(s.location ?? "") },
  { name: "MOM_CLOCK_INSTRUCTION", kind: "story", reached: stage("intro_stage", [4, 5, 6, 7]) },
  { name: "PLAYER_BEDROOM", kind: "navigation", reached: (s) => s.started && /^LITTLEROOT TOWN (BRENDANS|MAYS) HOUSE 2F$/.test(s.location ?? "") },
  { name: "CLOCK_SET", kind: "story", reached: flag("clock_set") },
  { name: "MOM_RIVAL_INSTRUCTION", kind: "story", reached: stage("intro_stage", [7]) },
  { name: "RIVAL_MET", kind: "story", reached: stage("rival_stage", [3, 4]) },
  { name: "ROUTE_101", kind: "navigation", reached: at("ROUTE 101") },
  { name: "STARTER_CHOSEN", kind: "story", reached: (s) => s.started && s.party.length > 0 },
  { name: "BIRCH_RESCUE_COMPLETE", kind: "story", reached: stage("birch_lab_stage", [2, 3, 4, 5]) },
  { name: "BIRCH_STARTER_HANDOFF_COMPLETE", kind: "story", reached: stage("birch_lab_stage", [3, 4, 5]) },
  { name: "OLDALE_TOWN", kind: "navigation", reached: at("OLDALE TOWN") },
  { name: "ROUTE_103", kind: "navigation", reached: at("ROUTE 103") },
  { name: "RIVAL_BATTLE_WON", kind: "story", reached: flag("rival_battle_won") },
  { name: "RECEIVED_POKEDEX", kind: "story", reached: flag("pokedex_received") },
  { name: "STARTER_TUTORIAL_COMPLETE", kind: "story", reached: flag("starter_tutorial_complete") },
  { name: "RUNNING_SHOES_RECEIVED", kind: "story", reached: flag("running_shoes_received") },
  { name: "ROUTE_102", kind: "navigation", reached: at("ROUTE 102") },
  { name: "PETALBURG_CITY", kind: "navigation", reached: at("PETALBURG CITY") },
  { name: "DAD_FIRST_MEETING", kind: "story", reached: stage("petalburg_gym_stage", [1, 2, 3, 4, 5, 6, 7, 8]) },
  { name: "WALLY_TUTORIAL_COMPLETE", kind: "story", reached: stage("petalburg_gym_stage", [2, 3, 4, 5, 6, 7, 8]) },
  { name: "ROUTE_104", kind: "navigation", reached: at("ROUTE 104") },
  { name: "PETALBURG_WOODS", kind: "navigation", reached: at("PETALBURG WOODS") },
  { name: "TEAM_AQUA_WOODS_EVENT_COMPLETE", kind: "story", reached: stage("woods_stage", [1]) },
  { name: "RUSTBORO_CITY", kind: "navigation", reached: at("RUSTBORO CITY") },
  { name: "RUSTBORO_CITY_GYM", kind: "navigation", reached: at("RUSTBORO CITY GYM") },
  { name: "RUSTBORO_GYM_COMPLETE", kind: "story", reached: flag("rustboro_gym_complete") },
  { name: "STONE_BADGE", kind: "story", reached: (s) => s.started && s.badges.includes("STONE") },
  { name: "ROCK_TOMB_RECEIVED", kind: "story", reached: flag("rock_tomb_received") },
];
export const MILESTONE_ORDER = MILESTONES.map((m) => m.name);

export class StateMilestones implements MilestoneSource {
  private readonly seen = new Set<string>();
  private truckSeq: number | null = null;
  private sawTruck = false;
  private resumed = false;
  private savedStateSeen = false;

  constructor(private readonly state: StateSource, private readonly now: () => number = () => Date.now()) {}
  initialize(start: "boot" | "save_state"): void { this.resumed = start === "save_state"; }

  observe(state: GameStateSnapshot, seq?: number): SeenMilestone[] {
    const serverTimestamp = this.now() / 1000;
    if (state.started && state.location === "INSIDE OF TRUCK") {
      this.sawTruck = true;
      this.truckSeq ??= seq ?? null;
    }
    const initial = this.resumed && state.started && !this.savedStateSeen;
    if (state.started) this.savedStateSeen = true;
    const fresh = MILESTONES.filter((m) => !this.seen.has(m.name) && m.reached(state) && (m.name !== "FIRST_TRUCK_EXIT" || this.sawTruck));
    for (const m of fresh) this.seen.add(m.name);
    return fresh.map((m) => ({
      name: m.name, serverTimestamp, kind: m.kind,
      origin: initial && m.name !== "GAME_RUNNING" ? "present_at_start" : "observed",
      ...(seq === undefined ? {} : { evidence: m.name === "FIRST_TRUCK_EXIT" && this.truckSeq !== null ? [this.truckSeq, seq] : [seq] }),
    }));
  }
  async poll(): Promise<SeenMilestone[]> { return this.observe(await this.state.read()); }
}
