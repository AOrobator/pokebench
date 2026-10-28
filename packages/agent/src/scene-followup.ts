import type {AgentMessage} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {RunRecorder} from "./recorder.js";
import {onScreenItem} from "./script-line-presence.js";

// scene-followup-prompt-v1: after a scene plays on its own (people speak and move while the player stands still,
// and nobody in it addresses the player by name), the next request gets one SUPERVISOR note that quotes the
// scene's pages and names who was on screen, then asks the model to talk to them before older plans.
// Probed on 9e33's model: 141/160 on five unseen runs vs 5/160 off (runs/reports/run-analysis/2026-10-27_scene-followup-prompt-research).
type Advance=Extract<RunEvent,{type:"dialogue_auto_advance"}>;
type Page=Advance["pages"][number];
type Transform=(messages:AgentMessage[])=>Promise<AgentMessage[]>;
export interface Scene {readonly texts:readonly string[];readonly people:readonly string[]}

const anonymous=(p:Page):boolean=>p.speaker===null&&(p.on_screen?.length??0)>0;
const cast=(p:Page):string=>JSON.stringify((p.on_screen??[]).map(o=>[o.local_id,o.x,o.y]));

// The guarded trigger, from the game's own pages only.
export function sceneFollowup(e:Advance):Scene|null {
 if(e.stop!=="field_free")return null;
 if(e.pages.some(p=>p.speaker!==null&&p.speaker_source!==null))return null;
 const anon=e.pages.filter(anonymous);
 if(anon.length<2)return null;
 if(!anon.some((p,i)=>i>0&&cast(p)!==cast(anon[i-1] as Page)))return null;
 const tiles=new Set(anon.map(p=>p.position===null?"?":`${String(p.position.x)},${String(p.position.y)}`));
 if(tiles.size!==1||tiles.has("?"))return null;
 const people=[...new Set(anon.flatMap(p=>(p.on_screen??[]).map(onScreenItem)))];
 return {texts:anon.map(p=>p.text.replace(/\n/g," ")),people};
}

export function sceneFollowupNote(scene:Scene):string {
 return `SUPERVISOR: You just watched a scene play out on its own while you could not move. The game showed: ${scene.texts.map(t=>`"${t}"`).join(" ")} The people in it were: ${scene.people.join("; ")} (where they stood during the scene). That was a story event, not background flavor. Before anything else, walk up to the nearest person who took part in it and talk to them (face them and press A). Only then return to older plans.`;
}

// Armed by the scene's own tool result, the note joins every request until the model has answered one that
// carried it (a reply that did not fail), so other results in the same turn cannot drop it and it is read once.
export function sceneFollowupContext(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe"|"recordLedgerContext">,base:Transform):Transform {
 if(!features["scene-followup-prompt-v1"])return base;
 let pending:{id:string;seq:number;note:string}|null=null,due:{note:string;evidence:number[];sent:boolean}|null=null;
 recorder.subscribe(e=>{
  if(e.type==="dialogue_auto_advance"){const scene=sceneFollowup(e);pending=scene===null?null:{id:e.tool_call_id,seq:e.seq,note:sceneFollowupNote(scene)};}
  if(e.type==="tool_result"&&pending!==null&&e.id===pending.id){due={note:pending.note,evidence:[pending.seq,e.seq],sent:false};pending=null;}
  if(e.type==="assistant"&&due?.sent===true&&e.stop_reason!=="error"&&e.stop_reason!=="aborted")due=null;
 },true);
 return async messages=>{
  const out=await base(messages);
  if(due===null||out.some(m=>m.role==="user"&&m.content===due?.note))return out;
  if(!due.sent){recorder.recordLedgerContext({text:due.note,evidence:due.evidence});due.sent=true;}
  return [...out,{role:"user",content:due.note,timestamp:Date.now()}];
 };
}
