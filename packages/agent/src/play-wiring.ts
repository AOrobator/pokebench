import type {AgentMessage,AgentTool} from "@mariozechner/pi-agent-core";
import {dialogueLog} from "./dialogue-log.js";
import {withoutTextOnlyReplies} from "./harness.js";
import type {FeatureSet} from "./features.js";
import {instructionLedger} from "./instruction-ledger.js";
import {nextMilestoneHint} from "./milestone-hint.js";
import type {LoopKind} from "./loop-detection.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {navigationMemory} from "./navigation-memory.js";
import type {RunRecorder} from "./recorder.js";

type Transform=(messages:AgentMessage[])=>Promise<AgentMessage[]>;
type WiringRecorder=Pick<RunRecorder,"subscribe"|"recordNavigationContext"|"recordLedgerContext"|"recordMilestoneHint">;

// The switch-dependent memory tools and the context chain a play run delivers to the model.
export function contextTools(features:FeatureSet,recorder:WiringRecorder,base:Transform):{tools:AgentTool[];transformContext:Transform}{
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
 return {tools,transformContext:features["fresh-retry-v1"]?messages=>chain(withoutTextOnlyReplies(messages)):chain};
}

// The loop guard's supervisor briefing, when that switch is on.
export function loopSupervisor(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe">):((kind:LoopKind,calls:number)=>string)|undefined {
 if(!features["loop-guard-supervisor-v1"])return undefined;
 const briefing=new SupervisorBriefing(features);recorder.subscribe(event=>{briefing.observe(event);});
 return (kind,calls)=>briefing.text(kind,calls);
}
