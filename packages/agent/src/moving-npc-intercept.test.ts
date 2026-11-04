import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import type {Button} from "./events.js";
import {type FeatureSet} from "./features.js";
import {pressTool,type CheckedPressTool} from "./game-tools.js";
import type {GameStateSnapshot} from "./game-state.js";
import {INTERCEPT_MAX_FRAMES,type InterceptPlan,type InterceptReceipt,type PatrolStep,type WatchPlan,type WatchReceipt} from "./intercept.js";
import {flagFeatures} from "./play-preset.js";
import {playSystemPrompt} from "./play-config.js";
import {MOVING_NPC_SENTENCE,PATH_STEP_IN_SENTENCE,pathStepIn} from "./semantic-navigation.js";
import {playGameTools} from "./play-wiring.js";

const ID="moving-npc-intercept-v1";
function must<T>(value:T|undefined|null):T {if(value===undefined||value===null)throw new Error("missing fixture value");return value;}
const request={map_id:[0,9],target:{kind:"object",local_id:2}};
type Target=NonNullable<GameStateSnapshot["interaction_targets"]>[number];
// A 12-tile loop around a 2x2 table at (2..3,2..3) on a 6x6 floor; the person walks it the same way
// round, as the cottage pair does.
const LOOP=[{x:4,y:1},{x:4,y:2},{x:4,y:3},{x:4,y:4},{x:3,y:4},{x:2,y:4},{x:1,y:4},{x:1,y:3},{x:1,y:2},{x:1,y:1},{x:2,y:1},{x:3,y:1}];
const STEPS:PatrolStep[]=LOOP.map((from,i)=>({from,to:must(LOOP[(i+1)%LOOP.length])}));
const table=(x:number,y:number)=>x>=2&&x<=3&&y>=2&&y<=3;
const npc=(p:{x:number;y:number}):Target=>({kind:"object",x:p.x,y:p.y,elevation:3,activation:"A",availability:"conditional",facing:null,local_id:2,native_slot:2,destination:null,name:"PERSON"});
function place(state:GameStateSnapshot,p:{x:number;y:number}):GameStateSnapshot {
 const t=npc(p);
 return {...state,interaction_targets:[t],interaction_object_slots:[{slot:2,local_id:2,x:p.x,y:p.y,elevation:3,map_id:[0,9],is_player:false}],navigation_grid:{elevation:3,tiles:Array.from({length:6},(_,x)=>Array.from({length:6},(_,y)=>({x,y,collision:table(x,y)?1:0,behavior:0,elevation:3}))).flat(),objects:[{x:p.x,y:p.y}],warps:[]}};
}
const field=(p={x:4,y:1})=>place({...IN_GAME,screen:"overworld",started:true,map_id:[0,9],position:{x:5,y:5},facing:"up",field_controls_locked:false},p);
const result=(state:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"state"}],details:{state}});
interface Options {readonly on?:boolean;readonly moves?:boolean;readonly watch?:Partial<WatchReceipt>;readonly intercept?:(plan:Omit<InterceptPlan,"id">,n:number)=>string;readonly overrides?:Partial<FeatureSet>;readonly fallbackOnly?:boolean}
function fixture(o:Options={}){
 let current=field(),pinned=false;const sent:Button[][]=[],watches:Omit<WatchPlan,"id">[]=[],intercepts:Omit<InterceptPlan,"id">[]=[];
 const observe:AgentTool={name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text" as const,text:"state"}],details:{state:current}})};
 const pressFake={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:(id:string,args:{buttons:Button[]})=>pressFake.executeChecked(id,args,()=>undefined),executeChecked:(_id:string,args:{buttons:Button[]},check:(state:GameStateSnapshot)=>void)=>{
  check(current);sent.push(args.buttons);
  const button=args.buttons[0];if(button==="A")current={...current,field_controls_locked:true,world_context:{objects:[],triggers:[],dialogue:"Hello"}};
  else if(button!==undefined){const facing=button.toLowerCase();if(current.facing!==facing)current={...current,facing};else {const dx=button==="RIGHT"?1:button==="LEFT"?-1:0,dy=button==="DOWN"?1:button==="UP"?-1:0;current={...current,position:{x:(current.position?.x??0)+dx,y:(current.position?.y??0)+dy}};}}
  return Promise.resolve(result(current));
 },...(o.fallbackOnly===true?{}:{
  executeWatch:(plan:Omit<WatchPlan,"id">,check:(state:GameStateSnapshot)=>void):Promise<WatchReceipt>=>{
   check(current);watches.push(plan);
   return Promise.resolve({id:"w",...plan,edges:STEPS,frames:12*16+1,reason:"loop closed",stopped:true,...o.watch});
  },
  executeIntercept:(_id:string,plan:Omit<InterceptPlan,"id">,check:(state:GameStateSnapshot)=>void):Promise<AgentToolResult<{state:GameStateSnapshot;intercept:InterceptReceipt}>>=>{
   check(current);intercepts.push(plan);
   const reason=o.intercept?.(plan,intercepts.length)??"entered";
   if(reason==="entered"){pinned=true;current=place({...current,position:plan.enter,facing:"left"},plan.approach);}
   return Promise.resolve({content:[{type:"text",text:`Path step-in receipt: ${reason}`}],details:{state:current,intercept:{id:"i",...plan,frames:20,phase:reason==="entered"?"entered":"waiting",reason,stopped:true}}});
  },
 })} as unknown as CheckedPressTool;
 const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"walkable-floor-v1":true,"semantic-navigation-v1":true,"moving-npc-target-v1":true,[ID]:o.on??true,...o.overrides};
 const recorder={trainerSightCheck:()=>undefined,subscribe:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,destinationCitation:()=>undefined} as unknown as Parameters<typeof playGameTools>[3];
 let reads=0;
 // The person takes one step along the loop before each read until a step-in pins them.
 const tools=playGameTools([observe,pressFake],features,{read:()=>{reads+=1;if(reads>=2&&o.moves!==false&&!pinned)current=place(current,must(LOOP[(reads-1)%LOOP.length]));return Promise.resolve(current);},trainerSight:()=>Promise.resolve({available:false,reason:"fixture"})},recorder);
 const tool=tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing tool");
 return {sent,watches,intercepts,tool,state:()=>current};
}
const text=(out:AgentToolResult<unknown>)=>out.content.flatMap(part=>part.type==="text"?[part.text]:[]).join("\n");

