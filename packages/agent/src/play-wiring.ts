import {withMenuItemGuidance} from "./menu-item-guidance.js";
import type {AgentMessage,AgentTool} from "@mariozechner/pi-agent-core";
import {battleEngaged} from "./battle-text-auto-advance.js";
import {withDialogueAutoAdvance,type AutoAdvanceRecorder} from "./dialogue-auto-advance.js";
import {dialogueLog} from "./dialogue-log.js";
import {parseGameState,type StateSource} from "./game-state.js";
import {withNavigation,type NavigationPorts} from "./navigation.js";
import {withNavigateFirst} from "./navigate-first.js";
import {healArm,withLowHpTrainerWarning,type HealArm,type WarningRecorder} from "./low-hp-trainer-warning.js";
import {StoryBattleHealGate,withStoryBattleHealGate,type GateDecision} from "./story-battle-heal-gate.js";
import {withHealFirst,type HealFirstRecorder} from "./heal-first.js";
import type {FeatureSet} from "./features.js";
import {ContextBudget,budgetLimit,type BudgetTrim} from "./context-budget.js";
import {instructionLedger} from "./instruction-ledger.js";
import {disprovedBeliefs} from "./disproved-beliefs.js";
import {SamePlanBreaker} from "./same-plan.js";
import {nextMilestoneHint} from "./milestone-hint.js";
import type {LoopDetector,LoopKind} from "./loop-detection.js";
import {loopEvidence} from "./loop/types.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {StallBriefing} from "./stall-briefing.js";
import {StoryCharacterGate} from "./stall-gate.js";
import {fixedPointBreaker,type FixedPointBreaker} from "./fixed-point-breaker.js";
import {navigationMemory} from "./navigation-memory.js";
import {withPeopleLedger} from "./people-ledger.js";
import {withEffectivenessHeard} from "./effectiveness-heard.js";
import {withGameSaidGoals} from "./game-said-goals.js";
import {withGymReadiness,withGymProgress} from "./gym-readiness.js";
import {withTrainingBlock} from "./training-block.js";
import {withCatchingBlocks} from "./catching-block.js";
import {withPeopleIdCards,type IdCardRecorder} from "./people-id-cards.js";
import {withStoryDestinations} from "./story-destinations.js";
import {withInstructionLedgerV2} from "./instruction-ledger-v2.js";
import {withBattleAction} from "./battle-action.js";
import {withLearnMove} from "./learn-move.js";
import {withHarnessTrust,type TrustRecorder} from "./harness-trust.js";
import {withCitedDestination,type CitationRecorder} from "./cited-destination.js";
import {withUntakenExits} from "./untaken-exits.js";
import {withSemanticNavigation} from "./semantic-navigation.js";
import {withStalePlanFact} from "./stale-plan-fact.js";
import {withNoExitHere} from "./no-exit-here.js";
import {withResultFacts} from "./result-facts.js";
import type {RunRecorder} from "./recorder.js";
import {STALL_STOP_MS,StallStop,type RunControl} from "./run-control.js";
import {TEXT_ONLY_NOTE_LIMIT,contextWindow,withoutTextOnlyReplies,type Window} from "./harness.js";
import {withStarterDecision} from "./starter-decision.js";
import {VisitedTerrain,withVisitedTerrain} from "./visited-terrain.js";

import {observedInstructions} from "./observed-instructions.js";
import {withUnfinishedActivity,type ActivityRecorder} from "./unfinished-activity.js";
import type {TrainerSightCheck,TrainerSightPorts} from "./trainer-sight.js";

type Transform=(messages:AgentMessage[])=>Promise<AgentMessage[]>;
type WiringRecorder=Pick<RunRecorder,"subscribe"|"recordNavigationContext"|"recordLedgerContext"|"recordMilestoneHint"|"recordBeliefLedger"|"recordLoopBreaker">;

