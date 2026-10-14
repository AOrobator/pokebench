import { esc, eventMs } from "./format.js";
import { FRAME_MS } from "./gba.js";
import type { RunView } from "./model.js";

export const WINDOW_MS = 60_000;
export const LANES = ["thinking", "tool calls", "presses", "milestones", "errors"] as const;

const W = 1000;
const H = 170;
const LABEL = 110;
const LANE = (H - 20) / LANES.length;

const f = (n: number): string => n.toFixed(1);

function bar(cls: string, lane: number, a: number, b: number, title: string, fill = 0.6): string {
  const top = lane * LANE + (LANE * (1 - fill)) / 2;
  return `<rect class="${cls}" role="img" aria-label="${esc(title)}" x="${f(a)}" y="${f(top)}" width="${f(Math.max(3, b - a))}" height="${f(LANE * fill)}"><title>${esc(title)}</title></rect>`;
}

// Swimlanes over the 60 s before `nowMs` (wall clock live, the cursor in replay).
export function lanesSvg(view: RunView, nowMs: number): string {
  const t0 = nowMs - WINDOW_MS;
  const x = (ms: number): number => LABEL + (W - LABEL - 8) * ((Math.max(ms, t0) - t0) / WINDOW_MS);
  const parts: string[] = [];
  LANES.forEach((name, i) => {
    parts.push(`<rect class="lane${i % 2 === 0 ? "" : " alt"}" x="0" y="${f(i * LANE)}" width="${String(W)}" height="${f(LANE)}"/>`);
    parts.push(`<text class="lab" x="8" y="${f(i * LANE + LANE / 2 + 4)}">${name}</text>`);
  });
  for (const pause of view.control.pauses) {
    const end = pause.endMs ?? nowMs;
    if (end < t0 || pause.startMs > nowMs) continue;
    const a = x(pause.startMs), b = x(end);
    parts.push(`<rect class="m-paused" x="${f(a)}" y="0" width="${f(Math.max(3, b - a))}" height="${f(H - 20)}"><title>paused ${String(Math.round((end - pause.startMs) / 1000))}s (operator)</title></rect>`);
  }
  for (const span of view.thinkingSpans) {
    const end = span.endMs ?? nowMs;
    if (end < t0 || span.startMs > nowMs) continue;
    const seconds = ((end - span.startMs) / 1000).toFixed(1);
    parts.push(bar(span.endMs === null ? "m-think open" : "m-think", 0, x(span.startMs), x(end), `thinking ${seconds}s`));
  }
  for (const span of view.toolSpans) {
    const end = span.endMs ?? nowMs;
    if (end < t0 || span.startMs > nowMs) continue;
    parts.push(bar(span.error ? "m-tool err" : "m-tool", 1, x(span.startMs), x(end), span.name));
  }
  for (const press of view.presses) {
    const step = (press.hold + press.release) * FRAME_MS;
    press.buttons.forEach((button, i) => {
      const start = press.ms + i * step;
      if (start + step < t0 || start > nowMs) return;
      const title = `${button} hold ${String(press.hold)}f${press.assumed ? " (assumed)" : ""}`;
      parts.push(bar(`m-press b-${button}`, 2, x(start), x(start + step), title, 0.5));
    });
  }
  for(const event of view.events){
    if(event.type!=="decision_input"&&event.type!=="wait_input")continue;
    const ms=eventMs(event);if(ms<t0||ms>nowMs)continue;
    const title=event.type==="decision_input"?`snapshot for decision ${String(event.decision_turn)} · state #${String(event.state_seq)}`:`WAIT ${String(event.duration_ms)} ms (host time)`;
    parts.push(bar(event.type==="decision_input"?"m-tool":"m-press",event.type==="decision_input"?1:2,x(ms)-2,x(ms)+3,title,0.5));
  }
  for (const milestone of view.milestones) {
    if (milestone.ms < t0 || milestone.ms > nowMs) continue;
    const cx = x(milestone.ms);
    const cy = 3 * LANE + LANE / 2;
    parts.push(
      `<path class="m-milestone" d="M${f(cx)} ${f(cy - 9)}L${f(cx + 7)} ${f(cy)}L${f(cx)} ${f(cy + 9)}L${f(cx - 7)} ${f(cy)}Z"><title>${esc(milestone.name)}</title></path>`,
    );
  }
  for (const mark of view.errors) {
    if (mark.ms < t0 || mark.ms > nowMs) continue;
    parts.push(bar(`m-error k-${mark.kind}`, 4, x(mark.ms) - 2, x(mark.ms) + 3, mark.label));
  }
  if(view.end?.target_proof!==undefined){
    const ms=eventMs(view.end);const proof=view.end.target_proof;
    if(ms>=t0&&ms<=nowMs)parts.push(bar("m-milestone",3,x(ms)-2,x(ms)+3,`native target ${proof.name} · milestone #${String(proof.milestone_seq)} · state evidence ${proof.state_evidence.map(seq=>`#${String(seq)}`).join(", ")}`));
  }
  for (let s = 0; s <= 60; s += 10) {
    const px = LABEL + (W - LABEL - 8) * (s / 60);
    parts.push(`<rect class="tick" x="${f(px)}" y="${String(H - 18)}" width="1" height="4"/>`);
    parts.push(`<text class="axis" x="${f(px - 8)}" y="${String(H - 3)}">${s === 60 ? "now" : `−${String(60 - s)}s`}</text>`);
  }
  parts.push(`<rect class="nowline" x="${String(W - 9)}" y="0" width="2" height="${String(H - 20)}"/>`);
  return `<svg class="lanes" viewBox="0 0 ${String(W)} ${String(H)}" preserveAspectRatio="none">${parts.join("")}</svg>`;
}
