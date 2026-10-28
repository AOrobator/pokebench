import {expect,it} from "vitest";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";
import {parseGameState} from "./game-state.js";
import {PeopleIdCards,type IdCard} from "./people-id-cards.js";
import {DialogueRecord,pageLine,type DialoguePage} from "./dialogue-auto-advance.js";
import {codePoints} from "./instruction-memory-cap.js";
import {ALL_ON,SWITCHABLE_FEATURES,featureInfo,dependencyProblems,playHarnessFeatures,type FeatureSet} from "./features.js";
import {normalizeFeatures,flagFeatures} from "./play-preset.js";
import {pressTool} from "./game-tools.js";
import {playGameTools} from "./play-wiring.js";

const ID="id-card-bound-v1",HEAD="- Other pages that name them";
const OFF=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet;
const here=parseGameState({...IN_GAME,location:"ROUTE103",map_id:[0,18],position:{x:5,y:5},facing:"up",world_context:{objects:[{local_id:1,map_id:[0,18],graphics_id:105,sprite_kind:"RIVAL_MAY_NORMAL",x:5,y:4}],triggers:[],dialogue:null}});
const gone={...here,world_context:{...here.world_context,objects:[],triggers:[],dialogue:null}};
const ev=(body:Record<string,unknown>,seq:number,turn=1):RunEvent=>checkEvent({v:1,run:"card-bound",t:"2026-10-28T14:30:00.000-04:00",seq,turn,...body});
const page=(text:string):DialoguePage=>({text,map:"ROUTE103",map_id:[0,18],position:{x:5,y:5},state_seq:1,speaker:"PROF. BIRCH",speaker_source:"name_prefix"});
const texts=Array.from({length:18},(_,i)=>`Page ${String(i).padStart(2,"0")} about MAY: ${"a".repeat(100)}.`);
function events(values:readonly string[]):RunEvent[]{return [ev({type:"state",...here},1),...values.flatMap((text,i)=>{const id=`c${String(i)}`;return [ev({type:"dialogue_auto_advance",tool_call_id:id,tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,pages:[page(text)],stop:"field_free",detail:"closed",duration_ms:1},2+i*2,i+2),ev({type:"tool_result",id,name:"press",text:"ok",is_error:false,duration_ms:1,frames:[]},3+i*2,i+2)];})];}
function memory(on:boolean,values=texts,recall=false){const m=new PeopleIdCards(true,false,on,recall);for(const e of events(values))m.observe(e);return m;}
function card(m:PeopleIdCards):string {const c=m.cards(here,"show")?.cards.find(c=>c.key==="name:MAY");if(c===undefined)throw Error("missing MAY card");return c.text;}
const block=(text:string)=>text.slice(text.indexOf(HEAD),text.indexOf("\n- Battles with you:"));
const quoted=(values:readonly string[])=>values.map((text,i)=>`  ${pageLine(page(text),i+2)}`);

