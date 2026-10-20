import type {PromptReceipt} from "./jit-context.js";
import type { IdCard } from "./people-id-cards.js";
import type { HealBeforeTrainersFacts, LowHpTrainerWarningFacts, StoryBattleWarningFacts } from "./low-hp-trainer-warning.js";
import type { StoryGoalAwayFacts } from "./harness-trust.js";
import type { DestinationCitationFacts } from "./cited-destination.js";
import type { PressModifiers } from "./game-tools.js";
import {StateActivities} from "./activity.js";
import type {DecisionSnapshot} from "./state-decision.js";
import type { AgentEvent, AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, AssistantMessageEvent, ImageContent, TextContent } from "@mariozechner/pi-ai";
import type { TargetProof } from "./target-stop.js";
import type { LoopNotice } from "./loop-detection.js";
import type { BodyOf, Button, RunEndReason, RunEvent, EventBody } from "./events.js";
import type { FrameRef, FrameStore } from "./frames.js";
import { parseGameState, type GameStateSnapshot, type StateSource } from "./game-state.js";
import { deeperMilestone, type MilestoneSource, type SeenMilestone } from "./milestones.js";
import type { RunLog } from "./run-log.js";

export class RecorderError extends Error {
  override readonly name = "RecorderError";
}

export type RunStartMeta = Omit<BodyOf<"run_start">, "type" | "turn">;

export interface RecorderDeps {
  readonly log: RunLog;
  readonly frames: FrameStore;
  readonly milestones: MilestoneSource;
  readonly gameState: StateSource;
  readonly now?: () => number;
}

export interface PressTiming {
  readonly hold_frames: number;
  readonly release_frames: number;
}

const CHARS_PER_TOKEN = 4;
const STREAM_FLUSH_MS = 250;
// Any PNG serialized as base64 starts with this; tool text (e.g. the vendor
// /state body) can embed whole frames, which belong in frames/, not the log.
const INLINE_PNG = /iVBORw0KGgo[A-Za-z0-9+/]+={0,2}/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function contentParts(message: AgentMessage): readonly (TextContent | ImageContent | { type: string })[] {
  if (!("content" in message)) return [];
  const content: unknown = message.content;
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content) ? (content as (TextContent | ImageContent)[]) : [];
}

function textOf(part: { type: string }): string {
  if (part.type === "text" && "text" in part && typeof part.text === "string") return part.text;
  if (part.type === "thinking" && "thinking" in part && typeof part.thinking === "string") return part.thinking;
  return "";
}

function contextSize(messages: readonly AgentMessage[]): { messages: number; images: number; est_tokens: number } {
  let chars = 0;
  let images = 0;
  for (const message of messages) {
    for (const part of contentParts(message)) {
      if (part.type === "image") images += 1;
      chars += textOf(part).length;
    }
  }
  return { messages: messages.length, images, est_tokens: Math.ceil(chars / CHARS_PER_TOKEN) };
}

interface ToolResultPayload {
  readonly content: readonly (TextContent | ImageContent)[];
}

function toolResultPayload(result: unknown): ToolResultPayload {
  if (!isRecord(result) || !Array.isArray(result.content)) {
    throw new RecorderError("tool result has no content list");
  }
  return { content: result.content as (TextContent | ImageContent)[] };
}

export function requireRoute103Field(required:boolean,state:{readonly route103_rival?:unknown}):void {
  if(required&&state.route103_rival===undefined)throw new RecorderError("Declared route103-rival-splits-v1 but the game server returned no route103_rival state; check the Python reader deployment.");
}

