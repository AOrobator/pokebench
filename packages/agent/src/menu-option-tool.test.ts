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
it("recovers from the actual recorded trainer-row overshoot with UP,A",async()=>{
 let current=snapshot(must(fixture.events.map(checkEvent).find(e=>e.seq===40378)));
 const target=snapshot(must(fixture.events.map(checkEvent).find(e=>e.seq===39570))),buttons:Button[]=[];
 expect(current.active_ui?.details?.["selected_index"]).toBe(4);expect(target.active_ui?.selected).toBe("POKéNAV");
 const tool=menuOptionTool({observe:()=>Promise.resolve(result(current)),press:(_id,b,check)=>{check(current);buttons.push(b);current=b==="UP"?target:{...target,active_ui:null};return Promise.resolve(result(current));}});
 await tool.execute("recorded-recovery",{phase:"field_multichoice",menu_id:86,option:"POKéNAV"});expect(buttons).toEqual(["UP","A"]);
});
it.each(["phase","id"])("rejects a mismatched requested menu %s independently",async kind=>{
 let current=at(2);const buttons:Button[]=[];const tool=menuOptionTool({observe:()=>Promise.resolve(result(current)),press:(_id,b,check)=>{check(current);buttons.push(b);current=b==="A"?{...current,active_ui:null}:at(3);return Promise.resolve(result(current));}});
 await tool.execute("wrong-request",{phase:kind==="phase"?"start_menu":"field_multichoice",menu_id:kind==="id"?87:86,option:"POKéNAV"});expect(buttons).toEqual([]);
});
it.each(["identity","cursor"])("checks pre-input %s independently",async kind=>{
 const current=at(2),ui=must(current.active_ui),before=kind==="cursor"?at(3):{...current,active_ui:{...ui,details:{...ui.details,menu_id:87}}};const buttons:Button[]=[];
 const tool=menuOptionTool({observe:()=>Promise.resolve(result(current)),press:(_id,b,check)=>{check(before);buttons.push(b);return Promise.resolve(result(at(3)));}});
 await tool.execute("changed-input",{phase:"field_multichoice",menu_id:86,option:"POKéNAV"});expect(buttons).toEqual([]);
});

it("optional hints leave unsupported historical states untouched while menu execution remains strict", async () => {
    const { withMenuOptionTool } = await import("./menu-option-tool.js");
    const { Type } = await import("typebox");
    const inputs: Button[] = [];
    for (const [supported, state] of [[false, undefined], [false, null], [false, {}], [false, { version: 1, active_ui: at(2).active_ui }], [false, { ...at(2), map_id: "invalid" }], [true, at(2)]] as const) {
        const original = { content: [{ type: "text" as const, text: "historical observation" }], details: { state } };
        const observe = { name: "observe", label: "Observe", description: "Observe", parameters: Type.Object({}), execute: () => Promise.resolve(original) };
        const press = { ...observe, name: "press", executeChecked: (_id: string, args: {buttons: Button[]}) => { inputs.push(...args.buttons); return Promise.resolve(original); } };
        const tools = withMenuOptionTool([observe, press], true);
        const annotated = await must(tools[0]).execute("hint", {});
        if (!supported) {
            expect(annotated).toBe(original);
            await expect(must(tools.find(t => t.name === "select_menu_option")).execute("select", { phase: "field_multichoice", menu_id: 86, option: "POKéNAV" })).rejects.toThrow();
        } else {
            expect(JSON.stringify(annotated)).toContain("Menu selection tool available");
            expect(annotated.details).toBe(original.details);
        }
        expect(inputs).toEqual([]);
    }
});
