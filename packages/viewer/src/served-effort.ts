// What a lane's server fell back to when a run sent no effort (2026-11-04). Recordings are never rewritten; this reads alongside them.
// Measured: the tokenizer's count for the run's first request equalled the recorded prompt. From its template: read, not measured.
const LANES: readonly (readonly [RegExp, string])[] = [
  [/qwen3\.8-27b/i, "server ran xhigh (measured)"],
  [/qwen3\.8-flash/i, "server ran xhigh (from its template)"],
  [/glm-5\.3/i, "server ran Max (from its template)"],
  [/qwen3\.6|^think-(fast|swarm|longctx)$/i, "this lane's template has no effort setting"],
];
export function servedEffort(model: string): string {
  return LANES.find(([lane]) => lane.test(model))?.[1] ?? "server default, not known";
}