export class RunRecorder {
  private readonly log: RunLog;
  private readonly frames: FrameStore;
  private readonly milestones: MilestoneSource;
  private readonly gameState: StateSource;
  private readonly now: () => number;
  private turn = 0;
  private startedAt = 0;
  elapsedMs():number {return this.now()-this.startedAt;}
  private requestAt = 0;
  private requestContext:PromptReceipt|null=null;
  recordRequestContext(context:PromptReceipt|null):void {this.requestContext=context;this.requestAt=this.now();this.firstTokenAt=null;}
  private firstTokenAt: number | null = null;
  private stream = { thinking: "", text: "", flushedAt: 0 };
  private readonly toolStarts = new Map<string, number>();
  private furthest: string | null = null;
  private storyRequired = false;
  private rawRamRequired = false;
  private activityEnabled=false;
  private route103Required=false;
  private nativeActionsEnabled=false;
  private nativeActionCursor=0;
  private nativeActionFrame=0;
  private nativeActionTime=0;
  private nativeActionFailure:Error|null=null;
  private battleEnabled=false;
  private battleCursor=0;
  private battleFrame=0;
  private battleFailure:Error|null=null;
  private readonly activities=new StateActivities();
  private humanSamplingFrame:number|undefined;
  private humanScreenshotMs:number|undefined;
  private humanScreenshotNextAt:number|null=null;
  private targetProof:TargetProof|null=null;
  setTargetProof(proof:TargetProof):void {this.targetProof={...proof,state_evidence:[...proof.state_evidence]};}
  private tokens = { input: 0, output: 0 };
  private saved = { saved: 0, bytes: 0 };

  constructor(deps: RecorderDeps) {
    this.log = deps.log;
    this.frames = deps.frames;
    this.milestones = deps.milestones;
    this.gameState = deps.gameState;
    this.now = deps.now ?? (() => performance.now());
  }

  private readonly observers: ((event: RunEvent) => void)[] = [];
  private readonly milestoneEvents: RunEvent[] = [];
  private latestStateEvent: Extract<RunEvent,{type:"state"}> | null = null;
  // Replay is opt-in: milestones at checkpoint start, or the latest recorded state for a late request observer.
  subscribe(observer: (event: RunEvent) => void, replayMilestones = false, replayLatestState = false): void { this.observers.push(observer); if (replayMilestones) for (const event of this.milestoneEvents) observer(event); if(replayLatestState&&this.latestStateEvent!==null)observer(this.latestStateEvent); }
  private append(body: EventBody): RunEvent {
    const event = this.log.append(body);
    if (event.type === "milestone") this.milestoneEvents.push(event);
    if(event.type==="state")this.latestStateEvent=event;
    for (const observer of this.observers) observer(event);
    return event;
  }
  recordDecisionSnapshot(snapshot:DecisionSnapshot):void {
    const state=this.recordState(snapshot.state);
    const seq=this.log.nextSeq;
    const frame=this.frames.save(this.log,seq,0,snapshot.content[0].data);
    this.saved={saved:this.saved.saved+1,bytes:this.saved.bytes+Buffer.from(snapshot.content[0].data,"base64").length};
    this.append({type:"decision_input",turn:this.turn,decision_turn:this.turn+1,state_seq:state.seq,text:snapshot.content[1].text,frames:[frame]});
  }
  recordNavigationContext(body:Omit<BodyOf<"navigation_context">,"type"|"turn">):void {this.append({type:"navigation_context",turn:this.turn+1,...body});}
  recordLedgerContext(body:Omit<BodyOf<"ledger_context">,"type"|"turn">):void {this.append({type:"ledger_context",turn:this.turn+1,...body});}
  recordMilestoneHint(body:Omit<BodyOf<"milestone_hint">,"type"|"turn">):void {this.append({type:"milestone_hint",turn:this.turn+1,...body});}
  recordBeliefLedger(body:Omit<BodyOf<"belief_ledger">,"type"|"turn">):void {this.append({type:"belief_ledger",turn:this.turn+1,...body});}
  recordWaitInput(id:string,duration_ms:number):void {this.append({type:"wait_input",turn:this.turn,tool_call_id:id,duration_ms});}
  recordControl(body: Omit<BodyOf<"operator_control">, "type" | "turn">): void { this.append({ type: "operator_control", turn: this.turn, ...body }); }
  recordLoopGuard(body: LoopNotice): void { this.append({type:"loop_guard",turn:this.turn,...body,evidence:[...body.evidence]}); }
  recordObjective(body: BodyOf<"objective_update"> | BodyOf<"objective_attempt">): void { this.append({ ...body, turn: this.turn }); }
  recordState(state: GameStateSnapshot): Extract<Extract<RunEvent, { type: "state" }>, { started: boolean }> {
    if (this.rawRamRequired && state.raw_ram === undefined) throw new RecorderError("Declared full-raw-ram-v1 but the server returned no raw RAM archive reference");
    if (this.storyRequired && state.story === undefined) throw new RecorderError("Declared story-state-v1 but the game server returned no story state; check the Python reader deployment.");
    requireRoute103Field(this.route103Required,state);
    if(this.activityEnabled&&(state.game_stats===undefined||state.blackout_active===undefined||state.party.some(mon=>mon.identity===undefined)))throw new RecorderError("Declared native-progress-activity-v1 but the game server returned incomplete native activity state; check the Python reader deployment.");
    const event = this.append({ type: "state", turn: this.turn, ...state }) as Extract<Extract<RunEvent, { type: "state" }>, { started: boolean }>;
    if (this.milestones.observe !== undefined) this.recordMilestones(this.milestones.observe(state, event.seq));
    if(this.activityEnabled) {
      const result=this.activities.observe(state,event.seq);
      for(const activity of result.activities)this.append({type:"activity",turn:this.turn,...activity,server_timestamp:Date.parse(event.t)/1000,...(this.humanSamplingFrame===undefined?{}:{emulator_frame:this.humanSamplingFrame,emulator_frame_kind:"sample_upper_bound"})});
      if(result.firstHealEvidence!==null)this.recordMilestones([{name:"FIRST_POKECENTER_HEAL",kind:"story",origin:"observed",serverTimestamp:Date.parse(event.t)/1000,evidence:result.firstHealEvidence}]);
    }
    return event;
  }

