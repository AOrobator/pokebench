import {withSceneJournal} from "./scene-journal.js";
import {withInterfaceGuidance} from "./interface-guidance.js";
import {TaskGoalCompletion} from "./task-goal-completion.js";
import {instructionGoalTools,withInstructionGoalReview,type GoalTools} from "./instruction-goal-tools.js";
import {withMenuOptionTool} from "./menu-option-tool.js";
import {moveLearnGoalReminder} from "./move-learn-goal-reminder.js";
import {sceneFollowupContext} from "./scene-followup.js";
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
import {ShownStoryNames,withShownCast} from "./story-foreknowledge.js";
import type {FeatureSet} from "./features.js";
import {ContextBudget,budgetLimit,type BudgetTrim} from "./context-budget.js";
import {ExactContext,type PayloadCounter} from "./exact-context.js";
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
import {withTrainingBlock,trainingContext,type TrainingBlock} from "./training-block.js";
import {withCatchingBlocks} from "./catching-block.js";
import {withTypeGapTeam} from "./type-gap-team.js";
import {withSupplies} from "./supplies.js";
import {withUntalkedInGym} from "./untalked-in-gym.js";
import {withPeopleIdCards,type IdCardRecorder} from "./people-id-cards.js";
import {withStoryDestinations} from "./story-destinations.js";
import {withInstructionLedgerV2} from "./instruction-ledger-v2.js";
import {withBattleAction} from "./battle-action.js";
import {withLearnMove} from "./learn-move.js";
import {withHarnessTrust,type TrustOptions,type TrustRecorder} from "./harness-trust.js";
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
export function contextTools(features:FeatureSet,recorder:WiringRecorder,base:Transform,cutOffNotice?:string):{tools:AgentTool[];transformContext:Transform;window:Window;breaker:FixedPointBreaker|null;training?:TrainingBlock;instructionGoals?:GoalTools}{
 const tools:AgentTool[]=[];
 const memoryRecorder:WiringRecorder={subscribe:(observer,milestones,latest)=>{recorder.subscribe(observer,milestones,latest,true);},recordNavigationContext:body=>{recorder.recordNavigationContext(body);},recordLedgerContext:body=>{recorder.recordLedgerContext(body);},recordMilestoneHint:body=>{recorder.recordMilestoneHint(body);},recordBeliefLedger:body=>{recorder.recordBeliefLedger(body);},recordLoopBreaker:body=>{recorder.recordLoopBreaker(body);}};

 const observedBase=features["instruction-goal-ledger-v1"]?base:observedInstructions(features,memoryRecorder,base);
 const memory=navigationMemory(features,memoryRecorder,observedBase);
 if(memory!==null)tools.push(memory.tool);
 const dialogue=dialogueLog(features,memoryRecorder);
 if(dialogue!==null)tools.push(dialogue);
 const ledger=instructionLedger(features,memoryRecorder,memory?.transformContext??observedBase);
 if(ledger!==null)tools.push(ledger.tool);
 const hint=nextMilestoneHint(features,memoryRecorder,ledger?.transformContext??memory?.transformContext??observedBase);
 if(hint!==null)tools.push(hint.tool);
 const hinted=hint?.transformContext??ledger?.transformContext??memory?.transformContext??observedBase;
 const chain=disprovedBeliefs(features,memoryRecorder,hinted)?.transformContext??hinted;
 const inner:Transform=features["fresh-retry-v1"]?messages=>chain(withoutTextOnlyReplies(messages)):chain;
 // fixed-point-breaker-v1 or duplicate-turn-collapse-v1: duplicate turns collapse before every other step;
 // fixed-point-breaker-v1 alone ends the request with its note.
 const breaker=fixedPointBreaker(features,memoryRecorder,cutOffNotice);
 const note=features["fixed-point-breaker-v1"];
 const history=trainingContext(features,memoryRecorder,moveLearnGoalReminder(features,memoryRecorder,breaker===null?inner:async messages=>{const out=await inner(breaker.collapse(messages));return note?breaker.note(out):out;}),tools);
 const instructionGoals=instructionGoalTools(features,memoryRecorder,history.transform,new TaskGoalCompletion());
 if(instructionGoals!==null)tools.push(...instructionGoals.tools);
 // scene-followup-prompt-v1 wraps last, so its note is the final message of the request.
 const transformContext=sceneFollowupContext(features,memoryRecorder,instructionGoals?.transform??history.transform);
 return {...(instructionGoals===null?{}:{instructionGoals}),tools,transformContext,window:contextWindow(features),breaker,...(history.training===undefined?{}:{training:history.training})};
}

