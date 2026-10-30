import type {AgentMessage} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import {semanticNavigation,type FeatureSet} from "./features.js";
import type {RunRecorder} from "./recorder.js";
import {progressReached} from "./story-progress.js";

type State=Extract<RunEvent,{type:"state";started:boolean}>;
type Result=Extract<RunEvent,{type:"tool_result"}>;
type Transform=(messages:AgentMessage[])=>Promise<AgentMessage[]>;
const HEADER="RUSTURF ENTRY FOLLOW-UP";
const AVAILABLE="Field controls: available (terrain and objects can still block a direction)";
const COMPLETIONS=new Set(["RUSTURF_AQUA_GRUNT_DEFEATED","DEVON_GOODS_RECOVERED"]);
// This is a generic priority/inquiry/tool-binding reminder, not an episode quote or a walkthrough.
// Every game fact in the note comes from the current delivered readout. No unseen actor, task or exit is supplied.
const CORE="Current question: what local inquiry can you make from the evidence here? Prioritize that inquiry before speculative older travel plans. Limited visibility does not exhaust the leads: inspect the local area, using current observations, listed identities and the game's exact words. Treat older plans as proposals, not game facts. If the game has given you an unresolved local task, keep it pending through wild battles, dialogue, menus and necessary healing/travel; return to it when field control is free. Arrival or a taunt is not completion. Retire that task only when the observed game result resolves it. After a refusal or interrupted approach, observe and rebind your next call to the returned current state. Follow through on the game's reply. The overall mission is unchanged.";
function guidance(features:FeatureSet):string {
 const lines=[CORE];
 if(semanticNavigation(features))lines.push("For a listed person with a supported navigate_to_target identity, use navigate_to_target with the current map_id and exact listed target; do not navigate to the person's occupied coordinates.");
 if(features["bounded-navigation-v1"])lines.push("Use navigate_to only for a reachable approach tile supported by the current observation; reaching a tile does not itself talk to a person.");
 lines.push("Use press with A for a person only when already adjacent, facing that person and on the free field; otherwise first choose an observed approach. Check any prerequisite against what the game actually says.");
 return lines.join(" ");
}

function eligible(s:State):boolean {
 const world=s.world_context;
 return s.started&&s.map_id?.[0]===24&&s.map_id[1]===4&&s.location?.replace(/\s+/g," ").trim().toUpperCase()==="RUSTURF TUNNEL"&&s.position!==null&&s.screen==="overworld"&&!s.in_battle&&s.blackout_active!==true&&s.field_controls_locked===false&&s.active_ui===null&&s.naming==null&&world!=null&&world.dialogue===null&&world.message==null&&world.field_activity===undefined&&!world.message_diagnostic&&!s.map_visibility?.diagnostic&&!s.running?.diagnostic&&!s.battle?.active&&!(s.settle?.reason.endsWith("_bound")??false)&&s.settle?.reason!=="coherence_timeout"&&[...COMPLETIONS].every(name=>progressReached(name,s)===false);
}
function locationMatches(s:State,line:string):boolean {
 if(s.location===null)return false;
 if(line===`Location: ${s.location}`)return true;
 const current=s.exit_sections?.current;
 if(current===undefined||line!==`Location: ${current}`)return false;
 // exit-labels-v3 owner: map_sections.py:named uses the observed name, native map id,
 // and Sections.label's quadrant/anchor (or "terrain section unknown"). Match that whole contract.
 const label=/^(.+) \(map (\d+)\/(\d+)\) — (?:(?:north|south)(?:west|east) terrain section \[\d+,\d+\]|terrain section unknown)$/.exec(current);
 return label!==null&&label[1]===s.location&&s.map_id!==null&&Number(label[2])===s.map_id[0]&&Number(label[3])===s.map_id[1];
}
function readout(s:State,text:string):{location:string;position:string}|null {
 const dialogs=text.match(/^Dialog: .*$/gm)??[],menus=text.match(/^Menu: .*$/gm)??[];
 const screens=text.match(/^Screen: .*$/gm)??[],locations=text.match(/^Location: .*$/gm)??[],positions=text.match(/^Position: .*$/gm)??[],controls=text.match(/^Field controls: .*$/gm)??[];
 if(screens.length!==1||screens[0]!=="Screen: overworld"||locations.length!==1||positions.length!==1||controls.length!==1||controls[0]!==AVAILABLE||dialogs.length!==1||dialogs[0]!=="Dialog: none"||menus.length!==1||menus[0]!=="Menu: none open"||/^(?:Interface:|STATE COVERAGE ERROR:|Unverified menu buffer:)/m.test(text))return null;
 const location=locations[0],position=positions[0];
 if(s.position===null||!locationMatches(s,location))return null;
 const xy=/^Position: X=(-?\d+), Y=(-?\d+)(?:,.*)?$/.exec(position);
 if(xy===null||Number(xy[1])!==s.position.x||Number(xy[2])!==s.position.y)return null;
 return {location,position};
}
function delivered(messages:AgentMessage[],result:Result):boolean {
 for(const m of [...messages].reverse()){
  if(m.role==="assistant")return false;
  if(m.role!=="toolResult")continue;
  return !m.isError&&m.toolCallId===result.id&&m.toolName===result.name&&m.content.filter(p=>p.type==="text").map(p=>p.text).join("\n")===result.text;
 }
 return false;
}

