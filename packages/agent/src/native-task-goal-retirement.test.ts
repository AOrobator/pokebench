import {fileURLToPath} from "node:url";
import {readFixedDefinition} from "../../viewer/src/fixed-definition.js";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {expect,it} from "vitest";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {checkEvent,type RunEvent} from "./events.js";
import {parseGameState} from "./game-state.js";
import {featuresOf,featureInfo} from "./features.js";
import {normalizeFeatures,flagFeatures} from "./play-preset.js";
import {playGameTools} from "./play-wiring.js";
import {TaskGoalCompletion} from "./task-goal-completion.js";
import {RETIREMENT_RULES} from "./milestone-memory-rules.js";
import {StoryDestinations,type PlacesBody} from "./story-destinations.js";

const sourceRoot=fileURLToPath(new URL("../../../",import.meta.url));
const CURRENT=["bundle-v-control","bundle-v-control-2h","glm53-flash-4h"];
const ARCHIVED=["bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h"];
const ID="native-task-goal-retirement-v1";
const fixture=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/native-task-goal-0517.json.gz",import.meta.url))).toString()) as {events:unknown[]};
const events=fixture.events.map(checkEvent);
const places=JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as PlacesBody;
const stateEvent=(seq:number)=>{const e=events.find(e=>e.seq===seq);if(e?.type!=="state"||!("started" in e))throw Error("missing native state");return e;};
const state=(seq:number)=>parseGameState(Object.fromEntries(Object.entries(stateEvent(seq)).filter(([key])=>!["v","run","seq","t","type","turn"].includes(key))));
const original=events.find(e=>e.seq===34807);if(original?.type!=="tool_result")throw Error("missing recorded failure");
const quote="Hm? Aren't you going to the POKéMON GYM in RUSTBORO CITY?";
const issue=events.filter(e=>e.seq<=7561);
const current=state(34806);
const nativeStory=current.story,nativeMap=current.map_id;
if(nativeStory==null||nativeMap===null)throw Error("missing recorded native story/map");
function story(on:boolean,source:readonly RunEvent[]=issue){const s=new StoryDestinations(false,false,false,false,false,on);for(const e of source)s.observe(e);return s;}
function block(s:StoryDestinations,now=current){return s.block(now,"next",places.places,true,true);}

