import type {FeatureSet, SwitchableFeature} from "../src/features.js";
import {ALL_ON as CURRENT_ALL_ON, SWITCHABLE_FEATURES} from "../src/features.js";
// The registry is a set, not a list: nothing here may depend on a switch's position. These fixtures froze when
// map-observability-v1 was the newest switch, and that moment is recorded as the set of ids that existed then. The
// registry can grow, shrink or reorder without moving the boundary, and retiring an id simply removes a member.
// Registering a switch still needs no edit here: it is absent from the set, so it is "later" by definition.
export const FROZEN_SWITCHES:ReadonlySet<SwitchableFeature>=new Set<SwitchableFeature>([
 "scripted-place-guidance-v1","trigger-script-loop-v1","navigation-evidence-memory-v1","automatic-running-v1",
 "expanded-menu-battle-information-v1","ram-state-v1","live-map-v1","live-player-position-v1",
 "world-coordinate-grid-v1","live-object-sprites-v1","world-targets-v1","named-interactions-v1",
 "world-destinations-v1","bounded-navigation-v1","semantic-navigation-v1","deterministic-exploration-v1",
 "grass-cost-navigation-v1","field-dialogue-phase-v1","dialogue-safe-batches-v1","interaction-loop-detection-v1",
 "active-field-message-buffer-v1","naming-cursor-v1","story-state-v1","coordinate-script-conditions-v1",
 "state-only-decisions-v1","contextual-interface-docs-v1","active-ui-ownership-v1","press-result-v1",
 "field-control-lock","warp-activation-guidance-v1","ledge-hops-v1","one-way-tiles-v1",
 "counter-talk-v1","walkable-floor-v1","deterministic-loop-guard-v1","objective-tracking-v1",
 "repeat-attempt-guard-v1","native-objective-completion-v1","full-map-navigation-v1","elevation-transitions-v1",
 "game-evidence-priority-v1","dialogue-log-v1","loop-guard-supervisor-v1","instruction-ledger-v1",
 "next-milestone-hint-v1","double-context-window-v1","fresh-retry-v1","named-warp-destinations-v1",
 "milestone-stall-stop-v1","text-only-supervisor-v1","character-presence-v1","navigation-refusal-reasons-v1",
 "transition-press-result-v1","stall-briefing-v1","battle-details-v2","dialogue-auto-advance-v1",
 "warp-arrival-settle-v1","dialogue-context-kept-v1","displayed-place-names-v1","transition-loop-detection-v1",
 "blocked-batch-result-v1","battle-triage-guidance-v1","adjacent-tiles-v1","readout-rules-in-prompt-v1",
 "explorer-guidance-v1","connection-edge-tiles-v1","in-game-naming-readout-v1","no-nickname-guidance-v1",
 "battle-text-auto-advance-v1","battle-message-waiting-v1","script-line-presence-v1","offscreen-objects-v1",
 "navigate-first-prompt-v1","presence-penalty-v1","disproved-beliefs-v1","same-plan-breaker-v1",
 "levelup-box-v1","briefing-exits-v1","untaken-exits-v1","people-ledger-v1",
 "trainer-heal-guidance-v1","low-hp-trainer-warning-v1","briefing-battle-outcomes-v1","blocked-exit-fact-v1",
 "battle-loss-recap-v1","pushback-loop-detection-v1","pushback-press-result-v1","battle-observation-loop-v1",
 "transition-coherence-v1","readout-truth-v1","birch-speech-pages-v1","blackout-readout-v1",
 "surf-gated-exits-v1","navigation-truth-v1","navigation-refusal-reasons-v2","cross-map-goal-v1",
 "explorer-guidance-v2","ineffective-loops-v1","people-id-cards-v1","open-goal-prompt-v1",
 "low-hp-trainer-warning-v2","story-destinations-v1","exit-reachability-v1","heal-before-trainers-v1",
 "harness-trust-v1","cited-destination-v1","battle-move-tool-v1","harness-trust-v2",
 "tutorial-party-owner-v1","mid-frame-readout-v1","unset-dynamic-warp-v1","status-names-v1",
 "surf-gated-exits-v2","instruction-ledger-v2","no-exit-here-v1","bag-healing-items-v1",
 "battle-menu-loop-v1","clock-view-loop-v1","stale-story-goal-v1","input-cuts-v1",
 "loop-guard-screen-v1","reopened-dialogue-loop-v1","dialog-button-b-v1","just-in-time-prompt-v1",
 "just-in-time-prompt-v2","faced-interaction-history-v1","save-state-task-truth-v1","cache-aligned-window-v1",
 "jit-guide-reuse-v1","battle-effective-damage-v1","visited-terrain-navigation-v1","stale-story-goal-v2",
 "deterministic-warp-navigation-v1","battle-refusal-loop-v1","battle-decision-ready-v1","ineffective-navigation-v2",
 "supervisor-briefing-v2","reachable-story-guidance-v1","text-only-supervisor-v2","safe-navigation-strides-v1",
 "evolution-decision-v1","observed-instructions-v1","starter-decision-salience-v1","context-token-budget-v1",
 "briefing-repeat-count-v1","navigate-already-here-v1","original-speed-pacing-v1","fixed-point-breaker-v1",
 "story-character-stall-gate-v1","positive-supervisor-v1","semantic-navigation-v2","auto-talk-v1",
 "duplicate-turn-collapse-v1","unfinished-activity-v1","exit-labels-v2","heal-before-trainers-v2",
 "gym-heal-warning-v1","respawn-readout-v1","trainer-sight-check-v1","caught-nickname-prompt-v1",
 "fail-open-input-v1","whiteout-healed-v1","gym-readiness-readout-v1","party-item-confirmation-v1",
 "same-target-no-progress-v1","story-progress-clock-v1","yes-no-answer-readout-v1","field-move-gates-v1",
 "story-battle-heal-gate-v1","exit-labels-v3","navigation-tool-use-guard-v1","semantic-current-map-feedback-v1",
 "short-cycle-fixed-point-v1","navigation-refusal-reasons-v3","story-battle-heal-first-v1","pending-field-dialogue-v1",
 "move-learn-settle-v1","move-learn-question-v1","move-learn-comparison-v1","effectiveness-heard-v1",
 "game-said-goals-v1","menu-refusal-recovery-v1","gym-door-label-v1","mart-stock-readout-v1",
 "caught-dex-input-v1","exp-next-level-v1","pokedex-own-v1","exp-earned-ledger-v1",
 "leader-attempt-ledger-v1","seen-trainers-ledger-v1","party-coverage-v1","said-type-matches-v1",
 "progress-aware-cycles-v1","shop-interface-v1","rejected-movement-step-v1","observed-field-dialogue-v1",
 "story-goal-player-name-v1","cut-off-reply-feedback-v1","trainer-sight-check-v2","auto-talk-v2",
 "map-wide-triggers-v1","drought-battle-heal-hold-v1","gym-evidence-v1",
 "milestone-instruction-memory-v1","birch-intro-pages-v1","tool-prompt-docs-v1","field-ownership-feedback-v1",
 "move-learn-loop-fingerprint-v1","stale-plan-fact-v1","post-battle-readout-v1","move-learn-tool-v1",
 "move-learn-early-comparison-v1","poison-readout-v1","berry-readout-v1","milestone-drought-suppression-v1",
 "navigation-recovery-v1","menu-item-guidance-v1","factual-healing-guidance-v1","coherent-healing-feedback-v1",
 "explorer-family-guidance-v1","battle-move-learn-input-v1","rejected-movement-stride-v1","leader-loss-comparison-v1",
 "npc-approach-feedback-v1","boundary-crossing-facts-v1","delivered-place-evidence-v1","reachable-section-alternatives-v1",
 "owned-battle-context-v1","static-npc-template-approach-v1","auto-talk-field-only-v1","auto-talk-v3",
 "untalked-people-header-v1","rejected-movement-prefix-v1","coherent-battle-observation-v1","turn-drought-clock-v1",
 "away-note-buildings-v1","current-map-display-name-v1","window-escape-route-v1","map-cycle-recovery-v1",
 "random-starter-v1","move-learn-goal-reminder-v1","move-learn-offer-identity-v1","campaign-progress-clock-v1",
 "roxanne-campaign-reminder-v1","elevation-aware-map-v1","screen-center-player-v1","navigation-cycle-stop-v1",
 "restored-memory-run-v1","blackout-transition-v1","trainer-observed-party-v1","leader-loss-immediate-v1",
 "battle-action-history-v1","leader-preparation-comparison-v1","refusal-ledger-v1","player-elevation-readout-v1",
 "party-menu-message-v1","drought-progress-facts-v1","whiteout-outcomes-v2","interface-guidance-v1",
 "active-warp-exits-v1","available-exits-presentation-v1","native-task-goal-retirement-v1","instruction-goal-ledger-v1",
 "menu-option-tool-v1","bag-pocket-truth-v1","bag-press-feedback-v1","bag-ineffective-loop-v1",
 "citation-evidence-v1","moving-npc-target-v1","caught-nickname-prompt-v2","mauville-puzzle-readout-v1",
 "cutscene-journal-v1","instruction-goal-advisory-v1","goal-review-repair-feedback-v1","map-observability-v1",
]);
export const LATER_SWITCHES=SWITCHABLE_FEATURES.filter(id=>!FROZEN_SWITCHES.has(id));
const LATER_SWITCHES_OFF=Object.fromEntries(LATER_SWITCHES.map(id=>[id,false])) as Partial<Record<SwitchableFeature,false>>;
// Frozen pre-recovery all-on fixture: new treatments stay OFF in legacy behavior tests.
export const LEGACY_ALL_ON={...CURRENT_ALL_ON,"scene-followup-prompt-v1":false,...LATER_SWITCHES_OFF,"map-observability-v1":false,"mauville-puzzle-readout-v1":false,"instruction-goal-advisory-v1":false,"goal-review-repair-feedback-v1":false,"cutscene-journal-v1":false,"caught-nickname-prompt-v2":false,"moving-npc-target-v1":false,"citation-evidence-v1":false,"bag-ineffective-loop-v1":false,"bag-press-feedback-v1":false,"bag-pocket-truth-v1":false,"menu-option-tool-v1":false,"instruction-goal-ledger-v1":false,"native-task-goal-retirement-v1":false,"player-elevation-readout-v1":false,"party-menu-message-v1":false,"drought-progress-facts-v1":false,"refusal-ledger-v1":false,"whiteout-outcomes-v2":false,"active-warp-exits-v1":false,"available-exits-presentation-v1":false,"interface-guidance-v1":false,"trainer-observed-party-v1":false,"navigation-cycle-stop-v1":false,"elevation-aware-map-v1":false,"screen-center-player-v1":false,"blackout-transition-v1":false,"restored-memory-run-v1":false,"move-learn-offer-identity-v1":false,"campaign-progress-clock-v1":false,"roxanne-campaign-reminder-v1":false,"move-learn-goal-reminder-v1":false,"coherent-battle-observation-v1":false,"map-cycle-recovery-v1":false,"random-starter-v1":false,"turn-drought-clock-v1":false,"static-npc-template-approach-v1":false,"owned-battle-context-v1":false,"reachable-section-alternatives-v1":false,"delivered-place-evidence-v1":false,"boundary-crossing-facts-v1":false,"npc-approach-feedback-v1":false,"leader-loss-immediate-v1":false,"battle-action-history-v1":false,"leader-preparation-comparison-v1":false,"leader-loss-comparison-v1":false,"rejected-movement-stride-v1":false,"battle-move-learn-input-v1":false,"explorer-family-guidance-v1":false,"coherent-healing-feedback-v1":false,"navigation-recovery-v1":false,"milestone-drought-suppression-v1":false,"milestone-instruction-memory-v1":false,"gym-evidence-v1":false,"rejected-movement-step-v1":false,"observed-field-dialogue-v1":false,"birch-intro-pages-v1":false,"story-goal-player-name-v1":false,"cut-off-reply-feedback-v1":false,"trainer-sight-check-v2":false,"auto-talk-v2":false,"rejected-movement-prefix-v1":false,"away-note-buildings-v1":false,"current-map-display-name-v1":false,"window-escape-route-v1":false,"auto-talk-field-only-v1":false,"auto-talk-v3":false,"untalked-people-header-v1":false,"map-wide-triggers-v1":false,"drought-battle-heal-hold-v1":false,"tool-prompt-docs-v1":false,"field-ownership-feedback-v1":false,"move-learn-loop-fingerprint-v1":false,"stale-plan-fact-v1":false,"post-battle-readout-v1":false,"move-learn-tool-v1":false,"move-learn-early-comparison-v1":false,"poison-readout-v1":false,"berry-readout-v1":false,"shop-interface-v1":false,"progress-aware-cycles-v1":false,"exp-next-level-v1":false,"pokedex-own-v1":false,"exp-earned-ledger-v1":false,"leader-attempt-ledger-v1":false,"seen-trainers-ledger-v1":false,"party-coverage-v1":false,"said-type-matches-v1":false,"caught-dex-input-v1":false,"gym-door-label-v1":false,"mart-stock-readout-v1":false,"menu-refusal-recovery-v1":false,"menu-item-guidance-v1":false,"factual-healing-guidance-v1":false,"move-learn-settle-v1":false,"move-learn-question-v1":false,"move-learn-comparison-v1":false,"effectiveness-heard-v1":false,"game-said-goals-v1":false,"story-battle-heal-first-v1":false,"pending-field-dialogue-v1":false,"exit-labels-v3":false,"navigation-tool-use-guard-v1":false,"semantic-current-map-feedback-v1":false,"short-cycle-fixed-point-v1":false,"navigation-refusal-reasons-v3":false,"yes-no-answer-readout-v1":false,"story-battle-heal-gate-v1":false,"party-item-confirmation-v1":false,"original-speed-pacing-v1":false,"observed-instructions-v1":false,"starter-decision-salience-v1":false,"safe-navigation-strides-v1":false,"ineffective-navigation-v2":false,"supervisor-briefing-v2":false,"reachable-story-guidance-v1":false,"text-only-supervisor-v2":false,"fixed-point-breaker-v1":false,"story-character-stall-gate-v1":false,"positive-supervisor-v1":false,"auto-talk-v1":false,"duplicate-turn-collapse-v1":false,"unfinished-activity-v1":false,"exit-labels-v2":false,"heal-before-trainers-v2":false,"gym-heal-warning-v1":false,"respawn-readout-v1":false,"trainer-sight-check-v1":false,"caught-nickname-prompt-v1":false,"fail-open-input-v1":false,"whiteout-healed-v1":false,"field-move-gates-v1":false,"gym-readiness-readout-v1":false,"same-target-no-progress-v1":false,"story-progress-clock-v1":false};