  async start(meta: RunStartMeta, captureState = true): Promise<void> {
    this.startedAt = this.now();
    this.humanScreenshotMs=meta.controller?.screenshot_ms;
    this.rawRamRequired = meta.harness_features.includes("full-raw-ram-v1");
    this.storyRequired = meta.harness_features.includes("story-state-v1");
    this.activityEnabled=meta.harness_features.includes("native-progress-activity-v1");
    this.route103Required=meta.harness_features.includes("route103-rival-splits-v1");
    this.battleEnabled=meta.harness_features.includes("battle-choices-v1");
    this.nativeActionsEnabled=meta.harness_features.includes("native-action-history-v1");
    this.append({ type: "run_start", turn: 0, ...meta });
    this.milestones.initialize?.(meta.start_state.kind);
    if (captureState) await this.checkMilestones();
    if (meta.controller?.kind === "human") this.frames.protectActiveRuns();
    this.frames.attach(this.log);
  }

  readonly transformContext = (messages: AgentMessage[]): Promise<AgentMessage[]> => {
    this.turn += 1;
    this.requestAt = this.now();
    this.firstTokenAt = null;
    this.requestContext=null;
    this.stream = { thinking: "", text: "", flushedAt: this.requestAt };
    this.append({ type: "turn_start", turn: this.turn, context: contextSize(messages) });
    return Promise.resolve(messages);
  };

  readonly emit = async (event: AgentEvent): Promise<void> => {
    await Promise.resolve();
    switch (event.type) {
      case "message_update":
        {const update=event.assistantMessageEvent;if((update.type==="thinking_delta"||update.type==="text_delta"||update.type==="toolcall_delta")&&update.delta!=="")this.firstTokenAt ??= this.now();}
        this.streamDelta(event.assistantMessageEvent);
        break;
      case "message_end":
        if (event.message.role === "assistant") {
          this.flushStream();
          this.recordAssistant(event.message);
        }
        break;
      case "tool_execution_start":
        this.recordToolCall(event.toolCallId, event.toolName, event.args);
        break;
      case "tool_execution_end":
        this.recordToolResult(event.toolCallId, event.toolName, event.result, event.isError);
        await this.recordBattleChoices();
    await this.recordNativeActions();
        break;
      default:
        break;
    }
  };