// The switch-dependent memory tools and the context chain a play run delivers to the model.
export function contextTools(features:FeatureSet,recorder:WiringRecorder,base:Transform):{tools:AgentTool[];transformContext:Transform;window:Window;breaker:FixedPointBreaker|null}{
 const tools:AgentTool[]=[];
 const observedBase=observedInstructions(features,recorder,base);
 const memory=navigationMemory(features,recorder,observedBase);
 if(memory!==null)tools.push(memory.tool);
 const dialogue=dialogueLog(features,recorder);
 if(dialogue!==null)tools.push(dialogue);
 const ledger=instructionLedger(features,recorder,memory?.transformContext??observedBase);
 if(ledger!==null)tools.push(ledger.tool);
 const hint=nextMilestoneHint(features,recorder,ledger?.transformContext??memory?.transformContext??observedBase);
 if(hint!==null)tools.push(hint.tool);
 const hinted=hint?.transformContext??ledger?.transformContext??memory?.transformContext??observedBase;
 const chain=disprovedBeliefs(features,recorder,hinted)?.transformContext??hinted;
 const inner:Transform=features["fresh-retry-v1"]?messages=>chain(withoutTextOnlyReplies(messages)):chain;
 // fixed-point-breaker-v1 or duplicate-turn-collapse-v1: duplicate turns collapse before every other step;
 // fixed-point-breaker-v1 alone ends the request with its note.
 const breaker=fixedPointBreaker(features,recorder);
 const note=features["fixed-point-breaker-v1"];
 return {tools,transformContext:breaker===null?inner:async messages=>{const out=await inner(breaker.collapse(messages));return note?breaker.note(out):out;},window:contextWindow(features),breaker};
}

// context-token-budget-v1: fit each request to the served context; each trim is recorded as a compaction.
export function contextBudget(features:FeatureSet,model:{readonly contextWindow:number},maxTokens:number,recorder:Pick<RunRecorder,"compaction">):{budget?:ContextBudget;onBudgetTrim?:(trim:BudgetTrim)=>void}{
 if(!features["context-token-budget-v1"])return {};
 return {budget:new ContextBudget(budgetLimit(model.contextWindow,maxTokens)),onBudgetTrim:trim=>{recorder.compaction(trim.from,trim.predicted);}};
}

// The loop guard's supervisor briefing, when that switch is on.
export function loopSupervisor(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe">):((kind:LoopKind,calls:number)=>string)|undefined {
 if(!features["loop-guard-supervisor-v1"])return undefined;
 const briefing=new SupervisorBriefing(features);recorder.subscribe(event=>{briefing.observe(event);},true);
 return (kind,calls)=>briefing.text(kind,calls);
}

