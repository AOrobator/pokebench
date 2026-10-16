import {describe,expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {withDialogueAutoAdvance,type AutoAdvanceRecorder} from "./dialogue-auto-advance.js";
import {gameTools,type Clock} from "./game-tools.js";
import {flagFeatures} from "./play-preset.js";
import {toolSwitches} from "./play-config.js";
import {ALL_ON,dependencyProblems,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import type {Button,RunEvent} from "./events.js";
import type {GameStateSnapshot} from "./game-state.js";
import {pushbackPressResult} from "./press-result.js";
import {MESSAGE_WAITING} from "./navigation.js";
import {Type} from "typebox";
import {IN_GAME} from "../test-support/events.js";

const URL_BASE="http://127.0.0.1";
const BASE:FeatureSet={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"field-dialogue-phase-v1":true,"dialogue-auto-advance-v1":true,"transition-press-result-v1":true};
const ON:FeatureSet={...BASE,"pushback-press-result-v1":true};
const OFF:FeatureSet={...BASE,"pushback-press-result-v1":false};
const png=(()=>{const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write("IHDR",12);b.writeUInt32BE(240,16);b.writeUInt32BE(160,20);return b.toString("base64");})();
const ID=(text:string)=>Buffer.from(text).toString("hex").padEnd(64,"0").slice(0,64);
type Tile={readonly x:number;readonly y:number};

// A field where stepping onto `trigger` starts a script message; when its last page is dismissed the script
// walks the player to `home` (Route101_EventScript_PreventExitWest; the Littleroot twin), as pokeemerald does.
class PushbackGame{
 posts:Button[]=[];
 private mode:"free"|"message"="free";private page=0;private printing=0;
 constructor(private position:Tile,private facing:string,private readonly trigger:Tile,private readonly home:Tile,private readonly pages:readonly string[],private readonly place={location:"ROUTE101",map_id:[0,16] as [number,number]}){}
 openNow(){this.mode="message";this.page=0;this.printing=0;}
 private open(){this.mode="message";this.page=0;this.printing=1;}
 press(buttons:readonly Button[]){
  for(const b of buttons){
   this.posts.push(b);
   if(this.mode==="free"){
    const step=({UP:[0,-1],DOWN:[0,1],LEFT:[-1,0],RIGHT:[1,0]} as Record<string,readonly [number,number]|undefined>)[b];
    if(step===undefined)continue;
    this.facing=b.toLowerCase();
    this.position={x:this.position.x+step[0],y:this.position.y+step[1]};
    if(this.position.x===this.trigger.x&&this.position.y===this.trigger.y)this.open();
   }else if((b==="A"||b==="B")&&this.printing===0){
    this.page++;
    if(this.page>=this.pages.length){this.mode="free";this.position=this.home;}
    else this.printing=1;
   }
  }
 }
 tick(){if(this.mode==="message"&&this.printing>0)this.printing--;}
 state():GameStateSnapshot{
  const base:GameStateSnapshot={...IN_GAME,location:this.place.location,map_id:this.place.map_id,position:this.position,facing:this.facing,active_ui:null,naming:null,field_controls_locked:false,world_context:{objects:[],triggers:[],dialogue:null,message:null}};
  if(this.mode!=="message")return base;
  const text=this.pages[this.page]??"";const last=this.page===this.pages.length-1;
  return {...base,field_controls_locked:true,world_context:{objects:[],triggers:[],dialogue:text,message:{phase:this.printing>0?"printing":last?"dismiss_wait":"page_wait",cursor:this.printing>0?1:text.length,ready:this.printing===0,identity:ID(text)}}};
 }
 fetch:typeof fetch=(input,init)=>{
  const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown;
  if(url.endsWith("/action")){if(typeof init?.body!=="string")throw new Error("body");this.press((JSON.parse(init.body) as {buttons:Button[]}).buttons);body={status:"success"};}
  else if(url.endsWith("/queue_status"))body={queue_empty:true};
  else if(url.endsWith("/pokebench/observation")){this.tick();const s=this.state();body={state_text:`Location: ${s.location??""}`,screenshot_base64:png,state:s};}
  else if(url.endsWith("/pokebench/state")){this.tick();body=this.state();}
  else throw new Error(`Unexpected request ${url}`);
  return Promise.resolve(new Response(JSON.stringify(body)));
 };
 read={read:()=>{this.tick();return Promise.resolve(this.state());}};
}

function wire(game:PushbackGame,features:FeatureSet){
 const clock:Clock&{t:number}={t:0,now:()=>clock.t,sleep:(ms:number)=>{clock.t+=ms;return Promise.resolve();}};
 const events:RunEvent[]=[];let seq=0;
 const push=(body:Record<string,unknown>)=>{const e={v:1,run:"r",seq:++seq,t:"2026-10-16T03:00:00.000-04:00",turn:7,...body} as RunEvent;events.push(e);return {seq:e.seq,turn:7};};
 const recorder:AutoAdvanceRecorder={recordState:s=>push({type:"state",...s}),recordDialogueAutoAdvance:b=>push({type:"dialogue_auto_advance",...b}),subscribe:()=>undefined};
 const base=gameTools(URL_BASE,{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},game.fetch,toolSwitches(features),clock);
 // navigate_to that finds a message already open and so does not walk (54a7 T92), as navigation reports it.
 const nav:AgentTool={name:"navigate_to",label:"Navigate",description:"walk",parameters:Type.Object({}),execute:()=>{const s=game.state();return Promise.resolve({content:[{type:"text" as const,text:`Navigation: refused: ${MESSAGE_WAITING}; 0 ordinary button attempts.`}],details:{state:s,navigation:{unready:true,status:MESSAGE_WAITING,commands:0}}});}};
 const tools=withDialogueAutoAdvance([...base,nav],features,{state:game.read,recorder,clock});
 const press=tools.find(t=>t.name==="press") as AgentTool;
 const navigate=tools.find(t=>t.name==="navigate_to") as AgentTool;
 return Object.assign((buttons:Button[],id="c1")=>press.execute(id,{buttons}),{events,navigate:()=>navigate.execute("n1",{})});
}
const pressLine=(r:AgentToolResult<unknown>)=>/^Press result: (.*)$/m.exec(r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n"))?.[1];

const BIRCH_PAGES=["Wh-Where are you going?!\nDon't leave me like this!"];
const TWIN_PAGES=["Um, um, um!","If you go outside and go in the grass,\nwild POKéMON will jump out!","It's dangerous if you don't have\nyour own POKéMON."];
const birch=()=>new PushbackGame({x:7,y:15},"right",{x:6,y:15},{x:7,y:15},BIRCH_PAGES);
// The twin's message is already open at (11,1) when the model presses UP (sh02 T146); its script walks the player to (11,2).
const twin=()=>{const g=new PushbackGame({x:11,y:1},"up",{x:11,y:1},{x:11,y:2},TWIN_PAGES,{location:"LITTLEROOT TOWN",map_id:[0,9]});g.openNow();return g;};

describe("pushback-press-result-v1: navigate_to while the twin's message is open (54a7 T90-T114, audit 2)",()=>{
 const status=(r:AgentToolResult<unknown>)=>r.content.flatMap(p=>p.type==="text"?[p.text]:[])[0];
 it("OFF: today's advice to call navigate_to again",async()=>{
  expect(status(await wire(twin(),OFF).navigate())).toBe("Navigation: a message was open, so navigate_to did not walk; after auto-advance: the conversation closed and field controls are free; call navigate_to again; 0 ordinary button attempts.");
 });
 it("ON: the script's move replaces the advice",async()=>{
  expect(status(await wire(twin(),ON).navigate())).toBe("Navigation: a message was open, so navigate_to did not walk; after auto-advance: the conversation closed and field controls are free; a script moved you (11,1) -> (11,2) while the dialogue advanced; 0 ordinary button attempts.");
 });
});

describe("pushback-press-result-v1: a walk batch cut short by the message it opened (sh02 T264, audit 5)",()=>{
 const batch:Button[]=["LEFT","LEFT","LEFT","UP","UP","UP"];
 const advance=(press:ReturnType<typeof wire>)=>press.events.find((e):e is Extract<RunEvent,{type:"dialogue_auto_advance"}>=>e.type==="dialogue_auto_advance");
 it("OFF: today's record says all six were sent and none dropped",async()=>{
  const press=wire(birch(),OFF);const text=(await press(batch)).content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
  expect(advance(press)).toMatchObject({sent:batch,dropped:[]});
  expect(text).not.toContain("had no effect");
 });
 it("ON: when every input ran before the message opened (RIGHT, LEFT, UP onto the trigger), nothing is dropped",async()=>{
  const press=wire(new PushbackGame({x:7,y:15},"right",{x:7,y:14},{x:7,y:15},BIRCH_PAGES),ON);
  const text=(await press(["RIGHT","LEFT","UP"])).content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
  expect(advance(press)).toMatchObject({sent:["RIGHT","LEFT","UP"],dropped:[]});
  expect(text).not.toContain("had no effect");
 });
 it("ON: the step that opened the message is sent; the five pressed under its lock count as dropped, and the result says so",async()=>{
  const press=wire(birch(),ON);const text=(await press(batch)).content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
  expect(advance(press)).toMatchObject({requested:batch,sent:["LEFT"],dropped:["LEFT","LEFT","UP","UP","UP"]});
  expect(text).toContain("5 inputs of your batch had no effect (counted as dropped): the message opened during the batch and held field controls while they were pressed: LEFT, LEFT, UP, UP, UP.");
 });
});

describe("pushback-press-result-v1: Birch stops the player leaving west (sh02 T263)",()=>{
 it("OFF: today's text never says the script moved the player back",async()=>{
  const line=pressLine(await wire(birch(),OFF)(["LEFT","LEFT","LEFT","UP","UP","UP"]));
  expect(line).toBe("moved (7,15) -> (6,15)");
 });
 it("ON: says the press moved the player, the script moved them back, with tiles",async()=>{
  const line=pressLine(await wire(birch(),ON)(["LEFT","LEFT","LEFT","UP","UP","UP"]));
  expect(line).toBe("moved (7,15) -> (6,15); this call: your press moved you (7,15) -> (6,15), then a script moved you back (6,15) -> (7,15) while the dialogue advanced; you are back where this press began");
 });
 it("ON: the second attempt keeps the restarted-conversation note and adds the movement",async()=>{
  const game=birch();const press=wire(game,ON);
  await press(["LEFT","LEFT","LEFT","UP","UP","UP"],"c1");
  const line=pressLine(await press(["LEFT","LEFT","LEFT","UP","UP","UP"],"c2"));
  expect(line).toBe("conversation restarted: this text was already shown (2nd time); this call: your press moved you (7,15) -> (6,15), then a script moved you back (6,15) -> (7,15) while the dialogue advanced; you are back where this press began");
 });
 it("OFF: the second attempt says only that the conversation restarted",async()=>{
  const game=birch();const press=wire(game,OFF);
  await press(["LEFT","LEFT","LEFT","UP","UP","UP"],"c1");
  expect(pressLine(await press(["LEFT","LEFT","LEFT","UP","UP","UP"],"c2"))).toBe("conversation restarted: this text was already shown (2nd time)");
 });
});

describe("pushback-press-result-v1: the Route 101 twin walks the player back (sh02 T146)",()=>{
 it("OFF: today's false 'no net movement'",async()=>{
  expect(pressLine(await wire(twin(),OFF)(["UP"]))).toBe("locked (field controls locked in a snapshot; no net movement)");
 });
 it("ON: the press did not move the player; the script did, with tiles",async()=>{
  expect(pressLine(await wire(twin(),ON)(["UP"]))).toBe("locked (field controls locked in a snapshot; no movement by the press); this call: your press did not move you, then a script moved you (11,1) -> (11,2) while the dialogue advanced");
 });
});

describe("pushback-press-result-v1 wording rules",()=>{
 const at=(x:number,y:number,map:[number,number]=[0,16],location="ROUTE101"):GameStateSnapshot=>({...IN_GAME,location,map_id:map,position:{x,y},facing:"left",field_controls_locked:false});
 const SHOW={position:true,fieldLock:true};
 it("leaves the line unchanged when the script did not move the player",()=>{
  expect(pushbackPressResult("dialogue opened",at(7,15),at(7,15),at(7,15),SHOW)).toBe("dialogue opened");
 });
 it("leaves the line unchanged when a state has no position",()=>{
  expect(pushbackPressResult("x",at(7,15),{...at(6,15),position:null},at(7,15),SHOW)).toBe("x");
  expect(pushbackPressResult("x",undefined,at(6,15),at(7,15),SHOW)).toBe("x");
 });
 it("drops the tiles when positions are hidden",()=>{
  expect(pushbackPressResult("moved",at(7,15),at(6,15),at(7,15),{position:false,fieldLock:true})).toBe("moved; this call: your press moved you, then a script moved you back while the dialogue advanced; you are back where this press began");
 });
 it("names both places when the script moved the player to another map",()=>{
  expect(pushbackPressResult("dialogue opened",at(5,5),at(5,5),at(3,8,[1,4],"LITTLEROOT TOWN PROFESSOR BIRCHS LAB"),SHOW)).toBe("dialogue opened; this call: your press did not move you, then a script moved you ROUTE101 [map 0/16] (5,5) -> LITTLEROOT TOWN PROFESSOR BIRCHS LAB [map 1/4] (3,8) while the dialogue advanced");
 });
 it("does not call it 'back' when the script left the player somewhere new",()=>{
  expect(pushbackPressResult("moved (7,15) -> (6,15)",at(7,15),at(6,15),at(6,16),SHOW)).toBe("moved (7,15) -> (6,15); this call: your press moved you (7,15) -> (6,15), then a script moved you (6,15) -> (6,16) while the dialogue advanced");
 });
});

describe("pushback-press-result-v1 registry and wiring",()=>{
 it("is a default-off guidance switch with no dependency, recorded second to last",()=>{
  expect(featureInfo("pushback-press-result-v1")).toMatchObject({group:"guidance",needs:null,switchable:true});
  expect(featureInfo("pushback-press-result-v1").description).toContain(" Off: ");
  expect(playHarnessFeatures(ALL_ON,null).at(-4)).toBe("pushback-press-result-v1");
  expect(dependencyProblems({...ALL_ON,"dialogue-auto-advance-v1":false})).not.toContainEqual(expect.stringContaining("pushback-press-result-v1"));
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})["pushback-press-result-v1"]).toBe(false);
 });
 it("the tool switches carry it from the FeatureSet",()=>{
  expect(toolSwitches(ON).pushback).toBe(true);
  expect(toolSwitches(OFF).pushback).toBe(false);
 });
});