it("watches a person seen moving, steps into their path from beside it, then faces them and presses A once",async()=>{
 const f=fixture();
 const out=await f.tool.execute("pin",request);
 expect(f.watches).toEqual([{map_id:[0,9],target_local_id:2,target_slot:2,max_frames:INTERCEPT_MAX_FRAMES}]);
 expect(f.intercepts).toHaveLength(1);
 const plan=must(f.intercepts[0]);
 expect(LOOP.some(t=>t.x===plan.wait.x&&t.y===plan.wait.y)).toBe(false);
 expect(STEPS.some(s=>s.from.x===plan.approach.x&&s.from.y===plan.approach.y&&s.to.x===plan.enter.x&&s.to.y===plan.enter.y)).toBe(true);
 expect(Math.abs(plan.wait.x-plan.enter.x)+Math.abs(plan.wait.y-plan.enter.y)).toBe(1);
 expect(plan).toMatchObject({map_id:[0,9],target_local_id:2,target_slot:2,elevation:3,max_frames:INTERCEPT_MAX_FRAMES});
 expect(f.sent.filter(b=>b[0]==="A")).toEqual([["A"]]);
 expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:true}});
 expect(text(out)).toContain("Watched the person walk a repeating path of 12 steps without pressing anything.");
 expect(text(out)).toContain(`Stepped into the path at (${String(plan.enter.x)},${String(plan.enter.y)})`);
 expect(text(out)).not.toMatch(/BRINEY|PEEKO|cottage/i);
});

it("leaves a person who has not moved to the ordinary follow without watching",async()=>{
 const f=fixture({moves:false});
 await f.tool.execute("still",request);
 expect(f.watches).toEqual([]);expect(f.intercepts).toEqual([]);
 expect(f.sent.filter(b=>b[0]==="A")).toEqual([["A"]]);
});

