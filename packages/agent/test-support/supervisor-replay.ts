import {SupervisorBriefing,type Stall} from "../src/loop-supervisor.js";
import type {LoopKind} from "../src/loop-detection.js";
import type {FeatureSet} from "../src/features.js";
import type {RunEvent} from "../src/events.js";

// Fixtures for story-progress-clock-v1, made by the test author from local runs:
// - supervisor-truth-bd60.jsonl.gz: runs/2026-10-17T00-50-38_qwen36-gpu0_bd60 seq 0-19700. Kept: run_start,
//   milestone, state, tool_call, tool_result, button_press, dialogue_auto_advance, loop_guard. States drop
//   local_map, navigation_grid, raw_ram, game_stats, resources, route103_rival, run, settle, party_ownership,
//   play_time_s, badges, story and running; party members keep species, level, hp, max_hp, is_egg, status and
//   identity; battle keeps active, outcome, battle_type and battlers' battler and species. Tool results drop
//   frames; their text is whole.
// - supervisor-truth-dc5a.jsonl.gz: runs/2026-10-17T00-50-38_qwen36-gpu1_dc5a seq 0-16700, trimmed the same way.
// Not parseEvent-valid runs.

type Note=Extract<RunEvent,{type:"loop_guard"}>;
// A recorded supervisor note rebuilt from its own headline by a briefing that has observed every earlier event.
export function rebuild(b:SupervisorBriefing,note:Note):string|null {
 const message=note.message;
 const cycle=/You have walked between (.+) and (.+) (\d+) times(, out and back,| \(with other maps in between\),)/.exec(message);
 if(cycle!==null){const stall:Stall={kind:"map_cycle",from:cycle[1]??"",to:cycle[2]??"",roundTrips:Number(cycle[3]),consecutive:cycle[4]===", out and back,"};return b.stallText(stall,note.calls);}
 const drought=/no new story milestone for (\d+) minutes of play/.exec(message);
 if(drought!==null)return b.stallText({kind:"milestone_drought",minutes:Number(drought[1])},note.calls);
 const dwell=/You have made (\d+) calls in the (.+) without leaving it/.exec(message);
 if(dwell!==null)return b.stallText({kind:"interface_dwell",name:dwell[2]??"",calls:Number(dwell[1])},note.calls);
 if(message.startsWith("SUPERVISOR: You are currently looping."))return b.text(note.kind as LoopKind,note.calls);
 return null;
}

// Every recorded supervisor note of a run, with the briefing's rebuild of it under the given switches.
export function replayNotes(events:readonly RunEvent[],features:FeatureSet):{readonly note:Note;readonly text:string|null}[] {
 const b=new SupervisorBriefing(features);
 const out:{note:Note;text:string|null}[]=[];
 for(const e of events){
  if(e.type==="loop_guard"&&e.phase==="supervisor"){out.push({note:e,text:rebuild(b,e)});continue;}
  if(e.type==="text_only_supervisor")continue;
  b.observe(e);
 }
 return out;
}