// context-token-budget-v1: fit each request to the served context; each trim is recorded as a compaction.
// context-exact-count-v1: on a server that can count the request, that count replaces the estimate.
export function contextBudget(features:FeatureSet,model:{readonly contextWindow:number},maxTokens:number,recorder:Pick<RunRecorder,"compaction">&Partial<Pick<RunRecorder,"promptCount">>,counter:PayloadCounter|null=null):{budget?:ContextBudget;onBudgetTrim?:(trim:BudgetTrim)=>void;exact?:ExactContext}{
 const exact=features["context-exact-count-v1"];
 if(exact&&counter!==null)return {exact:new ExactContext(counter,model.contextWindow,maxTokens,{compaction:(from,to)=>{recorder.compaction(from,to);},promptCount:count=>{recorder.promptCount?.(count);}})};
 if(!features["context-token-budget-v1"])return {};
 return {budget:new ContextBudget(budgetLimit(model.contextWindow,maxTokens),exact),onBudgetTrim:trim=>{recorder.compaction(trim.from,trim.predicted);}};
}

// The loop guard's supervisor briefing, when that switch is on.
export function loopSupervisor(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe">):((kind:LoopKind,calls:number)=>string)|undefined {
 if(!features["loop-guard-supervisor-v1"])return undefined;
 const briefing=new SupervisorBriefing(features);recorder.subscribe(event=>{briefing.observe(event);},true,false,true);
 return (kind,calls)=>briefing.text(kind,calls);
}

// stall-briefing-v1: supervisor notes for map ping-pong and milestone droughts, timed on unpaused play.
// same-plan-breaker-v1: a supervisor note when the stated plan repeats while the game does not move on.
export function stallBriefing(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe"|"recordStallGate"|"recordLoopGuard">,detector:Pick<LoopDetector,"stall">&Partial<Pick<LoopDetector,"mapCycleWindow">>,control:Pick<RunControl,"pausedMs">,elapsed:()=>number):StallBriefing|null {
 if(features["same-plan-breaker-v1"]){const plans=new SamePlanBreaker(features,detector);recorder.subscribe(event=>{plans.observe(event);},false,false,true);}
 if(!features["stall-briefing-v1"])return null;
 const briefing=new SupervisorBriefing(features);recorder.subscribe(event=>{briefing.observe(event);},true,false,true);
 // story-character-stall-gate-v1: the gate reads each event before the stall check that the same event runs.
 const gate=features["story-character-stall-gate-v1"]?new StoryCharacterGate(recorder):null;
 if(gate!==null)recorder.subscribe(event=>{gate.observe(event);},false,false,true);
 // positive-supervisor-v1: retired stall briefings stay in the record as diagnostics; the model is not sent them.
 const retired=features["positive-supervisor-v1"]||features["milestone-drought-suppression-v1"]?(kind:"map_cycle"|"milestone_drought",text:string,evidence:readonly number[]):void=>{recorder.recordLoopGuard({kind,message:`Not sent (${features["positive-supervisor-v1"]?"positive-supervisor-v1":"milestone-drought-suppression-v1"}): ${text}`,calls:0,evidence:loopEvidence(evidence),mode:"diagnostic",phase:"would_warn"});}:null;
 const stall=new StallBriefing(features,()=>elapsed()-control.pausedMs(),detector,(kind,calls)=>briefing.stallText(kind,calls),gate,retired,(message,evidence)=>{recorder.recordLoopGuard({kind:"map_cycle",message,calls:0,evidence:loopEvidence(evidence),mode:"diagnostic",phase:"would_warn"});},
  // drought-battle-heal-hold-v1: a held drought briefing stays in the record as a diagnostic (Activity History).
  features["drought-battle-heal-hold-v1"]||features["drought-progress-facts-v1"]?(message,evidence)=>{recorder.recordLoopGuard({kind:"milestone_drought",message,calls:0,evidence:loopEvidence(evidence),mode:"diagnostic",phase:"would_warn"});}:null);
 recorder.subscribe(event=>{stall.observe(event);},false,false,true);
 return stall;
}

