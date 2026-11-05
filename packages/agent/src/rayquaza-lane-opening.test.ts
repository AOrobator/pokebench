import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import preset from "../../../experiments/presets/rayquaza-lane-8h.json" with { type: "json" };
import type { FeatureSet } from "./features.js";
import type { RunEvent } from "./events.js";
import { stableJitPrompts } from "./play-config.js";
import { RAYQUAZA_GUIDE_STEPS } from "./rayquaza-guide-data.js";
import { GuidePosition, OPTIONS_NOTE, rayquazaGuideContext, type GuideStep } from "./rayquaza-guide.js";

const ON = preset.features as FeatureSet;
const steps: readonly GuideStep[] = [
  { after: "RUN_START", map: null, note: "Choose OPTION." },
  { after: "OPTIONS_OPENED", map: null, note: "Set them." },
  { after: "OPTIONS_SET", map: null, note: "Choose NEW GAME." },
  { after: "PLAYER_NAME_CONFIRMED", map: null, note: "Leave the truck." },
];
const state = (over: Record<string, unknown>): RunEvent => ({ type: "state", started: false, screen: "main_menu", active_ui: null, in_battle: false, map_id: null, party: [], ...over }) as unknown as RunEvent;
const options = (text_speed: number, battle_scene_off: number, battle_style: number): RunEvent => state({ screen: "options_menu", active_ui: { phase: "options_menu", details: { text_speed, battle_scene_off, battle_style } } });
const field = (over: Record<string, unknown> = {}): RunEvent => state({ started: true, screen: "overworld", map_id: [0, 9], ...over });
const name = (): RunEvent => ({ type: "milestone", name: "PLAYER_NAME_CONFIRMED", origin: "observed", kind: "story" }) as unknown as RunEvent;
const user = (content: string): AgentMessage => ({ role: "user", content, timestamp: 1 });

describe("options from boot", () => {
  it("moves on from the options steps only when all three settings are set and the menu is left", () => {
    const guide = new GuidePosition(steps);
    guide.observe(state({}));
    expect(guide.current().after).toBe("RUN_START");
    guide.observe(options(1, 0, 0));
    expect(guide.current().after).toBe("OPTIONS_OPENED");
    guide.observe(options(2, 1, 1));
    expect(guide.current().after).toBe("OPTIONS_OPENED");
    guide.observe(state({}));
    expect(guide.current().after).toBe("OPTIONS_SET");
  });

  it("stays on the step when the menu is left with a setting missed", () => {
    const guide = new GuidePosition(steps);
    guide.observe(options(2, 1, 0));
    guide.observe(state({}));
    expect(guide.current().after).toBe("OPTIONS_OPENED");
  });

  it("keeps a START menu note after an early new game, until the settings are made", () => {
    const guide = new GuidePosition(steps);
    guide.observe(state({}));
    guide.observe(name());
    guide.observe(field());
    expect(guide.situationNotes().map((n) => n.text)).toEqual([OPTIONS_NOTE]);
    guide.observe(options(2, 1, 1));
    guide.observe(field());
    expect(guide.situationNotes()).toEqual([]);
    expect(guide.current().after).toBe("PLAYER_NAME_CONFIRMED");
  });

  it("gives no options note to a run that did not start at the menus or to a guide without the step", () => {
    const checkpoint = new GuidePosition(steps);
    checkpoint.observe(field());
    expect(checkpoint.situationNotes()).toEqual([]);
    const plain = new GuidePosition([steps[0] as GuideStep]);
    plain.observe(state({}));
    plain.observe(field());
    expect(plain.situationNotes()).toEqual([]);
  });

  it("is the opening of the shipped guide", () => {
    expect(RAYQUAZA_GUIDE_STEPS.slice(0, 3).map((s) => s.after)).toEqual(["RUN_START", "OPTIONS_OPENED", "OPTIONS_SET"]);
    expect(RAYQUAZA_GUIDE_STEPS[1]?.note).toMatch(/TEXT SPEED to FAST.*BATTLE SCENE to OFF.*BATTLE STYLE to SET/);
  });
});

describe("rq-slim-prompt-v1", () => {
  const parts = (text: string, prefix: string): number => text.split("\n\n").filter((p) => p.startsWith(prefix)).length;

  it("takes sections out of the core and scene guidance only with the switch", () => {
    for (const prefix of ["PokéNav calls", "- learn_move", "- choose_evolution"]) {
      expect(parts(stableJitPrompts(ON, null, "unknown").core, prefix)).toBe(0);
      expect(parts(stableJitPrompts({ ...ON, "rq-slim-prompt-v1": false }, null, "unknown").core, prefix)).toBe(1);
    }
    const field = stableJitPrompts(ON, null, "overworld").guidance;
    expect(parts(field, "Surf:")).toBe(0);
    expect(parts(field, "Trainer battles")).toBe(0);
    expect(parts(stableJitPrompts({ ...ON, "rq-slim-prompt-v1": false }, null, "overworld").guidance, "Surf:")).toBe(1);
    const battle = stableJitPrompts(ON, null, "battle").guidance;
    expect(parts(battle, "Trainer battles")).toBe(1);
    expect(parts(battle, "Overworld:")).toBe(0);
  });

  const context = (features = ON) => {
    const hints: string[] = [];
    let listener: (event: RunEvent) => void = () => undefined;
    const transform = rayquazaGuideContext(features, { subscribe: (next: (event: RunEvent) => void) => { listener = next; }, recordMilestoneHint: (body: { text: string; milestone: string }) => { hints.push(body.text); } }, (m) => Promise.resolve(m), steps);
    return { hints, emit: (event: RunEvent) => { listener(event); }, texts: async (): Promise<string[]> => (await transform([user("o")])).map((m) => typeof m.content === "string" ? m.content : "") };
  };
  const has = (texts: readonly string[], prefix: string): boolean => texts.some((t) => t.startsWith(prefix));

  it.each([
    ["PokéNav calls", { screen: "pokenav" }],
    ["- choose_evolution", { screen: "evolution" }],
    ["Surf:", { surf_gate: { can_surf: true } }],
  ])("delivers %s whole while it applies, before the guide line, then drops it", async (prefix, over) => {
    const c = context();
    c.emit(field());
    expect(has(await c.texts(), prefix)).toBe(false);
    c.emit(field(over));
    const shown = await c.texts();
    expect(has(shown, prefix)).toBe(true);
    expect(shown.at(-1)).toMatch(/^GUIDE: /);
    expect(c.hints.filter((h) => h.startsWith("JIT section: "))).toHaveLength(1);
    c.emit(field());
    expect(has(await c.texts(), prefix)).toBe(false);
  });

  it("delivers the learn_move section during a move-learning prompt", async () => {
    const c = context();
    c.emit(field({ in_battle: true, screen: "battle", party: [], battle: { diagnostic: null, prompt: { kind: "learn_move", ready: true, selected: null } } }));
    expect(has(await c.texts(), "- learn_move")).toBe(true);
  });

  it("adds nothing without the switch", async () => {
    const c = context({ ...ON, "rq-slim-prompt-v1": false });
    c.emit(field({ screen: "pokenav" }));
    expect(await c.texts()).toEqual(["o", "GUIDE: Choose OPTION."]);
  });
});
