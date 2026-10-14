import {expect,it} from "vitest";
import {LoopDetector,LOOP_POLICY,type CompletedCall,type LoopNotice} from "./loop-detection.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {ALL_ON,featureInfo,dependencyProblems} from "./features.js";
import {playSystemPrompt} from "./play-config.js";
import {attachLoopGuard,Governor} from "./harness.js";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,parseEvent,type RunEvent} from "./events.js";

const policy={...LOOP_POLICY,planning:2,observation:2,ineffective:2,cycleRepeats:2,rejection:2,recovery:2};
const planning=(name="set_objective"):CompletedCall=>({name,args:{},isError:false,text:"ok"});
const supervised=(brief=()=>"SUPERVISOR: brief")=>{
 const notices:LoopNotice[]=[];
 const detector=new LoopDetector(n=>notices.push(n),policy,"enforced",false,brief);
 return {detector,notices};
};
const loopUntilWarned=(d:LoopDetector)=>{d.complete(planning());d.complete(planning("get_objectives"));d.context();};

it("posts a supervisor briefing instead of stopping, and the run keeps going",()=>{
 const {detector,notices}=supervised();
 loopUntilWarned(detector);
 expect(notices.map(n=>n.phase)).toEqual(["warning"]);
 detector.complete(planning());detector.complete(planning());
 expect(detector.stopped).toBe(false);
 expect(notices.at(-1)).toMatchObject({phase:"supervisor",mode:"enforced",message:"SUPERVISOR: brief"});
 expect(detector.context()).toContain("SUPERVISOR: brief");
});

it("backs off: each further briefing needs twice as many looping calls, up to a cap",()=>{
 let n=0;const {detector,notices}=supervised(()=>`SUPERVISOR: brief ${String(++n)}`);
 loopUntilWarned(detector);
 for(let i=1;i<=200;i++)detector.complete(planning());
 const supervisorCalls=notices.filter(x=>x.phase==="supervisor").map(x=>x.calls);
 const gaps=supervisorCalls.slice(1).map((c,i)=>c-(supervisorCalls[i]??0));
 expect(gaps.slice(0,4)).toEqual([4,8,16,32]);
 expect(new Set(gaps.slice(4))).toEqual(new Set([32]));
 expect(detector.stopped).toBe(false);
 expect(detector.context()).toMatch(/SUPERVISOR: brief \d+/);
});

it("still recovers normally after a briefing and clears the context note",()=>{
 const {detector,notices}=supervised();
 loopUntilWarned(detector);detector.complete(planning());detector.complete(planning());
 const state={...IN_GAME,started:true as const,screen:"overworld" as const,position:{x:9,y:9}};
 detector.complete({name:"press",args:{buttons:["UP"]},isError:false,text:"ok",state,beforeState:IN_GAME});
 expect(notices.at(-1)?.phase).toBe("recovered");
 expect(detector.context()).toBeNull();
});

it("leaves the original stop untouched without a supervisor, and in diagnostic mode",()=>{
 const notices:LoopNotice[]=[];const plain=new LoopDetector(n=>notices.push(n),policy);
 loopUntilWarned(plain);plain.complete(planning());plain.complete(planning());
 expect(plain.stopped).toBe(true);expect(notices.at(-1)?.phase).toBe("stop");
 const diag:LoopNotice[]=[];const d=new LoopDetector(n=>diag.push(n),policy,"diagnostic",false,()=>"SUPERVISOR");
 d.complete(planning());d.complete(planning("get_objectives"));d.complete(planning());d.complete(planning());
 expect(diag.map(n=>n.phase)).not.toContain("supervisor");
});