it("reproduces the actual 0517 stale goal OFF and retires it ON after native gym completion",()=>{
 expect(original.text).toContain(`Story goal: "${quote}"`);
 expect(block(story(false))).toContain(quote);
 expect(block(story(false))).toContain('"RUSTBORO CITY"');
 const on=block(story(true));
 expect(on).toBeNull();
 expect(story(true).goal(nativeMap,current.name,"next",places.places,true,current.story,true,current)).toMatchObject({done:true,doneReason:"rustboro gym complete"});
 const dialogue=issue.find(e=>e.type==="dialogue_auto_advance");
 expect(dialogue?.type==="dialogue_auto_advance"?dialogue.pages.at(-1)?.text:null).toContain("four GYM BADGES");
});
it("requires native completion, readable issuance, stable current state and authentic source attribution",()=>{
 for(const now of [{...current,story:null},{...current,story:{...nativeStory,rustboro_gym_complete:false}},{...current,story:{...nativeStory,rustboro_gym_complete:null}},{...current,screen:"field_transition" as const}])expect(story(true).goal(nativeMap,now.name,"next",places.places,true,now.story,true,now)?.done).not.toBe(true);
 for(const kind of ["unknown","already_complete","wrong_speaker","wrong_attribution","wrong_map","unknown_wording","missing_state","missing_ref","battle_page","failed_delivery"]){
  const changed=issue.map(e=>{
   if(e.type==="state"&&"started" in e&&e.story!=null&&(kind==="unknown"||kind==="already_complete"))return {...e,story:{...e.story,rustboro_gym_complete:kind==="unknown"?null:true}};
   if(e.type==="state"&&"started" in e&&kind==="wrong_map")return {...e,map_id:[0,3] as [number,number]};
   if(e.type==="dialogue_auto_advance")return {...e,pages:e.pages.map((p,i)=>i!==0?p:{...p,...(kind==="wrong_speaker"?{speaker:"MOM"}:kind==="wrong_attribution"?{speaker_source:"faced_sprite" as const}:kind==="wrong_map"?{map_id:[0,3] as [number,number]}:kind==="unknown_wording"?{text:p.text+" Come back later."}:kind==="missing_state"?{state_seq:7536}:kind==="missing_ref"?{state_seq:null}:kind==="battle_page"?{battle_turn:1}:{})})};
   if(e.type==="tool_result"&&kind==="failed_delivery")return {...e,is_error:true};
   return e;
  });
  expect(story(true,changed).goal(nativeMap,current.name,"next",places.places,true,current.story,true,current)?.done,kind).not.toBe(true);
 }
});
it("uses the shared source-audited rival-return task and retains unknown extra future requests",()=>{
 const rule=RETIREMENT_RULES.find(r=>r.id==="rival-return-lab");if(rule===undefined)throw Error("missing audited task");
 expect(rule.requires).toEqual(["RECEIVED_POKEDEX"]);
 expect(rule.pages.at(-1)?.text).toBe("Well, it's time to head back to\nthe LAB.");
 const native={...stateEvent(7535),map_id:[0,18] as [number,number],story:{...nativeStory,pokedex_received:false},name:"AAA",seq:40000};
 const template=issue.find(e=>e.type==="dialogue_auto_advance");if(template?.type!=="dialogue_auto_advance")throw Error("missing dialogue");
 const firstPage=template.pages[0];if(firstPage===undefined)throw Error("missing first page");
 const pages=rule.pages.map(p=>({...firstPage,...p,state_seq:40000,map_id:[0,18] as [number,number]}));
 const dialogue={...template,seq:40001,pages};
 const result=issue.find(e=>e.type==="tool_result");if(result?.type!=="tool_result")throw Error("missing delivery");
 const source=[native,dialogue,{...result,seq:40002}].map(checkEvent);
 const s=story(true,source),now={...current,story:{...nativeStory,pokedex_received:true}};
 expect(s.block(now,"later",places.places,false,false)).toContain("Done: received pokedex");
 const first=pages[0];if(first===undefined)throw Error("empty audited episode");
 const mixed=story(true,[native,{...dialogue,pages:[...pages,{...first,text:"Come back to the LAB later when you are stronger."}]},{...result,seq:40002}].map(checkEvent));
 expect(mixed.block(now,"later",places.places,false,false)).not.toContain("Done:");
 expect(issue.find(e=>e.type==="dialogue_auto_advance")).toEqual(events.find(e=>e.seq===7559));
});
it("qualifies only the first-gym page, preserving the four-badge future request",()=>{
 const memory=new TaskGoalCompletion();
 for(const event of issue)if(event.type==="state"&&"started" in event)memory.observe(event);
 const dialogue=issue.find(e=>e.type==="dialogue_auto_advance");if(dialogue?.type!=="dialogue_auto_advance")throw Error("missing dialogue");
 const tasks=memory.tasks(dialogue.pages);
 expect([...tasks.keys()]).toEqual([dialogue.pages[0]]);
 expect(dialogue.pages.slice(1).every(p=>!tasks.has(p))).toBe(true);
 const wrongAttribution=dialogue.pages.map((page,i)=>i===0?{...page,speaker_source:"faced_sprite" as const}:page);
 expect([...memory.tasks(wrongAttribution).keys()]).toEqual([]);
});
it("production factory delivers the new header with identical tools and OFF bytes",async()=>{
 async function deliver(on:boolean|undefined,consumer:"harness-trust-v1"|"story-destinations-v1"){
  const subs:((e:RunEvent)=>void)[]=[];
  const observe:AgentTool={name:"observe",label:"observe",description:"recorded observation",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text" as const,text:"Location: ROUTE116"}],details:{state:current}})};
  const f={...featuresOf([consumer,"stale-story-goal-v1","stale-story-goal-v2","input-cuts-v1"]),...(on===undefined?{}:{[ID]:on})};
  const recorder={subscribe:(fn:(e:RunEvent)=>void)=>subs.push(fn),storyGoalAway:()=>undefined,destinationCitation:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1})} as unknown as Parameters<typeof playGameTools>[3];
  const tools=playGameTools([observe],f,{read:()=>Promise.resolve(current),places:()=>Promise.resolve(places)},recorder);
  for(const e of issue)for(const sub of subs)sub(e);
  const tool=tools.find(t=>t.name==="observe");if(tool===undefined)throw Error("missing observe tool");
  const r=await tool.execute("next",{});
  return {text:r.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n"),tools:tools.map(t=>({name:t.name,description:t.description,parameters:t.parameters}))};
 }
 for(const consumer of ["harness-trust-v1","story-destinations-v1"] as const){
  const off=await deliver(false,consumer),omitted=await deliver(undefined,consumer),on=await deliver(true,consumer);
  expect(off,consumer).toEqual(omitted);
  expect(off.text,consumer).toContain(quote);
  expect(on.text,consumer).not.toContain(quote);
  expect(on.tools,consumer).toEqual(off.tools);
  expect(on.text,consumer).toContain("Location: ROUTE116");
 }
});
it("defaults OFF and enables only bundle arms",()=>{
 expect(featureInfo(ID)).toMatchObject({group:"observation",needs:null});
 const { [ID]:omittedValue,...omitted}=featuresOf([]);
 expect(omittedValue).toBe(false);
 expect(normalizeFeatures(omitted)[ID]).toBe(false);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
 for(const file of [...CURRENT,...ARCHIVED]){
  const {definition:d}=readFixedDefinition(sourceRoot,file,ARCHIVED.includes(file));
  expect(d.base.features[ID],file).toBe(false);expect(d.switches,file).toContain(ID);
 }
});
