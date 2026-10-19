// Compatibility facade. Existing harness and tests keep this import while the
// loop implementation is split into focused modules under ./loop/.
import { LOOP_POLICY, LoopCoordinator } from "./loop/coordinator.js";
import type { LoopKind, LoopMode, LoopNotice, LoopPolicy } from "./loop/coordinator.js";

export {
  BATTLE_MENU_LOOP_MESSAGE,
  BATTLE_MENU_RETURNS,
  LOOP_POLICY,
  NATIVE_PROGRESS_MILESTONES,
  PUSHBACK_MESSAGE,
  REVISIT_MESSAGE,
  TRIGGER_SCRIPT_MESSAGE,
  WAITING_MESSAGE,
  battleState,
  readLoopMode,
  scriptHeld,
  semanticState,
  transientLock,
  waitingState,
} from "./loop/coordinator.js";
export type {
  CompletedCall,
  LoopKind,
  LoopMode,
  LoopNotice,
  LoopPolicy,
  StallKind,
} from "./loop/coordinator.js";

export class LoopDetector extends LoopCoordinator {
  constructor(
    notify: (notice: LoopNotice) => void,
    policy: LoopPolicy = LOOP_POLICY,
    mode: LoopMode = "enforced",
    interactions = false,
    supervisor?: (kind: LoopKind, calls: number) => string,
    transitions = false,
    pushback = false,
    battles = false,
    messageTruth = false,
    ineffectiveLoops = false,
    menuLoop = false,
    clockViews = false,
    closedDialogue = false,
    triggerScriptLoops = false,
    battleRefusals = false,
  ) {
    super(notify, {
      policy,
      mode,
      interactions,
      ...(supervisor === undefined ? {} : { supervisor }),
      transitions,
      pushback,
      battles,
      messageTruth,
      ineffectiveLoops,
      menuLoop,
      clockViews,
      closedDialogue,
      triggerScriptLoops,
      battleRefusals,
    });
  }
}
