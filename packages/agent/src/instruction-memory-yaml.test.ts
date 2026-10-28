import {describe,expect,it} from "vitest";
import type {RunEvent} from "./events.js";
import {SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {INSTRUCTION_MEMORY_CAP_CHARS,codePoints,type CapEpisode} from "./instruction-memory-cap.js";
import {INSTRUCTION_MEMORY_YAML_CAP_CHARS,YAML_CARRY_LINE,YAML_HEADER,instructionMemoryYaml,yamlScalar} from "./instruction-memory-yaml.js";
import {observedInstructions} from "./observed-instructions.js";
import {flagFeatures} from "./play-preset.js";

const COLS=["speaker","speaker_source","text","map","map_id","state_event"];
const ep=(result:number,turn:number,pages:CapEpisode["pages"]):CapEpisode=>({result,dialogue:[result-2,result-1],turn,pages});

describe("instruction-memory-yaml-v1 rendering",()=>{
 it("writes plain scalars only where YAML cannot read them as anything else",()=>{
  expect(["ROUTE104","faced_sprite","MR. BRINEY","PROF. BIRCH'S HOUSE 2F","AAAAAA's HOUSE 2F","POKéMON CENTER"].map(yamlScalar)).toEqual(["ROUTE104","faced_sprite","MR. BRINEY","PROF. BIRCH'S HOUSE 2F","AAAAAA's HOUSE 2F","POKéMON CENTER"]);
  expect(["0x1A","104","Yes","off","~","NULL","ends with dot.","trailing ","a: b","#tag","-dash",'Sign text "Hi"',"",":"].map(yamlScalar)).toEqual(['"0x1A"','"104"','"Yes"','"off"','"~"','"NULL"','"ends with dot."','"trailing "','"a: b"','"#tag"','"-dash"','"Sign text \\"Hi\\""','""','":"']);
  expect([null,true,false,0,42,[0,19],[]].map(yamlScalar)).toEqual(["null","true","false","0","42","[0, 19]","[]"]);
 });
 it("renders whole episodes with carried-over fields and block-literal text, and a JSON string where a block could change the text",()=>{
  const eps=[ep(10,3,[["MOM","name_prefix","MOM: Hi, \"hon\"!\nPOKéNAV: on.","HOUSE 1F",[1,0],5],["MOM","name_prefix","Bye.","HOUSE 1F",[1,0],6],[null,null,"Sign: a\n# b","LITTLEROOT TOWN",[0,9],7]]),
   ep(20,4,[["BOY_1","faced_sprite"," leading","ROUTE104",[0,19],8],["BOY_1","faced_sprite","trailing \nx","ROUTE104",[0,19],9],["BOY_1","faced_sprite","tab\there","ROUTE104",[0,19],null],["BOY_1","faced_sprite","blank\n\nline","ROUTE104",[0,19],10],["BOY_1","faced_sprite","end\n","ROUTE104",[0,19],11],["BOY_1","faced_sprite","sep\u2028x","ROUTE104",null,12]])];
  expect(instructionMemoryYaml(2,eps,COLS,{current:{result_event:30,state_event:null,location:"ROUTE104",story:"clock set; rival met"}})).toBe([
   YAML_HEADER.replace("Unknown, mixed, future and reusable dialogue stays.","Over the size cap, finished and less relevant episodes are left out."),"2 earlier episodes are left out and remain in the run recording.",YAML_CARRY_LINE,"episodes:",
   "  - turn: 3","    delivered_result: 10","    dialogue_events: [8, 9]","    pages:",
   "      - speaker: MOM","        speaker_source: name_prefix","        map: HOUSE 1F","        map_id: [1, 0]","        state_event: 5","        text: |-","          MOM: Hi, \"hon\"!","          POKéNAV: on.",
   "      - state_event: 6","        text: |-","          Bye.",
   "      - speaker: null","        speaker_source: null","        map: LITTLEROOT TOWN","        map_id: [0, 9]","        state_event: 7","        text: |-","          Sign: a","          # b",
   "  - turn: 4","    delivered_result: 20","    dialogue_events: [18, 19]","    pages:",
   "      - speaker: BOY_1","        speaker_source: faced_sprite","        map: ROUTE104","        map_id: [0, 19]","        state_event: 8","        text: \" leading\"",
   "      - state_event: 9","        text: \"trailing \\nx\"",
   "      - state_event: null","        text: \"tab\\there\"",
   "      - state_event: 10","        text: \"blank\\n\\nline\"",
   "      - state_event: 11","        text: \"end\\n\"",
   "      - map_id: null","        state_event: 12","        text: \"sep\u2028x\"",
   "current:","  result_event: 30","  state_event: null","  location: ROUTE104","  story: \"clock set; rival met\""].join("\n"));
  expect(instructionMemoryYaml(0,[],COLS,{current:null})).toBe([YAML_HEADER,YAML_CARRY_LINE,"episodes:","current: null"].join("\n"));
  expect(YAML_HEADER).not.toContain("columns");
 });
});

describe("instruction-memory-yaml-v1 through observedInstructions",()=>{
 const ev=(body:Record<string,unknown>):RunEvent=>({v:1,run:"r",t:"2026-10-28T00:00:00.000Z",turn:1,...body}) as unknown as RunEvent;
 const stream=(n:number):RunEvent[]=>Array.from({length:n},(_,i)=>{const seq=10+i*2;return [
  ev({seq,turn:i+2,type:"dialogue_auto_advance",tool_call_id:`t${String(i)}`,tool:"press",requested:[],sent:[],dropped:[],auto_presses:1,pages:[{state_seq:null,map:"FAR",map_id:[9,9],position:null,speaker:"MOM",speaker_source:"name_prefix",text:`MOM: episode ${String(i)} ${"y".repeat(400)}`}],stop:"field_control",detail:"",duration_ms:1}),
  ev({seq:seq+1,turn:i+2,type:"tool_result",id:`t${String(i)}`,name:"press",is_error:false,text:"Location: ROUTE104",state_seq:null})];}).flat();
 const recorded=async(n:number,yaml:boolean,cap=false,trim=true)=>{
  const features={...Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])),"observed-instructions-v1":true,"observed-field-dialogue-v1":true,"milestone-instruction-memory-v1":trim,"instruction-memory-cap-v1":cap,"instruction-memory-yaml-v1":yaml} as FeatureSet;
  const subs:((e:RunEvent)=>void)[]=[],records:string[]=[];
  const transform=observedInstructions(features,{subscribe:fn=>{subs.push(fn);},recordLedgerContext:body=>{records.push(body.text);}},m=>Promise.resolve(m));
  for(const e of stream(n))for(const fn of subs)fn(e);
  const messages=await transform([]);
  return {text:records[0]??"",sent:messages.map(m=>m.role==="user"?m.content:null)};
 };
 it("sends the same selected episodes as YAML instead of JSON, and changes nothing when off or when the selection form is off",async()=>{
  const [json,yaml]=await Promise.all([recorded(3,false),recorded(3,true)]);
  expect(json.text.startsWith("OBSERVED INSTRUCTION MEMORY")).toBe(true);expect(json.text).toContain('{"columns":');
  expect(yaml.text).not.toContain('{"columns":');expect(yaml.sent).toEqual([yaml.text]);
  const payload=JSON.parse(json.text.slice(json.text.indexOf("\n{")+1)) as {columns:string[];episodes:CapEpisode[];current:Record<string,string|number|null>|null};
  expect(yaml.text).toBe(instructionMemoryYaml(0,payload.episodes,payload.columns,{current:payload.current}));
  const [legacyOff,legacyOn]=await Promise.all([recorded(3,false,false,false),recorded(3,true,false,false)]);
  expect(legacyOn.text).toBe(legacyOff.text);
 });
 it("with instruction-memory-cap-v1, measures the cap on the delivered YAML",async()=>{
  const [json,yaml]=await Promise.all([recorded(60,false,true),recorded(60,true,true)]);
  expect(codePoints(json.text)).toBeLessThanOrEqual(INSTRUCTION_MEMORY_CAP_CHARS);
  expect(codePoints(yaml.text)).toBeLessThanOrEqual(INSTRUCTION_MEMORY_YAML_CAP_CHARS);expect(codePoints(yaml.text)).toBeGreaterThan(INSTRUCTION_MEMORY_CAP_CHARS);
  const left=Number(/^(\d+) earlier episodes are left out and remain in the run recording\.$/m.exec(yaml.text)?.[1]);
  expect([...yaml.text.matchAll(/^ {2}- turn: /gm)].length+left).toBe(60);
 });
});

