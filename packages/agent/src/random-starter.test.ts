import {readFileSync} from "node:fs";
import {describe,expect,it,vi} from "vitest";
import {featureInfo,featuresOf,playHarnessFeatures,SWITCHABLE_FEATURES} from "./features.js";
import {normalizeFeatures} from "./play-preset.js";
import {toolSwitches} from "./play-config.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {gameTools,type PressHooks} from "./game-tools.js";
import {RANDOM_STARTER_LIMITS,atStarterBag,isStarterPick,pickRandomStarter,starterStep,type RandomStarter} from "./random-starter.js";
import {withDialogueAutoAdvance,type AutoAdvanceRecorder} from "./dialogue-auto-advance.js";
import {IN_GAME} from "../test-support/events.js";

const ID="random-starter-v1";
const events=JSON.parse(readFileSync(new URL("./fixtures/starter-decision.json",import.meta.url),"utf8")) as {seq:number;type:string}[];
const entry=events.find(e=>e.seq===2906);
if(entry===undefined)throw new Error("missing fixture");
const bag=parseGameState(Object.fromEntries(Object.entries(entry).filter(([key])=>!["v","run","seq","t","type","turn"].includes(key))));
const bagUi=bag.active_ui;
if(bagUi==null)throw new Error("fixture has no starter bag");
const off=featuresOf([]),on={...off,[ID]:true};
const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
const NAMES=["TREECKO","TORCHIC","MUDKIP"] as const;
type Phase="starter_label_transition"|"starter_selection"|"starter_confirmation_transition"|"starter_confirmation"|"closed";
// A starter bag that follows pret Task_HandleStarterChooseInput: LEFT/RIGHT move, A opens YES/NO, YES takes the starter, B declines.
function game(opts:{phase?:Phase;transitionPolls?:number;stuck?:boolean}={}){
 let phase:Phase=opts.phase??"starter_selection",index=1,yes=true,polls=opts.transitionPolls??0,party:string|null=null;
 const pressed:string[]=[];
 const name=():string=>NAMES[index]??"TORCHIC";
 const ui=():NonNullable<GameStateSnapshot["active_ui"]>|null=>{
  const details={...(bag.active_ui?.details??{}),selected_index:index,starter:name()};
  if(phase==="starter_confirmation")return {phase,selected:yes?"YES":"NO",ready:true,controls:"UP/DOWN selects; A confirms; B declines",diagnostic:null,value:name(),details};
  if(phase==="starter_selection")return {phase,selected:name(),ready:true,controls:"LEFT/RIGHT selects; A opens confirmation",diagnostic:null,value:null,details};
  if(phase==="closed")return null;
  return {phase,selected:name(),ready:false,controls:"Starter transition; selection input is not active",diagnostic:null,value:null,details};
 };
 const state=():GameStateSnapshot=>({...bag,screen:phase==="closed"?"field_transition":"starter_choice",active_ui:ui(),party:[]});
 const press=(button:string)=>{
  pressed.push(button);
  if(opts.stuck===true)return;
  if(phase==="starter_selection"){if(button==="LEFT"&&index>0)index--;if(button==="RIGHT"&&index<2)index++;if(button==="A"){phase="starter_confirmation";yes=true;}}
  else if(phase==="starter_confirmation"){if(button==="UP")yes=true;if(button==="DOWN")yes=false;if(button==="B")phase="starter_selection";if(button==="A"){if(yes){phase="closed";party=name();}else phase="starter_selection";}}
 };
 const fetchFn=vi.fn<typeof fetch>().mockImplementation((input,init)=>{
  const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;
  if(url.endsWith("/action")&&init?.method==="POST"){
   if(typeof init.body!=="string")throw new Error("Expected JSON text");
   const body=JSON.parse(init.body) as {buttons:string[]};
   for(const b of body.buttons)press(b);
   return Promise.resolve(Response.json({status:"success"}));
  }
  if(url.endsWith("/queue_status"))return Promise.resolve(Response.json({queue_empty:true}));
  if(url.endsWith("/pokebench/state")){
   if(phase==="starter_label_transition"||phase==="starter_confirmation_transition"){if(polls>0)polls--;else if(opts.stuck!==true)phase=phase==="starter_label_transition"?"starter_selection":"starter_confirmation";}
   return Promise.resolve(Response.json(state()));
  }
  if(url.endsWith("/pokebench/observation"))return Promise.resolve(Response.json({state_text:`Screen: ${state().screen}`,state:state(),screenshot_base64:png.toString("base64")}));
  throw new Error(`Unexpected request ${url}`);
 });
 return {fetchFn,pressed,taken:()=>party};
}
const hooks=()=>({beforePress:vi.fn<PressHooks["beforePress"]>(),afterPress:vi.fn<PressHooks["afterPress"]>().mockResolvedValue(undefined)});
const fakeClock=()=>{let t=0;return {now:()=>t,sleep:(ms:number)=>{t+=ms;return Promise.resolve();}};};
const text=(r:{content:readonly {type:string;text?:string}[]})=>r.content.flatMap(c=>c.type==="text"&&c.text!==undefined?[c.text]:[]).join("\n");
const press=(g:ReturnType<typeof game>,features=on,pick:RandomStarter="MUDKIP",h=hooks(),clock=fakeClock())=>{
 const switches=features[ID]?{...toolSwitches(features),randomStarter:()=>pick}:toolSwitches(features);
 const tool=gameTools("http://test",h,g.fetchFn,switches,clock)[1];
 return {tool,h};
};

