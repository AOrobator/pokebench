import { esc, eventMs } from "./format.js";
import { FRAME_MS } from "./gba.js";
import { RunView, type Button } from "./model.js";

export const WINDOW_MS = 60_000;
export const LANES = ["thinking", "tool calls", "presses", "milestones", "errors"] as const;

// Time the live strip is drawn ahead of now, so it can glide without being rebuilt.
export const LEAD_MS = 30_000;
const RECENTER_MS = LEAD_MS * 0.9;
const DRIFT_MS = 200;
const FORGET_MS = 2 * WINDOW_MS;

const W = 1000;
const AXIS = 20;
const LANE = 150 / LANES.length;

const f = (n: number): string => n.toFixed(1);
const BUTTON_LABELS: Record<Button, string> = {
  UP: "↑", DOWN: "↓", LEFT: "←", RIGHT: "→",
  A: "A", B: "B", L: "L", R: "R", START: "START", SELECT: "SELECT",
};

function bar(cls: string, lane: number, a: number, b: number, title: string, fill = 0.6, minWidth = 3): string {
  const top = lane * LANE + (LANE * (1 - fill)) / 2;
  return `<rect class="${cls}" role="img" aria-label="${esc(title)}" x="${f(a)}" y="${f(top)}" width="${f(Math.max(minWidth, b - a))}" height="${f(LANE * fill)}"><title>${esc(title)}</title></rect>`;
}

type Lanes = readonly (typeof LANES[number])[];