  private streamDelta(update: AssistantMessageEvent): void {
    if (update.type === "thinking_delta") this.stream.thinking += update.delta;
    else if (update.type === "text_delta") this.stream.text += update.delta;
    else return;
    if (this.now() - this.stream.flushedAt >= STREAM_FLUSH_MS) this.flushStream();
  }

  private flushStream(): void {
    const { thinking, text } = this.stream;
    this.stream = { thinking: "", text: "", flushedAt: this.now() };
    if (thinking === "" && text === "") return;
    this.append({ type: "assistant_delta", turn: this.turn, thinking, text });
  }

  private recordAssistant(message: AssistantMessage): void {
    const done = this.now();
    const thinking = message.content.flatMap((block) => (block.type === "thinking" ? [block.thinking] : [])).join("\n");
    const text = message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    const tool_calls = message.content.flatMap((block) =>
      block.type === "toolCall" ? [{ id: block.id, name: block.name, args: block.arguments }] : [],
    );
    this.tokens = { input: this.tokens.input + message.usage.input, output: this.tokens.output + message.usage.output };
    this.append({
      type: "assistant",
      turn: this.turn,
      thinking,
      ...(this.requestContext===null?{}:{request_context:this.requestContext}),
      text,
      tool_calls,
      usage: { input: message.usage.input, output: message.usage.output, cache_read: message.usage.cacheRead, ...(this.requestContext!==null||message.usage.cacheWrite!==0?{cache_write:message.usage.cacheWrite}:{}) },
      latency_ms: Math.round(done - this.requestAt),
      ttft_ms: this.firstTokenAt === null ? null : Math.round(this.firstTokenAt - this.requestAt),
      stop_reason: message.stopReason,
      ...(message.errorMessage === undefined ? {} : { error: message.errorMessage }),
    });
  }

  private recordToolCall(id: string, name: string, args: unknown): void {
    if(name==="act"){
      this.toolStarts.set(id,this.now());this.append({type:"tool_call",turn:this.turn,id,name:"act",args});return;
    }
    if(!isRecord(args))throw new RecorderError(`tool ${name} called with non-object arguments`);
    this.toolStarts.set(id,this.now());this.append({type:"tool_call",turn:this.turn,id,name,args});
  }

  private recordToolResult(id: string, name: string, result: unknown, isError: boolean): void {
    const startedAt = this.toolStarts.get(id);
    if (startedAt === undefined) throw new RecorderError(`tool result for ${id} without a recorded call`);
    this.toolStarts.delete(id);
    const payload = toolResultPayload(result);
    let stateSeq:number|undefined;
    // Reuse the state paired with the exact returned frame/text, including an
    // observe-only turn and play runs with objective tracking disabled.
    if ((name === "observe" || name === "press" || name === "navigate_to" || name === "act" || name === "battle_action") && isRecord(result) && isRecord(result.details) && result.details.state !== undefined) {
      try { stateSeq=this.recordState(parseGameState(result.details.state)).seq; }
      catch (error) { this.telemetryError("state", error); }
    }
    const seq = this.log.nextSeq;
    const frames: FrameRef[] = [];
    for (const part of payload.content) {
      if (part.type !== "image") continue;
      const ref = this.frames.save(this.log, seq, frames.length, part.data);
      frames.push(ref);
      this.saved = { saved: this.saved.saved + 1, bytes: this.saved.bytes + Buffer.from(part.data, "base64").length };
    }
    const rawText = payload.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
    const text = rawText.replace(INLINE_PNG, (data) => {
      const ref = this.frames.save(this.log, seq, frames.length, data);
      frames.push(ref);
      this.saved = { saved: this.saved.saved + 1, bytes: this.saved.bytes + Buffer.from(data, "base64").length };
      return `<frame ${ref.path}>`;
    });
    this.append({
      type: "tool_result",
      ...(stateSeq===undefined?{}:{state_seq:stateSeq}),
      turn: this.turn,
      id,
      name,
      is_error: isError,
      duration_ms: Math.round(this.now() - startedAt),
      text,
      frames,
    });
    this.frames.flush(this.log, this.turn);
  }

