import {ALL_ON as CURRENT_ALL_ON} from "../src/features.js";
// Frozen pre-recovery all-on fixture: new treatments stay OFF in legacy behavior tests.
export const LEGACY_ALL_ON={...CURRENT_ALL_ON,"original-speed-pacing-v1":false,"observed-instructions-v1":false,"starter-decision-salience-v1":false,"safe-navigation-strides-v1":false,"ineffective-navigation-v2":false,"supervisor-briefing-v2":false,"reachable-story-guidance-v1":false,"text-only-supervisor-v2":false,"fixed-point-breaker-v1":false,"story-character-stall-gate-v1":false,"positive-supervisor-v1":false,"auto-talk-v1":false};
