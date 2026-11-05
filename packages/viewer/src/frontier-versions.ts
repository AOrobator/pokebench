import type { WorkbenchRun } from "./workbench-data.js";
// Harness versions for the story frontier. This module also runs in the browser.
//
// A harness version is one model plus the exact set of switchable features that were on (config.features
// entries with on === true; false and null both count as not on: null means the run's build did not
// record the switch as on, and a save-state start never has a verified full map). A legacy run has no
// switch map at all (see legacyRun): it joins "<model> · legacy <arm>" and is never numbered or compared.
// The version takes its arm from the earliest run that used the set: run_start.evaluation.experiment.arm,
// else the preset, else "untagged". Versions are numbered per model and arm in order of their first run.
export interface SwitchRef { readonly id: string; readonly label: string }
export type VersionFamily = "bundle" | "control" | "other" | "legacy";
export interface HarnessVersion {
  readonly id: string; readonly key: string; readonly model: string; readonly short: string; readonly arm: string; readonly family: VersionFamily;
  readonly number: number | null; readonly name: string; readonly fingerprint: string; readonly first: number;
  readonly on: readonly SwitchRef[]; readonly runs: readonly string[]; readonly builds: readonly string[];
  readonly previous: string | null; readonly added: readonly SwitchRef[]; readonly removed: readonly SwitchRef[]; readonly color: string;
}
export interface VersionIndex { readonly versions: readonly HarnessVersion[]; readonly byRun: ReadonlyMap<string, HarnessVersion> }

