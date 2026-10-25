import {must,snapshot} from "../test-support/instruction-goals.js";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "typebox";
import { expect, it } from "vitest";
import { contextTools, playGameTools } from "./play-wiring.js";
import { featuresOf, dependencyProblems, type FeatureSet } from "./features.js";
import { flagFeatures, normalizeFeatures } from "./play-preset.js";
import { playSystemPrompt, playTools, jitTools } from "./play-config.js";
import { checkEvent, type BodyOf, type RunEvent } from "./events.js";
import { withInstructionGoalReview } from "./instruction-goal-tools.js";
const data = JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/pokenav-instruction-goals.json.gz", import.meta.url))).toString()) as {
    events: unknown[];
};
const events = data.events.map(checkEvent), source = must(events.find(e => e.seq === 39512));
const state = snapshot(source);
const features = (goal: boolean, menu = false): FeatureSet => ({ ...featuresOf([]), "ram-state-v1": true, "instruction-goal-ledger-v1": goal, "menu-option-tool-v1": menu });
const review = { reviewed: [{ episode: 39430, interpretation: "Scientist asks for Match Call" }, { episode: 39462, interpretation: "Select POKéNAV" }], updates: [{ id: "select", title: "Select POKéNAV", sources: [{ episode: 39462, page: 0 }], parent: null, status: "active", reason: "Scientist asks", completion: "POKéNAV opens" }] };
function setup(on = true, initial: readonly RunEvent[] = events.filter(e => e.seq <= 39462), overrides: Partial<FeatureSet> = {}) {
    const subscribers: ((e: RunEvent) => void)[] = [], records: Omit<BodyOf<"ledger_context">, "type" | "turn">[] = [];
    const record = { subscribe: (fn: (e: RunEvent) => void) => { subscribers.push(fn); }, recordLedgerContext: (b: Omit<BodyOf<"ledger_context">, "type" | "turn">) => { records.push(b); }, recordNavigationContext: () => { }, recordMilestoneHint: () => { }, recordBeliefLedger: () => { }, recordLoopBreaker: () => undefined };
    const f = {...features(on), ...overrides}, context = contextTools(f, record, m => Promise.resolve(m));
    const send = (es: readonly RunEvent[]) => { for (const e of es)
        for (const fn of subscribers)
            fn(e); };
    send(initial);
    return { context, records, send, record, f };
}
it("factory pins recorded request after compaction; action accepts inline review and does not choose the goal", async () => {
    const s = setup();
    let presses = 0;
    let received: unknown;
    const press: AgentTool = { name: "press", label: "Press", description: "Press", parameters: Type.Object({ buttons: Type.Array(Type.String()) }, { additionalProperties: false }), execute: (_id, args) => Promise.resolve().then(() => { presses++; received = args; return { content: [{ type: "text", text: 'Story goal: historical Norman line' }], details: { state } }; }) };
    const tools = withInstructionGoalReview([press, ...s.context.tools], s.context.instructionGoals ?? null), action = must(tools.find(t => t.name === "press"));
    expect(JSON.stringify(await action.execute("blocked", { buttons: ["B"] }))).toContain("No game input sent");
    expect(presses).toBe(0);
    const result = await action.execute("chosen", { buttons: ["DOWN"], goal_review: review });
    expect(presses).toBe(1);
    expect(received).toEqual({ buttons: ["DOWN"] });
    expect(JSON.stringify(result)).toContain("not your active goal");
    const before = await s.context.transformContext([]);
    expect(JSON.stringify(before)).toContain("Select POKéNAV");
    const restored = setup();
    const transaction = must(s.records.find(b => b.instruction_goals !== undefined));
    restored.send([checkEvent({ v: 1, run: source.run, seq: 80000, t: source.t, turn: 1031, type: "ledger_context", ...transaction })]);
    expect(restored.context.instructionGoals?.ledger.pending()).toEqual([]);
    expect(restored.context.instructionGoals?.ledger.text()).toBe(s.context.instructionGoals?.ledger.text());
});
it("OFF has no bookkeeping or new prompt/tool/schema fields", async () => {
    const s = setup(false), input: AgentMessage[] = [{ role: "user", content: "old", timestamp: 0 }];
    expect(await s.context.transformContext(input)).toEqual(input);
    expect(s.context.tools).toEqual([]);
    expect(s.records).toEqual([]);
    expect(playSystemPrompt(s.f, null)).not.toContain("review_goals");
    expect(playTools(s.f)).not.toContain("select_menu_option");
    const old: AgentTool = { name: "press", label: "Press", description: "old", parameters: Type.Object({}), execute: () => Promise.resolve().then(() => ({ content: [], details: undefined })) };
    expect(withInstructionGoalReview([old], null)[0]).toBe(old);
    for (const id of ["instruction-goal-ledger-v1", "menu-option-tool-v1"] as const) {
        expect(normalizeFeatures(featuresOf([]))[id]).toBe(false);
        expect(flagFeatures({ loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true })[id]).toBe(false);
    }
});
it("two switches independently change the documented tool set in every scene", () => {
    for (const scene of ["overworld", "battle", "menu", "clock", "naming", "unknown"] as const) {
        for (const [goal, menu] of [[false, false], [true, false], [false, true], [true, true]] as const) {
            const f = features(goal, menu), names = jitTools(playTools(f).map(name => ({ name })), scene).map(t => t.name), prompt = playSystemPrompt({ ...f, "just-in-time-prompt-v1": true }, null, scene);
            expect(names.includes("review_goals")).toBe(goal);
            expect(names.includes("select_menu_option")).toBe(menu);
            expect(prompt.includes("- review_goals:")).toBe(goal);
            expect(prompt.includes("- select_menu_option:")).toBe(menu);
        }
    }
});
it("production game-tool factory offers menu selection only under its own switch", () => {
    const s = setup(false);
    const dummy: AgentTool = { name: "observe", label: "Observe", description: "Observe", parameters: Type.Object({}), execute: () => Promise.resolve().then(() => ({ content: [], details: { state } })) };
    const press = { ...dummy, name: "press", executeChecked: () => Promise.resolve().then(() => ({ content: [], details: { state } })) };
    const record = { ...s.record, recordState: () => ({ seq: 1, turn: 1 }), recordDialogueAutoAdvance: () => ({ seq: 2, turn: 1 }), lowHpTrainerWarning: () => { }, peopleIdCard: () => { }, storyGoalAway: () => { }, destinationCitation: () => { }, unfinishedActivity: () => { }, healFirstFacts: () => { } };
    // The feature-off factory needs no game server; all ordinary execution is injected.
    expect(playGameTools([dummy, press], features(false), { read: () => Promise.resolve().then(() => state) }, record).map(t => t.name)).not.toContain("select_menu_option");
    expect(playGameTools([dummy, press], features(false, true), { read: () => Promise.resolve().then(() => state) }, record).map(t => t.name)).toContain("select_menu_option");
});
it("rejects bad inline review before execution, permits observation, and standalone tools retrieve exact quotes", async () => {
    const s = setup();
    let count = 0;
    const action: AgentTool = { name: "press", label: "Press", description: "Press", parameters: Type.Object({}), execute: () => Promise.resolve().then(() => { count++; return { content: [], details: undefined }; }) };
    const tools = withInstructionGoalReview([action, ...s.context.tools], s.context.instructionGoals ?? null), press = must(tools.find(t => t.name === "press"));
    expect(JSON.stringify(await press.execute("bad", { goal_review: {} }))).toContain("Goal review rejected");
    expect(count).toBe(0);
    const archive = must(tools.find(t => t.name === "get_instruction_goals")), reviewTool = must(tools.find(t => t.name === "review_goals"));
    expect(JSON.stringify(await archive.execute("read", { episode: 39462 }))).toContain("Please select the POKéNAV.");
    await reviewTool.execute("standalone", review);
    await press.execute("go", {});
    expect(count).toBe(1);
    await expect(press.execute("invalid", null)).rejects.toThrow("Invalid action");
    const scalar = { ...action, parameters: Type.String() };
    expect(() => withInstructionGoalReview([scalar], s.context.instructionGoals ?? null)).toThrow("object parameters");
});
it("reuses the native owner to retire Norman's first-gym request while retaining his four-badge goal", () => {
    const fixture = JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/native-task-goal-0517.json.gz", import.meta.url))).toString()) as {
        events: unknown[];
    };
    const native = fixture.events.map(checkEvent), s = setup(true, []);
    s.send(native.filter(e => e.seq <= 7561));
    const ledger = must(s.context.instructionGoals).ledger;
    ledger.apply({ reviewed: [{ episode: 7561, interpretation: "Two separate requests: first gym and future four-badge return" }], updates: [{ id: "gym", native_source_completion:true, title: "Challenge Rustboro gym", sources: [{ episode: 7561, page: 0 }], parent: null, status: "active", reason: "Dad asked", completion: "Gym complete" }, { id: "return", title: "Return with four badges", sources: [{ episode: 7561, page: 3 }], parent: null, status: "deferred", reason: "Later request", completion: "Four badges and return" }] });
    expect(ledger.archive(undefined, "gym")).not.toContain("native_verified");
    s.send(native.filter(e => e.seq > 7561));
    expect(ledger.archive(undefined, "gym")).toContain('"verification":"native_verified"');
    expect(ledger.archive(undefined, "return")).toContain('"status":"deferred"');
    const original=must(native.find(e=>e.type==="dialogue_auto_advance")),result=must(native.find(e=>e.seq===7561));
    const completedState=must(native.find(e=>e.seq===34806));
    // Synthetic return to the issuing room isolates the already-complete issuance case from map mismatch.
    s.send([checkEvent({...completedState,seq:89999,map_id:[8,1],location:"PETALBURG CITY GYM"})]);
    s.send([checkEvent({...original,seq:90000,tool_call_id:"reissued",pages:original.pages.map(page=>({...page,state_seq:89999}))}),checkEvent({...result,seq:90001,id:"reissued",state_seq:89999})]);
    ledger.apply({reviewed:[{episode:90001,interpretation:"A renewed instruction, after the original task completed"}],updates:[{id:"gym-again",native_source_completion:true,title:"New gym request",sources:[{episode:90001,page:0}],parent:null,status:"active",reason:"Newly issued request",completion:"This renewed request is satisfied"}]});
    expect(ledger.archive(undefined,"gym-again")).toContain('"status":"active"');
});
it.each([false,true])("does not commit or send input when durable recording fails (advisory=%s)",async advisory=>{
 const s=setup(true,events.filter(e=>e.seq<=39462),{"instruction-goal-advisory-v1":advisory}),ledger=must(s.context.instructionGoals).ledger,before=ledger.text();let actions=0;
 const originalRecord=s.record.recordLedgerContext;s.record.recordLedgerContext=()=>{throw new Error("storage failure");};
 const action:AgentTool={name:"press",label:"Press",description:"Press",parameters:Type.Object({}),execute:()=>{actions++;return Promise.resolve({content:[],details:undefined});}};
 const wrapped=must(withInstructionGoalReview([action],s.context.instructionGoals??null)[0]);
 await expect(wrapped.execute("failed-record",{goal_review:review})).rejects.toThrow("storage failure");expect(actions).toBe(0);expect(ledger.text()).toBe(before);s.record.recordLedgerContext=originalRecord;await wrapped.execute("failed-record",{goal_review:review});expect(actions).toBe(1);
});
it("records dialogue triggered by menu confirmation through the ordinary checked-press wrapper",async()=>{
 const s=setup(false),said="Please select the POKéNAV.",base=state;let current=state,seq=80000;const presses:string[]=[],transcripts:BodyOf<"dialogue_auto_advance">[]=[];
 const see=()=>Promise.resolve({content:[{type:"text" as const,text:"fresh observation"}],details:{state:current}});
 const run=(buttons:readonly string[])=>{for(const b of buttons){presses.push(b);current=b==="A"?{...base,active_ui:null,world_context:{objects:base.world_context?.objects??[],triggers:[],dialogue:said,message:{phase:"button_wait",cursor:said.length,ready:true,identity:"a".repeat(64)}}}:base;}return see();};
 const observe:AgentTool={name:"observe",label:"Observe",description:"Observe",parameters:Type.Object({}),execute:()=>see()};
 const press:import("./game-tools.js").CheckedPressTool={name:"press",label:"Press",description:"Press",parameters:Type.Object({buttons:Type.Array(Type.Enum(["A","B","START","SELECT","UP","DOWN","LEFT","RIGHT"]),{minItems:1,maxItems:8}),walking:Type.Optional(Type.Boolean())}),execute:(_id,args)=>run(args.buttons),executeChecked:(_id,args,check)=>{check(current);return run(args.buttons);}};
 const recorder={...s.record,recordState:()=>({seq:seq++,turn:1}),recordDialogueAutoAdvance:(b:Omit<BodyOf<"dialogue_auto_advance">,"type"|"turn">)=>{transcripts.push({type:"dialogue_auto_advance",turn:1,...b});return {seq:seq++,turn:1};},lowHpTrainerWarning:()=>{},peopleIdCard:()=>{},destinationCitation:()=>{},unfinishedActivity:()=>{}};
 const tools=playGameTools([observe,press],{...features(false,true),"dialogue-auto-advance-v1":true,"field-dialogue-phase-v1":true},{read:()=>Promise.resolve(current)},recorder);
 await must(tools.find(t=>t.name==="select_menu_option")).execute("menu-choice",{phase:"field_multichoice",menu_id:86,option:"BAG"});
 expect(presses).toEqual(["A","B"]);expect(transcripts).toHaveLength(1);expect(transcripts[0]?.pages.map(p=>p.text)).toEqual([said]);
});

