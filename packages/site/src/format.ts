import { BADGES, TOP_LEVEL } from "./milestones.js";

export function hms(seconds: number): string {
  const s = Math.floor(seconds);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${String(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

const DOLLARS = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function usd(amount: number): string {
  return DOLLARS.format(amount);
}

export function progress(level: number): string {
  if (!Number.isInteger(level) || level < 1 || level > TOP_LEVEL) throw new RangeError(`progress level ${String(level)}`);
  if (level <= BADGES.length) return `${String(level)} gym badge${level === 1 ? "" : "s"}`;
  const league = level - BADGES.length;
  if (league <= 3) return `Beat ${String(league)} of the Elite Four`;
  if (league === 4) return "Beat the Elite Four";
  if (league === 5) return "Beat the Champion";
  return "Beat the game";
}