  buttonPress(toolCallId: string, buttons: readonly Button[], timing: PressTiming, before?: GameStateSnapshot, modifiers?: PressModifiers): void {
    const beforeSeq=before===undefined?undefined:this.recordState(before).seq;
    this.append({
      type: "button_press",
      turn: this.turn,
      tool_call_id: toolCallId,
      ...(modifiers?.stride===undefined?{}:{stride:modifiers.stride}),
      ...(beforeSeq===undefined?{}:{before_state_seq:beforeSeq}),
      ...(modifiers===undefined?{}:{automatic_running:modifiers.automatic_running,...(modifiers.walking===undefined?{}:{walking:modifiers.walking}),...(modifiers.requested_held_buttons===undefined?{}:{requested_held_buttons:[...modifiers.requested_held_buttons]})}),
      buttons: [...buttons],
      hold_frames: timing.hold_frames,
      release_frames: timing.release_frames,
    });
  }

  // The press has landed; a failed read here is logged, never a press failure.
  async afterPress(): Promise<void> {
    await this.recordBattleChoices();
    await this.recordNativeActions();
    if (this.milestones.observe !== undefined) {
      try { this.recordState(await this.gameState.read()); }
      catch (error) { this.telemetryError("state", error); }
      return;
    }
    try {
      await this.checkMilestones();
    } catch (error) {
      this.telemetryError("milestones", error);
    }
    try {
      this.append({ type: "state", turn: this.turn, ...(await this.gameState.read()) });
    } catch (error) {
      this.telemetryError("state", error);
    }
  }

  checkpointFailure(error:unknown):void {this.telemetryError("checkpoint",error);}
  private telemetryError(source: "milestones" | "state" | "battle" | "actions" | "checkpoint", error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.append({ type: "telemetry_error", turn: this.turn, source, message });
  }

  compaction(fromTokens: number, toTokens: number): void {
    this.append({ type: "compaction", turn: this.turn, from_tokens: fromTokens, to_tokens: toTokens });
  }

  recordHumanInput(body: Omit<BodyOf<"human_input">,"type"|"turn">): void {
    if (body.end_frame <= body.start_frame || body.end_ms < body.start_ms) throw new RecorderError("invalid human input interval");
    this.append({type:"human_input",turn:0,...body});
  }

  recordHumanSample(frame:number, paused:boolean, pngBase64:string, state:GameStateSnapshot,forceScreenshot=false):void {
    this.humanSamplingFrame=frame;
    try{this.recordState(state);}finally{this.humanSamplingFrame=undefined;}
    const sampledAt=this.now();
    const interval=this.humanScreenshotMs;
    const due=this.humanScreenshotNextAt===null?true:sampledAt>=this.humanScreenshotNextAt;
    if(!due&&!forceScreenshot)return;
    const screenshot=this.frames.save(this.log,this.log.nextSeq,0,pngBase64);
    this.append({type:"human_sample",turn:0,frame,paused,screenshot});
    this.saved={saved:this.saved.saved+1,bytes:this.saved.bytes+Buffer.from(pngBase64,"base64").length};
    this.frames.flush(this.log,0);
    if(interval!==undefined){
      const previous=this.humanScreenshotNextAt;
      this.humanScreenshotNextAt=previous===null?sampledAt+interval:previous+(Math.floor((sampledAt-previous)/interval)+1)*interval;
    }
  }

