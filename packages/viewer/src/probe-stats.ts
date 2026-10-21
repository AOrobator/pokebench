// The numbers behind the probes page: the automatic grade of a sampled call, tallies, Fisher's exact test, the gap
// between arms with its rough range, the plain-language verdict and lane timing. Pure, so the page and tests share it.

export type Grade = "dif" | "rep" | "err" | "unk";
export interface Call { readonly tool: string; readonly args: Readonly<Record<string, unknown>> }
export interface Tally { readonly n: number; readonly dif: number; readonly rep: number; readonly err: number; readonly unk: number }
export interface Gap { readonly d: number; readonly lo: number; readonly hi: number }
export interface Verdict { readonly lead: string; readonly detail: string }
export interface LaneTiming {
  readonly state: "running" | "complete" | "stopped" | "unknown";
  readonly completed: number;
  readonly planned: number;
  readonly started: string | null;
  readonly ended: string | null;
  readonly ceilingMs: number | null;
}

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// A sample's decision key is "<tool> <JSON args>", "(text only)" or "(model error: …)".
export function parseKey(key: string): Call | null {
  if (key.startsWith("(")) return null;
  const space = key.indexOf(" ");
  const tool = space < 0 ? key : key.slice(0, space);
  let args: unknown = {};
  if (space >= 0) {
    try { args = JSON.parse(key.slice(space + 1)); } catch { args = {}; }
  }
  return { tool, args: record(args) ? args : {} };
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (record(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return v === undefined ? "null" : JSON.stringify(v);
}
const withoutCitation = (args: Readonly<Record<string, unknown>>): Record<string, unknown> => Object.fromEntries(Object.entries(args).filter(([k]) => k !== "because"));

export function sameCall(a: Call, b: Call): boolean {
  return a.tool === b.tool && canonical(withoutCitation(a.args)) === canonical(withoutCitation(b.args));
}

// Departs (differs from the call the model made in the real run), repeats it, errors, or cannot be graded.
export function grade(key: string, recorded: Call | null): Grade {
  const call = parseKey(key);
  if (call === null) return "err";
  if (recorded === null) return "unk";
  return sameCall(call, recorded) ? "rep" : "dif";
}

export function tally(grades: readonly Grade[]): Tally {
  const t = { n: grades.length, dif: 0, rep: 0, err: 0, unk: 0 };
  for (const g of grades) t[g]++;
  return t;
}

function logFactorial(n: number): number {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}
// Two-sided Fisher exact test for [[a, b], [c, d]]: the sum of every table with these margins at most as likely.
export function fisher(a: number, b: number, c: number, d: number): number {
  const n = a + b + c + d, r1 = a + b, c1 = a + c;
  if (n === 0 || r1 === 0 || c1 === 0 || r1 === n || c1 === n) return 1;
  const p = (k: number): number => Math.exp(logFactorial(r1) + logFactorial(n - r1) + logFactorial(c1) + logFactorial(n - c1) - logFactorial(n) - logFactorial(k) - logFactorial(r1 - k) - logFactorial(c1 - k) - logFactorial(n - r1 - c1 + k));
  const observed = p(a);
  let total = 0;
  for (let k = Math.max(0, c1 - (n - r1)); k <= Math.min(r1, c1); k++) {
    const q = p(k);
    if (q <= observed * (1 + 1e-7)) total += q;
  }
  return Math.min(1, total);
}
export const pOf = (on: Tally, off: Tally): number => fisher(on.dif, on.n - on.dif, off.dif, off.n - off.dif);

export function pText(p: number): string {
  if (p >= 0.995) return "p=1";
  if (p < 0.001) return "p<0.001";
  return `p=${p.toFixed(p < 0.01 ? 3 : 2)}`;
}

function wilson(k: number, n: number): [number, number] {
  const z = 1.96, p = k / n, denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom, half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}
// ON minus OFF departure rate with Newcombe's 95% range (built from each arm's Wilson interval, so 0/n and n/n
// still get a width, and the range crosses zero about when Fisher's test cannot tell the arms apart).
export function gap(on: Tally, off: Tally): Gap | null {
  if (on.n === 0 || off.n === 0) return null;
  const p1 = on.dif / on.n, p2 = off.dif / off.n, [l1, u1] = wilson(on.dif, on.n), [l2, u2] = wilson(off.dif, off.n);
  const d = p1 - p2;
  return { d, lo: Math.max(-1, d - Math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2)), hi: Math.min(1, d + Math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)) };
}

export function verdict(on: Tally, off: Tally, onName: string, offName: string): Verdict {
  if (on.n === 0 || off.n === 0) return { lead: "Waiting for samples.", detail: "" };
  const a = `${onName} ${String(on.dif)}/${String(on.n)}`, b = `${offName} ${String(off.dif)}/${String(off.n)}`;
  const d = Math.round((100 * on.dif) / on.n) - Math.round((100 * off.dif) / off.n);
  if (Math.abs(d) < 10) return { lead: "About the same.", detail: `${a} vs ${b} depart from the recorded call.` };
  const p = pOf(on, off);
  const chance = p < 0.05 ? `A gap this size is unlikely to be chance (${pText(p)}).` : `With ${String(Math.min(on.n, off.n))} samples, a gap this size could still be chance (${pText(p)}).`;
  return { lead: `${d > 0 ? onName : offName} departs more`, detail: `(${a} vs ${b}). ${chance}` };
}

const NY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
export const nyTime = (t: string | number): string => NY.format(new Date(t));

// What is next for a lane: when it finished, when it should, or the per-lane wall ceiling it will hit first.
export function laneTail(lane: LaneTiming, msPerSample: number, now: number): string {
  if (lane.state === "complete") return lane.ended === null ? "done" : `done ${nyTime(lane.ended)}`;
  if (lane.state === "stopped") return `stopped at ${String(lane.completed)}/${String(lane.planned)}`;
  if (lane.state === "unknown") return "no status yet";
  if (msPerSample <= 0) return "running";
  const eta = now + Math.max(0, lane.planned - lane.completed) * msPerSample;
  const ceiling = lane.ceilingMs === null || lane.started === null ? null : Date.parse(lane.started) + lane.ceilingMs;
  if (ceiling === null || eta <= ceiling) return `ETA ${nyTime(eta)}`;
  const reach = Math.min(lane.planned, lane.completed + Math.max(0, Math.floor((ceiling - now) / msPerSample)));
  return `ceiling ${nyTime(ceiling)} · ~${String(reach)}/${String(lane.planned)} by then`;
}
