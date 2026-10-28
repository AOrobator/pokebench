import {must,snapshot} from "../test-support/instruction-goals.js";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, it } from "vitest";
import { checkEvent, type Button } from "./events.js";
import { type GameStateSnapshot } from "./game-state.js";
import { menuOptionTool, unsupportedMenuPhase, withMenuOptionTool } from "./menu-option-tool.js";
import { FEATURES, SERVER_FEATURES, SWITCHABLE_FEATURES, featureInfo, playHarnessFeatures, ALL_ON, featuresOf } from "./features.js";
import { serverOff, serverOffWith } from "../test-support/server-features.js";
import { playGameTools } from "./play-wiring.js";
import { Type } from "typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { normalizeFeatures } from "./play-preset.js";

const fixture = JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/pokenav-instruction-goals.json.gz", import.meta.url))).toString()) as { events: unknown[] };
const multichoice = snapshot(must(fixture.events.map(checkEvent).find(e => e.seq === 39512)));
// a702 turn 638 (seq 30979): the tutorial PokéNav main menu, ready, with no menu id.
const pokenavMenu: GameStateSnapshot = { ...multichoice, active_ui: { phase: "pokenav_menu", selected: "HOENN MAP", ready: true, controls: "UP/DOWN selects; A opens MATCH CALL only; B cannot exit during this tutorial", diagnostic: null, value: null, details: { options: ["HOENN MAP", "CONDITION", "MATCH CALL", "SWITCH OFF"], selected_index: 0, menu_type: 1, pokenav_mode: 1 } } };
const result = (s: GameStateSnapshot) => ({ content: [{ type: "text" as const, text: "current observation" }], details: { state: s } });
const OLD = "Menu selection: nothing pressed; the requested menu is not currently ready and verified.";
const HONEST = "Menu selection: nothing pressed; select_menu_option supports only the START menu and field multichoice menus, and the open menu is pokenav_menu. Use press for this menu.";
const run = async (s: GameStateSnapshot, honestRefusal: boolean | undefined, phase = "pokenav_menu") => {
    const buttons: Button[] = [];
    const tool = menuOptionTool({ observe: () => Promise.resolve(result(s)), press: (_id, b) => { buttons.push(b); return Promise.resolve(result(s)); }, ...(honestRefusal === undefined ? {} : { honestRefusal }) });
    const r = await tool.execute("pick", { phase, menu_id: 87, option: "MATCH CALL" });
    return { buttons, text: r.content.map(c => c.type === "text" ? c.text : "").join("\n") };
};

