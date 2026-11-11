// One page of the live history. An older page scans further back and leaves out what the trace
// never shows: streaming deltas and state snapshots were 90% of a turn's events and most of its
// bytes, so a page of raw events held under one turn and no tool calls.
import type { RunEvent } from "@pokebench/agent/events";

const OLDER_SCAN = 16;
const OLDER_KEEP = 4;
const OLDER_SKIPS = new Set<RunEvent["type"]>(["assistant_delta", "state"]);

export interface HistoryPage {
  // Sequence numbers read before the page's cursor.
  readonly scan: number;
  add(event: RunEvent, bytes: number): void;
  skip(seq: number): void;
  readonly events: RunEvent[];
  // The next page's bound, or null at the start of the recording.
  before(): number | null;
}

export const olderHistoryScan = (limit: number): number => limit * OLDER_SCAN;

// State snapshots can fill the read budget before a wide scan reaches its cursor.
// Halving ends at the page width, which always fit, so a heavy stretch still pages.
export const narrowerScan = (scan: number, limit: number): number | null => scan > limit ? Math.max(limit, Math.floor(scan / 2)) : null;

export function historyPage(older: boolean, limit: number, replyBytes: number, scan = older ? olderHistoryScan(limit) : limit): HistoryPage {
  const keep = older ? limit * OLDER_KEEP : limit, events: RunEvent[] = [], lengths: number[] = [];
  let payload = 0, trimmed = false, skipped: number | null = null;
  return {
    scan,
    events,
    skip(seq) { skipped ??= seq; },
    add(event, bytes) {
      if (older && OLDER_SKIPS.has(event.type)) { skipped ??= event.seq; return; }
      events.push(event); lengths.push(bytes); payload += bytes;
      while (events.length > keep || payload > replyBytes) { events.shift(); payload -= lengths.shift() ?? 0; trimmed = true; }
    },
    before() {
      const first = events[0]?.seq ?? null;
      const edge = trimmed || skipped === null ? first : first === null ? skipped : Math.min(first, skipped);
      return edge === null || edge === 0 ? null : edge;
    },
  };
}
