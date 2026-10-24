import {readFileSync,readdirSync} from "node:fs";
import {expect,it} from "vitest";
import {Type} from "typebox";
import {Value} from "typebox/value";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {ALL_ON,dependencyProblems,featureInfo,playHarnessFeatures,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {playSystemPrompt,CITED_DESTINATION_SECTION} from "./play-config.js";
import {playGameTools} from "./play-wiring.js";
import {checkEvent,type RunEvent} from "./events.js";
import {type DestinationCitationFacts,withCitedDestination} from "./cited-destination.js";

const ID="citation-evidence-v1";
const OFF=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet;
const fixture=JSON.parse(readFileSync(new URL("../test-support/citation-evidence-4f08.json",import.meta.url),"utf8")) as {events:unknown[]};
const events=fixture.events.map(checkEvent);
const source=events.find(e=>e.type==="tool_result");
if(source?.type!=="tool_result")throw Error("missing recorded observation");
const quote="You can usually find me in my cottage by the sea near PETALBURG WOODS.";
const rationale='object 1, sprite EXPERT_M (Mr. Briney) is here';
const goal={x:6,y:4,map_id:[17,0]};
const textOf=(result:Awaited<ReturnType<AgentTool["execute"]>>)=>result.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
function factory(enabled:boolean,production=true){
 const subs:((e:RunEvent)=>void)[]=[],calls:unknown[]=[];
 const records:{facts:DestinationCitationFacts;text:string|null}[]=[];
 const recorder={recordState:()=>{throw Error("unused");},recordDialogueAutoAdvance:()=>{throw Error("unused");},lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,storyGoalAway:()=>undefined,storyBattleWarning:()=>undefined,healBeforeTrainersWarning:()=>undefined,unfinishedActivity:()=>undefined,subscribe:(sub:(e:RunEvent)=>void)=>{subs.push(sub);},destinationCitation:(facts:DestinationCitationFacts,text:string|null)=>{records.push({facts,text});}};
 const nav:AgentTool={name:"navigate_to",label:"Walk",description:"Walk.",parameters:Type.Object({x:Type.Number(),y:Type.Number(),map_id:Type.Array(Type.Number())},{additionalProperties:false}),execute:(_id,params)=>{calls.push(params);return Promise.resolve({content:[{type:"text",text:"Navigation result"}],details:undefined});}};
 const features={...OFF,"cited-destination-v1":true,"input-cuts-v1":true,[ID]:enabled};
 // Supplied navigation seam isolates this wrapper; real bounded navigation remains independently covered.
 const tools=production?playGameTools([nav],features,{read:()=>{throw Error("no native read needed");}},recorder):withCitedDestination([nav],true,recorder,{fullMap:false,exitReach:false,silenceMiss:true});
 const tool=tools[0];if(tool===undefined)throw Error("missing navigation");
 return {tool,calls,records,feed:(e:RunEvent)=>{for(const sub of subs)sub(e);}};
}
it("registers default OFF, requires citations, and records activation",()=>{
 expect(featureInfo(ID)).toMatchObject({needs:"cited-destination-v1",switchable:true});
 expect(featureInfo(ID).description).toContain(" Off: ");
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
 const {[ID]:removed,...old}=ALL_ON;expect(removed).toBe(true);
 expect(normalizeFeatures(old)[ID]).toBe(false);
 expect(dependencyProblems({...OFF,[ID]:true})).toContain(`${ID} needs cited-destination-v1`);
 expect(playHarnessFeatures({...OFF,[ID]:true},null)).toContain(ID);
});
it("production factory matches the recorded newline quote independently of rationale and records words-only feedback",async()=>{
 const h=factory(true);h.feed(source);
 const args={...goal,because:{quote,rationale}};
 expect(Value.Check(h.tool.parameters,args)).toBe(true);
 const result=await h.tool.execute("citation",args);
 expect(h.records).toEqual([{facts:{tool_call_id:"citation",because:quote,verdict:"found",found_turn:314,...goal},text:"Destination citation: quotation found in observations from turn 314. This checks the quoted words only; speaker identity, rationale and destination are not verified."}]);
 expect(textOf(result)).toBe(`${h.records[0]?.text??"missing citation feedback"}\nNavigation result`);
 expect(h.calls).toEqual([goal]);
 expect(textOf(result)).not.toContain(rationale);
});
it("OFF preserves the prior schema, prompt, verdict and output byte for byte",async()=>{
 const off=factory(false),legacy=factory(false,false);off.feed(source);legacy.feed(source);
 expect(off.tool.parameters).toEqual(legacy.tool.parameters);expect(off.tool.description).toBe(legacy.tool.description);
 const original=events.find(e=>e.type==="tool_call");if(original?.type!=="tool_call")throw Error("missing call");
 expect(await off.tool.execute("original",original.args)).toEqual(await legacy.tool.execute("original",original.args));
 expect(off.records).toEqual(legacy.records);expect(off.records[0]?.facts.verdict).toBe("not_found");
 const features={...OFF,"cited-destination-v1":true,"bounded-navigation-v1":true};
 expect(playSystemPrompt(features,null)).toContain(CITED_DESTINATION_SECTION);
 const prompt=playSystemPrompt({...features,[ID]:true},null);
 expect(prompt).toContain("that make this destination the place to go");expect(prompt).toContain("because.quote");expect(prompt).toContain("because.rationale");expect(prompt).not.toContain(CITED_DESTINATION_SECTION);
 expect(Value.Check(off.tool.parameters,{...goal,because:{quote}})).toBe(false);
});
it("does not accept commentary as evidence, invent words, trust error results, or learn from citation echoes",async()=>{
 for(const because of [{quote:'MR. BRINEY: "'+quote+'"'},{quote:quote.replace('cottage','mansion'),rationale:quote},{quote:"PETALBURG"}]){
  const h=factory(true);h.feed(source);
  await h.tool.execute("miss",{...goal,because});
  expect(h.records[0]?.facts.verdict).toBe(because.quote==="PETALBURG"?"too_short":"not_found");
  expect(h.records[0]?.text).not.toContain(because.quote);
  expect(h.calls).toEqual([goal]);
 }
 const h=factory(true);h.feed({...source,is_error:true});
 await h.tool.execute("error-source",{...goal,because:{quote}});
 expect(h.records[0]?.facts.verdict).toBe("not_found");
 const prior=h.records[0]?.text;if(prior===null||prior===undefined)throw Error("missing miss feedback");
 h.feed({...source,text:prior});
 await h.tool.execute("echo",{...goal,because:{quote:prior}});
 expect(h.records[1]?.facts.verdict).toBe("not_found");
});
it("requires a structured quote, allows optional rationale and rejects malformed data before navigation",async()=>{
 const h=factory(true);
 for(const because of [quote,{},null,{quote:7},{quote,rationale:7},{quote,extra:"unverified"}]){
  expect(Value.Check(h.tool.parameters,{...goal,because})).toBe(false);
  await expect(h.tool.execute("invalid",{...goal,because})).rejects.toThrow("No navigation was attempted.");
 }
 expect(h.calls).toEqual([]);expect(h.records).toEqual([]);
 expect(Value.Check(h.tool.parameters,{...goal,because:{quote}})).toBe(true);
});
it("enables only current bundle arms; defaults and historical fixed definitions remain OFF",()=>{
 const dir=new URL("../../../experiments/fixed/",import.meta.url);
 const current=new Set(["bundle-v-control.json","bundle-v-control-2h.json","bundle-cook-1h.json","whole-map-cook-1h.json","whole-map-pair-2h.json","glm53-flash-4h.json"]);
 for(const name of readdirSync(dir).filter(n=>n.endsWith(".json"))){
  const d=JSON.parse(readFileSync(new URL(name,dir),"utf8")) as {base:{features:Record<string,boolean>};switches:string[];onInBoth?:string[]};
  expect(d.base.features[ID]??false,name).toBe(false);
  expect(d.switches.includes(ID),name).toBe(current.has(name));
  expect(d.onInBoth??[],name).not.toContain(ID);
 }
});
