import { describe, expect, it } from "vitest";
import { RunView } from "./model.js";
import { thinkingDialog } from "./panels.js";
import { Log, START, assistant, fullRun, state } from "../test-support/events.js";
import { behindLive, currentView, emptyCurrent, foldCurrent, jumpToTail, parseCurrent, MAX_OPEN_TOOLS, MAX_CURRENT_MILESTONES } from "./current-state.js";

const apply = (log: Log) => log.events.reduce((s, e) => foldCurrent(s, e), emptyCurrent());
describe("durable current checkpoint", () => {
  it("restores cumulative stats without retaining the transcript", () => {
    const log = fullRun(); const half = Math.floor(log.events.length / 2);
    let checkpoint = log.events.slice(0,half).reduce((s,e)=>foldCurrent(s,e),emptyCurrent());
    checkpoint = parseCurrent(JSON.parse(JSON.stringify(checkpoint)) as unknown);
    for(const e of log.events.slice(half)) checkpoint=foldCurrent(checkpoint,e);
    expect(checkpoint).toEqual(apply(log));
    const expected=new RunView();for(const e of log.events)expected.apply(e);
    const view=currentView(checkpoint);
    expect({turn:view.turn,tokens:view.tokens,errors:view.toolErrors,model:view.modelErrors,context:view.contextReadout(),party:view.partyMembers,frame:view.frame,retry:view.retry,end:view.end}).toEqual({turn:expected.turn,tokens:expected.tokens,errors:expected.toolErrors,model:expected.modelErrors,context:expected.contextReadout(),party:expected.partyMembers,frame:expected.frame,retry:expected.retry,end:expected.end});
    expect(view.events).toEqual([]);expect(checkpoint.milestones).toEqual(log.events.filter(e=>e.type==="milestone"));
  });
  it("preserves current party provenance identity after JSON restart",()=>{
    const l=new Log();l.add(0,START);l.add(10,state());const restored=currentView(parseCurrent(JSON.parse(JSON.stringify(apply(l))) as unknown));
    expect(restored.partyState).toBe(restored.state);
  });
  it("retains sparse party and resets through the existing reducer",()=>{
    const l=new Log();l.add(0,START);l.add(10,state());l.add(20,state({screen:"battle",in_battle:true,party:[],name:null,location:null}));
    const s=apply(l);expect(currentView(s).cardState?.name).toBe("MAY");expect(currentView(s).partyMembers).toHaveLength(1);
    l.add(30,state({screen:"title",started:false,party:[],name:null,location:null,play_time_s:null}));expect(currentView(apply(l)).partyMembers).toEqual([]);expect(currentView(apply(l)).cardState?.name).toBeNull();
  });
  it("keeps retry attempt separate from totals and measured context provenance",()=>{
    const l=new Log();l.add(0,START);l.add(1,{type:"turn_start",turn:1,context:{messages:1,images:0,est_tokens:250}});l.add(2,assistant({stop_reason:"error",error:"bad"}));l.add(3,{type:"retry",turn:1,reason:"bad",attempt:1,limit:3});l.add(4,{type:"retry",turn:1,reason:"bad",attempt:2,limit:3});
    const s=apply(l);expect(s.totals).toMatchObject({retries:2,modelErrors:1,input:500,output:100});expect(s.retry?.attempt).toBe(2);expect(s.context).toMatchObject({measured:{tokens:500,turn:1},estimated:{tokens:250,turn:1}});
  });
  it("resumes paused time and applied budgets exactly",()=>{
    const l=new Log();l.add(0,START);l.add(10,{type:"operator_control",turn:0,action:"pause",status:"applied",request:1});l.add(20,{type:"operator_control",turn:0,action:"resume",status:"applied",request:2});l.add(30,{type:"operator_control",turn:0,action:"extend_60m",status:"applied",request:3,max_wall_ms:3660000});
    const s=apply(l);expect(s.control.pausedMs).toBe(10);expect(currentView(s).control.pausedMs(100)).toBe(10);expect(s.control.maxWallMs).toBe(3660000);
  });
  it("validates identity/order/terminal boundaries and declared continuation namespace",()=>{
    const l=new Log();const start=l.add(0,START);const s=foldCurrent(emptyCurrent(),start,42);expect(s.nextSeq).toBe(42);
    const e=l.add(1,{type:"turn_start",turn:1,context:{messages:1,images:0,est_tokens:1}});
    expect(()=>foldCurrent(s,e)).toThrow(/sequence/);expect(()=>foldCurrent(s,{...e,seq:42,run:"foreign"})).toThrow(/identity/);
    const end={...l.add(2,{type:"run_end",turn:1,reason:"budget",turns:1,wall_ms:2,tokens:{input:0,output:0},frames:{saved:0,bytes:0},furthest_milestone:null}),seq:42};
    const ended=foldCurrent(s,end);expect(()=>foldCurrent(ended,{...e,seq:43})).toThrow(/terminal/);
    expect(()=>foldCurrent(emptyCurrent(),e)).toThrow();expect(()=>foldCurrent(s,{...start,seq:42})).toThrow();
  });
  it("refuses corrupt/cross-run/versioned persisted payloads",()=>{
    const l=new Log();l.add(0,START);l.add(1,state());const s=apply(l);
    for(const bad of [null,{}, {...s,version:2},{...s,seq:-2},{...s,nextSeq:s.seq},{...s,start:{...s.start,seq:1}},{...s,start:{...s.start,run:"other"}},{...s,totals:{...s.totals,input:-1}},{...s,card:{name:42}},{...s,health:{source:{...l.events[1],seq:100},party:[],slots:[]}}])expect(()=>parseCurrent(bad)).toThrow();
    expect(parseCurrent(s)).toEqual(s);expect(s.start?.system_prompt).toBe("");
  });
  it("bounds recorded progress separately from validated grading",()=>{
    expect(MAX_CURRENT_MILESTONES).toBe(1024);const l=new Log();l.add(0,START);const a=l.add(1,{type:"milestone",turn:0,name:"GAME_RUNNING",server_timestamp:1});const b=l.add(2,{type:"milestone",turn:0,name:"PLAYER_NAME_SET",server_timestamp:2});
    const first=l.events[0];if(first===undefined)throw new Error("missing start");let s=foldCurrent(emptyCurrent(),first);s=foldCurrent(s,a,undefined,undefined,1);
    expect(()=>foldCurrent(s,b,undefined,undefined,1)).toThrow(/progress/);
    expect(currentView(s).milestones).toEqual([]);
  });
  it("bounds pending tools with an injectable tiny limit",()=>{
    expect(MAX_OPEN_TOOLS).toBe(1024);const l=new Log();l.add(0,START);l.add(1,{type:"tool_call",turn:1,id:"a",name:"state",args:{}});let s=apply(l);const e=l.add(2,{type:"tool_call",turn:1,id:"b",name:"state",args:{}});expect(()=>foldCurrent(s,e,undefined,1)).toThrow(/pending/);s=foldCurrent(s,{...e,type:"tool_result",id:"a",name:"state",text:"ok",is_error:false,duration_ms:1,frames:[]});expect(s.openTools).toEqual({});
  });
});

