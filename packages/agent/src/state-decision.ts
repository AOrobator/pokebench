import { runAgentLoop, type AgentEvent, type AgentLoopConfig, type AgentMessage, type AgentTool, type StreamFn } from "@mariozechner/pi-agent-core";
import {createAssistantMessageEventStream,streamSimple,type AssistantMessage,type ImageContent,type TextContent} from "@mariozechner/pi-ai";
import { Type, type Static } from "typebox";
import {Value} from "typebox/value";
import type { GameStateSnapshot } from "./game-state.js";
import { ButtonSchema, type RunEndReason } from "./events.js";
import type { Governor } from "./harness.js";

const closed = { additionalProperties: false } as const;
export const StateActionSchema = Type.Union([
  Type.Object({ kind: Type.Literal("press"), buttons: Type.Array(ButtonSchema, { minItems: 1, maxItems: 8 }) }, closed),
  Type.Object({ kind: Type.Literal("wait"), duration_ms: Type.Integer({ minimum: 1, maximum: 2000 }) }, closed),
]);
export type StateAction = Static<typeof StateActionSchema>;
// OpenAI-compatible function schemas require an object at the root. The
// discriminated union above validates the original response before execution.
const ActionParameters=Type.Object({kind:Type.Enum(["press","wait"]),buttons:Type.Optional(Type.Array(ButtonSchema,{minItems:1,maxItems:8})),duration_ms:Type.Optional(Type.Integer({minimum:1,maximum:2000}))},closed);
export interface DecisionSnapshot {
  readonly state: GameStateSnapshot;
  readonly content: readonly [ImageContent, TextContent];
}
export interface StateDecisionOptions {
  readonly systemPrompt: string;
  readonly goal: string;
  readonly base: AgentLoopConfig;
  readonly governor: Governor;
  readonly signal: AbortSignal;
  readonly readSnapshot: (signal: AbortSignal) => Promise<DecisionSnapshot>;
  readonly recordSnapshot: (snapshot: DecisionSnapshot) => Promise<void>;
  readonly execute: (id: string, action: StateAction, signal?: AbortSignal) => ReturnType<AgentTool["execute"]>;
  readonly transformContext: (messages: AgentMessage[]) => Promise<AgentMessage[]>;
  readonly emit: (event: AgentEvent) => Promise<void> | void;
  readonly inputEpoch?:()=>number;
  readonly gate?: (signal?: AbortSignal) => Promise<void>;
  readonly streamFn?: StreamFn;
}

export async function stateDecisions(options: StateDecisionOptions): Promise<RunEndReason> {
  const { governor, signal } = options;
  const stopped = (): boolean => governor.stopReason !== null || signal.aborted;
  const transport:StreamFn=(model,context,streamOptions)=>{
    if(!stopped())return (options.streamFn??streamSimple)(model,context,streamOptions);
    const stream=createAssistantMessageEventStream();
    const message:AssistantMessage={role:"assistant",content:[],api:model.api,provider:model.provider,model:model.id,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:"aborted",errorMessage:"Run stopped before decision request",timestamp:Date.now()};
    stream.push({type:"error",reason:"aborted",error:message});return stream;
  };
  const act: AgentTool<typeof ActionParameters> = {
    name: "act", label: "Choose next action",
    description: "Choose exactly one action from the current snapshot: press up to eight buttons in order, or wait 1–2000 milliseconds of host time without pressing a button. A press uses buttons only; a wait uses duration_ms only. Never combine both fields. Host waiting does not guarantee a number of emulator frames; inspect the next snapshot for progress.",
    parameters: ActionParameters,
    execute: async (id, action, actionSignal) => {
      await options.gate?.(actionSignal ?? signal);
      if (stopped()) throw new Error("Run stopped; no action permitted");
      (actionSignal ?? signal).throwIfAborted();
      if(!Value.Check(StateActionSchema,action))throw new Error("Invalid action shape");
      return options.execute(id, action, actionSignal ?? signal);
    },
  };
  try {
  while (!stopped()) {
    await options.gate?.(signal);
    if (stopped()) break;
    const prompt:AgentMessage={role:"user",timestamp:Date.now(),content:options.goal};
    const messages = await runAgentLoop([prompt], {systemPrompt:options.systemPrompt,messages:[],tools:[act]}, {
      ...options.base,
      toolExecution:"sequential",
      transformContext:async (fresh, loopSignal) => {
        await options.gate?.(loopSignal ?? signal);
        if(stopped())return fresh;
        let epoch=options.inputEpoch?.()??0;
        let snapshot:DecisionSnapshot;
        for(;;){
          snapshot=await options.readSnapshot(signal);
          await options.gate?.(loopSignal??signal);
          if(stopped())return fresh;
          const current=options.inputEpoch?.()??0;
          if(current===epoch)break;
          epoch=current;
        }
        await options.recordSnapshot(snapshot);
        if(stopped())return fresh;
        const current:AgentMessage={role:"user",timestamp:Date.now(),content:[{type:"text",text:options.goal},...snapshot.content]};
        return options.transformContext([current]);
      },
      beforeToolCall:async ({assistantMessage,toolCall}) => {
        await options.gate?.(signal);
        const calls=assistantMessage.content.filter(part=>part.type==="toolCall");
        if(stopped())return {block:true,reason:"Run stopped; no action permitted"};
        if(assistantMessage.stopReason==="length")return {block:true,reason:"Incomplete response; action not executed"};
        if(calls.length!==1)return {block:true,reason:"Choose exactly one action per decision"};
        if(!Value.Check(StateActionSchema,toolCall.arguments))return {block:true,reason:"Invalid action: values must have the exact declared types and bounds"};
        return undefined;
      },
      shouldStopAfterTurn:({message,toolResults}) => {
        governor.afterTurn(message,toolResults);
        return true;
      },
      getFollowUpMessages:()=>Promise.resolve([]),
    },options.emit,signal,transport);
    const last=messages.at(-1);
    if(last?.role==="assistant"&&(last.stopReason==="error"||last.stopReason==="aborted")&&!stopped())governor.modelError(last);
  }
  }catch(error){if(!signal.aborted)throw error;}
  return governor.stopReason ?? "operator_abort";
}