it("falls back to the follow when the watch sees no repeating path",async()=>{
 const f=fixture({watch:{edges:STEPS.slice(0,3),reason:"target still",frames:60}});
 const out=await f.tool.execute("wander",request);
 expect(f.intercepts).toEqual([]);
 expect(text(out)).toContain("Watched the person for 60 frames without pressing anything: target still; 3 steps seen, not a repeating path.");
});

it("tries a second step-in after a missed one and reports both",async()=>{
 const f=fixture({intercept:(_p,n)=>n===1?"frame budget":"entered"});
 const out=await f.tool.execute("again",request);
 expect(f.watches).toHaveLength(2);expect(f.intercepts).toHaveLength(2);
 expect(text(out)).toContain(": frame budget.");
 expect(f.sent.filter(b=>b[0]==="A")).toEqual([["A"]]);
});

it("OFF sends no watch or step-in and keeps the tool description and prompt bytes",async()=>{
 const f=fixture({on:false});
 await f.tool.execute("off",request);
 expect(f.watches).toEqual([]);expect(f.intercepts).toEqual([]);
 const flags={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"semantic-navigation-v1":true,"moving-npc-target-v1":true};
 const offPrompt=playSystemPrompt({...flags,[ID]:false},null);
 const onPrompt=playSystemPrompt({...flags,[ID]:true},null);
 expect(offPrompt).toContain(MOVING_NPC_SENTENCE);expect(offPrompt).not.toContain(PATH_STEP_IN_SENTENCE);
 expect(onPrompt.replace(` ${PATH_STEP_IN_SENTENCE}`,"")).toBe(offPrompt);
 expect(f.tool.description).not.toContain(PATH_STEP_IN_SENTENCE);
 expect(fixture().tool.description).toContain(`${MOVING_NPC_SENTENCE} ${PATH_STEP_IN_SENTENCE}`);
});

it("does exactly the OFF follow when the press tool cannot reach the game server's step-in",async()=>{
 const on=fixture({fallbackOnly:true}),off=fixture({on:false});
 const a=await on.tool.execute("old",request),b=await off.tool.execute("old",request);
 expect(on.sent).toEqual(off.sent);expect(text(a)).toBe(text(b));
});

it("chooses a reachable free tile off the path, next to a tile the person steps onto",()=>{
 const state=field();
 const plan=must(pathStepIn(state,STEPS,{mode:"local"}));
 expect(LOOP.some(t=>t.x===plan.wait.x&&t.y===plan.wait.y)).toBe(false);
 // Nearest to the player at (5,5): beside (4,4) at (5,4) or (4,5).
 expect([[5,4],[4,5]]).toContainEqual([plan.wait.x,plan.wait.y]);
 const grid=must(state.navigation_grid);
 const walled={...state,navigation_grid:{...grid,tiles:grid.tiles.map(t=>LOOP.some(l=>l.x===t.x&&l.y===t.y)||(t.x===5&&t.y===5)?t:{...t,collision:1})}};
 expect(pathStepIn(walled,STEPS,{mode:"local"})).toBeNull();
});