it("records a schema-valid supervisor event and never aborts the governor",()=>{
 const recorded:RunEvent[]=[];let seq=0;
 const recorder={subscribe:()=>undefined,recordLoopGuard:(body:LoopNotice)=>{recorded.push(checkEvent({v:1,run:"r",t:"2026-10-14T12:00:00.000-04:00",turn:1,seq:seq++,type:"loop_guard",...body}));}};
 const governor=new Governor({limits:{maxTurns:100,maxWallMs:60_000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const detector=attachLoopGuard(recorder,governor,policy,"enforced",false,()=>"SUPERVISOR: brief");
 loopUntilWarned(detector);detector.complete(planning());detector.complete(planning());
 expect(governor.stopReason).toBeNull();
 const last=recorded.at(-1);expect(last?.type).toBe("loop_guard");
 expect(()=>parseEvent(JSON.stringify(last))).not.toThrow();
});

const ev=(body:Record<string,unknown>,seq:number,turn=1):RunEvent=>checkEvent({v:1,run:"brief-test",t:"2026-10-14T12:00:00.000-04:00",turn,seq,...body});
const DOOR={name:"DOOR",kind:"warp",x:5,y:1,elevation:0,activation:"walk into it",availability:"observed",facing:null,local_id:null,destination:[1,2,0]};
const MOM={name:"MOM",kind:"object",x:2,y:6,elevation:0,activation:"press_a",availability:"live",facing:null,local_id:1,destination:null};
const TV={name:"TV",kind:"bg",x:4,y:1,elevation:0,activation:"press_a",availability:"observed",facing:null,local_id:null,destination:null};
const st=(seq:number,extra:Record<string,unknown>={})=>ev({type:"state",...IN_GAME,started:true,screen:"overworld",location:"HOUSE 1F",map_id:[1,0],position:{x:3,y:3},facing:"up",field_controls_locked:false,interaction_targets:[DOOR,MOM,TV],world_context:{objects:[],triggers:[],dialogue:null},...extra},seq);
const delivered=(b:SupervisorBriefing,seq:number,extra:Record<string,unknown>={},id="t")=>{b.observe(st(seq,extra));b.observe(ev({type:"tool_result",id,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:seq},seq+1));};

it("briefs where the agent is, what it was told, what it tried and what it has not tried",()=>{
 const b=new SupervisorBriefing(ALL_ON);
 delivered(b,1,{world_context:{objects:[],triggers:[],dialogue:"Your neighbor has a kid your age."}});
 b.observe(ev({type:"tool_call",id:"n1",name:"navigate_to",args:{x:4,y:2,map_id:[1,0]}},3));
 delivered(b,4,{position:{x:4,y:2}},"n1");
 b.observe(ev({type:"tool_call",id:"p1",name:"press",args:{buttons:["A"]}},6));
 delivered(b,7,{position:{x:4,y:2},facing:"up"},"p1");
 b.observe(ev({type:"tool_call",id:"p2",name:"press",args:{buttons:["A"]}},9));
 delivered(b,10,{position:{x:4,y:2},facing:"up"},"p2");
 const text=b.text("cycle",12);
 expect(text).toContain("SUPERVISOR");
 expect(text).toContain("HOUSE 1F (map 1/0) at 4,2 facing up");
 expect(text).toContain("Your neighbor has a kid your age.");
 expect(text).toContain("navigate_to 4,2");
 expect(text).toMatch(/A facing TV at 4,1 ×2/);
 expect(text).toContain("DOOR at 5,1");expect(text).toContain("MOM at 2,6");
 expect(text.slice(text.indexOf("not tried"))).not.toContain("TV at 4,1");
 expect(text).toContain("recall_dialogue");
 expect(text).not.toMatch(/go to|next door|rival|lab/i);
});

it("stays honest when the readout lacks positions, targets or dialogue, and stays bounded",()=>{
 const bare=new SupervisorBriefing({...ALL_ON,"world-targets-v1":false,"live-player-position-v1":false,"dialogue-log-v1":false});
 delivered(bare,1,{world_context:{objects:[],triggers:[],dialogue:"Hello."}});
 const text=bare.text("ineffective",3);
 expect(text).not.toContain("3,3");expect(text).toContain("not available");expect(text).not.toContain("recall_dialogue");
 const empty=new SupervisorBriefing(ALL_ON).text("planning",0);
 expect(empty).toContain("no observation yet");
 const big=new SupervisorBriefing(ALL_ON);
 const many=Array.from({length:60},(_,i)=>({...MOM,name:`NPC${String(i)}`,x:i,y:i}));
 delivered(big,1,{interaction_targets:many,world_context:{objects:[],triggers:[],dialogue:"x".repeat(5000)}});
 for(let i=0;i<40;i++){big.observe(ev({type:"tool_call",id:`c${String(i)}`,name:"navigate_to",args:{x:i,y:0,map_id:[1,0]}},10+i*3));delivered(big,11+i*3,{interaction_targets:many},`c${String(i)}`);}
 expect(big.text("cycle",200).length).toBeLessThanOrEqual(2500);
});

it("registers the switch as a guard that needs the loop guard, with a prompt line",()=>{
 expect(featureInfo("loop-guard-supervisor-v1")).toMatchObject({group:"guard",needs:"deterministic-loop-guard-v1"});
 expect(dependencyProblems({...ALL_ON,"deterministic-loop-guard-v1":false})).toContain("loop-guard-supervisor-v1 needs deterministic-loop-guard-v1");
 expect(playSystemPrompt({...ALL_ON,"loop-guard-supervisor-v1":true},null)).toContain("SUPERVISOR");
 expect(playSystemPrompt({...ALL_ON,"loop-guard-supervisor-v1":false},null)).not.toContain("SUPERVISOR");
});

it("labels odd calls and outcomes truthfully",()=>{
 const b=new SupervisorBriefing(ALL_ON);
 b.observe(ev({type:"tool_call",id:"early",name:"press",args:{buttons:["B"]}},0));
 delivered(b,1,{},"early");
 b.observe(ev({type:"tool_call",id:"bad",name:"navigate_to",args:{x:"5",y:1}},3));delivered(b,4,{},"bad");
 b.observe(ev({type:"tool_call",id:"none",name:"press",args:{buttons:[]}},6));delivered(b,7,{},"none");
 b.observe(ev({type:"tool_call",id:"talk",name:"press",args:{buttons:["A"]}},9));delivered(b,10,{world_context:{objects:[],triggers:[],dialogue:"Hi."}},"talk");
 b.observe(ev({type:"tool_call",id:"blind",name:"press",args:{buttons:["A"]}},12));delivered(b,13,{facing:null},"blind");
 b.observe(ev({type:"tool_call",id:"odd",name:"press",args:{buttons:["A"]}},15));delivered(b,16,{facing:"sideways"},"odd");
 b.observe(ev({type:"tool_call",id:"walk",name:"press",args:{buttons:["UP","UP"]}},18));delivered(b,19,{location:"TOWN",map_id:[0,9]},"walk");
 b.observe(ev({type:"tool_call",id:"menu",name:"press",args:{buttons:["START"]}},21));delivered(b,22,{screen:"menu"},"menu");
 for(let i=0;i<20;i++)b.observe(ev({type:"tool_call",id:`x${String(i)}`,name:"press",args:{buttons:["B"]}},30+i));
 const text=b.text("ineffective",40);
 expect(text).toContain("press B in HOUSE 1F (map 1/0) → result unverified");
 expect(text).toContain("navigate_to (invalid target)");
 expect(text).toContain("A facing tile at 3,2 ×2 in HOUSE 1F (map 1/0) → dialogue changed");
 expect(text).toContain("press A in HOUSE 1F (map 1/0) → no change");
 expect(text).toContain("press UP,UP in HOUSE 1F (map 1/0) → entered TOWN (map 0/9)");
 expect(text).toContain("Where you are: TOWN (map 0/9) at 3,3 facing up");
 const unnamed=new SupervisorBriefing({...ALL_ON,"named-interactions-v1":false});
 unnamed.observe(ev({type:"tool_call",id:"a",name:"press",args:{buttons:["A"]}},0));delivered(unnamed,1,{position:{x:4,y:2}},"x");
 unnamed.observe(ev({type:"tool_call",id:"b",name:"press",args:{buttons:["A"]}},3));delivered(unnamed,4,{position:{x:9,y:9}},"b");
 expect(unnamed.text("cycle",5)).toContain("A facing bg at 4,1");
 expect(unnamed.text("cycle",5)).toContain("warp at 5,1");
 const done=new SupervisorBriefing(ALL_ON);delivered(done,1,{interaction_targets:[{...MOM,x:3,y:3}]});
 expect(done.text("cycle",2)).toContain("every listed target here has been tried");
 const quiet=new SupervisorBriefing({...ALL_ON,"active-field-message-buffer-v1":false});delivered(quiet,1);
 expect(quiet.text("cycle",2)).toContain("dialogue text is off");
 expect(new SupervisorBriefing({...ALL_ON,"live-player-position-v1":false}).text("cycle",0)).toContain("none recorded");
});

it("keeps tried tiles separate for maps that share a location label",()=>{
 const b=new SupervisorBriefing(ALL_ON);
 b.observe(ev({type:"tool_call",id:"n",name:"navigate_to",args:{x:5,y:1,map_id:[1,0]}},0));delivered(b,1,{},"n");
 delivered(b,3,{map_id:[1,1]});
 const text=b.text("cycle",4);
 expect(text.slice(text.indexOf("not tried"))).toContain("DOOR at 5,1");
 expect(text).not.toMatch(/\b(rival|birch|professor|may|brendan|neighbou?r|next door|lab|littleroot|oldale|petalburg|rustboro|route|starter|gym|badge)\b/i);
});

it("describes the live backoff schedule that LOOP_POLICY actually produces",()=>{
 const windows:number[]=[];let w:number=LOOP_POLICY.recovery;for(let i=0;i<6;i++){windows.push(w);w=Math.min(w*2,LOOP_POLICY.recovery*16);}
 expect(windows).toEqual([6,12,24,48,96,96]);
 expect(featureInfo("loop-guard-supervisor-v1").description).toContain(`after ${String(windows[0])} looping calls, then ${String(windows[1])}, ${String(windows[2])} and ${String(windows[3])} more, then every ${String(windows[4])}`);
});

it("catches a two-button walk-and-talk loop like trial 1 of the first 2×2 and keeps the run going",()=>{
 const notices:LoopNotice[]=[];
 const d=new LoopDetector(n=>notices.push(n),LOOP_POLICY,"enforced",true,(k,c)=>`SUPERVISOR ${k} ${String(c)}`);
 const at=(x:number)=>({...IN_GAME,started:true as const,screen:"overworld" as const,location:"TOWN",map_id:[0,9] as [number,number],position:{x,y:2},facing:x===9?"left":"right",field_controls_locked:false});
 let x=10;
 for(let i=0;i<60;i++){
  const before=at(x);x=x===10?9:10;
  d.complete({name:"press",args:{buttons:[x===9?"LEFT":"RIGHT","A"]},isError:false,text:"ok",state:at(x),beforeState:before});
  d.context();
 }
 expect(notices.map(n=>n.phase)).toContain("warning");
 expect(notices.filter(n=>n.phase==="supervisor").length).toBeGreaterThanOrEqual(2);
 expect(notices.map(n=>n.phase)).not.toContain("stop");
 expect(d.stopped).toBe(false);
 expect(d.context()).toContain("SUPERVISOR cycle");
});

it("quotes the model's own latest plan, the characters the readout names and the story steps done",()=>{
 const b=new SupervisorBriefing(ALL_ON);
 b.observe(ev({type:"assistant",thinking:"I need to face Professor Birch to talk.",text:"",tool_calls:[],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:1,stop_reason:"toolUse"},1,7));
 delivered(b,2,{story:{name_confirmed:true,intro_stage:null,rival_stage:null,birch_lab_stage:null,petalburg_gym_stage:null,woods_stage:null,clock_set:true,rival_battle_won:null,pokedex_received:null,running_shoes_received:null,starter_tutorial_complete:null,rustboro_gym_complete:null,stone_badge:null,rock_tomb_received:null}});
 const text=b.text("cycle",9);
 expect(text).toContain('Your latest plan, in your own words: turn 7: "I need to face Professor Birch to talk."');
 expect(text).toContain("Characters the readout names here: MOM at 2,6");
 expect(text).toMatch(/Story steps the game confirms are done: [^\n]*clock set/);
 expect(text).toContain("believe the readout");
 const off=new SupervisorBriefing({...ALL_ON,"named-interactions-v1":false,"story-state-v1":false});delivered(off,1);
 expect(off.text("cycle",2)).toContain("named interactions are off");expect(off.text("cycle",2)).toContain("story flags are off");
 expect(new SupervisorBriefing(ALL_ON).text("cycle",0)).toContain("Your latest plan, in your own words: none recorded");
});
