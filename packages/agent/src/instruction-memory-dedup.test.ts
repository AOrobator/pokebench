import {expect,it} from "vitest";
import {checkEvent,type RunEvent} from "./events.js";
import {featuresOf} from "./features.js";
import {normalizeFeatures} from "./play-preset.js";
import {ObservedInstructions} from "./observed-instructions.js";
import {contextTools} from "./play-wiring.js";

const ID="instruction-memory-dedup-v1";
const quote="Please deliver the LETTER to STEVEN in DEWFORD TOWN.\nThen take the GOODS to SLATEPORT.";
const page=(text:string,speaker:string|null="MOM")=>({text,speaker,speaker_source:speaker===null?null:"name_prefix",map:"SOURCE MAP",map_display:"Source Town",map_id:[0,9],state_seq:2,position:null});
const event=(body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:"dedup",seq:1,t:"2026-10-27T21:00:00.000-04:00",turn:1,...body});
const dialogue=(id:string,pages:ReturnType<typeof page>[])=>event({type:"dialogue_auto_advance",seq:id==="named"?3:5,tool_call_id:id,pages,tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,stop:"field_free",detail:"test",duration_ms:1});
const result=(id:string,error=false)=>event({type:"tool_result",seq:id==="named"?4:6,id,name:"press",text:"Location: Source Town\nStory: delivered facts",is_error:error,duration_ms:1,frames:[],state_seq:2});
const fixture=[dialogue("named",[page(quote),page("Come back after both errands.")]),result("named"),dialogue("unknown",[page("Our daughter is upstairs, I think.",null)]),result("unknown")];
const flags=(on:boolean,allField=true,trim=true)=>normalizeFeatures({...featuresOf(["observed-instructions-v1","delivered-place-evidence-v1","current-map-display-name-v1"]),"observed-field-dialogue-v1":allField,"milestone-instruction-memory-v1":trim,[ID]:on});
function setup(on:boolean,allField=true,trim=true){
 const listeners:((e:RunEvent)=>void)[]=[],records:{text:string;evidence:number[]}[]=[];
 const wiring=contextTools(flags(on,allField,trim),{subscribe:fn=>{listeners.push(fn);},recordLedgerContext:r=>{records.push(r);},recordNavigationContext:()=>{},recordMilestoneHint:()=>{},recordBeliefLedger:()=>{},recordLoopBreaker:()=>undefined},messages=>Promise.resolve(messages));
 return {wiring,records,feed:(events:RunEvent[])=>{for(const e of events)for(const fn of listeners)fn(e);}};
}
interface Payload{observed_locations?:{location:string;result_event:number}[];columns:string[];episodes:{result:number;pages:unknown[][]}[]}
const payload=(text:string):Payload=>JSON.parse(text.slice(text.indexOf("\n")+1)) as Payload;

it.each([[false,false],[false,true],[true,false],[true,true]])("renders every selected whole episode once and retains spatial metadata, allField=%s trim=%s",async(allField,trim)=>{
 const s=setup(true,allField,trim);s.feed(fixture);const out=await s.wiring.transformContext([]);const text=s.records[0]?.text??"";
 const p=payload(text);expect(p.episodes.map(e=>e.result)).toEqual([4,6]);expect(p.episodes[0]?.pages.map(p=>p[2])).toEqual([quote,"Come back after both errands."]);
 const named=p.episodes[0]?.pages[0];expect(named?.[p.columns.indexOf("source_map_name")]).toBe("SOURCE MAP");expect(named?.[p.columns.indexOf("source_map_display")]).toBe("Source Town");
 expect(p.episodes[1]?.pages[0]?.slice(0,3)).toEqual([null,null,"Our daughter is upstairs, I think."]);
 expect(p.observed_locations).toEqual(trim?undefined:[{result_event:4,state_event:2,location:"Source Town"}]);
 expect(text).not.toContain("DELIVERED PERSON AND PLACE EVIDENCE");expect(out.at(-1)?.content).toBe(text);expect(s.wiring.tools).toEqual([]);expect(s.records[0]?.evidence.toSorted((a,b)=>a-b)).toEqual([2,3,4,5,6]);
});
it.each([false,true])("OFF preserves exact incumbent projection, trim=%s",async trim=>{
 const s=setup(false,true,trim),base=new ObservedInstructions(true,trim,true),places=new ObservedInstructions(true,true);
 for(const e of fixture){base.observe(e);places.observe(e);}s.feed(fixture);await s.wiring.transformContext([]);
 expect(s.records[0]?.text).toBe(`${base.text()??""}\n\n${places.placeEvidence()??""}`);
});
it("does not admit pending, failed or cross-run dialogue and is inert without its existing owner",async()=>{
 const s=setup(true);s.feed([dialogue("pending",[page(quote)]),dialogue("failed",[page(quote)]),result("failed",true),{...dialogue("other",[page(quote)]),run:"other"},{...result("other"),run:"other"}]);
 expect(await s.wiring.transformContext([])).toEqual([]);expect(s.records).toEqual([]);
 const listeners:((e:RunEvent)=>void)[]=[];const f={...flags(true),"instruction-goal-ledger-v1":true};const w=contextTools(f,{subscribe:fn=>{listeners.push(fn);},recordLedgerContext:()=>{},recordNavigationContext:()=>{},recordMilestoneHint:()=>{},recordBeliefLedger:()=>{},recordLoopBreaker:()=>undefined},m=>Promise.resolve(m));
 expect(w.tools.length).toBeGreaterThan(0);expect((await w.transformContext([])).some(m=>JSON.stringify(m).includes(quote))).toBe(false);
});

it("does not add unselected progress or visit history when only the place projection existed",async()=>{
 const s=setup(true,false,false),unrelated=result("unrelated");
 if(unrelated.type!=="tool_result")throw Error("fixture result type");
 s.feed([dialogue("unknown",[page("Our daughter is upstairs, I think.",null)]),result("unknown"),{...unrelated,seq:8,text:"Location: UNRELATED ROOM"}]);
 await s.wiring.transformContext([]);
 const text=s.records[0]?.text??"";
 expect(payload(text).episodes.map(e=>e.result)).toEqual([6]);
 expect(text).toContain("Our daughter is upstairs, I think.");
 expect(text).not.toContain("UNRELATED ROOM");
 expect(payload(text).observed_locations).toBeUndefined();
});
