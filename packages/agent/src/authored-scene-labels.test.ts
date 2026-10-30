import {expect,it} from "vitest";
import {applySceneLabelsToPages} from "./authored-scene-labels.js";
import {checkEvent,type RunEvent} from "./events.js";
import {featuresOf} from "./features.js";
import {pageLine} from "./dialogue-auto-advance.js";
import {DialogueLog} from "./dialogue-log.js";
import {observedInstructions} from "./observed-instructions.js";
import {IN_GAME} from "../test-support/events.js";

// pret731ad5bfd6e6f265508d0efcca0ba42f9dcf5881: RustboroCity employee help request,
// separate from the authored theft/chase. These labels describe already displayed text only.
const ROM="f3ae088181bf583e55daf962a92bb46f4f1d07b7";
const REQUEST="Help me! I was robbed by TEAM AQUA!\nI have to get the DEVON GOODS back!";
const label={source:"authored-script" as const,scene:"rustboro-employee-request" as const,beat:"employee-request" as const,speaker:"DEVON EMPLOYEE" as const,map_id:[0,3] as [0,3],actor_local_id:9,message_pointer:0x081e183e,return_pc:0x081e0b6d,rom_sha1:ROM};
const on={...featuresOf([]),"authored-scene-labels-v1":true};
const off={...featuresOf([]),"authored-scene-labels-v1":false};
const event=(body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:"authored-scenes",seq:1,t:"2026-10-30T12:00:00.000-04:00",turn:1,...body});
const bare=(text=REQUEST,speaker:string|null=null)=>({state_seq:1,map:"RUSTBORO CITY",map_id:[0,3],position:null,speaker,speaker_source:speaker===null?null:"faced_sprite",on_screen:[],text});
const dialogue=(pages:readonly unknown[],seq=2,id=`call-${String(seq)}`)=>event({type:"dialogue_auto_advance",seq,tool_call_id:id,tool:"press",requested:[],sent:[],dropped:[],auto_presses:0,stop:"field_free",detail:"",duration_ms:0,pages});
const result=(seq=3,id=`call-${String(seq-1)}`,text="Location: RUSTBORO CITY")=>event({type:"tool_result",seq,id,name:"press",text,is_error:false,duration_ms:1,frames:[]});
function pages(...raw:unknown[]){const d=dialogue(raw);if(d.type!=="dialogue_auto_advance")throw Error("fixture");return d.pages;}
function memory(enabled=true,allField=true,yaml=false){
 const listeners:((e:RunEvent)=>void)[]=[],receipts:{text:string;evidence:number[]}[]=[];
 const features={...on,"authored-scene-labels-v1":enabled,"observed-instructions-v1":true,"observed-field-dialogue-v1":allField,"instruction-memory-cap-v1":true,"instruction-memory-yaml-v1":yaml};
 const transform=observedInstructions(features,{subscribe:f=>{listeners.push(f);},recordLedgerContext:n=>{receipts.push(n);}},m=>Promise.resolve(m));
 return {receipts,transform,feed:(...events:RunEvent[])=>{for(const e of events)for(const f of listeners)f(e);}};
}