/** One successful exposed decision per unresolved run episode. Leaving cancels the current candidate;
 * reentry may retry an unconsumed cue, but never re-arms a consumed one. Retry/error responses do not consume.
 * An initial coherent delivered observation inside the tunnel qualifies without reconstructing source-run history.
 */
export function rusturfEntryFollowupContext(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe"|"recordLedgerContext">&Partial<Pick<RunRecorder,"isRestoring">>,base:Transform):Transform {
 if(!features["rusturf-entry-followup-v1"])return base;
 let run:string|null=null,latest:State|null=null,result:Result|null=null,consumed=false,exposed=false;
 const completed=new Set<string>(),recorded=new Set<string>();
 recorder.subscribe(e=>{
  // Historical prefixes are restored memory, not fresh current-run entry observations.
  if(recorder.isRestoring?.()===true)return;
  // pret 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881 RusturfTunnel_EventScript_Grunt:
  // trainer victory (1296), then FLAG_RECOVERED_DEVON_GOODS (143) after the closing scene.
  // Reuse existing native catalog decoding; never turn model narration into completion.
  if(e.type==="milestone"&&e.kind==="story"&&(e.origin==="observed"||e.origin==="present_at_start")&&COMPLETIONS.has(e.name))completed.add(e.run);
  if(e.type==="state"){
   run??=e.run;if(e.run!==run)return;
   const current="started"in e?e:null;latest=current;result=null;exposed=false;
   if(current!==null&&[...COMPLETIONS].some(name=>progressReached(name,current)===true))completed.add(e.run);
  }
  if(e.run!==run)return;
  if(e.type==="tool_result"){result=e;exposed=false;}
  if(e.type==="tool_call"){result=null;exposed=false;}
  if(e.type==="telemetry_error"&&e.source==="state"){latest=null;result=null;exposed=false;}
  if(e.type==="assistant"){
   if(exposed&&e.stop_reason!=="error"&&e.stop_reason!=="aborted")consumed=true;
   exposed=false;
  }
 },true,false,true);
 return async messages=>{
  const transformed=await base(messages);exposed=false;
  // Reentrant fit/trim calls may pass a previously transformed request back through this seam.
  // Drop only notes this instance actually produced, so stale coordinates cannot survive a new state.
  const out=transformed.filter(m=>!(m.role==="user"&&typeof m.content==="string"&&recorded.has(m.content)));
  if(consumed||latest===null||result===null||completed.has(latest.run)||!eligible(latest)||result.is_error||result.run!==latest.run||result.state_seq!==latest.seq||!delivered(messages,result)||!delivered(out,result))return out;
  const facts=readout(latest,result.text);if(facts===null)return out;
  const text=`${HEADER}\n${facts.location}\n${facts.position}\n${AVAILABLE}\n\n${guidance(features)}`;
  exposed=true;
  if(!recorded.has(text)){recorded.add(text);recorder.recordLedgerContext({text,evidence:[latest.seq,result.seq]},"current");}
  const existing=transformed.find(m=>m.role==="user"&&m.content===text);
  return [...out,existing??{role:"user",content:text,timestamp:Date.now()}];
 };
}
