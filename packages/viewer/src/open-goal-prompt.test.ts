// open-goal-prompt-v1 in the viewer: default OFF for the next run, and its card links a tracked
// explainer that carries the pre-registered Rustboro-before-mention diagnostic.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import { afterEach, expect, it } from "vitest";
import { FEATURES } from "@pokebench/agent/features";
import { Log, START } from "../test-support/events.js";
import { RunView } from "./model.js";
import { DEFAULT_NEXT_RUN } from "./next-run.js";
import { armPreset, parseFixedDefinition } from "./fixed-design.js";
import { FEATURE_EXPLAINERS, harnessConfig } from "./panels.js";
import { HOST, startViewer, type Viewer } from "./server.js";

const ID = "open-goal-prompt-v1";

it("starts OFF for the next run", () => {
  expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
});

it("links the open goal card to its tracked explainer with the diagnostic to watch", () => {
  expect(FEATURE_EXPLAINERS[ID]).toBe(`${ID}.html`);
  const log = new Log();
  log.add(0, { ...START, harness_features: [ID] });
  const doc = new Window().document;
  const view = new RunView();
  for (const event of log.events) view.apply(event);
  doc.body.innerHTML = harnessConfig(view, FEATURES.filter((f) => f.id === ID));
  expect(doc.querySelector(`[data-feature="${ID}"] a`)?.getAttribute("href")).toBe(`/explainers/${ID}.html`);
  const html = readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${ID}.html`, import.meta.url)), "utf8");
  expect(html).toContain(ID);
  expect(html).toContain("LAB (Rustboro City)");
  expect(html).toContain("26 of 67 runs");
  expect(html).toContain("Your goal is to play the game and make as much story progress as you can; the people in the game will tell you what to do next.");
});

const open: Viewer[] = [];
afterEach(async () => {
  while (open.length > 0) await open.pop()?.close();
});

function get(viewer: Viewer, path: string, options: { host?: string; method?: string } = {}): Promise<{ status: number; type: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: HOST, port: viewer.port, path, method: options.method ?? "GET", headers: { host: options.host ?? `${HOST}:${String(viewer.port)}` } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        resolve({ status: res.statusCode ?? 0, type: res.headers["content-type"] ?? "", body: Buffer.concat(chunks) });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

it("the viewer serves the tracked explainer byte for byte through the explainer route", async () => {
  const tracked = readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${ID}.html`, import.meta.url)));
  const root = mkdtempSync(join(tmpdir(), "pokebench-explainers-"));
  const staticDir = join(root, "packages/viewer/static"), docs = join(root, "docs/explainers");
  mkdirSync(staticDir, { recursive: true });
  mkdirSync(docs, { recursive: true });
  writeFileSync(join(docs, `${ID}.html`), tracked);
  const viewer = await startViewer({ runsRoot: join(root, "runs"), staticDir, appDir: join(root, "app"), port: 0 });
  open.push(viewer);
  const reply = await get(viewer, `/explainers/${ID}.html`);
  expect(reply.status).toBe(200);
  expect(reply.type).toContain("text/html");
  expect(reply.body.equals(tracked)).toBe(true);
  expect((await get(viewer, `/explainers/${ID}.html`, { host: "elsewhere.invalid" })).status).toBe(403);
  expect((await get(viewer, `/explainers/${ID}.html`, { method: "PUT" })).status).toBe(405);
  expect((await get(viewer, "/explainers/open-goal-prompt.html")).status).toBe(404);
});