it("OFF (absent or false) keeps the a702 t638 refusal byte for byte", async () => {
    for (const flag of [undefined, false]) {
        const { buttons, text } = await run(pokenavMenu, flag);
        expect(buttons).toEqual([]);
        expect(text).toBe(`current observation\n${OLD}`);
    }
});
it("ON names the unsupported PokéNav menu and says to use press, pressing nothing", async () => {
    const { buttons, text } = await run(pokenavMenu, true);
    expect(buttons).toEqual([]);
    expect(text).toBe(`current observation\n${HONEST}`);
    expect(text).not.toContain("not currently ready");
});
it("ON keeps the old wording when no interface owner is open or a supported menu is not ready", async () => {
    expect((await run({ ...pokenavMenu, active_ui: null }, true)).text).toContain(OLD);
    const busy = { ...multichoice, active_ui: { ...must(multichoice.active_ui), ready: false } };
    expect(unsupportedMenuPhase(busy)).toBeNull();
    expect((await run(busy, true, "field_multichoice")).text).toContain(OLD);
    expect(unsupportedMenuPhase(multichoice)).toBeNull();
    expect(unsupportedMenuPhase(pokenavMenu)).toBe("pokenav_menu");
});
it("ON keeps the old wording for an unsupported owner that is not ready or not verified", async () => {
    const ui = must(pokenavMenu.active_ui);
    for (const s of [{ ...pokenavMenu, active_ui: { ...ui, ready: false } }, { ...pokenavMenu, active_ui: { ...ui, ready: null } }, { ...pokenavMenu, active_ui: { ...ui, diagnostic: "invalid PokeNav list length/cursor/item size" } }]) {
        expect(unsupportedMenuPhase(s)).toBeNull();
        const { buttons, text } = await run(s, true);
        expect(buttons).toEqual([]);
        expect(text).toBe(`current observation\n${OLD}`);
    }
});
it("registry: default off, needs menu-option-tool-v1, at their registered positions", () => {
    expect(SWITCHABLE_FEATURES.indexOf("pokenav-short-list-v1")).toBe(282);
    expect(SWITCHABLE_FEATURES.indexOf("menu-option-honest-refusal-v1")).toBe(283);
    expect(SERVER_FEATURES.indexOf("pokenav-short-list-v1")).toBe(93);
    expect(SERVER_FEATURES).not.toContain("menu-option-honest-refusal-v1");
    expect(playHarnessFeatures(ALL_ON, null).indexOf("pokenav-short-list-v1")).toBe(306);
    expect(playHarnessFeatures(ALL_ON, null).indexOf("menu-option-honest-refusal-v1")).toBe(307);
    expect(serverOff({ ...ALL_ON, "pokenav-short-list-v1": false })).toEqual(serverOffWith(ALL_ON, { off: ["pokenav-short-list-v1"] }));
    expect(featureInfo("menu-option-honest-refusal-v1").needs).toBe("menu-option-tool-v1");
    expect(featureInfo("menu-option-honest-refusal-v1").description).toContain(" Off: ");
    expect(FEATURES.findIndex(f => f.id === "menu-option-honest-refusal-v1")).toBe(FEATURES.findIndex(f => f.id === "pokenav-short-list-v1") + 1);
    const omitted = Object.fromEntries(Object.entries(ALL_ON).filter(([id]) => id !== "pokenav-short-list-v1" && id !== "menu-option-honest-refusal-v1")) as Parameters<typeof normalizeFeatures>[0];
    expect(normalizeFeatures(omitted)["menu-option-honest-refusal-v1"]).toBe(false);
    expect(normalizeFeatures(omitted)["pokenav-short-list-v1"]).toBe(false);
});
it("withMenuOptionTool threads the switch into the production tool", async () => {
    const press = { name: "press", label: "press", description: "", parameters: {}, execute: () => Promise.resolve(result(pokenavMenu)), executeChecked: () => Promise.resolve(result(pokenavMenu)) };
    const observe = { name: "observe", label: "observe", description: "", parameters: {}, execute: () => Promise.resolve(result(pokenavMenu)) };
    const text = async (honest: boolean) => {
        const tools = withMenuOptionTool([press, observe], true, undefined, undefined, honest);
        const r = await must(tools.find(t => t.name === "select_menu_option")).execute("x", { phase: "pokenav_menu", menu_id: 87, option: "MATCH CALL" });
        return r.content.map(c => c.type === "text" ? c.text : "").join("\n");
    };
    expect(await text(false)).toContain(OLD);
    expect(await text(true)).toContain(HONEST);
});
it("production factory: playGameTools honors menu-option-honest-refusal-v1", async () => {
    const recorder = { subscribe: () => { }, recordLedgerContext: () => { }, recordNavigationContext: () => { }, recordMilestoneHint: () => { }, recordBeliefLedger: () => { }, recordLoopBreaker: () => undefined, recordState: () => ({ seq: 1, turn: 1 }), recordDialogueAutoAdvance: () => ({ seq: 2, turn: 1 }), lowHpTrainerWarning: () => { }, peopleIdCard: () => { }, storyGoalAway: () => { }, destinationCitation: () => { }, unfinishedActivity: () => { }, healFirstFacts: () => { } };
    const observe: AgentTool = { name: "observe", label: "Observe", description: "Observe", parameters: Type.Object({}), execute: () => Promise.resolve(result(pokenavMenu)) };
    const press = { ...observe, name: "press", executeChecked: () => Promise.resolve(result(pokenavMenu)) };
    const text = async (honest: boolean) => {
        const f = { ...featuresOf([]), "ram-state-v1": true, "menu-option-tool-v1": true, "menu-option-honest-refusal-v1": honest };
        const tool = must(playGameTools([observe, press], f, { read: () => Promise.resolve(pokenavMenu) }, recorder).find(t => t.name === "select_menu_option"));
        const r = await tool.execute("x", { phase: "pokenav_menu", menu_id: 87, option: "MATCH CALL" });
        return r.content.map(c => c.type === "text" ? c.text : "").join("\n");
    };
    expect(await text(false)).toContain(OLD);
    expect(await text(true)).toContain(HONEST);
});