describe("instruction-memory-yaml-v1 with instruction-memory-dedup-v1 and the cap",()=>{
 const ev=(body:Record<string,unknown>):RunEvent=>({v:1,run:"r",t:"2026-10-28T00:00:00.000Z",turn:1,...body}) as unknown as RunEvent;
 const stream=(n:number):RunEvent[]=>Array.from({length:n},(_,i)=>{const seq=10+i*2;return [
  ev({seq,turn:i+2,type:"dialogue_auto_advance",tool_call_id:`t${String(i)}`,tool:"press",requested:[],sent:[],dropped:[],auto_presses:1,pages:[{state_seq:null,map:"FAR",map_id:[9,9],map_display:"FAR AWAY",position:null,speaker:"MOM",speaker_source:"name_prefix",text:`MOM: ${i%2===0?"he went up the route":"just chatting"} ${String(i)} ${"y".repeat(400)}`}],stop:"field_control",detail:"",duration_ms:1}),
  ev({seq:seq+1,turn:i+2,type:"tool_result",id:`t${String(i)}`,name:"press",is_error:false,text:"Location: ROUTE104",state_seq:null})];}).flat();
 const sent=async(n:number,o:{yaml:boolean;dedup:boolean;cap:boolean;trim?:boolean})=>{
  const features={...Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])),"observed-instructions-v1":true,"observed-field-dialogue-v1":true,"milestone-instruction-memory-v1":o.trim??true,"delivered-place-evidence-v1":true,"instruction-memory-dedup-v1":o.dedup,"instruction-memory-cap-v1":o.cap,"instruction-memory-yaml-v1":o.yaml} as FeatureSet;
  const subs:((e:RunEvent)=>void)[]=[],records:string[]=[];
  const transform=observedInstructions(features,{subscribe:fn=>{subs.push(fn);},recordLedgerContext:body=>{records.push(body.text);}},m=>Promise.resolve(m));
  for(const e of stream(n))for(const fn of subs)fn(e);
  await transform([]);
  return records[0]??"";
 };
 it("renders dedup's merged block, source-map columns included, from the same JSON, capped or not",async()=>{
  for(const cap of [false,true]){
   const [json,yaml]=await Promise.all([sent(cap?60:3,{yaml:false,dedup:true,cap}),sent(cap?60:3,{yaml:true,dedup:true,cap})]);
   expect(yaml).not.toContain("DELIVERED PERSON AND PLACE EVIDENCE");expect(yaml).toContain("source_map_name: FAR");expect(yaml).toContain("source_map_display: FAR AWAY");
   if(!cap){
    const payload=JSON.parse(json.slice(json.indexOf("\n{")+1)) as {columns:string[];episodes:CapEpisode[];current:Record<string,string|number|null>|null};
    expect(yaml).toBe(instructionMemoryYaml(0,payload.episodes,payload.columns,{current:payload.current}));
   }else{
    expect(codePoints(yaml)).toBeLessThanOrEqual(INSTRUCTION_MEMORY_YAML_CAP_CHARS);
    expect(yaml.split("\n")[0]).toContain("Over the size cap, finished and less relevant episodes are left out.");
   }
  }
 });
 it("renders observed_locations when dedup selects without milestone retention, and leaves the separate place block alone without dedup",async()=>{
  const yaml=await sent(3,{yaml:true,dedup:true,cap:false,trim:false});
  expect(yaml).toMatch(/\nobserved_locations:\n {2}- result_event: \d+\n {4}state_event: null\n {4}location: ROUTE104$/);
  const [json,plain]=await Promise.all([sent(3,{yaml:false,dedup:false,cap:false}),sent(3,{yaml:true,dedup:false,cap:false})]);
  const place=(t:string)=>t.slice(t.indexOf("\n\nDELIVERED PERSON AND PLACE EVIDENCE"));
  expect(place(plain)).toBe(place(json));expect(plain.startsWith(YAML_HEADER)).toBe(true);
 });
});

describe("instruction-memory-yaml-v1 registry",()=>{
 it("is a default-off guidance switch registered after instruction-memory-cap-v1, needing nothing, with OFF copy",()=>{
  expect(SWITCHABLE_FEATURES.indexOf("instruction-memory-yaml-v1")).toBe(SWITCHABLE_FEATURES.indexOf("instruction-memory-cap-v1")+1);
  expect(featureInfo("instruction-memory-yaml-v1")).toMatchObject({group:"guidance",needs:null,switchable:true,title:"INSTRUCTION MEMORY YAML"});
  expect(featureInfo("instruction-memory-yaml-v1").description).toContain(" Off: ");
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})["instruction-memory-yaml-v1"]).toBe(false);
  expect(playHarnessFeatures({...Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])),"instruction-memory-yaml-v1":true} as FeatureSet,null)).toContain("instruction-memory-yaml-v1");
 });
});