it("the pending experiment's incumbent is exactly the bundle-v-control bundle cook arm, with only this switch off", () => {
  const raw = JSON.parse(readFileSync(fileURLToPath(new URL("../../../experiments/open-goal-prompt.json", import.meta.url)), "utf8")) as { incumbent: { id: string; features: Record<string, boolean> } & Record<string, unknown> };
  const { definition } = parseFixedDefinition(readFileSync(fileURLToPath(new URL("../../../experiments/fixed/bundle-v-control.json", import.meta.url)), "utf8"));
  const arm = armPreset(definition, "cook", "bundle");
  const without = (value: Record<string, unknown>, ...keys: string[]): Record<string, unknown> => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
  expect(without(raw.incumbent, "id", "features")).toEqual(without(arm, "id", "features"));
  expect(arm).toMatchObject({ start: { kind: "save_state" }, limits: { maxWallMs: 7_200_000 } });
  expect(raw.incumbent.features[ID]).toBe(false);
  expect(arm.features[ID]).toBe(true);
  expect(without(raw.incumbent.features, ID)).toEqual(without(arm.features, ID, "story-goal-player-name-v1", "cut-off-reply-feedback-v1", "trainer-sight-check-v2", "auto-talk-v2", "map-wide-triggers-v1", "drought-battle-heal-hold-v1", "rejected-movement-step-v1", "observed-field-dialogue-v1", "shop-interface-v1", "progress-aware-cycles-v1", "exp-next-level-v1", "pokedex-own-v1", "exp-earned-ledger-v1", "leader-attempt-ledger-v1", "seen-trainers-ledger-v1", "party-coverage-v1", "said-type-matches-v1", "caught-dex-input-v1", "gym-door-label-v1", "mart-stock-readout-v1", "menu-refusal-recovery-v1", "pending-field-dialogue-v1", "story-battle-heal-first-v1", "navigation-refusal-reasons-v3", "short-cycle-fixed-point-v1", "navigation-tool-use-guard-v1", "semantic-current-map-feedback-v1", "party-item-confirmation-v1", "yes-no-answer-readout-v1", "field-move-gates-v1","exit-labels-v3", "auto-talk-v1", "duplicate-turn-collapse-v1", "original-speed-pacing-v1", "observed-instructions-v1", "evolution-decision-v1", "safe-navigation-strides-v1", "ineffective-navigation-v2", "supervisor-briefing-v2", "reachable-story-guidance-v1", "text-only-supervisor-v2", "battle-decision-ready-v1", "faced-interaction-history-v1", "scripted-place-guidance-v1", "trigger-script-loop-v1", "battle-effective-damage-v1", "visited-terrain-navigation-v1", "deterministic-warp-navigation-v1", "context-token-budget-v1", "stale-story-goal-v2", "briefing-repeat-count-v1", "navigate-already-here-v1", "fixed-point-breaker-v1", "story-character-stall-gate-v1", "positive-supervisor-v1", "unfinished-activity-v1", "exit-labels-v2", "heal-before-trainers-v2", "gym-heal-warning-v1", "respawn-readout-v1", "trainer-sight-check-v1", "caught-nickname-prompt-v1", "fail-open-input-v1", "whiteout-healed-v1", "gym-readiness-readout-v1", "same-target-no-progress-v1", "story-progress-clock-v1", "story-battle-heal-gate-v1"));
});

it("every diagnostic number on the explainer comes from the tracked per-run manifest", () => {
  interface Row { cohort: string; turns: number; game_first_rustboro_turn: number | null; rustboro_turns_before_game: number; gym_turns_before_game: number; goal_named_at_turn_1: boolean; lab_in_rustboro_turns: number; prompt_names_rustboro: boolean }
  const rows = JSON.parse(readFileSync(fileURLToPath(new URL("../../../docs/experiments/open-goal-prompt/manifest.json", import.meta.url)), "utf8")) as Row[];
  const html = readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${ID}.html`, import.meta.url)), "utf8");
  const sum = (rs: Row[], f: (r: Row) => number): number => rs.reduce((n, r) => n + f(r), 0);
  const named = (rs: Row[]): Row[] => rs.filter((r) => r.rustboro_turns_before_game > 0);
  expect(rows.every((r) => r.prompt_names_rustboro && r.game_first_rustboro_turn === null)).toBe(true);
  expect(html).toContain(`${String(rows.length)} runs, ${sum(rows, (r) => r.turns).toLocaleString("en-US")} turns`);
  expect(html).toContain(`<strong>${String(named(rows).length)} of ${String(rows.length)} runs</strong> (${String(sum(rows, (r) => r.rustboro_turns_before_game))} turns)`);
  for (const cohort of ["cook-bundle", "cook-control", "factorial-clockset", "finals-boot", "dryrun-clockset"]) {
    const rs = rows.filter((r) => r.cohort === cohort);
    expect(html, cohort).toContain(`${String(named(rs).length)}/${String(rs.length)} · ${String(sum(rs, (r) => r.rustboro_turns_before_game))} turns`);
  }
  const labRuns = rows.filter((r) => r.lab_in_rustboro_turns > 0);
  expect(html).toContain(`${String(labRuns.length)} runs, ${String(sum(labRuns, (r) => r.lab_in_rustboro_turns))} turns`);
  const gymRuns = rows.filter((r) => r.gym_turns_before_game > 0);
  expect(html).toContain(`${String(gymRuns.length)} of ${String(rows.length)} runs; ${String(rows.filter((r) => r.goal_named_at_turn_1).length)} runs named the goal's gym or Rustboro at turn 1`);
  const bundle = rows.filter((r) => r.cohort === "cook-bundle");
  expect(html).toContain(`Baseline: bundle cook runs, ${String(named(bundle).length)} of ${String(bundle.length)} runs, ${String(sum(bundle, (r) => r.rustboro_turns_before_game))} turns.`);
});

it("enables exploratory waypoint guidance only in future bundle treatments",()=>{
 const id="navigation-refusal-reasons-v3";
 for(const name of ["bundle-v-control","bundle-cook-1h","whole-map-cook-1h"]){
  const {definition}=parseFixedDefinition(readFileSync(fileURLToPath(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url)),"utf8"));
  expect(armPreset(definition,"cook","control").features[id],name).toBe(false);
  expect(armPreset(definition,"cook","bundle").features[id],name).toBe(true);
 }
});
