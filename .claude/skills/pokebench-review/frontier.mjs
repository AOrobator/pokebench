const viewer = process.env.POKEBENCH_VIEWER_WORKTREE ?? "/private/tmp/pokebench-viewer";
const { FRONTIER_MILESTONES, frontierReferences } = await import(`${viewer}/packages/viewer/dist/frontier.js`);
const { parseWorkbench } = await import(`${viewer}/packages/viewer/dist/workbench-data.js`);

let wb;
try {
  const res = await fetch("http://127.0.0.1:8790/api/workbench", { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
  wb = parseWorkbench(await res.json());
} catch (error) {
  console.error(`Viewer workbench unavailable on 127.0.0.1:8790 (${error instanceof Error ? error.message : String(error)}). Ask the operator before restarting it.`);
  process.exit(1);
}

const order = FRONTIER_MILESTONES.map(m => m.id);
const clockAt = order.indexOf("CLOCK_SET");
const clean = r => r.excluded === null && r.problem === null && r.config !== null && !(r.measurement?.features ?? []).some(f => /probe|synthetic|replay/.test(f));
const agent = r => clean(r) && r.measurement?.controller === "agent";
const resumed = r => r.config.resume === "CLOCK_SET";
const top = r => {
  const from = resumed(r) ? clockAt + 1 : 0;
  const i = order.findLastIndex((n, k) => k >= from && r.splits.some(s => s.name === n && s.screenshotEvidence === undefined));
  return { i, ms: i < 0 ? Infinity : (r.splits.find(s => s.name === order[i])?.elapsedMs ?? Infinity) };
};
const start = r => r.config.start === "boot" ? "boot" : `${r.config.start}:${r.config.resume ?? "unknown"}`;
const line = (r, t) => `${t.i < 0 ? (resumed(r) ? "no progress past the resume point" : "no milestone reached") : order[t.i]}\t${t.ms === Infinity ? "-" : (t.ms / 60000).toFixed(1)} min\t${r.model ?? "-"}\t${r.config.preset ?? "-"}\t${start(r)}\t${r.status}\t${r.id}`;
const list = (label, runs, n) => {
  console.log(`## ${label}`);
  const rows = runs.map(r => ({ r, t: top(r) })).sort((a, b) => b.t.i - a.t.i || a.t.ms - b.t.ms || a.r.id.localeCompare(b.r.id)).slice(0, n);
  if (rows.length === 0) console.log("none");
  for (const { r, t } of rows) console.log(line(r, t));
};

const refs = frontierReferences(wb.runs);
console.log(`## best valid fresh-boot run (viewer frontierReferences)\n${refs.best === null ? "unavailable" : line(refs.best, top(refs.best))}`);
list("fresh-boot frontier: ended boot runs, active minutes since New game", wb.runs.filter(r => agent(r) && r.status === "ended" && r.config.start === "boot"), 5);
list("checkpoint frontier: ended runs resumed at CLOCK_SET, minutes since the save loaded (never compare with boot times)", wb.runs.filter(r => agent(r) && r.status === "ended" && resumed(r)), 5);
list("in progress, not counted: live or paused (save_state rows: minutes since the save loaded)", wb.runs.filter(r => agent(r) && (r.status === "live" || r.status === "paused")), 5);
list("stalled, not counted: unresponsive (save_state rows: minutes since the save loaded)", wb.runs.filter(r => agent(r) && r.status === "unresponsive"), 5);
console.log(`## human reference (viewer frontierReferences)\n${refs.human === null ? "unavailable" : line(refs.human, top(refs.human))}`);