const ACRONYMS = new Map(["RAM", "UI", "HP", "PP", "ID", "OCR", "NPC", "NPCS", "A*", "V1", "V2", "V3"].map(w => [w, w === "NPCS" ? "NPCs" : /^V\d$/.test(w) ? w.toLowerCase() : w]));
// FEATURES titles are upper case ("RAM GAME-STATE READOUT"); the legend reads them in sentence case.
export function switchLabel(title: string): string {
  const part = (word: string): string => ACRONYMS.get(word.toUpperCase()) ?? (/[a-z]/.test(word) ? word : word.toLowerCase());
  const words = title.trim().split(/\s+/).map(word => word.split("-").map(part).join("-"));
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
// A short model name derived from the id, never a lookup table: the basename after any "/" or ":" prefix,
// lower case, without a file extension, then cut at the first size or quantisation token (a 35b, a3b, q4,
// fp8, 4bit, ud, gguf, mlx, instruct, it…), with the dots and dashes of a version number squeezed out:
// "Qwen/Qwen3.6-35B-A3B-FP8" → "qwen36", "gemma-3-27b-it" → "gemma3".
const CUT = /^(?:\d+(?:\.\d+)?[bmk]|a\d+(?:\.\d+)?b|q\d.*|iq\d.*|fp\d+|bf16|f16|int\d+|\d+bit|ud|gguf|mlx|awq|gptq|exl2|instruct|chat|it|base|hf|thinking|latest)$/;
export function shortModelName(model: string): string {
  const base = (model.split(/[/\\]/).pop() ?? model).replace(/\.(gguf|safetensors|bin)$/i, "").toLowerCase();
  const tokens = base.split(/[-_\s:]+/).filter(t => t !== "");
  const kept: string[] = [];
  for (const token of tokens) { if (kept.length > 0 && CUT.test(token)) break; kept.push(token); }
  let name = kept.join("-");
  for (;;) { const next = name.replace(/([a-z])[-.]?(\d+)\.(\d)/, "$1$2$3").replace(/([a-z])-(\d)/, "$1$2"); if (next === name) break; name = next; }
  return name === "" ? model : name;
}
// The name the header shows: the id's own spelling up to its size, quantisation or tier, so
// "deepseek/deepseek-v4.1-flash" → "DeepSeek-v4.1". The full id stays in the hover title.
const TIER = /^(?:flash|lite|mini|nano|next|pro|turbo)$/;
const FAMILY = /^(deepseek|qwen|glm)/i;
const FAMILY_SPELLING: Readonly<Record<string, string>> = { deepseek: "DeepSeek", qwen: "Qwen", glm: "GLM" };
export function displayModelName(model: string): string {
  const base = (model.split(/[/\\]/).pop() ?? model).replace(/\.(gguf|safetensors|bin)$/i, "");
  const kept: string[] = [];
  for (const token of base.split(/[-_:]+/).filter(t => t !== "")) {
    const lower = token.toLowerCase();
    if (kept.length > 0 && (CUT.test(lower) || (TIER.test(lower) && /\d/.test(kept.join(""))))) break;
    kept.push(token);
  }
  const name = kept.join("-").replace(FAMILY, family => FAMILY_SPELLING[family.toLowerCase()] ?? family);
  return name === "" ? model : name;
}
// FNV-1a over the sorted ids; four hex digits identify a switch set in tooltips and the expanded card.
function hash8(text: string): string {
  let hash = 0x811c9dc5;
  for (const ch of text) { hash ^= ch.codePointAt(0) ?? 0; hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash.toString(16).padStart(8, "0");
}
export function fingerprint(ids: readonly string[]): string { return hash8([...ids].sort().join(",")).slice(0, 4); }
// Bundle versions take warm colors, control versions cool ones, in order of their first run; other arms a
// hue hashed from the arm's own text; legacy groups a muted grey. None is the frontier gold or the human navy.
const WARM = ["#c25464", "#c16b27", "#ae4c96", "#8856b5", "#9a3b2e", "#d0742f", "#b0466f", "#7d3f8f"];
const COOL = ["#2583bd", "#208b71", "#238e9f", "#4b6fc4", "#2f8f4f", "#1d6f8a", "#5a8a2f", "#3d5f9e"];
const hue = (text: string): number => Array.from(text).reduce((sum, ch, i) => sum + (ch.codePointAt(0) ?? 0) * (i + 7), 0) % 360;
export function versionColor(family: VersionFamily, arm: string, index: number): string {
  if (family === "bundle") return WARM[index] ?? `hsl(${String((350 + index * 23) % 360)} 55% 42%)`;
  if (family === "control") return COOL[index] ?? `hsl(${String(180 + ((index * 29) % 80))} 50% 36%)`;
  if (family === "legacy") return `hsl(${String(200 + ((index * 37) % 60))} 10% ${String(42 + (index % 3) * 8)}%)`;
  return `hsl(${String((hue(arm) + index * 31) % 360)} 45% 38%)`;
}
const familyOf = (arm: string): Exclude<VersionFamily, "legacy"> => arm === "bundle" ? "bundle" : arm === "control" ? "control" : "other";
// No switch map: no configuration at all, or a run from before switches were recorded (it names no
// switchable feature as on and leaves the rest unknown).
const legacyRun = (run: WorkbenchRun): boolean => run.config === null || (!run.config.features.some(f => f.on === true) && run.config.features.some(f => f.on === null));
const UNKNOWN_MODEL = "Model not recorded";
const armOf = (run: WorkbenchRun): string => run.arm ?? run.config?.preset ?? "untagged";
const startedAt = (run: WorkbenchRun): number => { const at = Date.parse(run.started ?? ""); return Number.isNaN(at) ? Infinity : at; };
const byLabel = (a: SwitchRef, b: SwitchRef): number => a.label.localeCompare(b.label) || a.id.localeCompare(b.id);

// previous: colors already given out (version key → color), so a poll that adds runs never recolors a version.
export function harnessVersions(runs: readonly WorkbenchRun[], previous: ReadonlyMap<string, string> = new Map()): VersionIndex {
  interface Draft { key: string; model: string; arm: string; legacy: boolean; on: SwitchRef[]; runs: WorkbenchRun[] }
  const drafts = new Map<string, Draft>();
  for (const run of [...runs].sort((a, b) => startedAt(a) - startedAt(b) || a.id.localeCompare(b.id))) {
    const model = run.model ?? UNKNOWN_MODEL, legacy = legacyRun(run);
    const on = legacy ? [] : (run.config?.features ?? []).filter(f => f.on === true).map(f => ({ id: f.id, label: switchLabel(f.label) })).sort(byLabel);
    const key = legacy ? `${model}\u0000legacy\u0000${armOf(run)}` : `${model}\u0000${on.map(f => f.id).sort().join(",")}`;
    const draft = drafts.get(key);
    if (draft === undefined) drafts.set(key, { key, model, arm: armOf(run), legacy, on, runs: [run] }); else draft.runs.push(run);
  }
  // A new version takes its family's first color that no version present already holds.
  const counters = new Map<string, number>(), used = new Set([...drafts.keys()].flatMap(key => { const color = previous.get(key); return color === undefined ? [] : [color]; }));
  const colorFor = (key: string, family: VersionFamily, arm: string): string => {
    const kept = previous.get(key); if (kept !== undefined) return kept;
    let index = 0; while (used.has(versionColor(family, arm, index))) index++;
    const color = versionColor(family, arm, index); used.add(color); return color;
  };
  const named = [...drafts.values()].map(d => {
    const lane = d.model, number = d.legacy ? null : (counters.get(lane) ?? 0) + 1;
    if (number !== null) counters.set(lane, number);
    const family: VersionFamily = d.legacy ? "legacy" : familyOf(d.arm);
    const short = d.model === UNKNOWN_MODEL ? UNKNOWN_MODEL : shortModelName(d.model), ids = d.on.map(f => f.id);
    return { draft: d, short, number, family, color: colorFor(d.key, family, d.arm), name: number === null ? `${short} · legacy configuration` : `${short} · configuration v${String(number)}`, print: fingerprint(ids) };
  });
  const find = (model: string, number: number): (typeof named)[number] | undefined => named.find(n => n.draft.model === model && n.number === number);
  const versions: HarnessVersion[] = named.map(n => {
    const d = n.draft;
    const prior = n.number === null ? undefined : n.number > 1 ? find(d.model, n.number - 1) : undefined;
    const before = new Set(prior?.draft.on.map(f => f.id) ?? []), now = new Set(d.on.map(f => f.id));
    return {
      id: `hv-${hash8(d.key)}`, key: d.key, model: d.model, short: n.short, arm: d.arm, family: n.family, number: n.number, name: n.name, fingerprint: n.print, first: Math.min(...d.runs.map(startedAt)),
      on: d.on, runs: d.runs.map(r => r.id), builds: Array.from(new Set(d.runs.flatMap(r => r.config === null ? [] : [r.config.source.slice(0, 7)]))).sort(),
      previous: prior?.name ?? null, added: prior === undefined ? [] : d.on.filter(f => !before.has(f.id)), removed: prior === undefined ? [] : prior.draft.on.filter(f => !now.has(f.id)), color: n.color,
    };
  });
  const byRun = new Map<string, HarnessVersion>();
  for (const v of versions) for (const id of v.runs) byRun.set(id, v);
  return { versions, byRun };
}
// Display order: bundle versions, then control, then other arms by name, then legacy groups; each by number.
const FAMILY_ORDER: Readonly<Record<VersionFamily, number>> = { bundle: 0, control: 1, other: 2, legacy: 3 };
export function orderedVersions(versions: readonly HarnessVersion[]): HarnessVersion[] {
  return [...versions].sort((a, b) => FAMILY_ORDER[a.family] - FAMILY_ORDER[b.family] || a.arm.localeCompare(b.arm) || a.short.localeCompare(b.short) || (a.number ?? 0) - (b.number ?? 0) || a.key.localeCompare(b.key));
}