it("rejects combining the model ledger with the legacy catalog objective owner",()=>{expect(dependencyProblems({...features(true),"objective-tracking-v1":true})).toContain("instruction-goal-ledger-v1 requires objective-tracking-v1 OFF (one goal authority)");});

it("does not advance initial field dialogue to a menu and choose an unseen option",async()=>{
 const s=setup(false),base=state,said="Please select the POKéNAV.";
 let current:typeof state={...base,screen:"overworld",in_battle:false,field_controls_locked:true,active_ui:null,world_context:{objects:base.world_context?.objects??[],triggers:[],dialogue:said,message:{phase:"button_wait",cursor:said.length,ready:true,identity:"a".repeat(64)}}};
 const presses:string[]=[],transcripts:BodyOf<"dialogue_auto_advance">[]=[];let seq=81000;
 const see=()=>Promise.resolve({content:[{type:"text" as const,text:current.world_context?.dialogue??"menu observation"}],details:{state:current}});
 const run=(buttons:readonly string[])=>{for(const button of buttons){presses.push(button);current=button==="B"?base:button==="DOWN"?{...base,active_ui:{...must(base.active_ui),selected:"POKéNAV",details:{...must(base.active_ui).details,selected_index:3}}}:{...base,active_ui:null};}return see();};
 const observe:AgentTool={name:"observe",label:"Observe",description:"Observe",parameters:Type.Object({}),execute:()=>see()};
 const press:import("./game-tools.js").CheckedPressTool={name:"press",label:"Press",description:"Press",parameters:Type.Object({buttons:Type.Array(Type.Enum(["A","B","START","SELECT","UP","DOWN","LEFT","RIGHT"]),{minItems:1,maxItems:8}),walking:Type.Optional(Type.Boolean())}),execute:(_id,args)=>run(args.buttons),executeChecked:(_id,args,check)=>{check(current);return run(args.buttons);}};
 const recorder={...s.record,recordState:()=>({seq:seq++,turn:1}),recordDialogueAutoAdvance:(body:Omit<BodyOf<"dialogue_auto_advance">,"type"|"turn">)=>{transcripts.push({type:"dialogue_auto_advance",turn:1,...body});return {seq:seq++,turn:1};},lowHpTrainerWarning:()=>{},peopleIdCard:()=>{},destinationCitation:()=>{},unfinishedActivity:()=>{}};
 const tools=playGameTools([observe,press],{...features(false,true),"dialogue-auto-advance-v1":true,"field-dialogue-phase-v1":true,"pending-field-dialogue-v1":true},{read:()=>Promise.resolve(current)},recorder);
 const result=await must(tools.find(tool=>tool.name==="select_menu_option")).execute("no-unseen-menu",{phase:"field_multichoice",menu_id:86,option:"POKéNAV"});
 expect(presses).toEqual([]);expect(transcripts).toEqual([]);
 expect(result.details).toMatchObject({state:{active_ui:null,world_context:{dialogue:said}},menu_selection:{buttons:[],confirmation_sent:false}});
});