  async recordNativeActions():Promise<void> {
    if(!this.nativeActionsEnabled)return;
    if(this.nativeActionFailure!==null)throw this.nativeActionFailure;
    try {
      if(this.gameState.nativeActions===undefined)throw new RecorderError("Declared native-action-history-v1 but no native action journal reader is installed");
      const batch=await this.gameState.nativeActions(this.nativeActionCursor);
      let cursor=this.nativeActionCursor,frame=this.nativeActionFrame,time=this.nativeActionTime;
      if(batch.frame<frame)throw new RecorderError("Native action journal frame regressed");
      for(const entry of batch.entries) {
        if(entry.id!==cursor+1||entry.frame<frame||entry.frame>batch.frame||entry.server_timestamp<time)throw new RecorderError("Invalid native action journal continuity");
        cursor=entry.id;frame=entry.frame;time=entry.server_timestamp;
      }
      if(batch.last_id!==cursor)throw new RecorderError("Native action journal cursor does not cover snapshot");
      for(const entry of batch.entries)this.append({type:"native_action",turn:this.turn,...entry});
      this.nativeActionCursor=cursor;this.nativeActionFrame=batch.frame;this.nativeActionTime=time;
    } catch(error) {
      this.nativeActionFailure=error instanceof Error?error:new RecorderError("Native action recording failed");
      this.telemetryError("actions",this.nativeActionFailure);
      throw this.nativeActionFailure;
    }
  }

  async recordBattleChoices():Promise<void> {
    if(!this.battleEnabled)return;
    if(this.battleFailure!==null)throw this.battleFailure;
    try {
    if(this.gameState.battleChoices===undefined)throw new RecorderError("Declared battle-choices-v1 but no battle journal reader is installed");
    const batch=await this.gameState.battleChoices(this.battleCursor);
    let next=this.battleCursor,lastFrame=this.battleFrame;
    for(const choice of batch.entries){
      if(choice.id!==next+1||choice.frame<lastFrame||choice.frame>batch.frame)throw new RecorderError("Battle choice journal has a gap or regressing frame");
      if(("hp" in choice.actor && choice.actor.hp>choice.actor.max_hp)||(choice.target!==null&&choice.target.hp>choice.target.max_hp))throw new RecorderError("Battle choice journal has invalid HP");
      if(choice.action==="move"&&choice.origin==="selected"&&(choice.move===null||choice.target===null))throw new RecorderError("Selected move is missing move/target evidence");
      next=choice.id;lastFrame=choice.frame;
    }
    if(batch.last_id!==next||batch.frame<this.battleFrame)throw new RecorderError("Battle journal cursor does not cover snapshot");
    for(const choice of batch.entries){this.append({type:"battle_choice",turn:this.turn,...choice});this.battleCursor=choice.id;}
    this.battleFrame=batch.frame;
    } catch(error) {
      this.battleFailure=error instanceof Error?error:new RecorderError("Battle recording failed");
      this.telemetryError("battle",this.battleFailure);
      throw this.battleFailure;
    }
  }

  async checkMilestones(): Promise<void> {
    await this.recordBattleChoices();
    await this.recordNativeActions();
    if (this.milestones.observe !== undefined) {
      this.recordState(await this.gameState.read());
      return;
    }
    this.recordMilestones(await this.milestones.poll());
  }

  private recordMilestones(milestones: readonly SeenMilestone[]): void {
    for (const milestone of milestones) {
      if (milestone.origin !== "present_at_start") this.furthest = deeperMilestone(this.furthest, milestone.name);
      this.append({ type: "milestone", turn: this.turn, ...(this.humanSamplingFrame===undefined?{}:{emulator_frame:this.humanSamplingFrame,emulator_frame_kind:"sample_upper_bound"}), name: milestone.name, server_timestamp: milestone.serverTimestamp,
        ...(milestone.kind === undefined ? {} : {kind:milestone.kind}),
        ...(milestone.origin === undefined ? {} : {origin:milestone.origin}),
        ...(milestone.evidence === undefined ? {} : {evidence:[...milestone.evidence]}),
      });
    }
  }

  retry(reason: string, attempt: number, limit: number): void {
    this.append({ type: "retry", turn: this.turn, reason, attempt, limit });
  }

  recordDialogueAutoAdvance(body: Omit<BodyOf<"dialogue_auto_advance">, "type" | "turn">): RunEvent { return this.append({ type: "dialogue_auto_advance", turn: this.turn, ...body }); }

  textOnlySupervisor(replies: number, note: number, limit: number, text: string): void {
    this.append({ type: "text_only_supervisor", turn: this.turn, replies, note, limit, text });
  }

