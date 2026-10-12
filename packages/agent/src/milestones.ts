import type { GameStateSnapshot, StateSource } from "./game-state.js";

export interface SeenMilestone {
  readonly name: string;
  readonly serverTimestamp: number;
}

export interface MilestoneSource {
  poll(): Promise<SeenMilestone[]>;
}

interface Milestone {
  readonly name: string;
  readonly reached: (state: GameStateSnapshot) => boolean;
}

const at = (location: string) => (state: GameStateSnapshot) => state.location === location;

// Derived only from PokeBench's RAM reader. The name counts as set once the
// game has started: before that the save block holds the game's default name.
export const MILESTONES: readonly Milestone[] = [
  { name: "GAME_RUNNING", reached: () => true },
  { name: "PLAYER_NAME_SET", reached: (s) => s.started && s.name !== null },
  { name: "INTRO_CUTSCENE_COMPLETE", reached: (s) => s.started && s.location !== "INSIDE OF TRUCK" },
  { name: "LITTLEROOT_TOWN", reached: at("LITTLEROOT TOWN") },
  { name: "PLAYER_HOUSE_ENTERED", reached: (s) => /^LITTLEROOT TOWN (BRENDANS|MAYS) HOUSE 1F$/.test(s.location ?? "") },
  { name: "PLAYER_BEDROOM", reached: (s) => /^LITTLEROOT TOWN (BRENDANS|MAYS) HOUSE 2F$/.test(s.location ?? "") },
  // Intro state6 follows confirmed clock;7 follows Mom. Missing trigger is unknown.
  { name: "CLOCK_SET", reached: (s) => s.started && (s.world_context?.triggers.some((t) => t.variable === 0x4092 && (t.current_value === 6 || t.current_value === 7)) ?? false) },
  { name: "ROUTE_101", reached: at("ROUTE 101") },
  { name: "STARTER_CHOSEN", reached: (s) => s.party.length > 0 },
  { name: "OLDALE_TOWN", reached: at("OLDALE TOWN") },
  { name: "ROUTE_103", reached: at("ROUTE 103") },
  { name: "ROUTE_102", reached: at("ROUTE 102") },
  { name: "PETALBURG_CITY", reached: at("PETALBURG CITY") },
  { name: "ROUTE_104", reached: at("ROUTE 104") },
  { name: "PETALBURG_WOODS", reached: at("PETALBURG WOODS") },
  { name: "RUSTBORO_CITY", reached: at("RUSTBORO CITY") },
  { name: "RUSTBORO_CITY_GYM", reached: at("RUSTBORO CITY GYM") },
  { name: "STONE_BADGE", reached: (s) => s.badges.includes("STONE") },
];

export class StateMilestones implements MilestoneSource {
  private readonly seen = new Set<string>();

  constructor(
    private readonly state: StateSource,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async poll(): Promise<SeenMilestone[]> {
    const state = await this.state.read();
    const serverTimestamp = this.now() / 1000;
    const fresh = MILESTONES.filter((m) => !this.seen.has(m.name) && m.reached(state));
    for (const m of fresh) this.seen.add(m.name);
    return fresh.map((m) => ({ name: m.name, serverTimestamp }));
  }
}