// Marks for the 60 s before `anchorMs` plus `leadMs` after it, one window to the plot's width.
function stripHtml(view: RunView, anchorMs: number, leadMs: number, visible: Lanes): string {
  const rows=LANE*visible.length;
  const span=WINDOW_MS+leadMs;
  const wide=W*(span/WINDOW_MS);
  const nowMs=anchorMs+leadMs;
  const draw=(cls:string,lane:number,a:number,b:number,title:string,fill=0.6):string=>{
    const name=LANES[lane];const slot=name===undefined?-1:visible.indexOf(name);
    return slot<0?"":bar(cls,slot,a,b,title,fill);
  };
  const t0 = anchorMs - WINDOW_MS;
  const x = (ms: number): number => W * ((Math.min(Math.max(ms, t0), nowMs) - t0) / WINDOW_MS);
  const parts: string[] = [];
  const texts: string[] = [];
  for (const pause of view.control.pauses) {
    const end = pause.endMs ?? nowMs;
    if (end < t0 || pause.startMs > nowMs) continue;
    const a = x(pause.startMs), b = x(end);
    const title = pause.endMs === null ? "paused (operator)" : `paused ${String(Math.round((end - pause.startMs) / 1000))}s (operator)`;
    parts.push(`<rect class="m-paused" x="${f(a)}" y="0" width="${f(Math.max(3, b - a))}" height="${f(rows)}"><title>${title}</title></rect>`);
  }
  for (const span of view.thinkingSpans) {
    const end = span.endMs ?? nowMs;
    if (end < t0 || span.startMs > nowMs) continue;
    const title = span.endMs === null ? "thinking" : `thinking ${((end - span.startMs) / 1000).toFixed(1)}s`;
    parts.push(draw(span.endMs === null ? "m-think open" : "m-think", 0, x(span.startMs), x(end), title));
  }
  for (const span of view.toolSpans) {
    const end = span.endMs ?? nowMs;
    if (end < t0 || span.startMs > nowMs) continue;
    parts.push(draw(span.error ? "m-tool err" : "m-tool", 1, x(span.startMs), x(end), span.name));
  }
  const pressLane = visible.indexOf("presses");
  const labelPress = (buttons: readonly Button[], start: number, end: number): void => {
    if (pressLane < 0) return;
    const label = buttons.map(button => BUTTON_LABELS[button]).join("+");
    const left = (((x(start) + x(end)) / 2) / wide) * 100;
    const top = ((pressLane * LANE + LANE / 2) / rows) * 100;
    texts.push(`<span class="press-label" style="left:${f(left)}%;top:${f(top)}%" aria-hidden="true">${esc(label)}</span>`);
  };
  // Native input changes are emitted after the request, in recording sequence.
  // Their server timestamps describe execution; event timestamps describe delivery.
  const native = view.nativeActions.filter(action => action.kind === "native_input");
  let nativeIndex = 0;
  for (const [pressIndex, press] of view.presses.entries()) {
    const nextSeq = view.presses[pressIndex + 1]?.seq ?? Infinity;
    while (nativeIndex < native.length && (native[nativeIndex]?.seq ?? Infinity) <= press.seq) nativeIndex++;
    const inputs = [];
    while (nativeIndex < native.length && (native[nativeIndex]?.seq ?? Infinity) < nextSeq) {
      const input = native[nativeIndex++];
      if (input !== undefined) inputs.push(input);
    }
    if (press.endMs === undefined && inputs.length > 0) {
      let firstStart: number | undefined;
      let lastEnd: number | undefined;
      let labelButtons: readonly Button[] = [];
      for (const [index, input] of inputs.entries()) {
        const next = inputs[index + 1];
        const raw = input.details["buttons"];
        if (next === undefined || !Array.isArray(raw)) continue;
        const buttons = raw.filter((button): button is Button => typeof button === "string" && Object.hasOwn(BUTTON_LABELS, button));
        const button = buttons[0];
        const start = input.server_timestamp * 1000;
        const end = Math.min(next.server_timestamp * 1000, nowMs);
        if (button === undefined || end <= start || end < t0 || start > nowMs || pressLane < 0) continue;
        // One mark for simultaneous keys; do not paint a second key over the first.
        parts.push(bar(`m-press b-${button}`, pressLane, x(start), x(end), `${buttons.join("+")} · native input · ${String(next.frame - input.frame)}f`, 0.5, 0.5));
        if (button !== labelButtons[0]) {
          if (firstStart !== undefined && lastEnd !== undefined) labelPress(labelButtons, firstStart, lastEnd);
          firstStart = start;
          labelButtons = [button];
        }
        lastEnd = end;
      }
      if (firstStart !== undefined && lastEnd !== undefined) labelPress(labelButtons, firstStart, lastEnd);
      continue;
    }
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
    if(event.type==="dialogue_auto_advance"){
      const ms=eventMs(event);if(ms<t0||ms>nowMs)continue;
      parts.push(bar("m-tool",1,x(ms)-2,x(ms)+3,`Dialogue auto-advanced · B ×${String(event.auto_presses)} · ${String(event.pages.length)} pages · stopped: ${event.stop.replaceAll("_"," ")}${event.dropped.length===0?"":` · ${String(event.dropped.length)} inputs not sent`}`,0.5));
      continue;
    }
    if(event.type==="ledger_context"&&event.instruction_goals!==undefined)continue;
    if(event.type!=="decision_input"&&event.type!=="navigation_context"&&event.type!=="ledger_context"&&event.type!=="milestone_hint")continue;
    const ms=eventMs(event);if(ms<t0||ms>nowMs)continue;
    const title=event.type==="navigation_context"?`Navigation memory delivered · ${String(event.evidence.length)} references`:event.type==="ledger_context"?`Instruction ledger delivered · ${String(event.evidence.length)} references`:event.type==="milestone_hint"?`Milestone hint sent · ${event.milestone}`:`snapshot for decision ${String(event.decision_turn)} · state #${String(event.state_seq)}`;
    parts.push(bar("m-tool",1,x(ms)-2,x(ms)+3,title,0.5));
  }
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
  for (const mark of view.errors) {
    if (mark.ms < t0 || mark.ms > nowMs) continue;
    parts.push(draw(`m-error k-${mark.kind}`, 4, x(mark.ms) - 2, x(mark.ms) + 3, mark.label));
  }
  if(view.end?.target_proof!==undefined){
    const ms=eventMs(view.end);const proof=view.end.target_proof;
    if(ms>=t0&&ms<=nowMs)parts.push(draw("m-milestone",3,x(ms)-2,x(ms)+3,`native target ${proof.name} · milestone #${String(proof.milestone_seq)} · state evidence ${proof.state_evidence.map(seq=>`#${String(seq)}`).join(", ")}`));
  }
  return `<svg class="lanes" viewBox="0 0 ${f(wide)} ${f(rows)}" preserveAspectRatio="none">${parts.join("")}</svg><div class="lanes-text">${texts.join("")}</div>`;
}

// Labels size their own column, so a mark clips a few pixels past the widest one at any width.
function shell(visible: Lanes, leadMs: number, strip: string): string {
  const rows = LANE * visible.length;
  const high = rows + AXIS;
  const zebra = visible.map((_, i) => `<rect class="lane${i % 2 === 0 ? "" : " alt"}" x="0" y="${f(i * LANE)}" width="${String(W)}" height="${f(LANE)}"/>`);
  const axis: string[] = [];
  const labels: string[] = [];
  for (let s = 0; s <= 60; s += 10) {
    const share = s / 60;
    axis.push(`<rect class="tick" x="${f(Math.min(W - 1, W * share))}" y="${f(rows + 2)}" width="1" height="4"/>`);
    labels.push(`<span class="axis" style="left:${f(share * 100)}%;top:${f(((rows + 11) / high) * 100)}%">${s === 60 ? "now" : `−${String(60 - s)}s`}</span>`);
  }
  axis.push(`<rect class="nowline" x="${String(W - 2)}" y="0" width="2" height="${f(rows)}"/>`);
  const lanesShare = `${f((rows / high) * 100)}%`;
  // The SVG stretches to the panel; text sits in HTML so glyphs keep their shape.
  return `<div class="lanes-wrap"><svg class="lanes lanes-zebra" viewBox="0 0 ${String(W)} ${f(high)}" preserveAspectRatio="none">${zebra.join("")}</svg><div class="lanes-labels" style="height:${lanesShare}">${visible.map(name => `<span class="lab">${name}</span>`).join("")}</div><div class="lanes-plot"><div class="lanes-clip" style="height:${lanesShare}"><div class="lanes-strip" style="width:${f(((WINDOW_MS + leadMs) / WINDOW_MS) * 100)}%">${strip}</div></div><svg class="lanes" viewBox="0 0 ${String(W)} ${f(high)}" preserveAspectRatio="none">${axis.join("")}</svg><div class="lanes-text">${labels.join("")}</div></div></div>`;
}

// Swimlanes over the 60 s before `nowMs` (wall clock live, the cursor in replay).
export function lanesSvg(view: RunView, nowMs: number, visible: Lanes = LANES): string {
  return shell(visible, 0, stripHtml(view, nowMs, 0, visible));
}

export interface LaneAnimation {
  currentTime: unknown;
  playbackRate: number;
  play(): void;
  pause(): void;
}
export type LaneAnimator = (element: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) => LaneAnimation;

// Glides the strip on the compositor, so page work cannot stutter it. Marks only rebuild
// when they change or the strip recenters; a position correction needs real drift.
export class LaneMotion {
  private strip: HTMLElement | null = null;
  private animation: LaneAnimation | null = null;
  private anchorMs = Number.NaN;
  private rate = Number.NaN;
  private marks = "";
  constructor(private readonly root: HTMLElement, private readonly animate?: LaneAnimator) {}

  render(view: RunView, nowMs: number, rate: number): void {
    if (this.strip === null) {
      this.root.innerHTML = shell(LANES, LEAD_MS, "");
      this.strip = this.root.querySelector<HTMLElement>(".lanes-strip");
    }
    const strip = this.strip;
    if (strip === null) return;
    const recenter = !(nowMs >= this.anchorMs && nowMs <= this.anchorMs + RECENTER_MS);
    if (recenter) this.anchorMs = nowMs;
    const marks = stripHtml(view, this.anchorMs, LEAD_MS, LANES);
    if (marks !== this.marks) {
      this.marks = marks;
      strip.innerHTML = marks;
    }
    const shift = nowMs - this.anchorMs;
    const travel = (LEAD_MS / (WINDOW_MS + LEAD_MS)) * 100;
    if (this.animate === undefined) {
      strip.style.transform = `translateX(-${f((shift / LEAD_MS) * travel)}%)`;
      return;
    }
    this.animation ??= this.animate(strip, [{ transform: "translateX(0)" }, { transform: `translateX(-${String(travel)}%)` }], { duration: LEAD_MS, easing: "linear", fill: "both" });
    const animation = this.animation;
    const at = animation.currentTime;
    if (recenter || rate !== this.rate || typeof at !== "number" || Math.abs(at - shift) > DRIFT_MS) animation.currentTime = shift;
    if (rate === this.rate) return;
    this.rate = rate;
    if (rate === 0) {
      animation.pause();
      return;
    }
    animation.playbackRate = rate;
    animation.play();
  }
}

// The live timeline's own view: folded once per event, independent of the bounded Agent
// Trace window, so paging or holding that list cannot empty it.
export class TimelineFeed {
  readonly view = new RunView();
  constructor(start: RunView["start"]) {
    this.view.start = start;
    if (start !== null) this.view.startMs = eventMs(start);
  }

  add(events: readonly Parameters<RunView["apply"]>[0][]): void {
    const fresh = this.view.events.length === 0;
    for (const event of events) this.view.apply(event);
    // A first page opens mid-run, so what it derives restates old progress. Those marks stay as repeat guards, off the window.
    if (fresh && events[0] !== undefined && events[0].seq > 0) for (const mark of this.view.milestones) if (mark.derived === true) mark.ms = 0;
    const newest = this.view.lastMs;
    const oldest = this.view.events[0];
    if (newest !== null && oldest !== undefined && newest - eventMs(oldest) > 2 * FORGET_MS) this.view.forgetBefore(newest - FORGET_MS);
  }
}
