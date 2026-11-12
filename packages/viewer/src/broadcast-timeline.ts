// The broadcast page's model: given a moment of the run, what is on screen.
import type { BroadcastItem, BroadcastMon, BroadcastRates, CommentaryLine } from "./broadcast-feed.js";

export const LANE_SECONDS = 60;
const TAIL_CHARS = 900;

type Of<K extends BroadcastItem["k"]> = Extract<BroadcastItem, { k: K }>;
export interface BroadcastView {
  readonly where: string | null;
  readonly foe: string | null;
  readonly party: readonly BroadcastMon[];
  readonly badges: readonly string[];
  readonly frame: string | null;
  // From the thought's first words to the next turn's thought (null while it is still the newest).
  readonly think: { readonly turn: number; readonly text: string; readonly start: number; readonly end: number | null } | null;
  readonly action: { readonly name: string; readonly detail: string } | null;
  readonly cost: number | null;
  readonly caption: string | null;
  readonly presses: readonly Of<"press">[];
  readonly tools: readonly Of<"tool">[];
  readonly miles: readonly Of<"mile">[];
}

// How many entries have t at or before the given moment.
function upTo(list: readonly { readonly t: number }[], t: number): number {
  let low = 0, high = list.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((list[middle]?.t ?? Infinity) <= t) low = middle + 1; else high = middle;
  }
  return low;
}
const last = <T extends { readonly t: number }>(list: readonly T[], t: number): T | null => list[upTo(list, t) - 1] ?? null;
const windowOf = <T extends { readonly t: number }>(list: readonly T[], t: number): readonly T[] => list.slice(upTo(list, t - LANE_SECONDS - 1e-9), upTo(list, t));

export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 3600))}:${String(Math.floor(s % 3600 / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const HOLD = 0.15, REACH = 0.85, LIVE_SPAN_S = 20;
// How far down a long thought the panel is at t: it holds at the top, then scrolls evenly to reach the end before
// the next thought replaces it. A function of t alone, so a rendered frame is the same every time.
export function scrollFraction(t: number, start: number, end: number | null): number {
  const span = (end ?? start + LIVE_SPAN_S) - start;
  if (!(span > 0)) return 1;
  return Math.min(1, Math.max(0, (t - start - HOLD * span) / ((REACH - HOLD) * span)));
}

export function thinkingTail(text: string, chars = TAIL_CHARS): string[] {
  let body = text.trim().replace(/\n\s*\n+/g, "\n");
  if (body.length > chars) { body = body.slice(-chars); body = body.slice(body.search(/\s/) + 1); }
  return body.split("\n").map(line => line.trim()).filter(line => line !== "");
}

export class BroadcastTimeline {
  private readonly states: Of<"state">[] = [];
  private readonly frames: Of<"frame">[] = [];
  private readonly thoughts: (Of<"think"> | Of<"thought">)[] = [];
  private readonly turns: Of<"turn">[] = [];
  private readonly toolList: Of<"tool">[] = [];
  private readonly pressList: Of<"press">[] = [];
  private readonly mileList: Of<"mile">[] = [];
  private readonly spent: { t: number; input: number; output: number; cacheRead: number }[] = [];
  private readonly paid: Of<"usd">[] = [];
  private ended: number | null = null;

  get end(): number | null { return this.ended; }

  add(items: readonly BroadcastItem[]): void {
    for (const item of items) {
      if (item.k === "state") this.states.push(item);
      else if (item.k === "frame") this.frames.push(item);
      else if (item.k === "think" || item.k === "thought") this.thoughts.push(item);
      else if (item.k === "turn") this.turns.push(item);
      else if (item.k === "tool") this.toolList.push(item);
      else if (item.k === "press") this.pressList.push(item);
      else if (item.k === "mile") this.mileList.push(item);
      else if (item.k === "end") this.ended = item.t;
      else if (item.k === "usd") this.paid.push(item);
      else {
        const before = this.spent.at(-1) ?? { input: 0, output: 0, cacheRead: 0 };
        this.spent.push({ t: item.t, input: before.input + item.input, output: before.output + item.output, cacheRead: before.cacheRead + item.cacheRead });
      }
    }
  }

  private thinkAt(t: number): BroadcastView["think"] {
    const newest = upTo(this.thoughts, t) - 1, item = this.thoughts[newest];
    if (item === undefined) return null;
    const pieces: string[] = [];
    let start = item.t;
    for (let index = newest; index >= 0; index -= 1) {
      const piece = this.thoughts[index];
      if (piece === undefined || piece.turn !== item.turn) break;
      pieces.unshift(piece.d);
      start = piece.t;
      if (piece.k === "thought") break;
    }
    const next = this.thoughts.slice(newest + 1).find(piece => piece.turn !== item.turn);
    return { turn: item.turn, text: pieces.join(""), start, end: next?.t ?? null };
  }

  // Recorded dollars, when the run has them, beat a price worked out from tokens.
  private costAt(t: number, rates: BroadcastRates | null): number | null {
    if (this.paid.length > 0) return last(this.paid, t)?.usd ?? 0;
    if (rates === null) return null;
    const used = last(this.spent, t);
    return used === null ? 0 : (used.input * rates.input + used.output * rates.output + used.cacheRead * rates.cacheRead) / 1_000_000;
  }

  view(t: number, lines: readonly CommentaryLine[], rates: BroadcastRates | null): BroadcastView {
    const state = last(this.states, t), tool = last(this.toolList, t), turn = last(this.turns, t)?.turn ?? null;
    return {
      where: state?.where ?? null, foe: state?.foe ?? null, party: state?.party ?? [], badges: state?.badges ?? [],
      frame: last(this.frames, t)?.f ?? null,
      think: this.thinkAt(t),
      action: tool === null ? null : { name: tool.name, detail: tool.detail },
      cost: this.costAt(t, rates),
      caption: lines.find(line => line.turn === turn && line.t <= t)?.text ?? null,
      presses: windowOf(this.pressList, t), tools: windowOf(this.toolList, t), miles: windowOf(this.mileList, t),
    };
  }
}