it("schema carries optional native authored labels without changing raw attribution or legacy events",()=>{
 const old=dialogue([bare()]);expect(old).toEqual(dialogue([bare()]));
 const d=dialogue([{...bare(),scene_label:label}]);if(d.type!=="dialogue_auto_advance")throw Error("fixture");
 expect(d.pages[0]).toMatchObject({speaker:null,speaker_source:null,on_screen:[],text:REQUEST,scene_label:label});
 const state=event({type:"state",...IN_GAME,world_context:{objects:[],triggers:[],dialogue:REQUEST,message:{phase:"button_wait",cursor:REQUEST.length,ready:true,scene_label:label}}});
 expect(state).toMatchObject({world_context:{message:{scene_label:label}}});
});
it.each([
 {source:"model"},{scene:"other-scene"},{beat:"later-page"},{speaker:"MR. STONE"},{map_id:[0,4]},
 {actor_local_id:11},{message_pointer:-1},{return_pc:-1},{rom_sha1:"0".repeat(40)},
 {scene:"rustboro-theft-chase",beat:"employee-request"},{beat:"grunt-escape",speaker:"DEVON EMPLOYEE"},
])("rejects unsupported authored label metadata: %j",patch=>{
 expect(()=>dialogue([{...bare(),scene_label:{...label,...patch}}])).toThrow();
});
it("helper OFF produces exact legacy page bytes even when replay carries ON metadata",()=>{
 const legacy=pages(bare()),annotated=pages({...bare(),scene_label:label});
 const original=structuredClone(annotated),out=applySceneLabelsToPages(annotated,off);
 expect(out).toEqual(legacy);expect(pageLine(out[0]!,7)).toBe(pageLine(legacy[0]!,7));expect(annotated).toEqual(original);
});
it("helper and page renderer label authored roles, preserve every quoted word and anonymous presence",()=>{
 const input=pages({...bare(),scene_label:label}),out=applySceneLabelsToPages(input,on);
 expect(out[0]).toMatchObject({speaker:null,speaker_source:null,on_screen:[],text:REQUEST,scene_label:label});
 expect(pageLine(out[0]!,7)).toContain(`DEVON EMPLOYEE (authored script role): "${REQUEST}"`);
 expect(pageLine(out[0]!,7)).not.toMatch(/current actor|go to|recover.*now|local_id/i);
});
it("helper refuses authored presentation on another map or a battle page without mutating raw pages",()=>{
 const input=pages({...bare(),map_id:[0,4],scene_label:label},{...bare(),battle_turn:1,scene_label:label});
 const out=applySceneLabelsToPages(input,on);expect(out.every(p=>p.scene_label===undefined)).toBe(true);
 expect(input[0]).toHaveProperty("scene_label");expect(out.map(p=>p.text)).toEqual([REQUEST,REQUEST]);
});
it("authored labels survive delivered dialogue recall without turning historical roles into current presence",()=>{
 const yes=new DialogueLog(on),no=new DialogueLog(off);const d=dialogue([{...bare(),scene_label:label}]);
 for(const log of [yes,no]){log.observe(d);log.observe(result());}
 expect(yes.recall({})).toContain("DEVON EMPLOYEE (authored script role)");expect(yes.recall({})).toContain(REQUEST);
 expect(no.recall({})).not.toContain("DEVON EMPLOYEE");expect(yes.entries()[0]?.text).toBe(REQUEST);
});
it("keeps old field/story selection on original attribution even when an authored name is available",async()=>{
 const h=memory(true,false);h.feed(dialogue([{...bare(),scene_label:label}]),result());
 expect(await h.transform([])).toEqual([]);expect(h.receipts).toEqual([]);
});
it.each([false,true])("retains employee request after healing and Route116 until native completion, YAML=%s",async yaml=>{
 const h=memory(true,true,yaml);h.feed(dialogue([{...bare(REQUEST,"MAN_2"),scene_label:label}]),result());
 h.feed(event({type:"state",seq:4,...IN_GAME,location:"RUSTBORO CITY POKEMON CENTER 1F",map_id:[11,5],story_progress:{flags:"00".repeat(300),rustboro_stage:3,devon_stage:0,letter:false}}),result(5,"healed","Location: POKéMON CENTER\nParty healed."));
 h.feed(event({type:"state",seq:6,...IN_GAME,location:"ROUTE 116",map_id:[0,31],story_progress:{flags:"00".repeat(300),rustboro_stage:3,devon_stage:0,letter:false}}),result(7,"travel","Location: ROUTE 116"));
 await h.transform([]);let text=h.receipts.at(-1)?.text??"";expect(text).toContain("DEVON EMPLOYEE");expect(text).toContain("authored-script");expect(text).toContain("robbed by TEAM AQUA");expect(text).not.toContain('speaker: "MAN_2"');
 h.feed(event({type:"milestone",seq:8,name:"RUSTURF_AQUA_GRUNT_DEFEATED",kind:"story",origin:"observed",server_timestamp:1,evidence:[6]}));await h.transform([]);expect(h.receipts.at(-1)?.text).toContain("robbed by TEAM AQUA");
 const flags=new Uint8Array(300);flags[143>>3]=1<<(143&7);
 h.feed(event({type:"state",seq:9,...IN_GAME,location:"RUSTURF TUNNEL",map_id:[24,4],story_progress:{flags:Buffer.from(flags).toString("hex"),rustboro_stage:4,devon_stage:0,letter:false}}),event({type:"milestone",seq:10,name:"DEVON_GOODS_RECOVERED",kind:"story",origin:"observed",server_timestamp:1,evidence:[9]}),result(11,"complete","Location: RUSTURF TUNNEL"));
 await h.transform([]);text=h.receipts.at(-1)?.text??"";expect(text).not.toContain("robbed by TEAM AQUA");expect(text).not.toContain("DEVON EMPLOYEE");
});
it("memory OFF ignores metadata exactly and failed delivery adds no authored episode",async()=>{
 const labelled=memory(false),legacy=memory(false);labelled.feed(dialogue([{...bare(),scene_label:label}]),result());legacy.feed(dialogue([bare()]),result());
 expect((await labelled.transform([])).map(m=>m.content)).toEqual((await legacy.transform([])).map(m=>m.content));
 const failed=memory();failed.feed(dialogue([{...bare(),scene_label:label}]),event({type:"tool_result",seq:3,id:"call-2",name:"press",text:"failed",is_error:true,duration_ms:1,frames:[]}));expect(await failed.transform([])).toEqual([]);
});
it.each([false,true])("counts the actual authored rendering against the existing whole-episode cap, YAML=%s",async yaml=>{
 const h=memory(true,true,yaml);
 for(let i=0;i<90;i++){const seq=2+i*2;h.feed(dialogue([{...bare(`Unique request ${String(i)}: ${"unchanged words ".repeat(15)}`,"MAN_2"),scene_label:label}],seq),result(seq+1));}
 await h.transform([]);const text=h.receipts.at(-1)?.text??"";expect(Array.from(text).length).toBeLessThanOrEqual(16000);expect(text).toContain("DEVON EMPLOYEE");expect(text).toContain("authored-script");expect(text).toContain("other episodes are left out");
});
