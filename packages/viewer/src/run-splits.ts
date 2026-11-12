import { FRONTIER_MILESTONES } from "./frontier.js";
import type { WorkbenchRun } from "./workbench-data.js";
import type { RunView } from "./model.js";

export interface BestSplits { readonly run: string; readonly milestones: readonly { readonly name: string; readonly offsetMs: number; readonly derived?: boolean }[] }

// The one answer to "what has this run reached". Recorded splits win: a current view carries no milestones.
export function reachedSplits(view: RunView, recorded: BestSplits | undefined): { name: string; at: number; derived: boolean }[] {
  if (recorded !== undefined) return recorded.milestones.map((m) => ({ name: m.name, at: m.offsetMs / 1000, derived: m.derived === true }));
  const startMs = view.startMs;
  if (startMs === null) return [];
  return view.milestones.filter((m) => m.origin !== "present_at_start").map((m) => ({ name: m.name, at: (m.ms - startMs - view.control.pausedBefore(m.ms)) / 1000, derived: m.derived === true }));
}

// Where the run began among the frontier milestones; null for a save with no known position.
function startIndex(view: RunView): number | null {
  const state = view.start?.start_state;
  if (state === undefined || state.kind !== "save_state") return -1;
  const file = state.path.split(/[/\\]/).pop() ?? "";
  if (file === "MAIN_MENU.state") return -1;
  const at = FRONTIER_MILESTONES.findIndex((m) => file === `${m.id}.state`);
  return at < 0 ? null : at;
}

export function nextSplit(view: RunView, names: ReadonlySet<string>): string | undefined {
  const deepest = Math.max(-1, ...FRONTIER_MILESTONES.map((m, i) => (names.has(m.id) ? i : -1)));
  const start = startIndex(view);
  if (deepest < 0 && start === null) return undefined;
  return FRONTIER_MILESTONES[Math.max(deepest, start ?? -1) + 1]?.id;
}

// Replay stays on the folded events: recorded splits hold the whole run, and rewinding must hide later ones.
export function tableSplits(mode: string, recorded: BestSplits | null | undefined): BestSplits | null | undefined {
  return mode === "replay" ? undefined : recorded;
}

// A replay head is paged: its last event bounds progress, but its milestones omit earlier history.
export function graphSplits(mode: string, recording: WorkbenchRun, view: RunView): WorkbenchRun["splits"] {
  if (mode !== "replay") return recording.splits;
  const through = view.events.at(-1)?.seq ?? -1;
  const shown = new Set(view.milestones.map(mark => mark.name));
  return recording.splits.filter(split => split.screenshotEvidence === undefined ? split.seq <= through : shown.has(split.name));
}