// stall-briefing-v1: supervisor notes for map ping-pong and milestone droughts, timed on unpaused play.
// same-plan-breaker-v1: a supervisor note when the stated plan repeats while the game does not move on.
export function stallBriefing(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe"|"recordStallGate"|"recordLoopGuard">,detector:Pick<LoopDetector,"stall">,control:Pick<RunControl,"pausedMs">,elapsed:()=>number):StallBriefing|null {
 if(features["same-plan-breaker-v1"]){const plans=new SamePlanBreaker(features,detector);recorder.subscribe(event=>{plans.observe(event);});}
 if(!features["stall-briefing-v1"])return null;
 const briefing=new SupervisorBriefing(features);recorder.subscribe(event=>{briefing.observe(event);},true);
 // story-character-stall-gate-v1: the gate reads each event before the stall check that the same event runs.
 const gate=features["story-character-stall-gate-v1"]?new StoryCharacterGate(recorder):null;
 if(gate!==null)recorder.subscribe(event=>{gate.observe(event);});
 // positive-supervisor-v1: retired stall briefings stay in the record as diagnostics; the model is not sent them.
 const retired=features["positive-supervisor-v1"]||features["milestone-drought-suppression-v1"]?(kind:"map_cycle"|"milestone_drought",text:string,evidence:readonly number[]):void=>{recorder.recordLoopGuard({kind,message:`Not sent (${features["positive-supervisor-v1"]?"positive-supervisor-v1":"milestone-drought-suppression-v1"}): ${text}`,calls:0,evidence:loopEvidence(evidence),mode:"diagnostic",phase:"would_warn"});}:null;
 const stall=new StallBriefing(features,()=>elapsed()-control.pausedMs(),detector,(kind,calls)=>briefing.stallText(kind,calls),gate,retired,(message,evidence)=>{recorder.recordLoopGuard({kind:"map_cycle",message,calls:0,evidence:loopEvidence(evidence),mode:"diagnostic",phase:"would_warn"});},
  // drought-battle-heal-hold-v1: a held drought briefing stays in the record as a diagnostic (Activity History).
  features["drought-battle-heal-hold-v1"]?(message,evidence)=>{recorder.recordLoopGuard({kind:"milestone_drought",message,calls:0,evidence:loopEvidence(evidence),mode:"diagnostic",phase:"would_warn"});}:null);
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
// move-learn-tool-v1: learn_move is built the same way, beside battle_action; dialogue auto-advance does not replace it.
// extra: the run's other model tools (context tools), wrapped too so any call between presses is seen.
// low-hp-trainer-warning-v1 wraps everything else, so its paragraph follows any other text the result gained; only
// withResultFacts (blocked-exit-fact-v1, battle-loss-recap-v1) is outside it, adding its lines after that paragraph.
// effectiveness-heard-v1 and game-said-goals-v1 wrap the ledger and extra tools (choose_evolution included), so their
// blocks are text parts before the low-HP paragraph, the unfinished-activity block and the result facts.
// heal-before-trainers-v1 reads the game's map table from the same state source (GET /pokebench/places).
// no-exit-here-v1 wraps press and navigate_to right outside navigation, so navigate_to's own presses get no line and
// its line sits right under the Press result or Navigation line, before any other wrapper adds text.
// cited-destination-v1 wraps all of that, so its line sits right under harness-trust-v1's header, which is outermost and
// therefore the first thing in every result.
// story-battle-heal-first-v1 wraps everything, harness-trust-v1's header included, so its line is the first line of every
// result it fires on (right under that header when the header is there), a story-battle-heal-gate-v1 refusal among them.
// stale-plan-fact-v1 wraps everything, so its line is the last thing a result says.
// trainer-sight-check-v1 asks the game server through the same state source (POST /pokebench/trainer-sight) and records
// each check as a trainer_sight_check event.
export interface SightRecorder {trainerSightCheck?(check:TrainerSightCheck):void}
function trainerSight(state:StateSource,recorder:SightRecorder):TrainerSightPorts {
 return {
  check:(mapId,tiles,signal)=>state.trainerSight===undefined?Promise.reject(new Error("trainer-sight-check-v1 needs a game server that serves /pokebench/trainer-sight")):state.trainerSight(mapId,tiles,signal),
  record:check=>{if(recorder.trainerSightCheck===undefined)throw new Error("trainer-sight-check-v1 needs a recorder for trainer_sight_check events");recorder.trainerSightCheck(check);},
 };
}
// story-battle-heal-gate-v1 shares heal-before-trainers' arm (its map table and heal-place list) with the warnings, asks
// the same trainer sight endpoint, and records each decision as a story_battle_heal_gate event. Its press and
// navigate_to_target check sits right inside the warnings, so a refusal's observation gets their paragraphs like any
// other result; its navigate_to check is navigate_to's own, beside trainer-sight-check-v1's.
export interface GateRecorder {storyBattleHealGate?(decision:GateDecision):void}
function storyBattleHealGate(arm:HealArm,state:StateSource,recorder:GateRecorder,progressAware:boolean):StoryBattleHealGate {
 const record=recorder.storyBattleHealGate?.bind(recorder);
 if(record===undefined)throw new Error("story-battle-heal-gate-v1 needs a recorder for story_battle_heal_gate events");
 const heal=arm.heal;
 if(heal===null)throw new Error("story-battle-heal-gate-v1 needs heal-before-trainers-v1's arm");
 return new StoryBattleHealGate({places:arm.table,heal:s=>heal.known(s),check:(mapId,tiles,signal)=>state.trainerSight===undefined?Promise.reject(new Error("story-battle-heal-gate-v1 needs a game server that serves /pokebench/trainer-sight")):state.trainerSight(mapId,tiles,signal),record},progressAware);
}
export function playGameTools(base:readonly AgentTool[],features:FeatureSet,state:StateSource,recorder:AutoAdvanceRecorder&WarningRecorder&IdCardRecorder&TrustRecorder&Pick<CitationRecorder,"destinationCitation">&Pick<ActivityRecorder,"unfinishedActivity">&SightRecorder&GateRecorder&HealFirstRecorder,gate?:NavigationPorts["gate"],extra:readonly AgentTool[]=[]):AgentTool[]{
 const terrain=features["visited-terrain-navigation-v1"]&&!features["full-map-navigation-v1"]?new VisitedTerrain():null;
 const navigationState=terrain?.source(state)??state;
 const sight=features["trainer-sight-check-v1"]?trainerSight(state,recorder):undefined;
 const arm=features["story-battle-heal-gate-v1"]&&!features["factual-healing-guidance-v1"]?healArm(features,state):undefined;
 const healGate=arm===undefined?undefined:storyBattleHealGate(arm,state,recorder,features["progress-aware-cycles-v1"]);
 const navigated=withSemanticNavigation(withNavigation(base,features,navigationState,gate,sight,healGate),features,navigationState);
 const facts=[...withResultFacts(withUnfinishedActivity(withLowHpTrainerWarning(withStoryBattleHealGate(withCatchingBlocks(withTrainingBlock(withGameSaidGoals(withEffectivenessHeard(withNavigateFirst([...withInstructionLedgerV2(withStoryDestinations(withPeopleIdCards(withUntakenExits(withGymReadiness(withPeopleLedger(withDialogueAutoAdvance(withLearnMove(withBattleAction(withNoExitHere(navigated,features),features,state,gate),features,state,gate),features,{state,recorder,...(gate===undefined?{}:{gate})}),features,recorder),features,recorder),features,recorder),features,recorder),features,recorder,state),features,recorder),...extra],features),features,recorder),features,recorder),features,recorder),features,recorder),healGate,state),features,recorder,state,arm),features,recorder,state),features,recorder)];
 const progress=withGymProgress(facts,features,recorder);
 const visible=terrain===null?progress:withVisitedTerrain(progress,terrain);
 const cited=withCitedDestination(visible,features["cited-destination-v1"],recorder,{fullMap:features["full-map-navigation-v1"],exitReach:features["exit-reachability-v1"],silenceMiss:features["input-cuts-v1"],factualMiss:features["gym-evidence-v1"]});
 return withMenuItemGuidance(withStalePlanFact(withHealFirst(withStarterDecision(withHarnessTrust(cited,features["harness-trust-v1"],recorder,state,{supervisor:true,semanticTargets:features["semantic-navigation-v2"],battleAction:features["harness-trust-v2"],goalOnce:features["input-cuts-v1"],retireLab:features["stale-story-goal-v1"],stageBound:features["stale-story-goal-v2"],omitEmptyGoal:features["stale-story-goal-v2"],scriptedGuidance:features["scripted-place-guidance-v1"],reachableGoal:features["reachable-story-guidance-v1"],exitSections:features["exit-labels-v3"],activity:features["unfinished-activity-v1"],playerName:features["story-goal-player-name-v1"],gymEvidence:features["gym-evidence-v1"],deliveredPlaces:features["delivered-place-evidence-v1"]}),features),features["story-battle-heal-first-v1"]&&!features["coherent-healing-feedback-v1"],recorder,state,features["factual-healing-guidance-v1"]),features,recorder),features["menu-item-guidance-v1"]);
}


export function battleDecisionContext(features:FeatureSet,state:StateSource,tools:readonly AgentTool[],base:Transform,recorder:Pick<RunRecorder,"recordDecisionSnapshot">,signal?:AbortSignal):Transform {
 if(!features["battle-decision-ready-v1"])return base;
 const observe=tools.find(t=>t.name==="observe");
 if(observe===undefined)throw new Error("Battle decision readiness requires observe");
 let sequence=0;
 let retained:AgentMessage|null=null,observedAt:string|null=null;
 const gameTools=new Set(["observe","press","navigate_to","navigate_to_target","explore_map","battle_action","act",...(features["evolution-decision-v1"]?["choose_evolution"]:[]),...(features["move-learn-tool-v1"]?["learn_move"]:[])]);
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
