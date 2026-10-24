import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {expect,it} from "vitest";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {checkEvent,type RunEvent} from "./events.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {featuresOf,featureInfo} from "./features.js";
import {normalizeFeatures,flagFeatures} from "./play-preset.js";
import {playGameTools} from "./play-wiring.js";
import {RETIREMENT_RULES} from "./milestone-memory-rules.js";
import {StoryDestinations,type PlacesBody} from "./story-destinations.js";

const ID="native-task-goal-retirement-v1";
const fixture=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/native-task-goal-0517.json.gz",import.meta.url))).toString()) as {events:unknown[]};
const events=fixture.events.map(checkEvent);
const places=JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as PlacesBody;
const stateEvent=(seq:number)=>{const e=events.find(e=>e.seq===seq);if(e?.type!=="state"||!("started" in e))throw Error("missing native state");return e;};
const state=(seq:number)=>{const {v: _v,run: _run,seq: _seq,t: _t,type: _type,turn: _turn,...body}=stateEvent(seq);return parseGameState(body);};
const original=events.find(e=>e.seq===34807);if(original?.type!=="tool_result")throw Error("missing recorded failure");
const quote="Hm? Aren't you going to the POKéMON GYM in RUSTBORO CITY?";
const issue=events.filter(e=>e.seq<=7561);
const current=state(34806);
function story(on:boolean,source:readonly RunEvent[]=issue){const s=new StoryDestinations(false,false,false,false,false,on);for(const e of source)s.observe(e);return s;}
function block(s:StoryDestinations,now=current){return s.block(now,"next",places.places,true,true);}

it("reproduces the actual 0517 stale goal OFF and retires it ON after native gym completion",()=>{
 expect(original.text).toContain(`Story goal: "${quote}"`);
 expect(block(story(false))).toContain(quote);
 expect(block(story(false))).toContain('"RUSTBORO CITY"');
 const on=block(story(true));
 expect(on).toContain("Done: RUSTBORO_GYM_COMPLETE");
 expect(on).not.toContain("Way in");
 expect(on).not.toContain("Direct entrances");
 const dialogue=issue.find(e=>e.type==="dialogue_auto_advance");
 expect(dialogue?.type==="dialogue_auto_advance"?dialogue.pages.at(-1)?.text:null).toContain("four GYM BADGES");
});
it("requires native completion, readable issuance, stable current state and authentic source attribution",()=>{
 for(const now of [{...current,story:null},{...current,story:{...current.story!,rustboro_gym_complete:false}},{...current,story:{...current.story!,rustboro_gym_complete:null}},{...current,screen:"field_transition" as const}])expect(block(story(true),now)).not.toContain("Done:");
 for(const kind of ["unknown","already_complete","wrong_speaker","wrong_map","unknown_wording","failed_delivery"]){
  const changed=issue.map(e=>{
   if(e.type==="state"&&"started" in e&&e.story!=null&&(kind==="unknown"||kind==="already_complete"))return {...e,story:{...e.story,rustboro_gym_complete:kind==="unknown"?null:true}};
   if(e.type==="dialogue_auto_advance")return {...e,pages:e.pages.map((p,i)=>i!==0?p:{...p,...(kind==="wrong_speaker"?{speaker:"MOM"}:kind==="wrong_map"?{map_id:[0,3] as [number,number]}:kind==="unknown_wording"?{text:p.text+" Come back later."}:{})})};
   if(e.type==="tool_result"&&kind==="failed_delivery")return {...e,is_error:true};
   return e;
  });
  expect(block(story(true,changed)),kind).not.toContain("Done:");
 }
});
it("uses the shared source-audited rival-return task and retains unknown extra future requests",()=>{
 const rule=RETIREMENT_RULES.find(r=>r.id==="rival-return-lab");if(rule===undefined)throw Error("missing audited task");
 expect(rule.requires).toEqual(["RECEIVED_POKEDEX"]);
 expect(rule.pages.at(-1)?.text).toBe("Well, it's time to head back to\nthe LAB.");
 const native={...stateEvent(7535),story:{...current.story!,pokedex_received:false},name:"AAA",seq:40000};
 const template=issue.find(e=>e.type==="dialogue_auto_advance");if(template?.type!=="dialogue_auto_advance")throw Error("missing dialogue");
 const pages=rule.pages.map(p=>({...template.pages[0]!,...p,state_seq:40000,map_id:[0,18] as [number,number]}));
 const dialogue={...template,seq:40001,pages};
 const result=issue.find(e=>e.type==="tool_result");if(result?.type!=="tool_result")throw Error("missing delivery");
 const source=[native,dialogue,{...result,seq:40002}];
 const s=story(true,source),now={...current,story:{...current.story!,pokedex_received:true}};
 expect(s.block(now,"later",places.places,false,false)).toContain("Done: RECEIVED_POKEDEX");
 const mixed=story(true,[native,{...dialogue,pages:[...pages,{...pages[0]!,text:"Come back to the LAB later when you are stronger."}]},{...result,seq:40002}]);
 expect(mixed.block(now,"later",places.places,false,false)).not.toContain("Done:");
 expect(issue.find(e=>e.type==="dialogue_auto_advance")).toEqual(events.find(e=>e.seq===7559));
});
it("production factory delivers the new header with identical tools and OFF bytes",async()=>{
 async function deliver(on:boolean|undefined){
  const subs:((e:RunEvent)=>void)[]=[];
  const observe:AgentTool={name:"observe",label:"observe",description:"recorded observation",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text" as const,text:"Location: ROUTE116"}],details:{state:current}})};
  const f={...featuresOf(["harness-trust-v1","stale-story-goal-v1","stale-story-goal-v2","input-cuts-v1"]),...(on===undefined?{}:{[ID]:on})};
  const recorder={subscribe:(fn:(e:RunEvent)=>void)=>subs.push(fn),storyGoalAway:()=>undefined,destinationCitation:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1})} as unknown as Parameters<typeof playGameTools>[3];
  const tools=playGameTools([observe],f,{read:()=>Promise.resolve(current),places:()=>Promise.resolve(places)},recorder);
  for(const e of issue)for(const sub of subs)sub(e);
  const r=await tools.find(t=>t.name==="observe")!.execute("next",{});
  return {text:r.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n"),tools:tools.map(t=>({name:t.name,description:t.description,parameters:t.parameters}))};
 }
 const off=await deliver(false),omitted=await deliver(undefined),on=await deliver(true);
 expect(off).toEqual(omitted);
 expect(off.text).toContain(`Story goal: "${quote}"`);
 expect(on.text).not.toContain(`Story goal: "${quote}"`);
 expect(on.tools).toEqual(off.tools);
 expect(on.text).toContain("Location: ROUTE116");
});
it("defaults OFF and enables only bundle arms",()=>{
 expect(featureInfo(ID)).toMatchObject({group:"observation",needs:null});
 expect(normalizeFeatures({})[ID]).toBe(false);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
 for(const file of ["bundle-v-control","bundle-v-control-2h","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h"]){
  const d=JSON.parse(readFileSync(new URL(`../../../experiments/fixed/${file}.json`,import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[]};
  expect(d.base.features[ID],file).toBe(false);expect(d.switches,file).toContain(ID);
 }
});
