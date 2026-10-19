import type {AgentMessage,AgentTool} from "@mariozechner/pi-agent-core";
import {battleEngaged} from "./battle-text-auto-advance.js";
import {withDialogueAutoAdvance,type AutoAdvanceRecorder} from "./dialogue-auto-advance.js";
import {dialogueLog} from "./dialogue-log.js";
import {parseGameState,type StateSource} from "./game-state.js";
import {withNavigation,type NavigationPorts} from "./navigation.js";
import {withNavigateFirst} from "./navigate-first.js";
import {withLowHpTrainerWarning,type WarningRecorder} from "./low-hp-trainer-warning.js";
import type {FeatureSet} from "./features.js";
import {instructionLedger} from "./instruction-ledger.js";
import {disprovedBeliefs} from "./disproved-beliefs.js";
import {SamePlanBreaker} from "./same-plan.js";
import {nextMilestoneHint} from "./milestone-hint.js";
import type {LoopDetector,LoopKind} from "./loop-detection.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {StallBriefing} from "./stall-briefing.js";
import {navigationMemory} from "./navigation-memory.js";
import {withPeopleLedger} from "./people-ledger.js";
import {withPeopleIdCards,type IdCardRecorder} from "./people-id-cards.js";
import {withStoryDestinations} from "./story-destinations.js";
import {withInstructionLedgerV2} from "./instruction-ledger-v2.js";
import {withBattleAction} from "./battle-action.js";
import {withHarnessTrust,type TrustRecorder} from "./harness-trust.js";
import {withCitedDestination,type CitationRecorder} from "./cited-destination.js";
import {withUntakenExits} from "./untaken-exits.js";
import {withNoExitHere} from "./no-exit-here.js";
import {withResultFacts} from "./result-facts.js";
import type {RunRecorder} from "./recorder.js";
import {STALL_STOP_MS,StallStop,type RunControl} from "./run-control.js";
import {TEXT_ONLY_NOTE_LIMIT,contextWindow,withoutTextOnlyReplies,type Window} from "./harness.js";
import {VisitedTerrain,withVisitedTerrain} from "./visited-terrain.js";

type Transform=(messages:AgentMessage[])=>Promise<AgentMessage[]>;
type WiringRecorder=Pick<RunRecorder,"subscribe"|"recordNavigationContext"|"recordLedgerContext"|"recordMilestoneHint"|"recordBeliefLedger">;

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
 const hinted=hint?.transformContext??ledger?.transformContext??memory?.transformContext??base;
 const chain=disprovedBeliefs(features,recorder,hinted)?.transformContext??hinted;
 return {tools,transformContext:features["fresh-retry-v1"]?messages=>chain(withoutTextOnlyReplies(messages)):chain,window:contextWindow(features)};
}

// The loop guard's supervisor briefing, when that switch is on.
export function loopSupervisor(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe">):((kind:LoopKind,calls:number)=>string)|undefined {
 if(!features["loop-guard-supervisor-v1"])return undefined;
 const briefing=new SupervisorBriefing(features);recorder.subscribe(event=>{briefing.observe(event);},true);
 return (kind,calls)=>briefing.text(kind,calls);
}

// stall-briefing-v1: supervisor notes for map ping-pong and milestone droughts, timed on unpaused play.
// same-plan-breaker-v1: a supervisor note when the stated plan repeats while the game does not move on.
export function stallBriefing(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe">,detector:Pick<LoopDetector,"stall">,control:Pick<RunControl,"pausedMs">,elapsed:()=>number):StallBriefing|null {
 if(features["same-plan-breaker-v1"]){const plans=new SamePlanBreaker(features,detector);recorder.subscribe(event=>{plans.observe(event);});}
 if(!features["stall-briefing-v1"])return null;
 const briefing=new SupervisorBriefing(features);recorder.subscribe(event=>{briefing.observe(event);},true);
 const stall=new StallBriefing(features,()=>elapsed()-control.pausedMs(),detector,(kind,calls)=>briefing.stallText(kind,calls));
 recorder.subscribe(event=>{stall.observe(event);});
 return stall;
}

// text-only-supervisor-v1: the recorded note the governor sends instead of ending the run.
export function textOnlySupervisor(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe"|"textOnlySupervisor">,replyFailuresEndRun=true):((replies:number,note:number)=>string)|undefined {
 if(!features["text-only-supervisor-v1"])return undefined;
 const briefing=new SupervisorBriefing(features);recorder.subscribe(event=>{briefing.observe(event);},true);
 return (replies,note)=>{const text=briefing.textOnly(replies,note,TEXT_ONLY_NOTE_LIMIT,replyFailuresEndRun);recorder.textOnlySupervisor(replies,note,TEXT_ONLY_NOTE_LIMIT,text);return text;};
}

// milestone-stall-stop-v1: ends the run as stalled after STALL_STOP_MS of unpaused play
// with no new observed milestone. elapsed is the same run clock the wall budget uses.
export function stallStop(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe">,control:RunControl,elapsed:()=>number,stalled:()=>void):StallStop|null{
 if(!features["milestone-stall-stop-v1"])return null;
 const stop=new StallStop(control,STALL_STOP_MS,elapsed,stalled);recorder.subscribe(event=>{stop.observe(event);});
 return stop;
}

