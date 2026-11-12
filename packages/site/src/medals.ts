import { html, type Html } from "./html.js";
import { BADGES, TOP_LEVEL } from "./milestones.js";

// Earned badges as gold pixel stars, missing ones as grey outlines, and after the eight badges a crown
// for the Hall of Fame only. The Elite Four and the Champion show eight stars and no crown.
export function medals(level: number): Html {
  if (!Number.isInteger(level) || level < 0 || level > TOP_LEVEL) throw new RangeError(`medal level ${String(level)}`);
  const earned = Math.min(level, BADGES.length);
  const hof = level === TOP_LEVEL;
  const label = `${String(earned)} of ${String(BADGES.length)} gym badges${hof ? " and the Hall of Fame" : ""}`;
  const stars = BADGES.map((_, i) => (i < earned ? html`<i class="medal"></i>` : html`<i class="medal off"></i>`));
  const crown = hof ? html`<i class="medal hof" title="Hall of Fame"></i>` : html``;
  return html`<span class="medals" role="img" aria-label="${label}">${stars}${crown}</span>`;
}
