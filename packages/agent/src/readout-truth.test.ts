import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { SERVER_FEATURES, SWITCHABLE_FEATURES, dependencyProblems, featureInfo, featuresOf, playHarnessFeatures, serverFeatureEnv, type FeatureSet} from "./features.js";
import { flagFeatures, normalizeFeatures, parsePlayPreset, presetFeatures } from "./play-preset.js";

// readout-truth-v1 and birch-speech-pages-v1 (correctness fixes, ON in both arms) and
// blackout-readout-v1 (bundle arm only): game-server readout switches, recorded last.
const IDS = ["readout-truth-v1", "birch-speech-pages-v1", "blackout-readout-v1"] as const;
const off = (...ids: (typeof SWITCHABLE_FEATURES)[number][]): FeatureSet => ({ ...ALL_ON,"battle-decision-ready-v1":false,...Object.fromEntries(ids.map((id) => [id, false])) });

it("registers three default-off observation switches with no dependency, recorded last in this order", () => {
  expect(SWITCHABLE_FEATURES.slice(-123,-120)).toEqual([...IDS]);
  expect(playHarnessFeatures(ALL_ON, null).slice(-51,-48)).toEqual([...IDS]);
  for (const id of IDS) {
    expect(featureInfo(id)).toMatchObject({ group: "observation", needs: null, switchable: true });
    expect(featureInfo(id).description).toContain(" Off: ");
    expect(playHarnessFeatures(off(id), null)).not.toContain(id);
    expect(featuresOf(playHarnessFeatures(off(id), null))[id]).toBe(false);
  }
  // No dependency: the control arm of bundle-v-control has expanded menu text off.
  expect(dependencyProblems(off("battle-decision-ready-v1","battle-effective-damage-v1", "expanded-menu-battle-information-v1", "battle-details-v2", "battle-triage-guidance-v1", "status-names-v1"))).toEqual([]);
});

it("describes each switch with the exact lines the game server writes", () => {
  const truth = featureInfo("readout-truth-v1").description;
  expect(truth).toContain("ON in both arms");
  expect(truth).toContain('"Field-message text: none (no message box is open)."');
  expect(truth).toContain('"Field-message phase: no message is open and no script is running."');
  expect(truth).toContain('"Menu: none open"');
  expect(truth).toContain('"Bag: empty"');
  expect(truth).toContain('"Mom told you PROF. BIRCH lives next door (after the Petalburg Gym TV report)"');
  expect(truth).toContain('"Field-message text: unavailable; do not infer that the dialogue box is closed."');
  expect(featureInfo("birch-speech-pages-v1").description).toContain("Interface: birch_speech_page; input ready; value <the page on screen>; A or B shows the next page");
  expect(featureInfo("blackout-readout-v1").description).toContain('"Whited out: your party had no usable Pokémon left, so the game took you back to <location> (the last place you healed), healed your party and halved your money: ₽3000 → ₽1500."');
  expect(featureInfo("blackout-readout-v1").description).toContain('"Whiting out: your party has no usable Pokémon left; the game is taking you back to the last place you healed."');
});

it("states each switch's intended arms and the whiteout frame scope (operator decisions 2026-10-16)", () => {
  const read = (path: string): string => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
  const notes = (file: string): string => (JSON.parse(read(`experiments/${file}.json`)) as { notes: string }).notes;
  const birch = featureInfo("birch-speech-pages-v1").description;
  expect(birch).toContain("Correctness fix, meant to be ON in both arms");
  expect(notes("birch-speech-pages")).toContain("meant to be ON in both arms of bundle-v-control");
  expect(notes("birch-speech-pages")).not.toContain("bundle arm only");
  expect(read("docs/explainers/birch-speech-pages-v1.html")).toContain("meant to be ON in both arms");
  expect(read("docs/explainers/birch-speech-pages-v1.html")).not.toContain("bundle arm only");
  expect(read("docs/experiments/readiness.md")).toContain("| `birch-speech-pages-v1` | `PLAYER_NAME_CONFIRMED` (the pages follow the accepted name) | PENDING until `just experiments` runs after landing | Registered 2026-10-16 on branch `claude/readout-truth`; correctness fix, ON in both arms");
  const whiteout = featureInfo("blackout-readout-v1").description;
  expect(whiteout).toContain("Bundle arm only.");
  expect(whiteout).toContain("game-loop frames advanced through run_frame_with_buttons");
  expect(whiteout).toContain("frames the vendor advances directly (tick, the frame load_state runs) are out of scope");
  expect(notes("blackout-readout")).toContain("bundle arm only");
  const explainer = read("docs/explainers/blackout-readout-v1.html");
  expect(explainer).toContain("Operator amendment (the operator, 2026-10-16)");
  expect(explainer).toContain("<code>run_frame_with_buttons</code>");
  expect(explainer).toContain("<code>tick</code>");
  expect(explainer).toContain("<code>load_state</code>");
});

