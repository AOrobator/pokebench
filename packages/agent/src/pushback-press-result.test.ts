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
 const tools=withDialogueAutoAdvance(base,features,{state:game.read,recorder,clock});
 const press=tools.find(t=>t.name==="press") as AgentTool;
 return (buttons:Button[],id="c1")=>press.execute(id,{buttons});
}
const pressLine=(r:AgentToolResult<unknown>)=>/^Press result: (.*)$/m.exec(r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n"))?.[1];

const BIRCH_PAGES=["Wh-Where are you going?!\nDon't leave me like this!"];
const TWIN_PAGES=["Um, um, um!","If you go outside and go in the grass,\nwild POKéMON will jump out!","It's dangerous if you don't have\nyour own POKéMON."];
const birch=()=>new PushbackGame({x:7,y:15},"right",{x:6,y:15},{x:7,y:15},BIRCH_PAGES);
// The twin's message is already open at (11,1) when the model presses UP (sh02 T146); its script walks the player to (11,2).
const twin=()=>{const g=new PushbackGame({x:11,y:1},"up",{x:11,y:1},{x:11,y:2},TWIN_PAGES,{location:"LITTLEROOT TOWN",map_id:[0,9]});g.openNow();return g;};

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
 it("is a default-off guidance switch that needs dialogue auto-advance, recorded last",()=>{
  expect(featureInfo("pushback-press-result-v1")).toMatchObject({group:"guidance",needs:"dialogue-auto-advance-v1",switchable:true});
  expect(featureInfo("pushback-press-result-v1").description).toContain(" Off: ");
  expect(playHarnessFeatures(ALL_ON,null).at(-1)).toBe("pushback-press-result-v1");
  expect(dependencyProblems({...ALL_ON,"dialogue-auto-advance-v1":false})).toContain(expect.stringContaining("pushback-press-result-v1"));
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})["pushback-press-result-v1"]).toBe(false);
 });
 it("the tool switches carry it from the FeatureSet",()=>{
  expect(toolSwitches(ON).pushback).toBe(true);
  expect(toolSwitches(OFF).pushback).toBe(false);
 });
});