export function withoutFrontierTreatments(features:FeatureSet):FeatureSet {
 return {...features,...BATCH_DEFAULTS_OFF,"player-elevation-readout-v1":false,"party-menu-message-v1":false,"drought-progress-facts-v1":false,"refusal-ledger-v1":false,"whiteout-outcomes-v2":false,"active-warp-exits-v1":false,"available-exits-presentation-v1":false,"interface-guidance-v1":false,"trainer-observed-party-v1":false,"navigation-cycle-stop-v1":false,"elevation-aware-map-v1":false,"screen-center-player-v1":false,"blackout-transition-v1":false,"restored-memory-run-v1":false,"move-learn-offer-identity-v1":false,"campaign-progress-clock-v1":false,"roxanne-campaign-reminder-v1":false,"move-learn-goal-reminder-v1":false,"coherent-battle-observation-v1":false,"map-cycle-recovery-v1":false,"random-starter-v1":false,"rejected-movement-prefix-v1":false,"away-note-buildings-v1":false,"current-map-display-name-v1":false,"window-escape-route-v1":false,"auto-talk-field-only-v1":false,"auto-talk-v3":false,"untalked-people-header-v1":false,"static-npc-template-approach-v1":false,"owned-battle-context-v1":false,"coherent-healing-feedback-v1":false,"explorer-family-guidance-v1":false,"battle-move-learn-input-v1":false,"rejected-movement-stride-v1":false,"leader-loss-immediate-v1":false,"battle-action-history-v1":false,"leader-preparation-comparison-v1":false,"leader-loss-comparison-v1":false,"npc-approach-feedback-v1":false,"boundary-crossing-facts-v1":false,"delivered-place-evidence-v1":false,"reachable-section-alternatives-v1":false};
}

// Preserve pre-batch feature values in legacy consumer fixtures.
export const BATCH_DEFAULTS_OFF={"scene-followup-prompt-v1":false,...LATER_SWITCHES_OFF,"map-observability-v1":false,"mauville-puzzle-readout-v1":false,"instruction-goal-advisory-v1":false,"goal-review-repair-feedback-v1":false,"cutscene-journal-v1":false,"caught-nickname-prompt-v2":false,"whiteout-outcomes-v2":false,"interface-guidance-v1":false,"active-warp-exits-v1":false,"available-exits-presentation-v1":false,"native-task-goal-retirement-v1":false,"instruction-goal-ledger-v1":false,"menu-option-tool-v1":false,"bag-pocket-truth-v1":false,"bag-press-feedback-v1":false,"bag-ineffective-loop-v1":false,"citation-evidence-v1":false,"moving-npc-target-v1":false} as const;
