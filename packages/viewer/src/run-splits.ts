import { FRONTIER_MILESTONES } from "./frontier.js";
import type { RunView } from "./model.js";

export interface BestSplits { readonly run: string; readonly milestones: readonly { readonly name: string; readonly offsetMs: number; readonly derived?: boolean }[] }

// The one answer to "what has this run reached". Recorded splits win: a current view carries no milestones.
export function reachedSplits(view: RunView, recorded: BestSplits | undefined): { name: string; at: number; derived: boolean }[] {
  if (recorded !== undefined) return recorded.milestones.map((m) => ({ name: m.name, at: m.offsetMs / 1000, derived: m.derived === true }));
  const startMs = view.startMs;
  if (startMs === null) return [];
  return view.milestones.filter((m) => m.origin !== "present_at_start").map((m) => ({ name: m.name, at: (m.ms - startMs - view.control.pausedBefore(m.ms)) / 1000, derived: m.derived === true }));
}

export function nextSplit(names: ReadonlySet<string>): string | undefined {
  const deepest = Math.max(-1, ...FRONTIER_MILESTONES.map((m, i) => (names.has(m.id) ? i : -1)));
  return FRONTIER_MILESTONES[deepest + 1]?.id;
}

// Replay stays on the folded events: recorded splits hold the whole run, and rewinding must hide later ones.
export function tableSplits(mode: string, recorded: BestSplits | null | undefined): BestSplits | null | undefined {
  return mode === "replay" ? undefined : recorded;
}
