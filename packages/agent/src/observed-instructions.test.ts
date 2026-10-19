import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {expect,it} from "vitest";
import {checkEvent,type RunEvent} from "./events.js";
import {ALL_ON,SWITCHABLE_FEATURES,playHarnessFeatures,stateOnlyProblems,type FeatureSet} from "./features.js";
import {normalizeFeatures,flagFeatures} from "./play-preset.js";
import {contextTools} from "./play-wiring.js";
import {IN_GAME} from "../test-support/events.js";

const off=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet;
const event=(body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:"instructions",seq:1,t:"2026-10-19T12:00:00.000-04:00",turn:1,...body});
const page=(text:string,speaker:string|null="DAD",source:"name_prefix"|"faced_sprite"|null="name_prefix")=>({text,speaker,speaker_source:source,map:"PETALBURG CITY GYM",map_id:[8,1],state_seq:1,position:null});
const norman=[page("DAD: Now…"),page("Head for RUSTBORO CITY beyond this\ntown."),page("There, you should challenge\nthe GYM LEADER, ROXANNE."),page("We'll battle one day, PLAYER.")];
function harness(enabled=true){
 const subscribers:((e:RunEvent)=>void)[]=[],recorded:{text:string;evidence:number[]}[]=[];
 const features={...off,"observed-instructions-v1":enabled} as FeatureSet;
 const wiring=contextTools(features,{subscribe:fn=>{subscribers.push(fn);},recordLedgerContext:body=>{recorded.push(body);},recordNavigationContext:()=>{},recordMilestoneHint:()=>{},recordBeliefLedger:()=>{}},messages=>Promise.resolve(messages));
 return {wiring,recorded,send:(e:RunEvent)=>{for(const fn of subscribers)fn(e);}};
}
function deliver(h:ReturnType<typeof harness>,seq=2,pages=norman,error=false){
 h.send(event({type:"dialogue_auto_advance",seq,tool_call_id:`call-${seq}`,pages,tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,stop:"field_free",detail:"fixture",duration_ms:1}));
 h.send(event({type:"state",seq:seq+1,...IN_GAME,location:"RUSTBORO CITY",map_id:[0,3]}));
 h.send(event({type:"tool_result",seq:seq+2,id:`call-${seq}`,name:"press",text:"Location: RUSTBORO CITY\nStory: Wally tutorial complete",is_error:error,duration_ms:1,frames:[],state_seq:seq+1}));
}
it("production chain pins whole Norman episode after arrival, newer dialogue and empty/pruned context",async()=>{
 const h=harness();deliver(h);
 deliver(h,10,[page("MOM: Take care, honey!","MOM")]);
 const messages=await h.wiring.transformContext([]);
 const text=JSON.stringify(messages);
 for(const p of norman)expect(text).toContain(JSON.stringify(JSON.stringify(p.text)).slice(1,-1));
 expect(text).toContain("observed_instruction_episodes:");expect(text).toContain("observed_progress:");
 expect(text).toContain("RUSTBORO CITY");expect(text).not.toContain("defeated_roxanne: true");
 expect(h.recorded).toHaveLength(1);expect(messages.at(-1)?.content).toBe(h.recorded[0]?.text);
 expect(h.wiring.tools).toEqual([]);
});
it("OFF preserves exact context and records nothing",async()=>{
 const h=harness(false);deliver(h);
 const messages=[{role:"user" as const,content:"ordinary",timestamp:0}];
 expect(await h.wiring.transformContext(messages)).toEqual(messages);expect(h.recorded).toEqual([]);
});
it("ignores failed delivery, objects and battle pages",async()=>{
 const h=harness();deliver(h,2,norman,true);deliver(h,10,[page("Sign: Rustboro",null,null)]);
 deliver(h,20,[{...page("DAD: battle text"),battle_turn:1}]);
 expect(await h.wiring.transformContext([])).toEqual([]);expect(h.recorded).toEqual([]);
});
it("reads actual recorded Mom episode through the same production chain",async()=>{
 const h=harness();
 const events=gunzipSync(readFileSync(new URL("./fixtures/instruction-ledger-v2-0e05.jsonl.gz",import.meta.url))).toString("utf8").trim().split("\n").map(line=>checkEvent(JSON.parse(line)));
 for(const e of events){if(e.seq>=1286)break;h.send(e);}
 const text=JSON.stringify(await h.wiring.transformContext([]));
 expect(text).toContain("PROF. BIRCH is his name.");expect(text).toContain("He lives right next door, so you should go over and introduce yourself.");
});
it("registers a default-OFF switch with state-only conflict and bundle treatment",()=>{
 expect(SWITCHABLE_FEATURES).toContain("observed-instructions-v1");
 expect(normalizeFeatures({})["observed-instructions-v1"]).toBe(false);
 expect(flagFeatures({loopGuard:false,activeUi:false,interfaceDocs:false,objectives:false})["observed-instructions-v1"]).toBe(false);
 expect(playHarnessFeatures({...ALL_ON,"observed-instructions-v1":true},null)).toContain("observed-instructions-v1");
 expect(stateOnlyProblems({...ALL_ON,"state-only-decisions-v1":true})).toContain("state-only-decisions-v1 requires observed-instructions-v1 OFF");
 const bundle=JSON.parse(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[]};
 expect(bundle.base.features["observed-instructions-v1"]).toBe(false);expect(bundle.switches).toContain("observed-instructions-v1");
});