describe(ID,()=>{
 it("is registered last, default off everywhere, with an Off: clause",()=>{
  expect(SWITCHABLE_FEATURES.at(-13)).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:null,switchable:true,title:"RANDOM STARTER PICK"});
  expect(featureInfo(ID).description).toContain(" Off: the model chooses its starter");
  const {[ID]:_omitted,...omitted}=on;
  expect(_omitted).toBe(true);
  expect(normalizeFeatures(omitted)[ID]).toBe(false);
  expect(playHarnessFeatures(off,null)).not.toContain(ID);
  expect(playHarnessFeatures(on,null).at(-1)).toBe(ID);
  expect(toolSwitches(off).randomStarter).toBeUndefined();
  expect(toolSwitches(on).randomStarter).toBe(pickRandomStarter);
 });
 it("draws 0 or 1 from two choices: 0 is TREECKO, 1 is MUDKIP",()=>{
  const draw=vi.fn((n:number)=>n-2);
  expect(pickRandomStarter(draw)).toBe("TREECKO");
  expect(draw).toHaveBeenCalledWith(2);
  expect(pickRandomStarter(()=>1)).toBe("MUDKIP");
  expect(["TREECKO","MUDKIP"]).toContain(pickRandomStarter());
  expect(isStarterPick({details:{state:null,starterPick:true}})).toBe(true);
  expect(isStarterPick({details:{state:null}})).toBe(false);
  expect(isStarterPick({details:null})).toBe(false);
 });
 it("reads the recorded starter bag as open with no starter",()=>{
  expect(atStarterBag(bag)).toBe(true);
  expect(IN_GAME.party.length).toBeGreaterThan(0);
  expect(atStarterBag({...bag,party:IN_GAME.party})).toBe(false);
  expect(atStarterBag(undefined)).toBe(false);
  expect(atStarterBag({...bag,active_ui:{...bagUi,phase:"starter_unsupported"}})).toBe(false);
  expect(starterStep(bag,"MUDKIP")).toEqual({kind:"press",button:"RIGHT"});
  expect(starterStep(bag,"TREECKO")).toEqual({kind:"press",button:"LEFT"});
  expect(starterStep({...bag,active_ui:{...bagUi,selected:"TREECKO"}},"TREECKO")).toEqual({kind:"press",button:"A"});
  expect(starterStep({...bag,active_ui:{...bagUi,selected:"PIKACHU"}},"TREECKO")).toMatchObject({kind:"stop"});
  expect(starterStep({...bag,active_ui:{...bagUi,diagnostic:"bad"}},"TREECKO")).toEqual({kind:"stop",detail:"bad"});
  const confirm={...bag,active_ui:{...bagUi,phase:"starter_confirmation",selected:"NO",value:"MUDKIP"}};
  expect(starterStep(confirm,"MUDKIP")).toEqual({kind:"press",button:"UP"});
  expect(starterStep({...confirm,active_ui:{...confirm.active_ui,selected:"YES"}},"MUDKIP")).toEqual({kind:"press",button:"A"});
  expect(starterStep(confirm,"TREECKO")).toEqual({kind:"press",button:"B"});
  expect(starterStep({...bag,active_ui:null},"MUDKIP")).toMatchObject({kind:"stop"});
 });
 it.each(["TREECKO","MUDKIP"] as const)("ON: the model's press at the bag is replaced by picking %s, one button per press",async pick=>{
  const g=game();const {tool,h}=press(g,on,pick);
  const r=await tool.execute("call-1",{buttons:["A","A"]});
  expect(g.taken()).toBe(pick);
  expect(g.pressed).toEqual(pick==="MUDKIP"?["RIGHT","A","A"]:["LEFT","A","A"]);
  expect(h.beforePress.mock.calls.map(c=>[c[0],c[1]])).toEqual(g.pressed.map(b=>["call-1",[b]]));
  expect(text(r)).toContain(`Starter pick: the harness chose ${pick} at random (TREECKO or MUDKIP, 50/50) and confirmed it. Your buttons were not sent. You have control again.`);
 });
 it("ON: waits out the bag's own transitions and keeps one pick per run",async()=>{
  const g=game({phase:"starter_label_transition",transitionPolls:3});
  const picks=vi.fn(()=>"TREECKO" as const);
  const switches={...toolSwitches(on),randomStarter:picks};
  const tool=gameTools("http://test",hooks(),g.fetchFn,switches,fakeClock())[1];
   await tool.execute("call-1",{buttons:["B"]});
  expect(g.taken()).toBe("TREECKO");
  await tool.execute("call-2",{buttons:["B"]});
  expect(picks).toHaveBeenCalledTimes(1);
  expect(g.pressed.at(-1)).toBe("B");
 });
 it("ON: a stuck bag stops within its bounds and sends none of the model's buttons",async()=>{
  const g=game({stuck:true});const {tool}=press(g,on,"MUDKIP");
  const r=await tool.execute("call-1",{buttons:["START"]});
  expect(g.pressed).toHaveLength(RANDOM_STARTER_LIMITS.presses);
  expect(g.pressed).not.toContain("START");
  expect(text(r)).toContain("Starter pick: the harness tried to choose MUDKIP at random but stopped: no starter after 12 presses. Your buttons were not sent.");
  const t=game({phase:"starter_confirmation_transition",stuck:true});
  const r2=await press(t,on,"MUDKIP").tool.execute("call-2",{buttons:["A"]});
  expect(t.pressed).toEqual([]);
  expect(text(r2)).toContain("stayed in starter_confirmation_transition for 10 s");
 });
 it("OFF: the model's own buttons reach the bag exactly as before",async()=>{
  const g=game();const {tool}=press(g,off);
  const r=await tool.execute("call-1",{buttons:["A"]});
  expect(g.pressed).toEqual(["A"]);
  expect(g.taken()).toBeNull();
  expect(text(r)).not.toContain("Starter pick");
 });
 it("ON: no interception away from the bag",async()=>{
  const g=game({phase:"closed"});const {tool}=press(g,on);
  await tool.execute("call-1",{buttons:["A"]});
  expect(g.pressed).toEqual(["A"]);
 });
 it("ON: a checked press (objective tracking) runs its check, then the pick",async()=>{
  const g=game();const {tool}=press(g,on,"MUDKIP");
  const check=vi.fn();
  const r=await tool.executeChecked("call-1",{buttons:["A"]},check);
  expect(check).toHaveBeenCalledTimes(1);
  expect(g.pressed).toEqual(["RIGHT","A","A"]);
  expect(r.details.starterPick).toBe(true);
 });
 describe("through dialogue auto-advance (on in the run's arm)",()=>{
  const wired=(g:ReturnType<typeof game>,pick:RandomStarter)=>{
   const advances:unknown[]=[];
   const recorder:AutoAdvanceRecorder={recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:b=>{advances.push(b);return {seq:2,turn:1};},subscribe:()=>undefined};
   const features={...on,"dialogue-auto-advance-v1":true};
   const base=gameTools("http://test",hooks(),g.fetchFn,{...toolSwitches(features),randomStarter:()=>pick},fakeClock());
   const state={read:async()=>parseGameState(await (await g.fetchFn("http://test/pokebench/state")).json())};
   const tools=withDialogueAutoAdvance(base,features,{state,recorder,clock:fakeClock()});
   const tool=tools.find(t=>t.name==="press");
   if(tool===undefined)throw new Error("missing press");
   return {tool,advances};
  };
  it.each([[["A"]],[["A","A"]],[["RIGHT","A","B"]]])("keeps the pick receipt and sends none of the batch %j",async buttons=>{
   const g=game();const {tool,advances}=wired(g,"TREECKO");
   const r=await tool.execute("call-1",{buttons});
   expect(g.pressed).toEqual(["LEFT","A","A"]);
   expect(text(r)).toContain("Starter pick: the harness chose TREECKO at random");
   expect(text(r)).not.toContain("pressed A");
   expect(advances).toEqual([]);
  });
 });
});