function server(routes:Record<string,(body:unknown)=>{status?:number;body:unknown}>){
 const calls:{url:string;method:string;body:unknown}[]=[];
 const fetchFn=((url:string,init?:{method?:string;body?:string})=>{
  const path=new URL(url).pathname;calls.push({url:path,method:init?.method??"GET",body:init?.body===undefined?undefined:JSON.parse(init.body)});
  const handler=routes[`${init?.method??"GET"} ${path}`]??routes[`${init?.method??"GET"} *`];
  if(handler===undefined)throw new Error(`unrouted ${path}`);
  const reply=handler(init?.body===undefined?undefined:JSON.parse(init.body));
  return Promise.resolve(new Response(JSON.stringify(reply.body),{status:reply.status??200}));
 }) as unknown as typeof fetch;
 return {calls,fetchFn};
}
const PNG="iVBORw0KGgoAAAANSUhEUgAAAPAAAACgCAYAAAA=";
const hooks={presses:[] as unknown[],beforePress(...args:unknown[]){this.presses.push(args);},afterPress:()=>Promise.resolve()};
const clock={sleep:()=>Promise.resolve(),now:()=>0};
it("production press tool owns the queue for the watch and the step-in and checks their receipts",async()=>{
 const state=field();let posted:{id:string}|undefined;
 const s=server({
  "GET /pokebench/state":()=>({body:state}),
  "POST /pokebench/intercept/watch":body=>{posted=body as {id:string};return {body:{status:"success"}};},
  "POST /pokebench/intercept":body=>{posted=body as {id:string};return {body:{status:"success"}};},
  "GET /queue_status":()=>({body:{queue_empty:true}}),
  "GET /pokebench/observation":()=>({body:{screenshot_base64:PNG,state,state_text:"text"}}),
  "GET *":()=>({body:posted!==undefined&&"wait" in posted?{...posted,frames:30,phase:"entered",reason:"entered",stopped:true}:{...posted,edges:STEPS,frames:193,reason:"loop closed",stopped:true}}),
 });
 const press=pressTool("http://game",hooks,s.fetchFn,clock);
 const watched=await must(press.executeWatch)({map_id:[0,9],target_local_id:2,target_slot:2,max_frames:240},()=>undefined);
 expect(watched.reason).toBe("loop closed");
 expect(s.calls.map(c=>`${c.method} ${c.url}`).slice(0,3)).toEqual(["GET /pokebench/state","POST /pokebench/intercept/watch","GET /queue_status"]);
 const plan={map_id:[0,9] as [number,number],wait:{x:5,y:1},enter:{x:4,y:1},approach:{x:4,y:2},target_local_id:2,target_slot:2,elevation:3,max_frames:240};
 const stepped=await must(press.executeIntercept)("call",plan,()=>undefined);
 expect(stepped.details.intercept.reason).toBe("entered");
 expect((hooks.presses.at(-1) as unknown[]).slice(0,3)).toEqual(["call",["LEFT"],{hold_frames:241,release_frames:8}]);
 expect(stepped.content.some(part=>part.type==="text"&&part.text.startsWith("Path step-in receipt: "))).toBe(true);
 await expect(must(press.executeIntercept)("bad",{...plan,wait:{x:5,y:5}},()=>undefined)).rejects.toThrow("not next to");
});

it("production press tool cancels on a failed queue wait and rejects a receipt for another request",async()=>{
 const state=field();let cancelled=0;
 const failing=server({
  "GET /pokebench/state":()=>({body:state}),
  "POST /pokebench/intercept/watch":()=>({body:{status:"error",message:"game input queue busy"},status:409}),
  "POST *":()=>{cancelled+=1;return {body:{}};},
 });
 await expect(must(pressTool("http://game",hooks,failing.fetchFn,clock).executeWatch)({map_id:[0,9],target_local_id:2,target_slot:2,max_frames:240},()=>undefined)).rejects.toThrow("game input queue busy");
 expect(cancelled).toBe(1);
 const wrong=server({
  "GET /pokebench/state":()=>({body:state}),
  "POST /pokebench/intercept/watch":()=>({body:{status:"success"}}),
  "GET /queue_status":()=>({body:{queue_empty:true}}),
  "GET *":()=>({body:{id:"someone-else",map_id:[0,9],target_local_id:2,target_slot:2,max_frames:240,edges:[],frames:1,reason:"loop closed",stopped:true}}),
 });
 await expect(must(pressTool("http://game",hooks,wrong.fetchFn,clock).executeWatch)({map_id:[0,9],target_local_id:2,target_slot:2,max_frames:240},()=>undefined)).rejects.toThrow("matching terminal receipt");
 await expect(must(pressTool("http://game",hooks,wrong.fetchFn,clock).executeWatch)({map_id:[0,9],target_local_id:2,target_slot:2,max_frames:240},()=>{throw new Error("changed");})).rejects.toThrow("changed");
});

it("keeps the step-in notes in the first text part, ahead of burst frames, so dialogue auto-advance keeps them",async()=>{
 const f=fixture({overrides:{"moving-npc-frame-burst-v1":true}});
 const out=await f.tool.execute("first",request);
 const first=out.content[0];
 expect(first?.type).toBe("text");
 expect(first?.type==="text"?first.text:"").toMatch(/^Semantic navigation: .*\nWatched the person walk a repeating path of 12 steps/s);
});
