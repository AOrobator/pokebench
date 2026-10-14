import { esc, eventMs } from "./format.js";
import { FRAME_MS } from "./gba.js";
import type { Button, RunView } from "./model.js";

export const WINDOW_MS = 60_000;
export const LANES = ["thinking", "tool calls", "presses", "milestones", "errors"] as const;

const W = 1000;
const H = 170;
const LABEL = 110;
const LANE = (H - 20) / LANES.length;

const f = (n: number): string => n.toFixed(1);
const BUTTON_LABELS: Record<Button, string> = {
  UP: "↑", DOWN: "↓", LEFT: "←", RIGHT: "→",
  A: "A", B: "B", L: "L", R: "R", START: "START", SELECT: "SELECT",
};

function bar(cls: string, lane: number, a: number, b: number, title: string, fill = 0.6): string {
  const top = lane * LANE + (LANE * (1 - fill)) / 2;
  return `<rect class="${cls}" role="img" aria-label="${esc(title)}" x="${f(a)}" y="${f(top)}" width="${f(Math.max(3, b - a))}" height="${f(LANE * fill)}"><title>${esc(title)}</title></rect>`;
}

// Swimlanes over the 60 s before `nowMs` (wall clock live, the cursor in replay).
export function lanesSvg(view: RunView, nowMs: number, visible: readonly (typeof LANES[number])[] = LANES): string {
  const H=20+LANE*visible.length;
  const draw=(cls:string,lane:number,a:number,b:number,title:string,fill=0.6):string=>{
    const name=LANES[lane];const slot=name===undefined?-1:visible.indexOf(name);
    return slot<0?"":bar(cls,slot,a,b,title,fill);
  };
  const t0 = nowMs - WINDOW_MS;
  const x = (ms: number): number => LABEL + (W - LABEL - 8) * ((Math.max(ms, t0) - t0) / WINDOW_MS);
  const parts: string[] = [];
  visible.forEach((name, i) => {
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
    parts.push(draw(span.endMs === null ? "m-think open" : "m-think", 0, x(span.startMs), x(end), `thinking ${seconds}s`));
  }
  for (const span of view.toolSpans) {
    const end = span.endMs ?? nowMs;
    if (end < t0 || span.startMs > nowMs) continue;
    parts.push(draw(span.error ? "m-tool err" : "m-tool", 1, x(span.startMs), x(end), span.name));
  }
  const pressLabels: string[] = [];
  const pressLane = visible.indexOf("presses");
  const labelPress = (buttons: readonly Button[], start: number, end: number): void => {
    if (pressLane < 0) return;
    const label = buttons.map(button => BUTTON_LABELS[button]).join("+");
    const halfWidth = label.length * 3.5 + 4;
    const cx = Math.min(W - 8 - halfWidth, Math.max(LABEL + halfWidth, (x(start) + x(end)) / 2));
    pressLabels.push(`<text class="press-label" x="${f(cx)}" y="${f(pressLane * LANE + LANE / 2)}" text-anchor="middle" dominant-baseline="central" aria-hidden="true">${esc(label)}</text>`);
  };
  for (const press of view.presses) {
    const step = (press.hold + press.release) * FRAME_MS;
    press.buttons.forEach((button, i) => {
      const start = press.endMs === undefined ? press.ms + i * step : press.ms;
      const end = press.endMs ?? start + step;
      if (end < t0 || start > nowMs) return;
      const title = `${button} hold ${String(press.hold)}f${press.assumed ? " (assumed)" : ""}${press.walking ? " · walking requested" : press.automaticRunning ? " · running requested where permitted; actual keys in native input history" : ""}`;
      parts.push(draw(`m-press b-${button}`, 2, x(start), x(end), title, 0.5));
      if (press.endMs === undefined) labelPress([button], start, end);
    });
    if (press.endMs !== undefined && press.endMs >= t0 && press.ms <= nowMs) {
      labelPress(press.buttons, press.ms, press.endMs);
    }
  }
  for(const event of view.events){
    if(event.type!=="decision_input"&&event.type!=="wait_input"&&event.type!=="navigation_context")continue;
    const ms=eventMs(event);if(ms<t0||ms>nowMs)continue;
    const title=event.type==="navigation_context"?`Navigation memory delivered · ${String(event.evidence.length)} references`:event.type==="decision_input"?`snapshot for decision ${String(event.decision_turn)} · state #${String(event.state_seq)}`:`WAIT ${String(event.duration_ms)} ms (host time)`;
    parts.push(bar(event.type!=="wait_input"?"m-tool":"m-press",event.type!=="wait_input"?1:2,x(ms)-2,x(ms)+3,title,0.5));
  }
  // Draw labels above every duration bar so later presses cannot paint over them.
  parts.push(...pressLabels);
  for (const milestone of view.milestones) {
    if (milestone.ms < t0 || milestone.ms > nowMs) continue;
    const cx = x(milestone.ms);
    const lane=visible.indexOf("milestones");
    if(lane<0)continue;
    const cy = lane * LANE + LANE / 2;
    parts.push(
      `<path class="m-milestone" d="M${f(cx)} ${f(cy - 9)}L${f(cx + 7)} ${f(cy)}L${f(cx)} ${f(cy + 9)}L${f(cx - 7)} ${f(cy)}Z"><title>${esc(milestone.name)}${milestone.derived === true ? ` · recovered · evidence ${milestone.evidence?.map(seq=>`#${String(seq)}`).join(", ") ?? `#${String(milestone.seq)}`} · first observation (upper bound)` : ""}</title></path>`,
    );
  }
  for(const choice of view.battleChoices){
    const ms=choice.recorded_ms;const lane=visible.indexOf("presses");
    if(ms<t0||ms>nowMs||lane<0)continue;
    const title=`Battle ${String(choice.battle)} turn ${String(choice.battle_turn)} · ${"species" in choice.actor?choice.actor.species:"Trainer"} chose ${choice.move?.name??choice.action} (${choice.origin}) · frame ${String(choice.frame)} · execution unobserved`;
    parts.push(draw("m-press",2,x(ms)-2,x(ms)+3,title,0.9));
  }
  for(const action of view.nativeActions.filter(entry=>entry.kind!=="native_input")) {
    const ms=action.server_timestamp*1000;const lane=visible.indexOf("milestones");
    if(ms<t0||ms>nowMs||lane<0)continue;
    const title=`${action.kind.replaceAll("_"," ")} · ${JSON.stringify(action.details)} · frame ${String(action.frame)} (first observed)`;
    parts.push(`<circle class="m-milestone m-activity" cx="${f(x(ms))}" cy="${f(lane*LANE+LANE/2)}" r="3"><title>${esc(title)}</title></circle>`);
  }
  for (const activity of view.activities) {
    const ms=eventMs(activity); const lane=visible.indexOf("milestones");
    if(ms<t0||ms>nowMs||lane<0)continue;
    const pokemon=activity.pokemon;
    const detail=pokemon===undefined?"":` · ${pokemon.species} Lv${String(pokemon.from_level)}→${String(pokemon.to_level)}`;
    const title=`${activity.kind.replaceAll("_"," ")} ×${String(activity.count)}${detail} · evidence ${activity.evidence.map(seq=>`#${String(seq)}`).join(", ")} · first observation (upper bound)`;
    parts.push(`<circle class="m-milestone m-activity" cx="${f(x(ms))}" cy="${f(lane*LANE+LANE/2)}" r="4"><title>${esc(title)}</title></circle>`);
  }
  for (const mark of view.errors) {
    if (mark.ms < t0 || mark.ms > nowMs) continue;
    parts.push(draw(`m-error k-${mark.kind}`, 4, x(mark.ms) - 2, x(mark.ms) + 3, mark.label));
  }
  if(view.end?.target_proof!==undefined){
    const ms=eventMs(view.end);const proof=view.end.target_proof;
    if(ms>=t0&&ms<=nowMs)parts.push(draw("m-milestone",3,x(ms)-2,x(ms)+3,`native target ${proof.name} · milestone #${String(proof.milestone_seq)} · state evidence ${proof.state_evidence.map(seq=>`#${String(seq)}`).join(", ")}`));
  }
  for (let s = 0; s <= 60; s += 10) {
    const px = LABEL + (W - LABEL - 8) * (s / 60);
    parts.push(`<rect class="tick" x="${f(px)}" y="${String(H - 18)}" width="1" height="4"/>`);
    parts.push(`<text class="axis" x="${f(px - 8)}" y="${String(H - 3)}">${s === 60 ? "now" : `−${String(60 - s)}s`}</text>`);
  }
  parts.push(`<rect class="nowline" x="${String(W - 9)}" y="0" width="2" height="${String(H - 20)}"/>`);
  return `<svg class="lanes" viewBox="0 0 ${String(W)} ${String(H)}" preserveAspectRatio="none">${parts.join("")}</svg>`;
}
