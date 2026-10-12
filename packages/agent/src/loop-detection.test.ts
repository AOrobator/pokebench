import { describe, expect, it } from "vitest";
import { LoopDetector, LOOP_POLICY, semanticState, type CompletedCall } from "./loop-detection.js";
import type { GameStateSnapshot } from "./game-state.js";

const field = (x = 0): GameStateSnapshot => ({screen:"overworld",started:true,name:"RED",location:"TOWN",map_id:[0,0],position:{x,y:0},facing:"RIGHT",field_controls_locked:false,in_battle:false,party:[],money:0,badges:[],play_time_s:0});
const call = (name:string, state?:GameStateSnapshot, buttons?:string[]):CompletedCall => ({name,args:buttons===undefined?{}:{buttons},isError:false,text:"ok",state});
const policy = {...LOOP_POLICY, planning:2, observation:2, ineffective:2, cycleRepeats:2, rejection:2, recovery:2};
const fixture = () => { const events: {kind:string;phase:string}[]=[]; const detector=new LoopDetector((e)=>events.push(e),policy); return {detector,events}; };

describe("deterministic loop detection",()=>{
  it("pins production thresholds",()=>expect(LOOP_POLICY).toEqual({planning:6,observation:3,ineffective:3,cycleRepeats:3,rejection:2,recovery:6}));
  it("warns planning churn despite changed arguments; unchanged observe does not clear it",()=>{
    const {detector,events}=fixture(); detector.complete(call("observe",field()));
    detector.complete(call("set_objective"));detector.complete({...call("update_objective"),args:{next_decision:"different prose"}});
    expect(events).toEqual([{kind:"planning",phase:"warning"}]);expect(detector.context()).toContain("does not execute buttons");
    detector.complete(call("observe",field()));detector.complete(call("get_objectives"));
    expect(detector.stopped).toBe(true);expect(events.at(-1)).toEqual({kind:"planning",phase:"stop"});
  });
  it("allows warning to reach context before stopping a large same-turn batch",()=>{
    const {detector,events}=fixture();for(let i=0;i<20;i++)detector.complete(call("set_objective"));
    expect(events).toHaveLength(1);expect(detector.stopped).toBe(false);
    detector.context();detector.complete(call("set_objective"));detector.complete(call("set_objective"));expect(detector.stopped).toBe(true);
  });
  it("actual press recovers planning, whereas objective wording never does",()=>{
    const {detector,events}=fixture();detector.complete(call("set_objective"));detector.complete(call("get_objectives"));detector.context();
    detector.complete(call("press",undefined,["A"]));for(let i=0;i<2;i++)detector.complete(call("update_objective"));
    expect(events.map(e=>e.phase)).toEqual(["warning","recovered","warning"]);expect(detector.stopped).toBe(false);
  });
  it("detects observation stall excluding playtime",()=>{
    const {detector,events}=fixture();detector.complete(call("observe",field()));detector.complete(call("observe",{...field(),play_time_s:8}));detector.complete(call("observe",field()));
    expect(events.at(-1)).toEqual({kind:"observation",phase:"warning"});detector.context();detector.complete(call("observe",field()));detector.complete(call("observe",field()));expect(detector.stopped).toBe(true);
  });
  it("does not treat missing or unobservable states as unchanged",()=>{
    const {detector,events}=fixture();for(let i=0;i<10;i++)detector.complete(call("observe",{...field(),screen:"unknown"}));
    for(let i=0;i<10;i++)detector.complete(call("press",{...field(),in_battle:true},["A"]));expect(events).toEqual([]);
    expect(semanticState({...field(),field_controls_locked:true})).toBe(null);
  });
  it("detects equivalent ineffective single actions, not batches with unknown intermediate effects",()=>{
    const {detector,events}=fixture();detector.complete(call("observe",field()));detector.complete(call("press",field(),["UP"]));detector.complete(call("press",field(),["UP"]));
    expect(events.at(-1)).toEqual({kind:"ineffective",phase:"warning"});detector.context();detector.complete(call("press",field(),["UP"]));detector.complete(call("press",field(),["UP"]));expect(detector.stopped).toBe(true);
    const other=fixture();other.detector.complete(call("observe",field()));for(let i=0;i<10;i++)other.detector.complete(call("press",field(),["LEFT","RIGHT"]));expect(other.events).toEqual([]);
  });
  it("allows new naming letters and cursor changes",()=>{
    const {detector,events}=fixture();for(let i=0;i<12;i++)detector.complete(call("press",{...field(),screen:"naming",naming:{text:"A".repeat(i),page:"uppercase",column:0,row:0,key:"A",ready:true}},["A"]));expect(events).toEqual([]);
  });
  it("detects repeated two-step state/action cycles, not ordinary backtracking",()=>{
    const {detector,events}=fixture();detector.complete(call("observe",field()));
    for(let i=0;i<4;i++)detector.complete(call("press",field((i+1)%2),[i%2===0?"RIGHT":"LEFT"]));
    expect(events.at(-1)).toEqual({kind:"cycle",phase:"warning"});detector.context();for(let i=0;i<4;i++)detector.complete(call("press",field((i+1)%2),[i%2===0?"RIGHT":"LEFT"]));expect(detector.stopped).toBe(true);
    const other=fixture();other.detector.complete(call("observe",field()));for(const x of [1,2,1,0,1,2,3,4])other.detector.complete(call("press",field(x),[x%2?"RIGHT":"LEFT"]));expect(other.events).toEqual([]);
  });
  it("detects repeated equivalent corrections across successful metadata, excluding infrastructure",()=>{
    const {detector,events}=fixture();const bad={...call("update_objective"),isError:true,text:"Completion mismatch at state #123: expected true, observed false"};
    detector.complete(bad);detector.complete(call("get_objectives"));detector.complete({...bad,text:bad.text.replace("123","456")});expect(events.at(-1)).toEqual({kind:"rejection",phase:"warning"});detector.context();detector.complete(bad);detector.complete(bad);expect(detector.stopped).toBe(true);
    const other=fixture();for(let i=0;i<12;i++)other.detector.complete({...bad,text:"GET http://server returned HTTP 503"});expect(other.events).toEqual([]);
  });
  it("emits one shared episode for overlapping detectors and resets on new information",()=>{
    const {detector,events}=fixture();detector.complete(call("observe",field()));detector.complete(call("set_objective"));detector.complete(call("set_objective"));detector.context();detector.complete(call("observe",field()));detector.complete(call("observe",field(1)));
    expect(events.map(e=>e.phase)).toEqual(["warning","recovered"]);expect(detector.stopped).toBe(false);expect(detector.context()).toBe(null);
  });
});
