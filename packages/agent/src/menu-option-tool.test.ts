import {isCheckedPress} from "./game-tools.js";
import {must,snapshot} from "../test-support/instruction-goals.js";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, it } from "vitest";
import { checkEvent, type Button } from "./events.js";
import { type GameStateSnapshot } from "./game-state.js";
import { menuOptionTool, menuOptionView } from "./menu-option-tool.js";
const fixture = JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/pokenav-instruction-goals.json.gz", import.meta.url))).toString()) as {
    events: unknown[];
};
const event = must(fixture.events.map(checkEvent).find(e => e.seq === 39512));
const state = snapshot(event);
function at(index: number): GameStateSnapshot { const options = state.active_ui?.details?.["options"] as string[]; return { ...state, active_ui: { ...must(state.active_ui), selected: must(options[index]), details: { ...must(state.active_ui).details, selected_index: index } } }; }
const result = (s: GameStateSnapshot) => ({ content: [{ type: "text" as const, text: "current observation" }], details: { state: s } });
it("selects the recorded POKéNAV from BAG with DOWN,A, stopping after the single confirmation", async () => {
    let s = at(2);
    const buttons: Button[] = [];
    const tool = menuOptionTool({ observe: () => Promise.resolve().then(() => result(s)), press: (_id, b, check) => Promise.resolve().then(() => { check(s); buttons.push(b); s = b === "A" ? { ...s, active_ui: null } : at(3); return result(s); }) });
    const r = await tool.execute("pick", { phase: "field_multichoice", menu_id: 86, option: "POKéNAV" });
    expect(buttons).toEqual(["DOWN", "A"]);
    expect(JSON.stringify(r)).toContain('"confirmation_sent":true');
    expect(JSON.stringify(r)).not.toContain('"completed":true');
});
it("requires matching current menu, visible unique option and ready cursor", async () => {
    for (const s of [at(2), { ...at(2), active_ui: { ...must(at(2).active_ui), ready: false } }, { ...at(2), active_ui: null }]) {
        const buttons: Button[] = [];
        const tool = menuOptionTool({ observe: () => Promise.resolve().then(() => result(s)), press: (_id, b) => Promise.resolve().then(() => { buttons.push(b); return result(s); }) });
        await tool.execute("pick", { phase: "start_menu", menu_id: null, option: "POKéNAV" });
        expect(buttons).toEqual([]);
    }
    expect(menuOptionView({ ...at(2), active_ui: { ...must(at(2).active_ui), phase: "field_multichoice_grid" } })).toBeNull();
});
it("stops on a changed owner at the checked input seam without sending A", async () => {
    const buttons: Button[] = [];
    const tool = menuOptionTool({ observe: () => Promise.resolve().then(() => result(at(2))), press: (_id, b, check) => Promise.resolve().then(() => { check({ ...at(2), active_ui: null }); buttons.push(b); return result(at(3)); }) });
    const r = await tool.execute("pick", { phase: "field_multichoice", menu_id: 86, option: "POKéNAV" });
    expect(buttons).toEqual([]);
    expect(JSON.stringify(r)).toContain("changed");
});
it.each([0, 3, 7])("moves from recorded index %s without wrapping or overshooting", async (index) => {
    let s = at(index);
    const buttons: Button[] = [];
    const tool = menuOptionTool({ observe: () => Promise.resolve().then(() => result(s)), press: (_id, b, check) => Promise.resolve().then(() => { check(s); buttons.push(b); const v = must(menuOptionView(s)); s = b === "A" ? { ...s, active_ui: null } : at(v.index + (b === "DOWN" ? 1 : -1)); return result(s); }) });
    await tool.execute("pick", { phase: "field_multichoice", menu_id: 86, option: "POKéNAV" });
    expect(buttons).toEqual([...Array.from({ length: Math.abs(index - 3) }, () => index < 3 ? "DOWN" : "UP"), "A"]);
});
it.each(["absent", "duplicate", "no-movement", "interruption"])("does not confirm on %s", async (kind) => {
    let s = at(2);
    if (kind === "duplicate")
        s = { ...s, active_ui: { ...must(s.active_ui), details: { ...must(s.active_ui).details, options: ["POKéNAV", "POKéNAV", "BAG"], selected_index: 2 } } };
    const buttons: Button[] = [];
    const tool = menuOptionTool({ observe: () => Promise.resolve().then(() => result(s)), press: (_id, b, check) => Promise.resolve().then(() => { check(s); buttons.push(b); if (kind === "interruption")
            s = { ...s, active_ui: null }; return result(s); }) });
    await tool.execute("pick", { phase: "field_multichoice", menu_id: 86, option: kind === "absent" ? "UNSEEN" : "POKéNAV" });
    expect(buttons.includes("A")).toBe(false);
    expect(buttons.length).toBeLessThanOrEqual(1);
});
it("validates input, honors cancellation and fails closed on missing state", async () => {
    const tool = menuOptionTool({ observe: () => Promise.resolve().then(() => ({ content: [], details: undefined })), press: () => Promise.resolve().then(() => result(at(2))) });
    await expect(tool.execute("x", { phase: "field_multichoice", menu_id: 86, option: "POKéNAV" })).rejects.toThrow("lacks state");
    const abort = new AbortController();
    abort.abort();
    await expect(tool.execute("x", { phase: "field_multichoice", menu_id: 86, option: "POKéNAV" }, abort.signal)).rejects.toThrow();
    await expect(tool.execute("x", { phase: "field_multichoice", menu_id: 86, option: "" })).rejects.toThrow("Supply phase");
});
it("supports the source-owned vertical START menu", async () => {
    let s = at(2);
    s = { ...s, active_ui: { ...must(s.active_ui), phase: "start_menu", details: { ...must(s.active_ui).details, menu_id: null } } };
    const buttons: Button[] = [];
    const tool = menuOptionTool({ observe: () => Promise.resolve().then(() => result(s)), press: (_id, b, check) => Promise.resolve().then(() => { check(s); buttons.push(b); return result(s); }) });
    await tool.execute("x", { phase: "start_menu", menu_id: null, option: "BAG" });
    expect(buttons).toEqual(["A"]);
});
it("factory annotates visible supported choices and preserves the checked-press path", async () => {
    const { withMenuOptionTool } = await import("./menu-option-tool.js");
    const { Type } = await import("typebox");
    const observe = { name: "observe", label: "Observe", description: "Observe", parameters: Type.Object({}), execute: () => Promise.resolve().then(() => result(at(2))) };
    const press = { ...observe, name: "press", executeChecked: () => Promise.resolve().then(() => result(at(2))) };
    const tools = withMenuOptionTool([observe, press], true);
    expect(JSON.stringify(await must(tools[0]).execute("x", {}))).toContain("Menu selection tool available");
    const checked = must(tools[1]);
    if (!isCheckedPress(checked))
        throw new Error("checked path missing");
    expect(JSON.stringify(await checked.executeChecked("x",{buttons:["DOWN"]},()=>{}))).toContain("select_menu_option");
    expect(() => withMenuOptionTool([observe], true)).toThrow("checked press");
    expect(withMenuOptionTool([observe], false)[0]).toBe(observe);
    const noState = { ...observe, execute: () => Promise.resolve().then(() => ({ content: [], details: undefined })) };
    await must(withMenuOptionTool([noState, press], true)[0]).execute("x", {});
    const changed = { ...observe, execute: () => Promise.resolve().then(() => result({ ...at(2), active_ui: null })) };
    expect((await must(withMenuOptionTool([changed, press], true)[0]).execute("x", {})).content).toEqual([{ type: "text", text: "current observation" }]);
});
it.each(["diagnostic", "index", "label", "id", "options"])("does not plan from malformed %s menu state", kind => {
    const s = at(2), ui = must(s.active_ui);
    const broken = { ...s, active_ui: { ...ui, ...(kind === "diagnostic" ? { diagnostic: "unsupported" } : {}), ...(kind === "label" ? { selected: "wrong" } : {}), details: { ...ui.details, ...(kind === "index" ? { selected_index: 99 } : {}), ...(kind === "id" ? { menu_id: null } : {}), ...(kind === "options" ? { options: [] } : {}) } } };
    expect(menuOptionView(broken)).toBeNull();
});
