// instruction-memory-yaml-v1: the selected OBSERVED INSTRUCTION MEMORY block as YAML instead of a JSON payload.
// Same episodes, pages and current progress; only the format changes. Game text goes in |- block scalars, which keep it
// as printed, or in a JSON string (valid YAML) wherever a block scalar could change it. The reference implementation is
// runs/analysis/bounded-input-20261028/yaml_form.py (to_yaml_compact), checked by parsing back with PyYAML.
import {CAPPED_SELECTION,omittedLine,type CapEpisode} from "./instruction-memory-cap.js";

// With instruction-memory-cap-v1: YAML runs about 3.1 chars per Qwen3.6 token against JSON's 2.6, so 19,000 YAML chars
// is the same ~6,100-token budget as 16,000 JSON chars (a702 T1301, measured with /tokenize).
export const INSTRUCTION_MEMORY_YAML_CAP_CHARS=19000;
export const YAML_HEADER="OBSERVED INSTRUCTION MEMORY — selected historical dialogue, not an active-goal list. Exact whole episodes; each page gives its speaker, map, state event and exact text. Current observations override old text. Unknown, mixed, future and reusable dialogue stays. Full archive remains in the run recording.";
export const YAML_CARRY_LINE="In each episode a page's speaker, speaker_source, map, map_id and source map fields are written only when they differ from the page before; otherwise they carry over.";
type Scalar=string|number|boolean|null|readonly number[];
const PLAIN=/^[A-Za-zéÉ][A-Za-z0-9éÉ_ .,'()/&-]*$/;
const RESERVED=new Set(["y","n","yes","no","true","false","on","off","null","~"]);
const CARRIED=["speaker","speaker_source","map","map_id"];
// Control, C1, line/paragraph separator and BOM characters: YAML 1.1 readers treat some as breaks or reject them.
const unsafe=(text:string)=>Array.from(text).some(c=>{const n=c.codePointAt(0)??0;return (n<0x20&&n!==0x0a)||(n>=0x7f&&n<=0x9f)||n===0x2028||n===0x2029||n===0xfeff;});

const quoted=(value:string)=>JSON.stringify(value).replace(/[\u007f-\u009f\u2028\u2029\ufeff]/g,c=>`\\u${(c.codePointAt(0)??0).toString(16).padStart(4,"0")}`);

export function yamlScalar(v:Scalar):string {
 if(v===null)return "null";
 if(typeof v==="boolean")return v?"true":"false";
 if(typeof v==="number")return String(v);
 if(typeof v!=="string")return `[${v.map(n=>String(n)).join(", ")}]`;
 return PLAIN.test(v)&&!RESERVED.has(v.toLowerCase())&&!v.endsWith(" ")&&!v.endsWith(".")?v:quoted(v);
}
function text(value:string,indent:number):string[] {
 const pad=" ".repeat(indent),lines=value.split("\n");
 const block=!value.startsWith(" ")&&!unsafe(value)&&lines.every(l=>l!==""&&!l.endsWith(" "));
 return block?[`${pad}text: |-`,...lines.map(l=>`${pad}  ${l}`)]:[`${pad}text: ${quoted(value)}`];
}
type Fields=Readonly<Record<string,string|number|null>>;
// The selected payload's keys after columns and episodes: current (with base episodes) and, under
// instruction-memory-dedup-v1 without retention, observed_locations.
export interface YamlRest {readonly current?:Fields|null;readonly observed_locations?:readonly Fields[];readonly current_left_out?:true;readonly earlier_locations_left_out?:number}
const mapping=(key:string,v:Fields)=>[`${key}:`,...Object.entries(v).map(([k,x])=>`  ${k}: ${yamlScalar(x)}`)];
export function instructionMemoryYaml(omitted:number,episodes:readonly CapEpisode[],columns:readonly string[],rest:YamlRest):string {
 const header=omitted===0?YAML_HEADER:YAML_HEADER.replace("Unknown, mixed, future and reusable dialogue stays.",CAPPED_SELECTION);
 const extra=columns.slice(6),carried=[...CARRIED,...extra];
 const out=[header,...(omitted===0?[]:[omittedLine(omitted)]),YAML_CARRY_LINE,episodes.length===0?"episodes: []":"episodes:"];
 for(const e of episodes){
  out.push(`  - turn: ${String(e.turn)}`,`    delivered_result: ${String(e.result)}`,`    dialogue_events: ${yamlScalar(e.dialogue)}`,e.pages.length===0?"    pages: []":"    pages:");
  let prev:Record<string,Scalar>|null=null;
  for(const [speaker,source,body,map,mapId,stateEvent,...more] of e.pages){
   const page:Record<string,Scalar>={speaker,speaker_source:source,map,map_id:mapId,...Object.fromEntries(extra.map((k,i)=>[k,more[i]??null]))};
   const keys=carried.filter(k=>prev===null||JSON.stringify(page[k])!==JSON.stringify(prev[k]));
   [...keys.map(k=>`${k}: ${yamlScalar(page[k]??null)}`),`state_event: ${yamlScalar(stateEvent)}`].forEach((line,i)=>{out.push(`${i===0?"      - ":"        "}${line}`);});
   out.push(...text(body,8));
   prev=page;
  }
 }
 if(rest.current!==undefined)out.push(...(rest.current===null?["current: null"]:mapping("current",rest.current)));
 if(rest.current_left_out===true)out.push("current_left_out: true");
 if(rest.observed_locations!==undefined)out.push(...(rest.observed_locations.length===0?["observed_locations: []"]:["observed_locations:",...rest.observed_locations.flatMap(l=>Object.entries(l).map(([k,x],i)=>`${i===0?"  - ":"    "}${k}: ${yamlScalar(x)}`))]));
 if(rest.earlier_locations_left_out!==undefined)out.push(`earlier_locations_left_out: ${String(rest.earlier_locations_left_out)}`);
 return out.join("\n");
}
