import { preciseTime } from "./frontier.js";
import { clip, esc, hms, num } from "./format.js";
import type { WorkbenchRun, WorkbenchSplit } from "./workbench-data.js";
export type Metric = "elapsedMs" | "segmentMs" | "turn" | "outputTokens";
export const METRICS: Readonly<Record<Metric, string>> = { elapsedMs: "Time from start", segmentMs: "Time since previous checkpoint", turn: "Model turns", outputTokens: "Output tokens" };
export function median(values: readonly number[]): number | null { const s = values.slice().sort((a, b) => a - b); return s.length === 0 ? null : ((s[Math.floor((s.length - 1) / 2)] ?? 0) + (s[Math.floor(s.length / 2)] ?? 0)) / 2; }
export function metricText(n: number, metric: Metric): string { return metric === "turn" || metric === "outputTokens" ? num(Math.round(n)) : hms(n / 1000); }
export function viewerUrl(run: string | null): string { return run === null ? "/" : `/#run=${encodeURIComponent(run)}`; }
const COLORS = ["#3a6ea5", "#2f9e57", "#b37b35", "#8b69a3", "#ba5860", "#287a88"];
export function color(value: string): string { let hash = 0; for (const c of value) hash = (hash * 31 + c.charCodeAt(0)) >>> 0; return COLORS[hash % COLORS.length] ?? "#3a6ea5"; }
export function eligible(run: WorkbenchRun): boolean { return run.excluded === null && run.problem === null; }
function widthOf(width: number): number { return Number.isFinite(width) ? Math.max(240, Math.round(width)) : 640; }
function ticks(width: number, left: number, max: number, height: number, metric: Metric): string {
  const count = width < 600 ? 2 : 5, right = width - 12;
  return Array.from({ length: count + 1 }, (_, i) => {
    const x = left + (right - left) * i / count;
    return `<line class="wb-gridline" x1="${String(x)}" x2="${String(x)}" y1="20" y2="${String(height - 34)}"/><text class="wb-axis" x="${String(x)}" y="${String(height - 10)}" text-anchor="${i === 0 ? "start" : i === count ? "end" : "middle"}">${metricText(max * i / count, metric)}</text>`;
  }).join("");
}
function mark(run: WorkbenchRun, split: WorkbenchSplit, body: string, label: string): string {
  return `<g class="wb-mark" role="button" tabindex="0" data-run="${esc(run.id)}" data-split="${esc(split.name)}" aria-label="${esc(`Inspect ${run.model ?? run.id}, ${split.name}, ${label}`)}"><title>${esc(`${run.id} · ${split.name} · ${label}`)}</title>${body}</g>`;
}
export function timingPlot(runs: readonly WorkbenchRun[], milestone: string, feature: string, metric: Metric, requestedWidth: number): string {
  const points = runs.filter(eligible).flatMap(run => { const split = run.splits.find(s => s.name === milestone); return split === undefined ? [] : [{ run, split, on: run.config?.features.find(f => f.id === feature)?.on ?? null }]; });
  if (points.length === 0) return '<p class="wb-empty">No verified milestone times for this selection.</p>';
  const width = widthOf(requestedWidth), narrow = width < 600, left = narrow ? 65 : 215;
  const models = Array.from(new Set(points.map(p => p.run.model ?? "Model not recorded"))).sort();
  const block = narrow ? 116 : 92, height = 28 + models.length * block + 38, max = Math.max(1, ...points.map(p => p.split[metric])) * 1.08;
  let body = ticks(width, left, max, height, metric);
  models.forEach((model, index) => {
    const top = 28 + index * block;
    body += `<text class="wb-model" x="0" y="${String(top + (narrow ? 10 : 43))}"><title>${esc(model)}</title>${esc(clip(model, narrow ? Math.floor(width / 7) : 20))}</text>`;
    ([true, false, null] as const).forEach((on, lane) => {
      const y = top + (narrow ? 32 : 18) + lane * 22, label = on === null ? "UNKNOWN" : on ? "ON" : "OFF";
      const group = points.filter(p => (p.run.model ?? "Model not recorded") === model && p.on === on);
      body += `<text class="wb-axis" x="${String(narrow ? 0 : 154)}" y="${String(y + 4)}">${label}</text>`;
      group.forEach(({ run, split }, i) => {
        const x = left + split[metric] / max * (width - left - 12), cy = y + (i % 3 - 1) * 4;
        body += mark(run, split, `<circle cx="${String(x)}" cy="${String(cy)}" r="6" fill="${on === null ? "#a7b6c5" : on ? color(model) : "#fff"}" stroke="${color(model)}" stroke-width="2"/>`, `${metricText(split[metric], metric)}${run.config?.resume === "CLOCK_SET" ? " · since Clock set save, not from New game" : ""}`);
      });
      const middle = median(group.map(p => p.split[metric]));
      if (middle !== null) { const x = left + middle / max * (width - left - 12); body += `<line class="wb-median" x1="${String(x)}" x2="${String(x)}" y1="${String(y - 10)}" y2="${String(y + 10)}"/>`; }
    });
  });
  return `<svg class="wb-chart" viewBox="0 0 ${String(width)} ${String(height)}" role="img" aria-label="Verified ${esc(milestone)} ${esc(METRICS[metric])}">${body}</svg>`;
}
export function ribbonPlot(runs: readonly WorkbenchRun[], requestedWidth: number): string {
  const plotted = runs.filter(r => eligible(r) && r.splits.length > 0);
  if (plotted.length === 0) return '<p class="wb-empty">No verified splits to draw. Unreached checkpoints are not zero-duration segments.</p>';
  const width = widthOf(requestedWidth), narrow = width < 600, left = narrow ? 0 : 215, row = narrow ? 66 : 42;
  const height = 24 + row * plotted.length + 36, max = Math.max(1, ...plotted.flatMap(r => r.splits.map(s => s.elapsedMs))) * 1.04;
  let body = ticks(width, left, max, height, "elapsedMs");
  plotted.forEach((run, index) => {
    const top = 28 + index * row, label = `${clip(run.model ?? "Model not recorded", narrow ? 18 : 16)} · ${run.id.slice(-6)}${run.config?.resume === "CLOCK_SET" ? " · not from zero" : ""}`;
    body += `<text class="wb-model" x="0" y="${String(top + (narrow ? 8 : 16))}"><title>${esc(run.id)}</title>${esc(label)}</text>`;
    const y = top + (narrow ? 16 : 0);
    for (const split of run.splits) {
      const x = left + (split.elapsedMs - split.segmentMs) / max * (width - left - 12), w = split.segmentMs / max * (width - left - 12);
      const shape = w > 0 ? `<rect x="${String(x)}" y="${String(y)}" width="${String(w)}" height="20" fill="${color(split.name)}" stroke="#fff" stroke-width="1"/>` : `<line x1="${String(x)}" x2="${String(x)}" y1="${String(y)}" y2="${String(y + 20)}" stroke="${color(split.name)}" stroke-width="2"/>`;
      body += mark(run, split, shape, `${hms(split.segmentMs / 1000)} since previous checkpoint; ${hms(split.elapsedMs / 1000)} elapsed`);
    }
    if (narrow) body += `<text class="wb-axis" x="0" y="${String(y + 36)}">${esc(run.reason ?? run.status)} · ${String(run.turn)} turns</text>`;
  });
  return `<svg class="wb-chart" viewBox="0 0 ${String(width)} ${String(height)}" role="img" aria-label="Recorded milestone split ribbons">${body}</svg>`;
}
export function currentRunHtml(runs: readonly WorkbenchRun[], at: number, now: number, back: string | null): string {
  const live = runs.filter(r => r.status === "live" || r.status === "paused");
  if (live.length === 0) return `<a class="wb-button" href="${viewerUrl(back)}">← BACK TO VIEWER</a>`;
  return live.map(run => {
    const elapsed = (run.elapsedMs ?? 0) + (run.status === "live" ? Math.max(0, now - at) : 0);
    return `<a class="wb-current" href="${viewerUrl(run.id)}"><span class="wb-kicker" data-current-field="summary">${run.status === "paused" ? "PAUSED" : "● CURRENT RUN"}${run.config?.resume === "CLOCK_SET" ? " · NOT FROM ZERO · Clock set save" : ""} · ${esc(run.model ?? "Model not recorded")}</span><strong><span data-current-field="elapsed">${hms(elapsed / 1000)}</span> <small data-current-field="cap">/ ${run.config?.maxWallMs == null ? "no recorded time cap" : hms(run.config.maxWallMs / 1000)}</small></strong><span data-current-field="progress">Turn ${String(run.turn)}${run.config?.maxTurns == null ? "" : ` / ${String(run.config.maxTurns)}`} · Target: ${esc(run.config?.target?.replace(/_/g, " ") ?? "play to budget")}</span><span class="wb-kicker" data-current-field="objective-status">CURRENT OBJECTIVE${run.objective === null ? "" : ` · ${esc(run.objective.status)}`}</span><span data-current-field="objective-title">${esc(run.objective?.title ?? "No objective recorded")}</span><span class="wb-current-go">WATCH THIS RUN →</span></a>`;
  }).join("");
}
function pairs(rows: readonly (readonly [string, string])[]): string { return `<dl class="wb-pairs">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`; }
export function runDetails(run: WorkbenchRun, selectedSplit: string | null): string {
  const c = run.config, split = run.splits.find(s => s.name === selectedSplit);
  const raw = run.measurement?.rawSplits.find(s => s.name === selectedSplit);
  const native = run.measurement === undefined ? "" : `<h3>TIMING & SOURCE EVIDENCE</h3>${pairs([[run.measurement.logBytes === undefined ? "Log SHA-256" : `Log snapshot SHA-256 (${String(run.measurement.logBytes)} bytes)`, run.measurement.logSha256], ["Applied pauses", `${String(run.measurement.pausedMs / 1000)} seconds`], ...(split === undefined ? [] : [["Active elapsed", `${split.derived === true ? "≤ " : ""}${preciseTime(split.elapsedMs)}`] as const, ["Timing basis", split.screenshotEvidence !== undefined ? "Visually reviewed, logged victory screenshots; observation upper bound, not a native trainer-flag timestamp." : split.derived === true ? `Recovered from recorded native state; first-observation upper bound.${split.name === "ROXANNE_DEFEATED" ? " Gym completion and Stone Badge prove Roxanne was defeated by this observation; the exact defeat time was not recorded." : ""}` : "Recorded native milestone"] as const]), ...(raw === undefined ? [] : [["Raw wall elapsed", preciseTime(raw.elapsedMs)] as const, [split?.screenshotEvidence === undefined ? "Native evidence" : "Reviewed screenshot events", raw.evidence.map(seq => `#${String(seq)}`).join(", ")] as const]), ...(run.measurement.artifact === undefined ? [] : [["Retained serving artifact", run.measurement.artifact.id] as const, ["Artifact receipt", `${run.measurement.artifact.receipt} · SHA256 ${run.measurement.artifact.sha256}`] as const]), ...(run.measurement.receipts ?? []).map(r => ["Launch receipt", `${r.path} · SHA256 ${r.sha256}`] as const)])}`;
  const screenshots = split?.screenshotEvidence?.map(frame => `<figure class="wb-proof-frame"><img src="/api/runs/${encodeURIComponent(run.id)}/${esc(frame.path)}" alt="Reviewed victory evidence, recorded screenshot #${String(frame.seq)}"/><figcaption>Recorded screenshot #${String(frame.seq)} · SHA1 ${esc(frame.sha1)}</figcaption></figure>`).join("") ?? "";
  const resumed = c?.resume === "CLOCK_SET" ? '<p class="wb-notice">This run loaded a Clock set save. It did not start from New game. Times count from when that save loaded.</p>' : "";
  return `<div class="wb-detail-head"><h2>RUN DETAILS</h2><button type="button" class="wb-button" data-close-detail aria-label="Close run details">× CLOSE</button></div><h3>${esc(run.model ?? "Model not recorded")}</h3><p class="wb-run-id">${esc(run.id)}</p><p>${esc(run.status)} · ${esc(run.reason ?? "no terminal outcome")}</p>${resumed}${run.problem === null && run.excluded === null ? "" : `<p class="wb-notice">${esc(run.problem ?? run.excluded ?? "")}</p>`}${native}${screenshots}<h3>MODEL & SAMPLING</h3>${c === null ? '<p>Model configuration was not recorded.</p>' : pairs([["Model", run.model ?? "not recorded"], ["Context", num(c.context)], ["Vision", c.vision ? "supported" : "not supported"], ["Thinking", c.thinking], ["Max output tokens", num(c.maxTokens)], ["Artifact / serving", "not recorded in run_start; no settings inferred from the model name"]])}<h3>HARNESS CONFIGURATION</h3>${c === null ? '<p>Harness configuration was not recorded.</p>' : pairs([["Source", `${c.source}${c.dirty ? " (dirty)" : ""}`], ["Preset", c.preset ?? "not recorded"], ["Fixed target", c.target ?? "not recorded / play to budget"], ["Start", c.resume === "CLOCK_SET" ? "Clock set save · not from New game" : c.start], ["Time cap", c.maxWallMs === null ? "not recorded" : hms(c.maxWallMs / 1000)], ["Turn cap", c.maxTurns === null ? "not recorded" : String(c.maxTurns)], ["Failure limit", c.failureLimit === null ? "not recorded" : String(c.failureLimit)], ["Vendor pin", c.vendor], ["pi version", c.pi], ["Tools", c.tools.join(", ")]])}<h3>FEATURES · RECORDED ON / OFF</h3>${c === null ? '<p>Feature settings were not recorded.</p>' : `<div class="wb-feature-list">${c.features.map(f => `<div><span>${esc(f.label)}<small>${esc(f.id)}</small></span><b class="${f.on === true ? "on" : f.on === false ? "off" : "unknown"}">${f.on === null ? "UNKNOWN" : f.on ? "ON" : "OFF"}</b></div>`).join("")}</div>`}<h3>${split === undefined ? "VERIFIED CHECKPOINTS" : "SELECTED CHECKPOINT"}</h3>${pairs((split === undefined ? run.splits : [split]).map(s => [s.name.replace(/_/g, " "), `${hms(s.elapsedMs / 1000)} · turn ${String(s.turn)} · ${s.derived === true ? (s.screenshotEvidence === undefined ? "recovered state (upper bound)" : "reviewed screenshot (upper bound)") : "milestone"} #${String(s.seq)} · ${num(s.outputTokens)} output tokens`]))}<a class="wb-button wb-primary" href="${viewerUrl(run.id)}">WATCH / REPLAY THIS RUN →</a>`;
}