it("bounds a contiguous newest suffix of whole indented lines, shows oldest first, and leaves other card lines unchanged",()=>{
 const off=card(memory(false)),on=card(memory(true)),before=block(off),after=block(on),lines=quoted(texts);
 let start=lines.length-1;while(start>0&&codePoints(lines.slice(start-1).join("\n"))<=1500)start--;
 expect(start).toBeGreaterThan(1);expect(after).toBe(`${HEAD} (each once, in order, whole; ${String(start)} earlier pages are left out):\n${lines.slice(start).join("\n")}`);
 expect(codePoints(lines.slice(start).join("\n"))).toBeLessThanOrEqual(1500);expect(codePoints(lines.slice(start-1).join("\n"))).toBeGreaterThan(1500);
 expect(before).toBe(`${HEAD} (each once, in order, whole):\n${lines.join("\n")}`);expect(on.replace(after,"LIST")).toBe(off.replace(before,"LIST"));
});
it("OFF, omitted switch, no mentions, and ON with no omissions retain exact bytes",()=>{
 for(const values of [[],texts.slice(0,2)])expect(card(memory(true,values))).toBe(card(memory(false,values)));
 const implicit=new PeopleIdCards();for(const e of events(texts))implicit.observe(e);expect(card(implicit)).toBe(card(memory(false)));
});
it("keeps an oversize newest page whole and reports exactly one omitted page",()=>{
 const values=["Old note about MAY.",`Newest MAY note ${"x".repeat(1700)}`];const on=card(memory(true,values));
 expect(block(on)).toBe(`${HEAD} (each once, in order, whole; 1 earlier page is left out):\n${quoted(values)[1]??""}`);expect(on).toContain(values[1]);expect(on).not.toContain(values[0]);
});
it("counts astral codepoints, indentation and separators instead of UTF-16 units",()=>{
 const values=[`Older MAY ${"😀".repeat(500)}`,`Newer MAY ${"😀".repeat(500)}`];expect(quoted(values).join("\n").length).toBeGreaterThan(1500);expect(codePoints(quoted(values).join("\n"))).toBeLessThan(1500);expect(card(memory(true,values))).toBe(card(memory(false,values)));
 const base=quoted(["MAY", "MAY"]);const overhead=codePoints(base.join("\n"));const edge=[`MAY${"x".repeat(1500-overhead)}`,"MAY"];expect(codePoints(quoted(edge).join("\n"))).toBe(1500);expect(card(memory(true,edge))).toBe(card(memory(false,edge)));
 const over=[edge[0]+"x",edge[1]??"MAY"];expect(block(card(memory(true,over)))).toContain("1 earlier page is left out");
});
it("mentions get_dialogue only when offered and proves an omitted page is searchable in its actual record",async()=>{
 const record=new DialogueRecord();for(const e of events(texts))record.observe(e);
 const on=card(memory(true,texts,true));expect(block(on)).toContain("earlier pages are left out; get_dialogue finds them");expect(on).not.toContain(texts[0]);
 const result=await record.tool().execute("recall",{contains:texts[0],last:1});expect(result.content).toContainEqual({type:"text",text:expect.stringContaining(texts[0]??"")});
 expect(block(card(memory(true)))).not.toContain("get_dialogue");expect(card(memory(true,texts.slice(0,2),true))).toBe(card(memory(false,texts.slice(0,2),true)));
});
it("keeps the full-other-list fingerprint and identical first/changed emission timing",()=>{
 const off=memory(false),on=memory(true);expect(off.cards(here,"a")?.cards.map(c=>c.reason)).toEqual(["first"]);expect(on.cards(here,"a")?.cards.map(c=>c.reason)).toEqual(["first"]);
 const fingerprint=(m:PeopleIdCards)=>(m as unknown as {history:Map<string,{fingerprint:string|null}>}).history.get("name:MAY")?.fingerprint;
 expect(fingerprint(on)).toBe(fingerprint(off));expect(fingerprint(on)).toContain(texts[0]);
 for(const m of [off,on]){expect(m.cards(here,"still")?.cards).toEqual([]);m.cards(gone,"leave");for(const e of events(["A new MAY mention."]))m.observe(e);}
 expect(off.cards(here,"back")?.cards.map(c=>c.reason)).toEqual(["changed"]);expect(on.cards(here,"back")?.cards.map(c=>c.reason)).toEqual(["changed"]);expect(fingerprint(on)).toBe(fingerprint(off));
 for(const m of [off,on]){m.cards(gone,"leave");expect(m.cards(here,"same")?.cards).toEqual([]);}
});
it("production playGameTools honors ON/OFF and records the same bounded card delivered to the model",async()=>{
 for(const on of [false,true]){
  const subs:((e:RunEvent)=>void)[]=[],cards:IdCard[]=[];
  const rec={subscribe:(fn:(e:RunEvent)=>void)=>{subs.push(fn);},recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:2,turn:1}),lowHpTrainerWarning:()=>undefined,peopleIdCard:(_tool:string,_id:string,c:IdCard)=>{cards.push(c);}};
  const game:AgentTool={name:"observe",label:"Observe",description:"fixture",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"Location: ROUTE103\nPosition: X=5, Y=5"}],details:{state:here}})};
  const tools=playGameTools([game,pressTool("http://unused",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},()=>Promise.reject(new Error("unexpected press")))],{...OFF,"dialogue-auto-advance-v1":true,"people-ledger-v1":true,"people-id-cards-v1":true,"character-presence-v1":true,[ID]:on},{read:()=>Promise.resolve(here)},rec);
  for(const e of events(texts))for(const fn of subs)fn(e);
  const out=await tools[0]?.execute("show",{});const text=out?.content.filter(p=>p.type==="text").map(p=>p.type==="text"?p.text:"").join("\n")??"";
  const delivered=cards.find(c=>c.key==="name:MAY");expect(delivered).toBeDefined();expect(text).toContain(delivered?.text);expect(block(delivered?.text??"").includes("left out")).toBe(on);expect(text.includes(texts[0]??"")).toBe(!on);
  const recall=tools.find(t=>t.name==="get_dialogue");expect(recall).toBeDefined();const found=await recall?.execute("lookup",{contains:texts[0],last:1});expect(JSON.stringify(found?.content)).toContain(texts[0]);if(on)expect(block(delivered?.text??"")).toContain("get_dialogue finds them");
 }
});
it("registers once with its dependency, default OFF and recorded membership only when ON",()=>{
 expect(SWITCHABLE_FEATURES.filter(x=>x===ID)).toEqual([ID]);expect(featureInfo(ID)).toMatchObject({group:"observation",needs:"people-id-cards-v1"});
 expect(dependencyProblems({...OFF,[ID]:true})).toContain(`${ID} needs people-id-cards-v1`);
 const {[ID]:_value,...omitted}=ALL_ON as FeatureSet&Record<typeof ID,boolean>;expect(_value).toBe(true);expect(normalizeFeatures(omitted)[ID]).toBe(false);expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
 expect(playHarnessFeatures({...ALL_ON,[ID]:true},null)).toContain(ID);expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
});
