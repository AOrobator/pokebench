import type { RunEvent } from "../events.js";
import type { GameStateSnapshot } from "../game-state.js";

export const LOOP_POLICY = {
  planning: 6,
  observation: 3,
  ineffective: 3,
  cycleRepeats: 3,
  rejection: 2,
  recovery: 6,
} as const;

export type LoopKind =
  | "planning"
  | "observation"
  | "ineffective"
  | "cycle"
  | "rejection"
  | "trigger_script";
export type StallKind = "map_cycle" | "milestone_drought" | "interface_dwell" | "same_plan";
// same-target-no-progress-v1: its own episode kind, outside the rule registry.
export type NavigationLoopKind = "same_target_no_progress";
export type LoopMode = "enforced" | "diagnostic";
export type LoopPolicy = { readonly [K in keyof typeof LOOP_POLICY]: number };

interface NoticeFields {
  readonly kind: LoopKind | StallKind | NavigationLoopKind;
  readonly message: string;
  readonly calls: number;
  readonly evidence: readonly number[];
}

export type LoopNotice = NoticeFields &
  (
    | {
        readonly mode: "enforced";
        readonly phase: "warning" | "recovered" | "stop" | "supervisor";
      }
    | {
        readonly mode: "diagnostic";
        readonly phase: "would_warn" | "would_recover" | "would_stop";
      }
  );

export interface TriggerScriptExecution {
  readonly map: readonly [number, number];
  readonly variable: number;
  readonly required: number;
  readonly current: number;
  readonly pointer: number;
  readonly stateSeq: number;
}

export interface CompletedCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly isError: boolean;
  readonly text: string;
  readonly state?: GameStateSnapshot | undefined;
  readonly beforeState?: GameStateSnapshot | undefined;
  readonly acted?: boolean | undefined;
  readonly seq?: number;
  readonly requested?: Record<string, unknown> | undefined;
  readonly startState?: GameStateSnapshot | undefined;
  readonly dialogue?: readonly string[] | undefined;
  readonly spoken?: readonly string[] | undefined;
  readonly triggerScript?: TriggerScriptExecution | undefined;
}

export type LoopRuleId =
  | "planning"
  | "observation"
  | "interaction-message"
  | "restarted-dialogue"
  | "clock-view"
  | "closed-dialogue"
  | "ineffective-action"
  | "state-cycle"
  | "pushback"
  | "revisit"
  | "transition"
  | "battle-menu"
  | "trigger-script"
  | "rejection";

export type RecoveryKind = "novel-state" | "new-place" | "interface-closed";

export interface LoopHit {
  readonly kind: LoopKind;
  readonly message: string;
  readonly evidenceSeqs: readonly number[];
  readonly recovery: RecoveryKind;
}

export interface RuleContext {
  readonly seq: number;
  readonly policy: LoopPolicy;
  readonly candidates?: ReadonlyMap<LoopRuleId, LoopHit>;
}

export type ResetReason = "native-progress" | "recovery" | "run-start";

export interface LoopObservation {
  readonly event: RunEvent;
}

export interface LoopRule {
  readonly id: LoopRuleId;
  readonly kind: LoopKind;
  observe?(observation: LoopObservation): void;
  check(call: CompletedCall, context: RuleContext): LoopHit | null;
  reset(reason: ResetReason): void;
}

export interface LoopRuleFeatures {
  readonly interactions?: boolean;
  readonly transitions?: boolean;
  readonly pushback?: boolean;
  readonly battles?: boolean;
  readonly messageTruth?: boolean;
  readonly ineffectiveLoops?: boolean;
  readonly menuLoop?: boolean;
  readonly clockViews?: boolean;
  readonly closedDialogue?: boolean;
  readonly triggerScriptLoops?: boolean;
  readonly battleRefusals?: boolean;
}

export interface LoopCoordinatorOptions extends LoopRuleFeatures {
  readonly ineffectiveNavigation?: boolean;
  readonly sameTargetNoProgress?: boolean;
  readonly policy?: LoopPolicy;
  readonly mode?: LoopMode;
  readonly supervisor?: (kind: LoopKind, calls: number) => string;
}