it("advisory factory retains pending dialogue but passes actions through ordinary validation after rejected bookkeeping",async()=>{
 const s=setup(true,events.filter(e=>e.seq<=39462),{"instruction-goal-advisory-v1":true});
 let actions=0;const received:unknown[]=[];
 const action:AgentTool={name:"press",label:"Press",description:"Press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:(_id,args)=>{actions++;received.push(args);return Promise.resolve({content:[{type:"text",text:"ordinary validated action result"}],details:{state}});}};
 const wrapped=must(withInstructionGoalReview([action],s.context.instructionGoals??null)[0]);
 const before=must(s.context.instructionGoals).ledger.text();
 await wrapped.execute("pending",{buttons:["B"]});
 const result=await wrapped.execute("invalid-review",{buttons:["DOWN"],goal_review:{reviewed:[{episode:123,interpretation:"unknown"}],updates:[]}});
 expect(actions).toBe(2);expect(received).toEqual([{buttons:["B"]},{buttons:["DOWN"]}]);
 expect(JSON.stringify(result)).toContain("Goal review rejected:");expect(JSON.stringify(result)).toContain("ordinary validated action result");expect(result.details).toEqual({state});
 expect(s.context.instructionGoals?.ledger.pending()).toEqual([39430,39462]);expect(s.context.instructionGoals?.ledger.text()).toBe(before);expect(s.records).toEqual([]);
 const prompt=playSystemPrompt(s.f,null);expect(prompt).toContain("Reviews are optional bookkeeping and never a prerequisite for gameplay");expect(prompt).not.toContain("Account for new dialogue before changing the game");expect(before).not.toContain("before a game-changing action");
});
it("repair feedback distinguishes unknown and duplicate episodes and names actual delivered references",async()=>{
 const s=setup(true,events.filter(e=>e.seq<=39462),{"goal-review-repair-feedback-v1":true});
 const ledger=must(s.context.instructionGoals).ledger;const before=ledger.text();
 const tool=must(s.context.tools.find(t=>t.name==="review_goals"));
 await expect(tool.execute("unknown",{reviewed:[{episode:123,interpretation:"not delivered"}],updates:[]})).rejects.toThrow("reviewed[0].episode 123 was not delivered; recent delivered episode IDs: [39430,39462]");
 await expect(tool.execute("duplicate",{reviewed:[{episode:39430,interpretation:"one"},{episode:39430,interpretation:"two"}],updates:[]})).rejects.toThrow("reviewed[1].episode 39430 duplicates an earlier entry");
 ledger.apply(review);
 const completion={reviewed:[],updates:[{...review.updates[0],status:"reported_complete",evidence:[123]}]};
 expect(()=>{ledger.apply(completion);}).toThrow('Goal "select" evidence[0] 123 was not delivered; latest delivered observation result: 39462');
 expect(()=>{ledger.apply({reviewed:[],updates:[{...review.updates[0],status:"reported_complete"}]});}).toThrow('Goal "select" evidence needs a delivered observation result newer than 39462; none has been delivered yet');
 expect(()=>{ledger.apply({reviewed:[],updates:[{...review.updates[0],sources:[{episode:39462,page:99}]}]});}).toThrow('Goal "select" sources[0].page 99 is outside delivered episode 39462');
 expect(before).toContain("39462");expect(s.records).toEqual([]);
 s.send([source,checkEvent({...must(events.find(e=>e.seq===39462)),seq:39513,id:"new-observation",state_seq:39512})]);
 expect(()=>{ledger.apply({reviewed:[],updates:[{...review.updates[0],status:"reported_complete"}]});}).toThrow('Goal "select" evidence needs a delivered observation result newer than 39462; latest available: 39513');
 ledger.apply({reviewed:[],updates:[{...review.updates[0],status:"reported_complete",evidence:[39513]}]});expect(ledger.archive(undefined,"select")).toContain('"verification":"model_reported"');
});
it("new switches are inert when the ledger is OFF and default OFF",()=>{
 for(const id of ["instruction-goal-advisory-v1","goal-review-repair-feedback-v1"] as const){
  expect(normalizeFeatures(Object.fromEntries(Object.entries(featuresOf([])).filter(([key])=>key!==id)) as Parameters<typeof normalizeFeatures>[0])[id]).toBe(false);expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[id]).toBe(false);
 }
 const f={...features(false),"instruction-goal-advisory-v1":true,"goal-review-repair-feedback-v1":true};
 const s=setup(false,[],f);expect(s.context.tools).toEqual([]);expect(s.context.instructionGoals).toBeUndefined();expect(playSystemPrompt(f,null)).toBe(playSystemPrompt(features(false),null));expect(playTools(f)).toEqual(playTools(features(false)));expect(dependencyProblems(f)).toEqual([]);
});
