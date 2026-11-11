// What the viewer sends the /broadcast page: a run's log cut down to what the page shows, as an append-only list.
export interface BroadcastMon { readonly name: string | null; readonly level: number | null; readonly hp: number | null; readonly maxHp: number | null }
export type BroadcastItem =
  | { readonly k: "turn"; readonly t: number; readonly turn: number }
  | { readonly k: "think"; readonly t: number; readonly turn: number; readonly d: string }
  | { readonly k: "thought"; readonly t: number; readonly turn: number; readonly d: string }
  | { readonly k: "tool"; readonly t: number; readonly turn: number; readonly name: string; readonly detail: string }
  | { readonly k: "press"; readonly t: number; readonly b: readonly string[] }
  | { readonly k: "frame"; readonly t: number; readonly f: string }
  | { readonly k: "state"; readonly t: number; readonly where: string | null; readonly foe: string | null; readonly badges: readonly string[]; readonly party: readonly BroadcastMon[] }
  | { readonly k: "mile"; readonly t: number; readonly name: string }
  | { readonly k: "use"; readonly t: number; readonly input: number; readonly output: number; readonly cacheRead: number; readonly cacheWrite: number }
  // Dollars spent so far, as the model's gateway recorded them.
  | { readonly k: "usd"; readonly t: number; readonly usd: number }
  | { readonly k: "end"; readonly t: number };

export interface BroadcastHeader { readonly run: string; readonly model: string; readonly started: string; readonly kind: "boot" | "save"; readonly save: string | null }
export interface CommentaryLine { readonly turn: number; readonly t: number; readonly text: string; readonly wav: string; readonly said?: number | null }
// USD per million tokens.
export interface BroadcastRates { readonly input: number; readonly output: number; readonly cacheRead: number }
export interface BroadcastResponse {
  readonly header: BroadcastHeader;
  readonly items: readonly BroadcastItem[];
  readonly next: number;
  readonly ended: boolean;
  readonly commentary: readonly CommentaryLine[];
  readonly rates: BroadcastRates | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const KINDS: ReadonlySet<unknown> = new Set(["turn", "think", "thought", "tool", "press", "frame", "state", "mile", "use", "usd", "end"]);

// The server built these from validated events; the check catches a stale page or a proxy's error body.
export function parseBroadcast(value: unknown): BroadcastResponse {
  const bad = (what: string): Error => new Error(`broadcast feed: ${what}`);
  if (!isRecord(value)) throw bad("not an object");
  const { header, items, next, ended, commentary, rates } = value;
  if (!isRecord(header) || typeof header.run !== "string" || typeof header.model !== "string" || typeof header.started !== "string") throw bad("bad header");
  if (!Array.isArray(items) || !items.every(item => isRecord(item) && KINDS.has(item.k) && typeof item.t === "number")) throw bad("bad items");
  if (typeof next !== "number" || typeof ended !== "boolean" || !Array.isArray(commentary)) throw bad("bad cursor");
  if (rates !== null && !isRecord(rates)) throw bad("bad rates");
  return value as unknown as BroadcastResponse;
}
