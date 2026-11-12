// The plotted story milestones, as in env/pokebench_env/readme_charts.py.

export const BADGES = [
  "STONE_BADGE",
  "KNUCKLE_BADGE",
  "DYNAMO_BADGE",
  "HEAT_BADGE",
  "BALANCE_BADGE",
  "FEATHER_BADGE",
  "MIND_BADGE",
  "RAIN_BADGE",
] as const;

export const LEAGUE = [
  "ELITE_FOUR_SIDNEY_DEFEATED",
  "ELITE_FOUR_PHOEBE_DEFEATED",
  "ELITE_FOUR_GLACIA_DEFEATED",
  "ELITE_FOUR_DRAKE_DEFEATED",
  "WALLACE_DEFEATED",
  "GAME_CLEAR_CONFIRMED",
] as const;

export type Milestone = (typeof BADGES)[number] | (typeof LEAGUE)[number];

export const TOP_LEVEL = BADGES.length + LEAGUE.length;

const ALL: ReadonlySet<string> = new Set<string>([...BADGES, ...LEAGUE]);

export function isMilestone(name: string): name is Milestone {
  return ALL.has(name);
}

// Badges count in the order they were earned, since runs do not always take the gyms in game order;
// the Elite Four, the Champion and the game clear have fixed levels.
export function levelOf(times: ReadonlyMap<Milestone, number>, furthest: Milestone, at: number): number {
  const league = (LEAGUE as readonly string[]).indexOf(furthest);
  if (league >= 0) return BADGES.length + league + 1;
  return BADGES.filter((b) => (times.get(b) ?? Number.POSITIVE_INFINITY) <= at).length;
}
