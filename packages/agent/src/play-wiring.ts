import type {AgentMessage,AgentTool} from "@mariozechner/pi-agent-core";
import {withDialogueAutoAdvance,type AutoAdvanceRecorder} from "./dialogue-auto-advance.js";
import {dialogueLog} from "./dialogue-log.js";
import type {StateSource} from "./game-state.js";
import {withNavigation,type NavigationPorts} from "./navigation.js";
import {withNavigateFirst} from "./navigate-first.js";
import type {FeatureSet} from "./features.js";
import {instructionLedger} from "./instruction-ledger.js";
import {nextMilestoneHint} from "./milestone-hint.js";
import type {LoopDetector,LoopKind} from "./loop-detection.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {StallBriefing} from "./stall-briefing.js";
import {navigationMemory} from "./navigation-memory.js";
import type {RunRecorder} from "./recorder.js";
import {STALL_STOP_MS,StallStop,type RunControl} from "./run-control.js";
import {TEXT_ONLY_NOTE_LIMIT,contextWindow,withoutTextOnlyReplies,type Window} from "./harness.js";

type Transform=(messages:AgentMessage[])=>Promise<AgentMessage[]>;
type WiringRecorder=Pick<RunRecorder,"subscribe"|"recordNavigationContext"|"recordLedgerContext"|"recordMilestoneHint">;

// The switch-dependent memory tools and the context chain a play run delivers to the model.
export function contextTools(features:FeatureSet,recorder:WiringRecorder,base:Transform):{tools:AgentTool[];transformContext:Transform;window:Window}{
 const tools:AgentTool[]=[];
 const memory=navigationMemory(features,recorder,base);
 if(memory!==null)tools.push(memory.tool);
 const dialogue=dialogueLog(features,recorder);
 if(dialogue!==null)tools.push(dialogue);
 const ledger=instructionLedger(features,recorder,memory?.transformContext??base);
 if(ledger!==null)tools.push(ledger.tool);
 const hint=nextMilestoneHint(features,recorder,ledger?.transformContext??memory?.transformContext??base);
 if(hint!==null)tools.push(hint.tool);
 const chain=hint?.transformContext??ledger?.transformContext??memory?.transformContext??base;
 return {tools,transformContext:features["fresh-retry-v1"]?messages=>chain(withoutTextOnlyReplies(messages)):chain,window:contextWindow(features)};
}

// The loop guard's supervisor briefing, when that switch is on.
export function loopSupervisor(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe">):((kind:LoopKind,calls:number)=>string)|undefined {
 if(!features["loop-guard-supervisor-v1"])return undefined;
 const briefing=new SupervisorBriefing(features);recorder.subscribe(event=>{briefing.observe(event);},true);
 return (kind,calls)=>briefing.text(kind,calls);
}

// stall-briefing-v1: supervisor notes for map ping-pong and milestone droughts, timed on unpaused play.
export function stallBriefing(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe">,detector:Pick<LoopDetector,"stall">,control:Pick<RunControl,"pausedMs">,elapsed:()=>number):StallBriefing|null {
 if(!features["stall-briefing-v1"])return null;
 const briefing=new SupervisorBriefing(features);recorder.subscribe(event=>{briefing.observe(event);},true);
 const stall=new StallBriefing(features,()=>elapsed()-control.pausedMs(),detector,(kind,calls)=>briefing.stallText(kind,calls));
 recorder.subscribe(event=>{stall.observe(event);});
 return stall;
}

// text-only-supervisor-v1: the recorded note the governor sends instead of ending the run.
export function textOnlySupervisor(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe"|"textOnlySupervisor">):((replies:number,note:number)=>string)|undefined {
 if(!features["text-only-supervisor-v1"])return undefined;
 const briefing=new SupervisorBriefing(features);recorder.subscribe(event=>{briefing.observe(event);},true);
 return (replies,note)=>{const text=briefing.textOnly(replies,note,TEXT_ONLY_NOTE_LIMIT);recorder.textOnlySupervisor(replies,note,TEXT_ONLY_NOTE_LIMIT,text);return text;};
}

// milestone-stall-stop-v1: ends the run as stalled after STALL_STOP_MS of unpaused play
// with no new observed milestone. elapsed is the same run clock the wall budget uses.
export function stallStop(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe">,control:RunControl,elapsed:()=>number,stalled:()=>void):StallStop|null{
 if(!features["milestone-stall-stop-v1"])return null;
 const stop=new StallStop(control,STALL_STOP_MS,elapsed,stalled);recorder.subscribe(event=>{stop.observe(event);});
 return stop;
}

// The game tools a play run hands the model: ordinary tools, navigate_to and dialogue auto-advance per switch.
export function playGameTools(base:readonly AgentTool[],features:FeatureSet,state:StateSource,recorder:AutoAdvanceRecorder,gate?:NavigationPorts["gate"]):AgentTool[]{
 return [...withNavigateFirst(withDialogueAutoAdvance(withNavigation(base,features,state,gate),features,{state,recorder}),features)];
}
