import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {fileURLToPath} from "node:url";
import {featuresOf,type FeatureSet,type SwitchableFeature} from "../src/features.js";
import type {RunEvent} from "../src/events.js";

// Recorded runs trimmed for the battle-facts tests (blocked-exit-fact-v1, battle-loss-recap-v1,
// briefing-battle-outcomes-v1). Made by the test author from runs/2026-10-16T04-51-03_qwen36-gpu0_54a7
// (seq 0-14400) and runs/2026-10-16T02-23-17_qwen36-gpu1_sh02 (seq 15600-16400 plus run_start and
// milestones): native_action, assistant, assistant_delta and turn_start events dropped; state events keep
// the fields the briefings and these switches read (battle trimmed to active/outcome/battle_type/battlers'
// species). Both runs predate trainer-opponent-v1, so each state at a tool result or in a battle carries
// `trainer_opponent` reparsed offline from that state's own raw RAM archive with the run's ROM
// (gTrainerBattleOpponent_A 0x02038BCA, gTrainers 0x08310030, the trainer flag); other states omit it.
// Tool result texts are whole. Not parseEvent-valid runs.
export function recorded(name:string):RunEvent[]{
 const path=fileURLToPath(new URL(`../src/fixtures/${name}`,import.meta.url));
 return gunzipSync(readFileSync(path)).toString("utf8").trim().split("\n").map(line=>JSON.parse(line) as RunEvent);
}

export function recordedFeatures(events:readonly RunEvent[],overrides:Partial<Record<SwitchableFeature,boolean>>={}):FeatureSet{
 const start=events.find(e=>e.type==="run_start");
 if(start?.type!=="run_start")throw new Error("fixture has no run_start");
 return {...featuresOf(start.harness_features),...overrides};
}

export type RecordedState=Extract<RunEvent,{type:"state";started:boolean}>;
export function stateAt(events:readonly RunEvent[],seq:number):RecordedState{
 const found=events.find(e=>e.seq===seq);
 if(found?.type!=="state"||!("started" in found))throw new Error(`no state at ${String(seq)}`);
 return found;
}
