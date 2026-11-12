import { BADGES, LEAGUE, TOP_LEVEL, type Milestone } from "./milestones.js";

const pad = (n: number): string => String(n).padStart(2, "0");

export function hms(seconds: number): string {
  const s = Math.floor(seconds);
  return `${String(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

// A gap between two times: minutes:seconds under an hour, hours:minutes:seconds from an hour.
export function span(seconds: number): string {
  const s = Math.floor(seconds);
  return s < 3600 ? `${String(Math.floor(s / 60))}:${pad(s % 60)}` : hms(s);
}

const DOLLARS = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const WHOLE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function usd(amount: number): string {
  return DOLLARS.format(amount);
}

export function count(n: number): string {
  return WHOLE.format(n);
}

const UNITS = ["B", "kB", "MB", "GB"] as const;

export function size(bytes: number): string {
  let v = bytes;
  let unit = 0;
  // 999.5 and up would round to "1000", so it moves up a unit.
  while (v >= 999.5 && unit < UNITS.length - 1) {
    v /= 1000;
    unit++;
  }
  return `${unit > 0 && v < 9.95 ? v.toFixed(1) : v.toFixed(0)} ${String(UNITS[unit])}`;
}

function checkLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1 || level > TOP_LEVEL) throw new RangeError(`progress level ${String(level)}`);
}

export function progress(level: number): string {
  checkLevel(level);
  if (level <= BADGES.length) return `${String(level)} gym badge${level === 1 ? "" : "s"}`;
  const league = level - BADGES.length;
  if (league <= 3) return `Beat ${String(league)} of the Elite Four`;
  if (league === 4) return "Beat the Elite Four";
  if (league === 5) return "Beat the Champion";
  return "Beat the game";
}

const IN_ORDER: readonly Milestone[] = [...BADGES, ...LEAGUE];
const BADGE_NAMES = ["Stone", "Knuckle", "Dynamo", "Heat", "Balance", "Feather", "Mind", "Rain"] as const;
const ELITE_NAMES = ["Sidney", "Phoebe", "Glacia"] as const;

const LEAGUE_LABELS = ["Elite Four: Sidney", "Elite Four: Phoebe", "Elite Four: Glacia", "Elite Four: Drake", "Champion Wallace", "Hall of Fame"] as const;

// The row label for a milestone in a splits table: "Stone Badge (gym 1)", "Elite Four: Sidney", "Hall of Fame".
export function milestoneLabel(m: Milestone): string {
  const i = IN_ORDER.indexOf(m);
  return i < BADGES.length ? `${String(BADGE_NAMES[i])} Badge (gym ${String(i + 1)})` : String(LEAGUE_LABELS[i - BADGES.length]);
}

// "5 gym badges (Balance)", "4 gym badges (last one: Knuckle)" when the gyms were taken out of game
// order, "Beat 3 of the Elite Four (through Glacia)", "Beat the game (Hall of Fame)". Without a furthest
// milestone the game-order milestone for the level is named.
export function progressLong(level: number, furthest?: Milestone): string {
  const base = progress(level);
  const inOrder = String(IN_ORDER[level - 1]);
  const last = furthest ?? inOrder;
  if (level <= BADGES.length) {
    const name = String(BADGE_NAMES[(BADGES as readonly string[]).indexOf(last)]);
    return last === inOrder ? `${base} (${name})` : `${base} (last one: ${name})`;
  }
  const league = level - BADGES.length;
  if (league <= ELITE_NAMES.length) return `${base} (through ${String(ELITE_NAMES[league - 1])})`;
  return level === TOP_LEVEL ? `${base} (Hall of Fame)` : base;
}