// text-only-supervisor-v1: the recorded note the governor sends instead of ending the run.
export function textOnlySupervisor(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe"|"textOnlySupervisor">,replyFailuresEndRun=true):((replies:number,note:number,cutOffNotice?:string)=>string)|undefined {
 if(!features["text-only-supervisor-v1"])return undefined;
 const briefing=new SupervisorBriefing(features);recorder.subscribe(event=>{briefing.observe(event);},true,false,true);
 return (replies,note,cutOffNotice)=>{const briefingText=briefing.textOnly(replies,note,TEXT_ONLY_NOTE_LIMIT,replyFailuresEndRun);const text=cutOffNotice===undefined?briefingText:`${cutOffNotice}\n${briefingText}`;recorder.textOnlySupervisor(replies,note,TEXT_ONLY_NOTE_LIMIT,text);return text;};
}

// milestone-stall-stop-v1: a factual nonterminal note after ten unpaused minutes.
export function stallStop(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe"|"recordLoopGuard">,control:RunControl,elapsed:()=>number,detector:Pick<LoopDetector,"stall">):StallStop|null{
 if(!features["milestone-stall-stop-v1"])return null;
 let latest:number|null=null,calls=0;
 const stop=new StallStop(control,STALL_STOP_MS,elapsed,()=>{
  if(latest===null)return;
  const message="SUPERVISOR: No newly observed milestone that resets this clock was recorded during the last 10 minutes of unpaused play. This does not establish that the game stopped changing. The run continues; no input or destination is selected for you.";
  if(!detector.stall("milestone_drought",()=>message,[latest]))recorder.recordLoopGuard({kind:"milestone_drought",message:`Not sent (another briefing is active or the guard is diagnostic): ${message}`,calls,evidence:[latest],mode:"diagnostic",phase:"would_warn"});
 });
 recorder.subscribe(event=>{latest=event.seq;if(event.type==="tool_result")calls++;stop.observe(event);},false,true);
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
// no-story-foreknowledge-v1 wraps everything, so every Story characters line any wrapper adds lists only the absent names
// the game has shown, and the recorded result is the text the model saw; the low-HP warnings and the heal-first line
// share its record of shown names.
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
// The harness-trust-v1 options the switches select; decision probes re-derive the header with the same options.
export function trustOptions(features:FeatureSet):TrustOptions {
 return {supervisor:!features["instruction-goal-ledger-v1"],semanticTargets:features["semantic-navigation-v2"],battleAction:features["harness-trust-v2"],goalOnce:features["input-cuts-v1"],retireLab:features["stale-story-goal-v1"],stageBound:features["stale-story-goal-v2"],nativeTasks:features["native-task-goal-retirement-v1"],omitEmptyGoal:features["stale-story-goal-v2"],scriptedGuidance:features["scripted-place-guidance-v1"],reachableGoal:features["reachable-story-guidance-v1"],exitSections:features["exit-labels-v3"],activity:features["unfinished-activity-v1"],playerName:features["story-goal-player-name-v1"],gymEvidence:features["gym-evidence-v1"],deliveredPlaces:features["delivered-place-evidence-v1"],untalkedPeople:features["untalked-people-header-v1"],buildings:features["away-note-buildings-v1"]};
}
export function playGameTools(base:readonly AgentTool[],features:FeatureSet,state:StateSource,recorder:AutoAdvanceRecorder&WarningRecorder&IdCardRecorder&TrustRecorder&Pick<CitationRecorder,"destinationCitation">&Pick<ActivityRecorder,"unfinishedActivity">&SightRecorder&GateRecorder&HealFirstRecorder,gate?:NavigationPorts["gate"],extra:readonly AgentTool[]=[],training?:TrainingBlock,instructionGoals?:GoalTools):AgentTool[]{
 const terrain=features["visited-terrain-navigation-v1"]&&!features["full-map-navigation-v1"]?new VisitedTerrain(features["map-observability-v1"]):null;
 const navigationState=terrain?.source(state)??state;
 const sight=features["trainer-sight-check-v1"]?trainerSight(state,recorder):undefined;
 const arm=features["story-battle-heal-gate-v1"]&&!features["factual-healing-guidance-v1"]?healArm(features,state):undefined;
 const healGate=arm===undefined?undefined:storyBattleHealGate(arm,state,recorder,features["progress-aware-cycles-v1"]);
 const navigated=withSemanticNavigation(withNavigation(base,features,navigationState,gate,sight,healGate),features,navigationState);
 const names=features["no-story-foreknowledge-v1"]?new ShownStoryNames():null;
 if(names!==null)recorder.subscribe(event=>{names.observe(event);});
 const facts=[...withResultFacts(withUnfinishedActivity(withLowHpTrainerWarning(withStoryBattleHealGate(withCatchingBlocks(withTrainingBlock(withGameSaidGoals(withEffectivenessHeard(withNavigateFirst([...withInstructionLedgerV2(withStoryDestinations(withPeopleIdCards(withUntakenExits(withGymReadiness(withPeopleLedger(withMenuOptionTool(withDialogueAutoAdvance(withLearnMove(withBattleAction(withNoExitHere(navigated,features),features,state,gate),features,state,gate),features,{state,recorder,...(gate===undefined?{}:{gate})}),features["menu-option-tool-v1"],gate,base.find(tool=>tool.name==="observe"),features["menu-option-honest-refusal-v1"]),features,recorder),features,recorder),features,recorder),features,recorder),features,recorder,state),features,recorder),...extra],features),features,recorder),features,recorder),features,recorder,training),features,recorder),healGate,state),features,recorder,state,arm,names),features,recorder,state),features,recorder)];
 const progress=withGymProgress(withUntalkedInGym(withSupplies(withTypeGapTeam(facts,features,recorder),features,state),features,recorder),features,recorder);
 const visible=terrain===null?progress:withVisitedTerrain(progress,terrain);
 const cited=withCitedDestination(visible,features["cited-destination-v1"],recorder,{fullMap:features["full-map-navigation-v1"],exitReach:features["exit-reachability-v1"],silenceMiss:features["input-cuts-v1"],factualMiss:features["gym-evidence-v1"],structuredEvidence:features["citation-evidence-v1"]});
 return withShownCast(withSceneJournal(withInstructionGoalReview(withInterfaceGuidance(withMenuItemGuidance(withStalePlanFact(withHealFirst(withStarterDecision(withHarnessTrust(cited,features["harness-trust-v1"],recorder,state,trustOptions(features)),features),features["story-battle-heal-first-v1"]&&!features["coherent-healing-feedback-v1"],recorder,state,features["factual-healing-guidance-v1"],names),features,recorder),features["menu-item-guidance-v1"]),features["interface-guidance-v1"],recorder),instructionGoals??null),features["cutscene-journal-v1"],state),names);
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
  if(!battleEngaged(current,features["owned-battle-context-v1"]))return base(retained===null?messages:[...messages,retained]);
  const result=await observe.execute(`battle-ready-${String(++sequence)}`,{},signal);
  const image=result.content.find(c=>c.type==="image");
  const details:unknown=result.details;
  if(image===undefined||typeof details!=="object"||details===null||!("state" in details))throw new Error("Battle readiness observation lacks a coherent snapshot");
  const text=result.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n");
  const snapshot={state:parseGameState(details.state),content:[image,{type:"text" as const,text},...(features["cutscene-journal-v1"]?result.content.filter(c=>c.type==="image").slice(1):[])]} as const;
  recorder.recordDecisionSnapshot(snapshot);
  observedAt=anchor;
  retained={role:"user",content:[{type:"text",text:"Harness battle update before your next decision:"},...(features["cutscene-journal-v1"]?result.content:snapshot.content)],timestamp:Date.now()};
  return base([...messages,retained]);
 };
}