it("hands all three to the game server, whose list and default-off set name them", () => {
  expect(SERVER_FEATURES.slice(-36,-33)).toEqual([...IDS]);
  for (const id of IDS) expect(serverFeatureEnv(off(id)).POKEBENCH_FEATURES_OFF).toBe(`${id},safe-navigation-strides-v1,original-speed-pacing-v1,exit-labels-v2,heal-before-trainers-v2,respawn-readout-v1,caught-nickname-prompt-v1,party-item-confirmation-v1,yes-no-answer-readout-v1,field-move-gates-v1,exit-labels-v3,move-learn-settle-v1,move-learn-question-v1,move-learn-comparison-v1,gym-door-label-v1,mart-stock-readout-v1,caught-dex-input-v1,exp-next-level-v1,pokedex-own-v1,shop-interface-v1,map-wide-triggers-v1,birch-intro-pages-v1,post-battle-readout-v1`);
  expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF).toBe("safe-navigation-strides-v1,original-speed-pacing-v1,exit-labels-v2,heal-before-trainers-v2,respawn-readout-v1,caught-nickname-prompt-v1,party-item-confirmation-v1,yes-no-answer-readout-v1,field-move-gates-v1,exit-labels-v3,move-learn-settle-v1,move-learn-question-v1,move-learn-comparison-v1,gym-door-label-v1,mart-stock-readout-v1,caught-dex-input-v1,exp-next-level-v1,pokedex-own-v1,shop-interface-v1,map-wide-triggers-v1,birch-intro-pages-v1,post-battle-readout-v1");
  const readout = readFileSync(new URL("../../../env/pokebench_env/readout.py", import.meta.url), "utf8");
  expect(readout).toContain('    "transition-coherence-v1",\n    "readout-truth-v1",\n    "birch-speech-pages-v1",\n    "blackout-readout-v1",\n');
  expect(readout).toContain('"readout-truth-v1,birch-speech-pages-v1,blackout-readout-v1,"');
});

it("defaults OFF for presets that omit them and for legacy flag presets, so recorded presets keep today's readout", () => {
  const legacy = flagFeatures({ loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true });
  const without = Object.fromEntries(Object.entries(legacy).filter(([id]) => !(IDS as readonly string[]).includes(id))) as Omit<FeatureSet, (typeof IDS)[number]>;
  const preset = parsePlayPreset({ version: 2, id: "p", target: null, limits: { maxTurns: 1, maxWallMs: 1, failureLimit: 1 }, sampling: { thinkingLevel: "medium", maxTokens: 1 }, features: without });
  for (const id of IDS) {
    expect(normalizeFeatures(without)[id]).toBe(false);
    expect(normalizeFeatures({ ...without, [id]: true })[id]).toBe(true);
    expect(legacy[id]).toBe(false);
    expect(presetFeatures(preset)[id]).toBe(false);
  }
});

it("registers each switch as a pending experiment with a readiness row", () => {
  const readiness = readFileSync(new URL("../../../docs/experiments/readiness.md", import.meta.url), "utf8");
  for (const [file, id, activation] of [["readout-truth", "readout-truth-v1", "NEW_GAME_CREATED"], ["birch-speech-pages", "birch-speech-pages-v1", "PLAYER_NAME_CONFIRMED"], ["blackout-readout", "blackout-readout-v1", "STARTER_CHOSEN"]] as const) {
    const entry = JSON.parse(readFileSync(new URL(`../../../experiments/${file}.json`, import.meta.url), "utf8")) as { changedFeature: string; activationMilestone: string; queuePosition?: number; incumbent: { features: Record<string, boolean> }; source: { commit: string } };
    expect(entry.changedFeature).toBe(id);
    expect(entry.activationMilestone).toBe(activation);
    expect(entry.queuePosition).toBeUndefined();
    expect(entry.incumbent.features[id]).toBe(false);
    // Pinned past the review fixes (not 639bc92a, the pre-review head); repinned at landing.
    expect(entry.source.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(entry.source.commit.startsWith("639bc92a")).toBe(false);
    expect(readiness).toContain(`| \`${id}\` | \`${activation}\``);
  }
});