  // low-hp-trainer-warning-v1: recorded as the paragraph is added to the tool result.
  lowHpTrainerWarning(tool: string, facts: LowHpTrainerWarningFacts, text: string): void {
    this.append({ type: "low_hp_trainer_warning", turn: this.turn, tool, ...facts, map_id: [facts.map_id[0], facts.map_id[1]], items: facts.items.map((i) => ({ ...i })), text });
  }
  // low-hp-trainer-warning-v2: recorded as the story-battle paragraph is added to the tool result.
  storyBattleWarning(tool: string, facts: StoryBattleWarningFacts, text: string): void {
    this.append({ type: "story_battle_warning", turn: this.turn, tool, ...facts, map_id: [facts.map_id[0], facts.map_id[1]], party: facts.party.map((p) => ({ ...p })), items: facts.items.map((i) => ({ ...i })), text });
  }
  // heal-before-trainers-v1: recorded as the paragraph is added to the tool result.
  healBeforeTrainersWarning(tool: string, facts: HealBeforeTrainersFacts, text: string): void {
    this.append({ type: "heal_before_trainers_warning", turn: this.turn, tool, map_id: [facts.map_id[0], facts.map_id[1]], trainers: facts.trainers.map((t) => ({ ...t })), weak: facts.weak.map((w) => (w.kind === "lead_no_pp" ? { ...w, moves: [...w.moves] } : { ...w })), heal: facts.heal === null ? null : { ...facts.heal, map_id: [facts.heal.map_id[0], facts.heal.map_id[1]] }, mom_heals: facts.mom_heals, money: facts.money, ...(facts.items === undefined ? {} : { items: facts.items.map((i) => ({ ...i })) }), text });
  }

  // harness-trust-v1: recorded as the walk-away note is added under the result's header.
  storyGoalAway(tool: string, facts: StoryGoalAwayFacts, text: string): void {
    this.append({ type: "story_goal_away", turn: this.turn, tool, speaker: facts.speaker, line_turn: facts.line_turn, quote: facts.quote, targets: facts.targets.map((t) => ({ name: t.name, map_id: [t.map_id[0], t.map_id[1]] })), steps: facts.steps.map((st) => ({ ...st, from_map: [st.from_map[0], st.from_map[1]], to_map: [st.to_map[0], st.to_map[1]], from: { ...st.from }, to: { ...st.to } })), text });
  }
  // cited-destination-v1: recorded before the walk, with the line the result will start with (null when found).
  destinationCitation(facts: DestinationCitationFacts, text: string | null): void {
    this.append({ type: "destination_citation", turn: this.turn, ...facts, map_id: [facts.map_id[0], facts.map_id[1]], text });
  }

  // people-id-cards-v1: recorded as each card is added to the tool result.
  peopleIdCard(tool: string, toolCallId: string, card: IdCard): void {
    this.append({ type: "people_id_card", turn: this.turn, tool, tool_call_id: toolCallId, key: card.key, reason: card.reason, text: card.text });
  }

  // fixed-point-breaker-v1: recorded as the request is built.
  recordLoopBreaker(body: Omit<BodyOf<"loop_breaker">, "type" | "turn">): void {
    this.append({ type: "loop_breaker", turn: this.turn + 1, ...body });
  }
  // story-character-stall-gate-v1: recorded once for each stall briefing it holds back.
  recordStallGate(body: Omit<BodyOf<"stall_gate">, "type" | "turn">): void {
    this.append({ type: "stall_gate", turn: this.turn, ...body, map_id: [body.map_id[0], body.map_id[1]] });
  }

  end(reason: RunEndReason): void {
    this.append({
      type: "run_end",
      turn: this.turn,
      reason,
      ...(reason==="milestone"&&this.targetProof!==null?{target_proof:{...this.targetProof,state_evidence:[...this.targetProof.state_evidence]}}:{}),
      furthest_milestone: this.furthest,
      turns: this.turn,
      wall_ms: Math.round(this.now() - this.startedAt),
      tokens: this.tokens,
      frames: this.saved,
    });
  }
}