// The game tools a play run hands the model: ordinary tools, navigate_to, dialogue auto-advance, the people ledger and untaken exits per switch.
// The ledger is inside untaken exits, so a readout with both reads Position, the Untaken exits line, then the people block.
// people-id-cards-v1 wraps both, so its cards follow the finished people block.
// story-destinations-v1 adds its block under the Story line, which none of those touches.
// instruction-ledger-v2 wraps it, so its conversation ledger sits right under the Story line, above that block.
// battle-move-tool-v1: battle_action is built beside navigate_to from the ordinary press and observe, inside dialogue auto-advance.
// extra: the run's other model tools (context tools), wrapped too so any call between presses is seen.
// low-hp-trainer-warning-v1 wraps everything else, so its paragraph follows any other text the result gained; only
// withResultFacts (blocked-exit-fact-v1, battle-loss-recap-v1) is outside it, adding its lines after that paragraph.
// heal-before-trainers-v1 reads the game's map table from the same state source (GET /pokebench/places).
// no-exit-here-v1 wraps press and navigate_to right outside navigation, so navigate_to's own presses get no line and
// its line sits right under the Press result or Navigation line, before any other wrapper adds text.
// cited-destination-v1 wraps all of that, so its line sits right under harness-trust-v1's header, which is outermost and
// therefore the first thing in every result.
export function playGameTools(base:readonly AgentTool[],features:FeatureSet,state:StateSource,recorder:AutoAdvanceRecorder&WarningRecorder&IdCardRecorder&TrustRecorder&Pick<CitationRecorder,"destinationCitation">,gate?:NavigationPorts["gate"],extra:readonly AgentTool[]=[]):AgentTool[]{
 const terrain=features["visited-terrain-navigation-v1"]&&!features["full-map-navigation-v1"]?new VisitedTerrain():null;
 const navigationState=terrain?.source(state)??state;
 const facts=[...withResultFacts(withLowHpTrainerWarning(withNavigateFirst([...withInstructionLedgerV2(withStoryDestinations(withPeopleIdCards(withUntakenExits(withPeopleLedger(withDialogueAutoAdvance(withBattleAction(withNoExitHere(withNavigation(base,features,navigationState,gate),features),features,state,gate),features,{state,recorder,...(gate===undefined?{}:{gate})}),features,recorder),features,recorder),features,recorder),features,recorder,state),features,recorder),...extra],features),features,recorder,state),features,recorder)];
 const visible=terrain===null?facts:withVisitedTerrain(facts,terrain);
 const cited=withCitedDestination(visible,features["cited-destination-v1"],recorder,{fullMap:features["full-map-navigation-v1"],exitReach:features["exit-reachability-v1"],silenceMiss:features["input-cuts-v1"]});
 return withHarnessTrust(cited,features["harness-trust-v1"],recorder,state,{supervisor:true,battleAction:features["harness-trust-v2"],goalOnce:features["input-cuts-v1"],retireLab:features["stale-story-goal-v1"],stageBound:features["stale-story-goal-v2"],omitEmptyGoal:features["stale-story-goal-v2"],scriptedGuidance:features["scripted-place-guidance-v1"],reachableGoal:features["reachable-story-guidance-v1"]});
}


export function battleDecisionContext(features:FeatureSet,state:StateSource,tools:readonly AgentTool[],base:Transform,recorder:Pick<RunRecorder,"recordDecisionSnapshot">,signal?:AbortSignal):Transform {
 if(!features["battle-decision-ready-v1"])return base;
 const observe=tools.find(t=>t.name==="observe");
 if(observe===undefined)throw new Error("Battle decision readiness requires observe");
 let sequence=0;
 let retained:AgentMessage|null=null,observedAt:string|null=null;
 const gameTools=new Set(["observe","press","navigate_to","battle_action","act"]);
 return async messages=>{
  const latest=messages.findLast(message=>message.role==="toolResult"&&gameTools.has(message.toolName)&&!message.isError&&message.content.some(part=>part.type==="image"));
  const anchor=latest?.role==="toolResult"?JSON.stringify([latest.toolName,latest.toolCallId,latest.timestamp]):null;
  if(anchor!==null&&anchor!==observedAt)retained=null;
  signal?.throwIfAborted();
  const current=await state.read(signal);
  if(!battleEngaged(current))return base(retained===null?messages:[...messages,retained]);
  const result=await observe.execute(`battle-ready-${String(++sequence)}`,{},signal);
  const image=result.content.find(c=>c.type==="image");
  const details:unknown=result.details;
  if(image===undefined||typeof details!=="object"||details===null||!("state" in details))throw new Error("Battle readiness observation lacks a coherent snapshot");
  const text=result.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n");
  const snapshot={state:parseGameState(details.state),content:[image,{type:"text" as const,text}]} as const;
  recorder.recordDecisionSnapshot(snapshot);
  observedAt=anchor;
  retained={role:"user",content:[{type:"text",text:"Harness battle update before your next decision:"},...snapshot.content],timestamp:Date.now()};
  return base([...messages,retained]);
 };
}