describe("current thinking in the checkpoint", () => {
  it("restores the last thought after a JSON restart with no history", () => {
    const log = new Log(); log.add(0, START); log.add(1, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 9 } }); log.add(3, assistant({ turn: 1, thinking: "go north", text: "ok" }));
    const restored = parseCurrent(JSON.parse(JSON.stringify(apply(log))));
    expect(currentView(restored).lastThought).toMatchObject({ turn: 1, thinking: "go north", reply: "ok" });
  });
  it("restores in-flight thinking, then clears it on the next turn", () => {
    const log = new Log(); log.add(0, START); log.add(1, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 9 } }); log.add(2, { type: "assistant_delta", turn: 1, thinking: "hmm", text: "" });
    const open = currentView(parseCurrent(JSON.parse(JSON.stringify(apply(log)))));
    expect(open.streaming.thinking).toBe("hmm"); expect(open.isThinking).toBe(true); expect(thinkingDialog(open, open.turnStartMs ?? 0).body).toContain("hmm");
    log.add(3, assistant({ turn: 1, thinking: "hmm", text: "ok" })); log.add(1, { type: "turn_start", turn: 2, context: { messages: 1, images: 0, est_tokens: 9 } });
    expect(currentView(apply(log)).streaming.thinking).toBe("");
  });
  it("reads checkpoints saved before thinking was stored", () => {
    const log = new Log(); log.add(0, START);
    const old: Record<string, unknown> = { ...apply(log) }; delete old["thought"]; delete old["streaming"];
    expect(parseCurrent(JSON.parse(JSON.stringify(old))).thought).toBeNull();
  });
  it("refuses a malformed stored thought", () => {
    const log = new Log(); log.add(0, START);
    expect(() => parseCurrent({ ...apply(log), thought: { turn: "1" } })).toThrow("Invalid current checkpoint");
  });
});

describe("jumping a lagging feed to the tail", () => {
  it("jumps only when the unread backlog exceeds the limit", () => {
    expect(behindLive(100, 50, 49)).toBe(true);
    expect(behindLive(100, 50, 50)).toBe(false);
  });
  it("drops in-flight fields that ended in the skipped span", () => {
    const log = new Log(); log.add(0, START); log.add(1, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 9 } }); log.add(2, { type: "assistant_delta", turn: 1, thinking: "stale", text: "" });
    const saved = apply(log);
    log.add(3, assistant({ turn: 1, thinking: "stale", text: "r" })); log.add(4, { type: "turn_start", turn: 2, context: { messages: 1, images: 0, est_tokens: 9 } }); log.add(5, { type: "assistant_delta", turn: 2, thinking: "new", text: "" });
    const jumped = jumpToTail(saved, log.events.slice(-1));
    expect(jumped.streaming.thinking).toBe("new"); expect(jumped.requestAt).toBeNull(); expect(jumped.openTools).toEqual({});
  });
  it("shows the newest events now and keeps what it already knew", () => {
    const log = new Log(); log.add(0, START); log.add(1, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 9 } }); log.add(3, assistant({ turn: 1, thinking: "old", text: "old" }));
    const saved = apply(log);
    for (let turn = 2; turn < 50; turn++) { log.add(1, { type: "turn_start", turn, context: { messages: 1, images: 0, est_tokens: 9 } }); log.add(3, assistant({ turn, thinking: `t${String(turn)}`, text: "r" })); }
    const jumped = jumpToTail(saved, log.events.slice(-2));
    expect(jumped.turn).toBe(49); expect(jumped.thought?.thinking).toBe("t49"); expect(jumped.start).toEqual(saved.start);
  });
});
