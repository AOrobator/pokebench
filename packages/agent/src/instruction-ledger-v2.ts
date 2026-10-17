// instruction-ledger-v2 (RED stub): replaced by the implementation in the GREEN commit.
import type {AgentTool} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import type {RunRecorder} from "./recorder.js";

export const LEDGER_HEADER="Conversation ledger";

export class ConversationLedger {
 constructor(private readonly features:FeatureSet){}
 observe(event:RunEvent):void {void event;void this.features;}
 block(state:GameStateSnapshot,callId:string):string|null {void state;void callId;return null;}
 annotate(text:string,state:GameStateSnapshot,callId:string):string {void state;void callId;return text;}
}

export function withInstructionLedgerV2(tools:readonly AgentTool[],features:FeatureSet,recorder:Pick<RunRecorder,"subscribe">):AgentTool[] {
 void features;void recorder;return [...tools];
}
