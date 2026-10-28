import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {Type,type Static} from "typebox";
import {Value} from "typebox/value";
import {MEASUREMENT_ONLY_MILESTONES,MILESTONES} from "./milestones.js";
import {ALL_ON,SWITCHABLE_FEATURES,dependencyProblems,stateOnlyProblems,type FeatureSet} from "./features.js";
const closed={additionalProperties:false} as const;
const positive=Type.Integer({minimum:1});
const common={stopAt:Type.Optional(Type.String({minLength:1})),id:Type.String({minLength:1,maxLength:100}),target:Type.Union([Type.String({minLength:1}),Type.Null()]),limits:Type.Object({maxTurns:positive,maxWallMs:positive,failureLimit:positive,replyFailuresEndRun:Type.Optional(Type.Boolean())},closed),sampling:Type.Object({thinkingLevel:Type.Enum(["off","minimal","low","medium","high","xhigh"] as const),maxTokens:positive},closed)};
export const PlayFlagsSchema=Type.Object({loopGuard:Type.Boolean(),activeUi:Type.Boolean(),interfaceDocs:Type.Boolean(),objectives:Type.Boolean()},closed);
export const FeatureSetSchema=Type.Object({
 "destination-first-navigation-v1":Type.Optional(Type.Boolean()),
 "pokenav-call-auto-advance-v1":Type.Optional(Type.Boolean()),
 "player-map-visibility-v1":Type.Optional(Type.Boolean()),
 "neutral-yes-no-readout-v1":Type.Optional(Type.Boolean()),
 "refusal-ledger-bound-v1":Type.Optional(Type.Boolean()),
 "disproved-beliefs-bound-v1":Type.Optional(Type.Boolean()),
 "scene-journal-safe-capture-v1":Type.Optional(Type.Boolean()),
 "compact-map-grid-v1":Type.Optional(Type.Boolean()),
 "supervisor-briefing-bound-v1":Type.Optional(Type.Boolean()),
 "gateway-current-turn-v1":Type.Optional(Type.Boolean()),
 "gateway-tool-schemas-v1":Type.Optional(Type.Boolean()),
 "gateway-schema-hint-v1":Type.Optional(Type.Boolean()),
 "type-gap-team-last-message-v1":Type.Optional(Type.Boolean()),
 "instruction-memory-cap-v1":Type.Optional(Type.Boolean()),
 "instruction-memory-junk-filter-v1":Type.Optional(Type.Boolean()),
 "instruction-goal-advisory-v1":Type.Optional(Type.Boolean()),
 "goal-review-repair-feedback-v1":Type.Optional(Type.Boolean()),
 "map-observability-v1":Type.Optional(Type.Boolean()),
 "type-gap-team-v1":Type.Optional(Type.Boolean()),
 "supplies-v1":Type.Optional(Type.Boolean()),
 "untalked-in-gym-v1":Type.Optional(Type.Boolean()),
 "pokenav-short-list-v1":Type.Optional(Type.Boolean()),
 "menu-option-honest-refusal-v1":Type.Optional(Type.Boolean()),
 "context-exact-count-v1":Type.Optional(Type.Boolean()),
 "no-story-foreknowledge-v1":Type.Optional(Type.Boolean()),"instruction-memory-dedup-v1":Type.Optional(Type.Boolean()),
 "grass-strides-v1":Type.Optional(Type.Boolean()),
 "scene-followup-prompt-v1":Type.Optional(Type.Boolean()),
 "self-named-speaker-v1":Type.Optional(Type.Boolean()),
 "story-briefing-native-milestones-v1":Type.Optional(Type.Boolean()),
 "retire-reached-story-line-v1":Type.Optional(Type.Boolean()),
 "cutscene-journal-v1":Type.Optional(Type.Boolean()),
 "bag-pocket-truth-v1":Type.Optional(Type.Boolean()),
 "bag-press-feedback-v1":Type.Optional(Type.Boolean()),
 "bag-ineffective-loop-v1":Type.Optional(Type.Boolean()),

 "citation-evidence-v1":Type.Optional(Type.Boolean()),
 "mauville-puzzle-readout-v1":Type.Optional(Type.Boolean()),
 "moving-npc-target-v1":Type.Optional(Type.Boolean()),
 "caught-nickname-prompt-v2":Type.Optional(Type.Boolean()),
 "player-elevation-readout-v1":Type.Optional(Type.Boolean()),
 "party-menu-message-v1":Type.Optional(Type.Boolean()),
 "native-task-goal-retirement-v1":Type.Optional(Type.Boolean()),
 "instruction-goal-ledger-v1":Type.Optional(Type.Boolean()),
 "menu-option-tool-v1":Type.Optional(Type.Boolean()),
 "refusal-ledger-v1":Type.Optional(Type.Boolean()),
 "whiteout-outcomes-v2":Type.Optional(Type.Boolean()),
 "trainer-observed-party-v1":Type.Optional(Type.Boolean()),
 "blackout-transition-v1":Type.Optional(Type.Boolean()),
 "restored-memory-run-v1":Type.Optional(Type.Boolean()),
 "leader-loss-immediate-v1":Type.Optional(Type.Boolean()),
 "battle-action-history-v1":Type.Optional(Type.Boolean()),
 "leader-preparation-comparison-v1":Type.Optional(Type.Boolean()),

 "campaign-progress-clock-v1":Type.Optional(Type.Boolean()),
 "navigation-cycle-stop-v1":Type.Optional(Type.Boolean()),
 "coherent-battle-observation-v1":Type.Optional(Type.Boolean()),
 "map-cycle-recovery-v1":Type.Optional(Type.Boolean()),
 "move-learn-offer-identity-v1":Type.Optional(Type.Boolean()),
 "move-learn-goal-reminder-v1":Type.Optional(Type.Boolean()),
 "roxanne-campaign-reminder-v1":Type.Optional(Type.Boolean()),
 "elevation-aware-map-v1":Type.Optional(Type.Boolean()),
 "screen-center-player-v1":Type.Optional(Type.Boolean()),
 "random-starter-v1":Type.Optional(Type.Boolean()),
 "drought-progress-facts-v1":Type.Optional(Type.Boolean()),
 "active-warp-exits-v1":Type.Optional(Type.Boolean()),
 "available-exits-presentation-v1":Type.Optional(Type.Boolean()),
 "turn-drought-clock-v1":Type.Optional(Type.Boolean()),
 "static-npc-template-approach-v1":Type.Optional(Type.Boolean()),
 "owned-battle-context-v1":Type.Optional(Type.Boolean()),
 "reachable-section-alternatives-v1":Type.Optional(Type.Boolean()),
 "boundary-crossing-facts-v1":Type.Optional(Type.Boolean()),
 "npc-approach-feedback-v1":Type.Optional(Type.Boolean()),
 "leader-loss-comparison-v1":Type.Optional(Type.Boolean()),
 "rejected-movement-stride-v1":Type.Optional(Type.Boolean()),
 "explorer-family-guidance-v1":Type.Optional(Type.Boolean()),
 "coherent-healing-feedback-v1":Type.Optional(Type.Boolean()),
 "milestone-drought-suppression-v1":Type.Optional(Type.Boolean()),
 "trigger-navigation-boundary-v1":Type.Optional(Type.Boolean()),
 "move-learn-settle-v1":Type.Optional(Type.Boolean()),
 "interface-guidance-v1":Type.Optional(Type.Boolean()),
 "move-learn-question-v1":Type.Optional(Type.Boolean()),
 "move-learn-comparison-v1":Type.Optional(Type.Boolean()),
 "effectiveness-heard-v1":Type.Optional(Type.Boolean()),
 "gym-evidence-v1":Type.Optional(Type.Boolean()),
 "game-said-goals-v1":Type.Optional(Type.Boolean()),
 "navigation-tool-use-guard-v1":Type.Optional(Type.Boolean()),
 "milestone-instruction-memory-v1":Type.Optional(Type.Boolean()),
 "rejected-movement-step-v1":Type.Optional(Type.Boolean()),
 "rejected-movement-prefix-v1":Type.Optional(Type.Boolean()),
 "away-note-buildings-v1":Type.Optional(Type.Boolean()),
 "current-map-display-name-v1":Type.Optional(Type.Boolean()),
 "window-escape-route-v1":Type.Optional(Type.Boolean()),
 "observed-field-dialogue-v1":Type.Optional(Type.Boolean()),
 "story-goal-player-name-v1":Type.Optional(Type.Boolean()),
 "cut-off-reply-feedback-v1":Type.Optional(Type.Boolean()),
 "trainer-sight-check-v2":Type.Optional(Type.Boolean()),
 "auto-talk-v2":Type.Optional(Type.Boolean()),
 "auto-talk-field-only-v1":Type.Optional(Type.Boolean()),
 "auto-talk-v3":Type.Optional(Type.Boolean()),
 "untalked-people-header-v1":Type.Optional(Type.Boolean()),
 "map-wide-triggers-v1":Type.Optional(Type.Boolean()),
 "drought-battle-heal-hold-v1":Type.Optional(Type.Boolean()),
 "birch-intro-pages-v1":Type.Optional(Type.Boolean()),
 "tool-prompt-docs-v1":Type.Optional(Type.Boolean()),
 "field-ownership-feedback-v1":Type.Optional(Type.Boolean()),
 "move-learn-loop-fingerprint-v1":Type.Optional(Type.Boolean()),
 "stale-plan-fact-v1":Type.Optional(Type.Boolean()),
 "post-battle-readout-v1":Type.Optional(Type.Boolean()),
 "move-learn-tool-v1":Type.Optional(Type.Boolean()),
 "move-learn-early-comparison-v1":Type.Optional(Type.Boolean()),
 "battle-move-learn-input-v1":Type.Optional(Type.Boolean()),
 "delivered-place-evidence-v1":Type.Optional(Type.Boolean()),
 "poison-readout-v1":Type.Optional(Type.Boolean()),
 "berry-readout-v1":Type.Optional(Type.Boolean()),

 "story-battle-heal-first-v1":Type.Optional(Type.Boolean()),
 "semantic-current-map-feedback-v1":Type.Optional(Type.Boolean()),
 "short-cycle-fixed-point-v1":Type.Optional(Type.Boolean()),
 "starter-decision-salience-v1":Type.Optional(Type.Boolean()),
 "observed-instructions-v1":Type.Optional(Type.Boolean()),
 ...Object.fromEntries(SWITCHABLE_FEATURES.filter(id=>id!=="destination-first-navigation-v1"&&id!=="neutral-yes-no-readout-v1"&&id!=="instruction-memory-cap-v1"&&id!=="instruction-memory-junk-filter-v1"&&id!=="refusal-ledger-bound-v1"&&id!=="disproved-beliefs-bound-v1"&&id!=="supervisor-briefing-bound-v1"&&id!=="compact-map-grid-v1"&&id!=="player-map-visibility-v1"&&id!=="pokenav-call-auto-advance-v1"&&id!=="gateway-current-turn-v1"&&id!=="self-named-speaker-v1"&&id!=="story-briefing-native-milestones-v1"&&id!=="retire-reached-story-line-v1"&&id!=="gateway-tool-schemas-v1"&&id!=="gateway-schema-hint-v1"&&id!=="type-gap-team-last-message-v1"&&id!=="map-observability-v1"&&id!=="type-gap-team-v1"&&id!=="supplies-v1"&&id!=="untalked-in-gym-v1"&&id!=="context-exact-count-v1"&&id!=="scene-journal-safe-capture-v1"&&id!=="instruction-memory-dedup-v1"&&id!=="no-story-foreknowledge-v1"&&id!=="grass-strides-v1"&&id!=="scene-followup-prompt-v1"&&id!=="pokenav-short-list-v1"&&id!=="menu-option-honest-refusal-v1"&&id!=="instruction-goal-advisory-v1"&&id!=="goal-review-repair-feedback-v1"&&id!=="cutscene-journal-v1"&&id!=="mauville-puzzle-readout-v1"&&id!=="caught-nickname-prompt-v2"&&id!=="moving-npc-target-v1"&&id!=="citation-evidence-v1"&&id!=="bag-ineffective-loop-v1"&&id!=="bag-press-feedback-v1"&&id!=="bag-pocket-truth-v1"&&id!=="menu-option-tool-v1"&&id!=="instruction-goal-ledger-v1"&&id!=="native-task-goal-retirement-v1"&&id!=="player-elevation-readout-v1"&&id!=="party-menu-message-v1"&&id!=="drought-progress-facts-v1"&&id!=="refusal-ledger-v1"&&id!=="whiteout-outcomes-v2"&&id!=="active-warp-exits-v1"&&id!=="available-exits-presentation-v1"&&id!=="interface-guidance-v1"&&id!=="trainer-observed-party-v1"&&id!=="blackout-transition-v1"&&id!=="restored-memory-run-v1"&&id!=="navigation-cycle-stop-v1"&&id!=="screen-center-player-v1"&&id!=="elevation-aware-map-v1"&&id!=="leader-loss-immediate-v1"&&id!=="battle-action-history-v1"&&id!=="leader-preparation-comparison-v1"&&id!=="roxanne-campaign-reminder-v1"&&id!=="campaign-progress-clock-v1"&&id!=="move-learn-offer-identity-v1"&&id!=="coherent-battle-observation-v1"&&id!=="map-cycle-recovery-v1"&&id!=="move-learn-goal-reminder-v1"&&id!=="random-starter-v1"&&id!=="turn-drought-clock-v1"&&id!=="rejected-movement-prefix-v1"&&id!=="away-note-buildings-v1"&&id!=="current-map-display-name-v1"&&id!=="window-escape-route-v1"&&id!=="auto-talk-field-only-v1"&&id!=="auto-talk-v3"&&id!=="untalked-people-header-v1"&&id!=="static-npc-template-approach-v1"&&id!=="owned-battle-context-v1"&&id!=="reachable-section-alternatives-v1"&&id!=="delivered-place-evidence-v1"&&id!=="boundary-crossing-facts-v1"&&id!=="npc-approach-feedback-v1"&&id!=="leader-loss-comparison-v1"&&id!=="rejected-movement-stride-v1"&&id!=="battle-move-learn-input-v1"&&id!=="explorer-family-guidance-v1"&&id!=="coherent-healing-feedback-v1"&&id!=="navigation-recovery-v1"&&id!=="milestone-drought-suppression-v1"&&id!=="milestone-instruction-memory-v1"&&id!=="trigger-navigation-boundary-v1"&&id!=="gym-evidence-v1"&&id!=="rejected-movement-step-v1"&&id!=="observed-field-dialogue-v1"&&id!=="birch-intro-pages-v1"&&id!=="story-goal-player-name-v1"&&id!=="cut-off-reply-feedback-v1"&&id!=="trainer-sight-check-v2"&&id!=="auto-talk-v2"&&id!=="map-wide-triggers-v1"&&id!=="drought-battle-heal-hold-v1"&&id!=="tool-prompt-docs-v1"&&id!=="field-ownership-feedback-v1"&&id!=="move-learn-loop-fingerprint-v1"&&id!=="stale-plan-fact-v1"&&id!=="post-battle-readout-v1"&&id!=="move-learn-tool-v1"&&id!=="move-learn-early-comparison-v1"&&id!=="poison-readout-v1"&&id!=="berry-readout-v1"&&id!=="shop-interface-v1"&&id!=="exp-next-level-v1"&&id!=="pokedex-own-v1"&&id!=="exp-earned-ledger-v1"&&id!=="leader-attempt-ledger-v1"&&id!=="seen-trainers-ledger-v1"&&id!=="party-coverage-v1"&&id!=="said-type-matches-v1"&&id!=="caught-dex-input-v1"&&id!=="mart-stock-readout-v1"&&id!=="menu-refusal-recovery-v1"&&id!=="menu-item-guidance-v1"&&id!=="factual-healing-guidance-v1"&&id!=="move-learn-settle-v1"&&id!=="move-learn-question-v1"&&id!=="move-learn-comparison-v1"&&id!=="effectiveness-heard-v1"&&id!=="game-said-goals-v1"&&id!=="pending-field-dialogue-v1"&&id!=="story-battle-heal-first-v1"&&id!=="short-cycle-fixed-point-v1"&&id!=="navigation-tool-use-guard-v1"&&id!=="semantic-current-map-feedback-v1"&&id!=="original-speed-pacing-v1"&&id!=="respawn-readout-v1"&&id!=="semantic-navigation-v2"&&id!=="starter-decision-salience-v1"&&id!=="observed-instructions-v1"&&id!=="ineffective-navigation-v2"&&id!=="supervisor-briefing-v2"&&id!=="reachable-story-guidance-v1"&&id!=="text-only-supervisor-v2"&&id!=="safe-navigation-strides-v1"&&id!=="scripted-place-guidance-v1"&&id!=="trigger-script-loop-v1"&&id!=="cache-aligned-window-v1"&&id!=="jit-guide-reuse-v1"&&id!=="save-state-task-truth-v1"&&id!=="navigation-evidence-memory-v1"&&id!=="pushback-loop-detection-v1"&&id!=="pushback-press-result-v1"&&id!=="battle-observation-loop-v1"&&id!=="in-game-naming-readout-v1"&&id!=="no-nickname-guidance-v1"&&id!=="battle-message-waiting-v1"&&id!=="connection-edge-tiles-v1"&&id!=="explorer-guidance-v1"&&id!=="automatic-running-v1"&&id!=="expanded-menu-battle-information-v1"&&id!=="field-dialogue-phase-v1"&&id!=="dialogue-safe-batches-v1"&&id!=="interaction-loop-detection-v1"&&id!=="state-only-decisions-v1"&&id!=="named-interactions-v1"&&id!=="world-destinations-v1"&&id!=="bounded-navigation-v1"&&id!=="ledge-hops-v1"&&id!=="one-way-tiles-v1"&&id!=="full-map-navigation-v1"&&id!=="grass-cost-navigation-v1"&&id!=="counter-talk-v1"&&id!=="walkable-floor-v1"&&id!=="elevation-transitions-v1"&&id!=="game-evidence-priority-v1"&&id!=="dialogue-log-v1"&&id!=="loop-guard-supervisor-v1"&&id!=="instruction-ledger-v1"&&id!=="next-milestone-hint-v1"&&id!=="double-context-window-v1"&&id!=="fresh-retry-v1"&&id!=="named-warp-destinations-v1"&&id!=="milestone-stall-stop-v1"&&id!=="text-only-supervisor-v1"&&id!=="character-presence-v1"&&id!=="navigation-refusal-reasons-v1"&&id!=="transition-press-result-v1"&&id!=="stall-briefing-v1"&&id!=="battle-details-v2"&&id!=="dialogue-auto-advance-v1"&&id!=="warp-arrival-settle-v1"&&id!=="dialogue-context-kept-v1"&&id!=="displayed-place-names-v1"&&id!=="transition-loop-detection-v1"&&id!=="blocked-batch-result-v1"&&id!=="adjacent-tiles-v1"&&id!=="script-line-presence-v1"&&id!=="offscreen-objects-v1"&&id!=="navigate-first-prompt-v1"&&id!=="presence-penalty-v1"&&id!=="levelup-box-v1"&&id!=="disproved-beliefs-v1"&&id!=="same-plan-breaker-v1"&&id!=="navigation-truth-v1"&&id!=="navigation-refusal-reasons-v2"&&id!=="low-hp-trainer-warning-v2"&&id!=="battle-triage-guidance-v1"&&id!=="readout-rules-in-prompt-v1"&&id!=="battle-text-auto-advance-v1"&&id!=="briefing-exits-v1"&&id!=="untaken-exits-v1"&&id!=="people-ledger-v1"&&id!=="trainer-heal-guidance-v1"&&id!=="low-hp-trainer-warning-v1"&&id!=="briefing-battle-outcomes-v1"&&id!=="blocked-exit-fact-v1"&&id!=="battle-loss-recap-v1"&&id!=="transition-coherence-v1"&&id!=="readout-truth-v1"&&id!=="birch-speech-pages-v1"&&id!=="blackout-readout-v1"&&id!=="open-goal-prompt-v1"&&id!=="surf-gated-exits-v1"&&id!=="story-destinations-v1"&&id!=="exit-reachability-v1"&&id!=="cross-map-goal-v1"&&id!=="explorer-guidance-v2"&&id!=="ineffective-loops-v1"&&id!=="people-id-cards-v1"&&id!=="heal-before-trainers-v1"&&id!=="harness-trust-v1"&&id!=="cited-destination-v1"&&id!=="harness-trust-v2"&&id!=="tutorial-party-owner-v1"&&id!=="mid-frame-readout-v1"&&id!=="unset-dynamic-warp-v1"&&id!=="status-names-v1"&&id!=="surf-gated-exits-v2"&&id!=="instruction-ledger-v2"&&id!=="no-exit-here-v1"&&id!=="bag-healing-items-v1"&&id!=="battle-menu-loop-v1"&&id!=="clock-view-loop-v1"&&id!=="stale-story-goal-v1"&&id!=="input-cuts-v1"&&id!=="loop-guard-screen-v1"&&id!=="reopened-dialogue-loop-v1"&&id!=="dialog-button-b-v1"&&id!=="just-in-time-prompt-v2"&&id!=="faced-interaction-history-v1"&&id!=="battle-decision-ready-v1"&&id!=="deterministic-warp-navigation-v1").map(id=>[id,Type.Boolean()])) as Record<Exclude<(typeof SWITCHABLE_FEATURES)[number],"destination-first-navigation-v1"|"player-map-visibility-v1"|"pokenav-call-auto-advance-v1"|"neutral-yes-no-readout-v1"|"instruction-memory-cap-v1"|"instruction-memory-junk-filter-v1"|"refusal-ledger-bound-v1"|"disproved-beliefs-bound-v1"|"supervisor-briefing-bound-v1"|"compact-map-grid-v1"|"gateway-current-turn-v1"|"self-named-speaker-v1"|"story-briefing-native-milestones-v1"|"retire-reached-story-line-v1"|"type-gap-team-last-message-v1"|"gateway-tool-schemas-v1"|"gateway-schema-hint-v1"|"map-observability-v1"|"type-gap-team-v1"|"supplies-v1"|"untalked-in-gym-v1"|"context-exact-count-v1"|"instruction-memory-dedup-v1"|"scene-journal-safe-capture-v1"|"no-story-foreknowledge-v1"|"grass-strides-v1"|"scene-followup-prompt-v1"|"pokenav-short-list-v1"|"menu-option-honest-refusal-v1"|"instruction-goal-advisory-v1"|"goal-review-repair-feedback-v1"|"mauville-puzzle-readout-v1"|"cutscene-journal-v1"|"caught-nickname-prompt-v2"|"moving-npc-target-v1"|"citation-evidence-v1"|"bag-ineffective-loop-v1"|"bag-press-feedback-v1"|"bag-pocket-truth-v1"|"menu-option-tool-v1"|"instruction-goal-ledger-v1"|"native-task-goal-retirement-v1"|"player-elevation-readout-v1"|"party-menu-message-v1"|"drought-progress-facts-v1"|"refusal-ledger-v1"|"whiteout-outcomes-v2"|"active-warp-exits-v1"|"available-exits-presentation-v1"|"interface-guidance-v1"|"trainer-observed-party-v1"|"blackout-transition-v1"|"restored-memory-run-v1"|"navigation-cycle-stop-v1"|"screen-center-player-v1"|"elevation-aware-map-v1"|"leader-loss-immediate-v1"|"battle-action-history-v1"|"leader-preparation-comparison-v1"|"campaign-progress-clock-v1"|"move-learn-offer-identity-v1"|"roxanne-campaign-reminder-v1"|"move-learn-goal-reminder-v1"|"coherent-battle-observation-v1"|"map-cycle-recovery-v1"|"random-starter-v1"|"turn-drought-clock-v1"|"rejected-movement-prefix-v1"|"away-note-buildings-v1"|"current-map-display-name-v1"|"window-escape-route-v1"|"auto-talk-field-only-v1"|"auto-talk-v3"|"untalked-people-header-v1"|"static-npc-template-approach-v1"|"owned-battle-context-v1"|"reachable-section-alternatives-v1"|"delivered-place-evidence-v1"|"boundary-crossing-facts-v1"|"npc-approach-feedback-v1"|"leader-loss-comparison-v1"|"rejected-movement-stride-v1"|"battle-move-learn-input-v1"|"explorer-family-guidance-v1"|"coherent-healing-feedback-v1"|"milestone-drought-suppression-v1"|"milestone-instruction-memory-v1"|"trigger-navigation-boundary-v1"|"gym-evidence-v1"|"rejected-movement-step-v1"|"observed-field-dialogue-v1"|"birch-intro-pages-v1"|"story-goal-player-name-v1"|"cut-off-reply-feedback-v1"|"trainer-sight-check-v2"|"auto-talk-v2"|"map-wide-triggers-v1"|"drought-battle-heal-hold-v1"|"tool-prompt-docs-v1"|"field-ownership-feedback-v1"|"move-learn-loop-fingerprint-v1"|"stale-plan-fact-v1"|"post-battle-readout-v1"|"move-learn-tool-v1"|"move-learn-early-comparison-v1"|"poison-readout-v1"|"berry-readout-v1"|"shop-interface-v1"|"exp-next-level-v1"|"pokedex-own-v1"|"exp-earned-ledger-v1"|"leader-attempt-ledger-v1"|"seen-trainers-ledger-v1"|"party-coverage-v1"|"said-type-matches-v1"|"mart-stock-readout-v1"|"menu-refusal-recovery-v1"|"menu-item-guidance-v1"|"factual-healing-guidance-v1"|"move-learn-settle-v1"|"move-learn-question-v1"|"move-learn-comparison-v1"|"effectiveness-heard-v1"|"game-said-goals-v1"|"pending-field-dialogue-v1"|"story-battle-heal-first-v1"|"short-cycle-fixed-point-v1"|"navigation-tool-use-guard-v1"|"semantic-current-map-feedback-v1"|"starter-decision-salience-v1"|"observed-instructions-v1"|"scripted-place-guidance-v1"|"trigger-script-loop-v1"|"cache-aligned-window-v1"|"jit-guide-reuse-v1"|"save-state-task-truth-v1"|"navigation-evidence-memory-v1"|"explorer-guidance-v1"|"automatic-running-v1"|"expanded-menu-battle-information-v1"|"field-dialogue-phase-v1"|"dialogue-safe-batches-v1"|"interaction-loop-detection-v1"|"state-only-decisions-v1"|"named-interactions-v1"|"world-destinations-v1"|"bounded-navigation-v1"|"ledge-hops-v1"|"one-way-tiles-v1"|"full-map-navigation-v1"|"grass-cost-navigation-v1"|"counter-talk-v1"|"walkable-floor-v1"|"elevation-transitions-v1"|"game-evidence-priority-v1"|"dialogue-log-v1"|"loop-guard-supervisor-v1"|"instruction-ledger-v1"|"next-milestone-hint-v1"|"double-context-window-v1"|"fresh-retry-v1"|"named-warp-destinations-v1"|"milestone-stall-stop-v1"|"text-only-supervisor-v1"|"character-presence-v1"|"navigation-refusal-reasons-v1"|"transition-press-result-v1"|"stall-briefing-v1"|"battle-details-v2"|"dialogue-auto-advance-v1"|"warp-arrival-settle-v1"|"dialogue-context-kept-v1"|"displayed-place-names-v1"|"transition-loop-detection-v1"|"blocked-batch-result-v1"|"adjacent-tiles-v1"|"readout-rules-in-prompt-v1"|"connection-edge-tiles-v1"|"in-game-naming-readout-v1"|"no-nickname-guidance-v1"|"battle-text-auto-advance-v1"|"battle-message-waiting-v1"|"script-line-presence-v1"|"briefing-exits-v1"|"untaken-exits-v1"|"people-ledger-v1"|"trainer-heal-guidance-v1"|"low-hp-trainer-warning-v1"|"briefing-battle-outcomes-v1"|"blocked-exit-fact-v1"|"battle-loss-recap-v1"|"transition-coherence-v1"|"readout-truth-v1"|"birch-speech-pages-v1"|"blackout-readout-v1"|"surf-gated-exits-v1"|"story-destinations-v1"|"exit-reachability-v1"|"cross-map-goal-v1"|"explorer-guidance-v2"|"ineffective-loops-v1"|"people-id-cards-v1"|"open-goal-prompt-v1"|"heal-before-trainers-v1"|"harness-trust-v1"|"cited-destination-v1"|"harness-trust-v2"|"tutorial-party-owner-v1"|"mid-frame-readout-v1"|"unset-dynamic-warp-v1"|"status-names-v1"|"surf-gated-exits-v2"|"instruction-ledger-v2"|"no-exit-here-v1"|"bag-healing-items-v1"|"battle-menu-loop-v1"|"clock-view-loop-v1"|"stale-story-goal-v1"|"input-cuts-v1"|"reopened-dialogue-loop-v1"|"dialog-button-b-v1"|"just-in-time-prompt-v1"|"just-in-time-prompt-v2"|"faced-interaction-history-v1"|"battle-decision-ready-v1"|"deterministic-warp-navigation-v1"|"ineffective-navigation-v2"|"supervisor-briefing-v2"|"reachable-story-guidance-v1"|"text-only-supervisor-v2" >,ReturnType<typeof Type.Boolean>>,
 "navigation-evidence-memory-v1":Type.Optional(Type.Boolean()),
 "field-dialogue-phase-v1":Type.Optional(Type.Boolean()),
 "dialogue-safe-batches-v1":Type.Optional(Type.Boolean()),
 "interaction-loop-detection-v1":Type.Optional(Type.Boolean()),
 "automatic-running-v1":Type.Optional(Type.Boolean()),
 "expanded-menu-battle-information-v1":Type.Optional(Type.Boolean()),
 "state-only-decisions-v1":Type.Optional(Type.Boolean()),
 "named-interactions-v1":Type.Optional(Type.Boolean()),
 "world-destinations-v1":Type.Optional(Type.Boolean()),
 "bounded-navigation-v1":Type.Optional(Type.Boolean()),
 "ledge-hops-v1":Type.Optional(Type.Boolean()),
 "one-way-tiles-v1":Type.Optional(Type.Boolean()),
 "counter-talk-v1":Type.Optional(Type.Boolean()),
 "walkable-floor-v1":Type.Optional(Type.Boolean()),
 "full-map-navigation-v1":Type.Optional(Type.Boolean()),
 "grass-cost-navigation-v1":Type.Optional(Type.Boolean()),
 // Omitted means ON: presets written before the switch ran the game elevation rule.
 "elevation-transitions-v1":Type.Optional(Type.Boolean()),
 "game-evidence-priority-v1":Type.Optional(Type.Boolean()),
 "dialogue-log-v1":Type.Optional(Type.Boolean()),
 "loop-guard-supervisor-v1":Type.Optional(Type.Boolean()),
 "instruction-ledger-v1":Type.Optional(Type.Boolean()),
 "next-milestone-hint-v1":Type.Optional(Type.Boolean()),
 "double-context-window-v1":Type.Optional(Type.Boolean()),
 "fresh-retry-v1":Type.Optional(Type.Boolean()),
 "named-warp-destinations-v1":Type.Optional(Type.Boolean()),
 "milestone-stall-stop-v1":Type.Optional(Type.Boolean()),
 "text-only-supervisor-v1":Type.Optional(Type.Boolean()),
 "character-presence-v1":Type.Optional(Type.Boolean()),
 "navigation-refusal-reasons-v1":Type.Optional(Type.Boolean()),
 "transition-press-result-v1":Type.Optional(Type.Boolean()),
 "stall-briefing-v1":Type.Optional(Type.Boolean()),
 "battle-details-v2":Type.Optional(Type.Boolean()),
 "dialogue-auto-advance-v1":Type.Optional(Type.Boolean()),
 "warp-arrival-settle-v1":Type.Optional(Type.Boolean()),
 "dialogue-context-kept-v1":Type.Optional(Type.Boolean()),
 "displayed-place-names-v1":Type.Optional(Type.Boolean()),
 "transition-loop-detection-v1":Type.Optional(Type.Boolean()),
 "blocked-batch-result-v1":Type.Optional(Type.Boolean()),
 "explorer-guidance-v1":Type.Optional(Type.Boolean()),
 "battle-triage-guidance-v1":Type.Optional(Type.Boolean()),
 "adjacent-tiles-v1":Type.Optional(Type.Boolean()),
 "readout-rules-in-prompt-v1":Type.Optional(Type.Boolean()),
 "connection-edge-tiles-v1":Type.Optional(Type.Boolean()),
 "in-game-naming-readout-v1":Type.Optional(Type.Boolean()),
 "no-nickname-guidance-v1":Type.Optional(Type.Boolean()),
 "battle-text-auto-advance-v1":Type.Optional(Type.Boolean()),
 "briefing-exits-v1":Type.Optional(Type.Boolean()),
 "untaken-exits-v1":Type.Optional(Type.Boolean()),
 "people-ledger-v1":Type.Optional(Type.Boolean()),
 "trainer-heal-guidance-v1":Type.Optional(Type.Boolean()),
 "low-hp-trainer-warning-v1":Type.Optional(Type.Boolean()),
 "battle-message-waiting-v1":Type.Optional(Type.Boolean()),
 "script-line-presence-v1":Type.Optional(Type.Boolean()),
 "offscreen-objects-v1":Type.Optional(Type.Boolean()),
 "navigate-first-prompt-v1":Type.Optional(Type.Boolean()),
 "presence-penalty-v1":Type.Optional(Type.Boolean()),
 "disproved-beliefs-v1":Type.Optional(Type.Boolean()),
 "same-plan-breaker-v1":Type.Optional(Type.Boolean()),
 "levelup-box-v1":Type.Optional(Type.Boolean()),
 "briefing-battle-outcomes-v1":Type.Optional(Type.Boolean()),
 "blocked-exit-fact-v1":Type.Optional(Type.Boolean()),
 "battle-loss-recap-v1":Type.Optional(Type.Boolean()),
 "pushback-loop-detection-v1":Type.Optional(Type.Boolean()),
 "pushback-press-result-v1":Type.Optional(Type.Boolean()),
 "battle-observation-loop-v1":Type.Optional(Type.Boolean()),
 "transition-coherence-v1":Type.Optional(Type.Boolean()),
 "readout-truth-v1":Type.Optional(Type.Boolean()),
 "birch-speech-pages-v1":Type.Optional(Type.Boolean()),
 "blackout-readout-v1":Type.Optional(Type.Boolean()),
 "open-goal-prompt-v1":Type.Optional(Type.Boolean()),
 "surf-gated-exits-v1":Type.Optional(Type.Boolean()),
 "story-destinations-v1":Type.Optional(Type.Boolean()),
 "exit-reachability-v1":Type.Optional(Type.Boolean()),
 "heal-before-trainers-v1":Type.Optional(Type.Boolean()),
 "harness-trust-v1":Type.Optional(Type.Boolean()),
 "cited-destination-v1":Type.Optional(Type.Boolean()),
 "harness-trust-v2":Type.Optional(Type.Boolean()),
 "battle-move-tool-v1":Type.Optional(Type.Boolean()),
 "tutorial-party-owner-v1":Type.Optional(Type.Boolean()),
 "mid-frame-readout-v1":Type.Optional(Type.Boolean()),
 "unset-dynamic-warp-v1":Type.Optional(Type.Boolean()),
 "status-names-v1":Type.Optional(Type.Boolean()),
 "surf-gated-exits-v2":Type.Optional(Type.Boolean()),
 "instruction-ledger-v2":Type.Optional(Type.Boolean()),
 "no-exit-here-v1":Type.Optional(Type.Boolean()),
 "bag-healing-items-v1":Type.Optional(Type.Boolean()),
 "battle-menu-loop-v1":Type.Optional(Type.Boolean()),
 "clock-view-loop-v1":Type.Optional(Type.Boolean()),
 "stale-story-goal-v1":Type.Optional(Type.Boolean()),
 "input-cuts-v1":Type.Optional(Type.Boolean()),
 "loop-guard-screen-v1":Type.Optional(Type.Boolean()),
 "reopened-dialogue-loop-v1":Type.Optional(Type.Boolean()),
 "dialog-button-b-v1":Type.Optional(Type.Boolean()),
 "just-in-time-prompt-v1":Type.Optional(Type.Boolean()),
 "just-in-time-prompt-v2":Type.Optional(Type.Boolean()),
 "faced-interaction-history-v1":Type.Optional(Type.Boolean()),
 "save-state-task-truth-v1":Type.Optional(Type.Boolean()),
 "scripted-place-guidance-v1":Type.Optional(Type.Boolean()),
 "trigger-script-loop-v1":Type.Optional(Type.Boolean()),
 "cache-aligned-window-v1":Type.Optional(Type.Boolean()),
 "jit-guide-reuse-v1":Type.Optional(Type.Boolean()),
 "visited-terrain-navigation-v1":Type.Optional(Type.Boolean()),
 "battle-effective-damage-v1":Type.Optional(Type.Boolean()),
 "deterministic-warp-navigation-v1":Type.Optional(Type.Boolean()),
 "safe-navigation-strides-v1":Type.Optional(Type.Boolean()),
 "evolution-decision-v1":Type.Optional(Type.Boolean()),
 "battle-refusal-loop-v1":Type.Optional(Type.Boolean()),
 "battle-decision-ready-v1":Type.Optional(Type.Boolean()),
 "cross-map-goal-v1":Type.Optional(Type.Boolean()),
 "explorer-guidance-v2":Type.Optional(Type.Boolean()),
 "navigation-truth-v1":Type.Optional(Type.Boolean()),
 "navigation-refusal-reasons-v2":Type.Optional(Type.Boolean()),
 "ineffective-loops-v1":Type.Optional(Type.Boolean()),
 "people-id-cards-v1":Type.Optional(Type.Boolean()),
 "low-hp-trainer-warning-v2":Type.Optional(Type.Boolean()),
 "stale-story-goal-v2":Type.Optional(Type.Boolean()),
 "ineffective-navigation-v2":Type.Optional(Type.Boolean()),
 "supervisor-briefing-v2":Type.Optional(Type.Boolean()),
 "reachable-story-guidance-v1":Type.Optional(Type.Boolean()),
 "text-only-supervisor-v2":Type.Optional(Type.Boolean()),
 "context-token-budget-v1":Type.Optional(Type.Boolean()),
 "briefing-repeat-count-v1":Type.Optional(Type.Boolean()),
 "navigate-already-here-v1":Type.Optional(Type.Boolean()),
 "fixed-point-breaker-v1":Type.Optional(Type.Boolean()),
 "story-character-stall-gate-v1":Type.Optional(Type.Boolean()),
 "positive-supervisor-v1":Type.Optional(Type.Boolean()),
 "auto-talk-v1":Type.Optional(Type.Boolean()),
 "duplicate-turn-collapse-v1":Type.Optional(Type.Boolean()),
 "unfinished-activity-v1":Type.Optional(Type.Boolean()),
 "exit-labels-v2":Type.Optional(Type.Boolean()),"heal-before-trainers-v2":Type.Optional(Type.Boolean()),
 "gym-heal-warning-v1":Type.Optional(Type.Boolean()),
 "respawn-readout-v1":Type.Optional(Type.Boolean()),
 "trainer-sight-check-v1":Type.Optional(Type.Boolean()),
 "caught-nickname-prompt-v1":Type.Optional(Type.Boolean()),
 "fail-open-input-v1":Type.Optional(Type.Boolean()),
 "party-item-confirmation-v1":Type.Optional(Type.Boolean()),
 "navigation-recovery-v1":Type.Optional(Type.Boolean()),
 "menu-refusal-recovery-v1":Type.Optional(Type.Boolean()),
 "progress-aware-cycles-v1":Type.Optional(Type.Boolean()),
 "gym-door-label-v1":Type.Optional(Type.Boolean()),
 "mart-stock-readout-v1":Type.Optional(Type.Boolean()),
 "caught-dex-input-v1":Type.Optional(Type.Boolean()),
 "exp-next-level-v1":Type.Optional(Type.Boolean()),
 "pokedex-own-v1":Type.Optional(Type.Boolean()),
 "exp-earned-ledger-v1":Type.Optional(Type.Boolean()),
 "leader-attempt-ledger-v1":Type.Optional(Type.Boolean()),
 "seen-trainers-ledger-v1":Type.Optional(Type.Boolean()),
 "party-coverage-v1":Type.Optional(Type.Boolean()),
 "said-type-matches-v1":Type.Optional(Type.Boolean()),
 "shop-interface-v1":Type.Optional(Type.Boolean()),
 "pending-field-dialogue-v1":Type.Optional(Type.Boolean()),
 "menu-item-guidance-v1":Type.Optional(Type.Boolean()),
 "factual-healing-guidance-v1":Type.Optional(Type.Boolean()),
 "whiteout-healed-v1":Type.Optional(Type.Boolean()),
 "gym-readiness-readout-v1":Type.Optional(Type.Boolean()),
 "same-target-no-progress-v1":Type.Optional(Type.Boolean()),
 "story-progress-clock-v1":Type.Optional(Type.Boolean()),
 "yes-no-answer-readout-v1":Type.Optional(Type.Boolean()),
 "field-move-gates-v1":Type.Optional(Type.Boolean()),
 "story-battle-heal-gate-v1":Type.Optional(Type.Boolean()),
 "exit-labels-v3":Type.Optional(Type.Boolean()),
 "navigation-refusal-reasons-v3":Type.Optional(Type.Boolean()),
 "original-speed-pacing-v1":Type.Optional(Type.Boolean()),
 "semantic-navigation-v2":Type.Optional(Type.Boolean()),
 "semantic-navigation-v1":Type.Optional(Type.Boolean()),
 "deterministic-exploration-v1":Type.Optional(Type.Boolean()),
},closed);
export function normalizeFeatures(features0:Static<typeof FeatureSetSchema>):FeatureSet {
 const features={...features0,"destination-first-navigation-v1":features0["destination-first-navigation-v1"]??false,"player-map-visibility-v1":features0["player-map-visibility-v1"]??false,"pokenav-call-auto-advance-v1":features0["pokenav-call-auto-advance-v1"]??false,"neutral-yes-no-readout-v1":features0["neutral-yes-no-readout-v1"]??false,"instruction-memory-cap-v1":features0["instruction-memory-cap-v1"]??false,"instruction-memory-junk-filter-v1":features0["instruction-memory-junk-filter-v1"]??false,"refusal-ledger-bound-v1":features0["refusal-ledger-bound-v1"]??false,"disproved-beliefs-bound-v1":features0["disproved-beliefs-bound-v1"]??false,"supervisor-briefing-bound-v1":features0["supervisor-briefing-bound-v1"]??false,"compact-map-grid-v1":features0["compact-map-grid-v1"]??false,"scene-journal-safe-capture-v1":features0["scene-journal-safe-capture-v1"]??false,"self-named-speaker-v1":features0["self-named-speaker-v1"]??false,"story-briefing-native-milestones-v1":features0["story-briefing-native-milestones-v1"]??false,"retire-reached-story-line-v1":features0["retire-reached-story-line-v1"]??false,"gateway-current-turn-v1":features0["gateway-current-turn-v1"]??false,"gateway-tool-schemas-v1":features0["gateway-tool-schemas-v1"]??false,"gateway-schema-hint-v1":features0["gateway-schema-hint-v1"]??false,"type-gap-team-last-message-v1":features0["type-gap-team-last-message-v1"]??false,"map-observability-v1":features0["map-observability-v1"]??true,"type-gap-team-v1":features0["type-gap-team-v1"]??false,"supplies-v1":features0["supplies-v1"]??false,"untalked-in-gym-v1":features0["untalked-in-gym-v1"]??false,"context-exact-count-v1":features0["context-exact-count-v1"]??false,"no-story-foreknowledge-v1":features0["no-story-foreknowledge-v1"]??false,"instruction-memory-dedup-v1":features0["instruction-memory-dedup-v1"]??false,"grass-strides-v1":features0["grass-strides-v1"]??false,"scene-followup-prompt-v1":features0["scene-followup-prompt-v1"]??false,"pokenav-short-list-v1":features0["pokenav-short-list-v1"]??false,"menu-option-honest-refusal-v1":features0["menu-option-honest-refusal-v1"]??false,"instruction-goal-advisory-v1":features0["instruction-goal-advisory-v1"]??false,"goal-review-repair-feedback-v1":features0["goal-review-repair-feedback-v1"]??false,"cutscene-journal-v1":features0["cutscene-journal-v1"]??false,"mauville-puzzle-readout-v1":features0["mauville-puzzle-readout-v1"]??true,"caught-nickname-prompt-v2":features0["caught-nickname-prompt-v2"]??false,"moving-npc-target-v1":features0["moving-npc-target-v1"]??false,"citation-evidence-v1":features0["citation-evidence-v1"]??false,"bag-ineffective-loop-v1":features0["bag-ineffective-loop-v1"]??false,"bag-press-feedback-v1":features0["bag-press-feedback-v1"]??false,"bag-pocket-truth-v1":features0["bag-pocket-truth-v1"]??false,"menu-option-tool-v1":features0["menu-option-tool-v1"]??false,"instruction-goal-ledger-v1":features0["instruction-goal-ledger-v1"]??false,"native-task-goal-retirement-v1":features0["native-task-goal-retirement-v1"]??false,"player-elevation-readout-v1":features0["player-elevation-readout-v1"]??false,"party-menu-message-v1":features0["party-menu-message-v1"]??false,"drought-progress-facts-v1":features0["drought-progress-facts-v1"]??false,"refusal-ledger-v1":features0["refusal-ledger-v1"]??false,"whiteout-outcomes-v2":features0["whiteout-outcomes-v2"]??false,"active-warp-exits-v1":features0["active-warp-exits-v1"]??false,"available-exits-presentation-v1":features0["available-exits-presentation-v1"]??false,"interface-guidance-v1":features0["interface-guidance-v1"]??false,"trainer-observed-party-v1":features0["trainer-observed-party-v1"]??false,"blackout-transition-v1":features0["blackout-transition-v1"]??false,"restored-memory-run-v1":features0["restored-memory-run-v1"]??false,"navigation-cycle-stop-v1":features0["navigation-cycle-stop-v1"]??false,"elevation-aware-map-v1":features0["elevation-aware-map-v1"]??false,"screen-center-player-v1":features0["screen-center-player-v1"]??false,"leader-loss-immediate-v1":features0["leader-loss-immediate-v1"]??false,"battle-action-history-v1":features0["battle-action-history-v1"]??false,"leader-preparation-comparison-v1":features0["leader-preparation-comparison-v1"]??false,"campaign-progress-clock-v1":features0["campaign-progress-clock-v1"]??false,"move-learn-offer-identity-v1":features0["move-learn-offer-identity-v1"]??false,"roxanne-campaign-reminder-v1":features0["roxanne-campaign-reminder-v1"]??false,"move-learn-goal-reminder-v1":features0["move-learn-goal-reminder-v1"]??false,"coherent-battle-observation-v1":features0["coherent-battle-observation-v1"]??false,"map-cycle-recovery-v1":features0["map-cycle-recovery-v1"]??false,"random-starter-v1":features0["random-starter-v1"]??false,"turn-drought-clock-v1":features0["turn-drought-clock-v1"]??false,"static-npc-template-approach-v1":features0["static-npc-template-approach-v1"]??false,"owned-battle-context-v1":features0["owned-battle-context-v1"]??false,"reachable-section-alternatives-v1":features0["reachable-section-alternatives-v1"]??false,"delivered-place-evidence-v1":features0["delivered-place-evidence-v1"]??false,"boundary-crossing-facts-v1":features0["boundary-crossing-facts-v1"]??false,"npc-approach-feedback-v1":features0["npc-approach-feedback-v1"]??false,"leader-loss-comparison-v1":features0["leader-loss-comparison-v1"]??false,"rejected-movement-stride-v1":features0["rejected-movement-stride-v1"]??false,"battle-move-learn-input-v1":features0["battle-move-learn-input-v1"]??false,"navigation-recovery-v1":features0["navigation-recovery-v1"]??false,"milestone-drought-suppression-v1":features0["milestone-drought-suppression-v1"]??false,"milestone-instruction-memory-v1":features0["milestone-instruction-memory-v1"]??false,"trigger-navigation-boundary-v1":features0["trigger-navigation-boundary-v1"]??false,"gym-evidence-v1":features0["gym-evidence-v1"]??false,"rejected-movement-step-v1":features0["rejected-movement-step-v1"]??false,"observed-field-dialogue-v1":features0["observed-field-dialogue-v1"]??false,"birch-intro-pages-v1":features0["birch-intro-pages-v1"]??false,"story-goal-player-name-v1":features0["story-goal-player-name-v1"]??false,"cut-off-reply-feedback-v1":features0["cut-off-reply-feedback-v1"]??false,"trainer-sight-check-v2":features0["trainer-sight-check-v2"]??false,"auto-talk-v2":features0["auto-talk-v2"]??false,"rejected-movement-prefix-v1":features0["rejected-movement-prefix-v1"]??false,"away-note-buildings-v1":features0["away-note-buildings-v1"]??false,"current-map-display-name-v1":features0["current-map-display-name-v1"]??false,"window-escape-route-v1":features0["window-escape-route-v1"]??false,"auto-talk-field-only-v1":features0["auto-talk-field-only-v1"]??false,"auto-talk-v3":features0["auto-talk-v3"]??false,"untalked-people-header-v1":features0["untalked-people-header-v1"]??false,"map-wide-triggers-v1":features0["map-wide-triggers-v1"]??false,"drought-battle-heal-hold-v1":features0["drought-battle-heal-hold-v1"]??false,"tool-prompt-docs-v1":features0["tool-prompt-docs-v1"]??false,"field-ownership-feedback-v1":features0["field-ownership-feedback-v1"]??false,"move-learn-loop-fingerprint-v1":features0["move-learn-loop-fingerprint-v1"]??false,"stale-plan-fact-v1":features0["stale-plan-fact-v1"]??false,"post-battle-readout-v1":features0["post-battle-readout-v1"]??false,"move-learn-tool-v1":features0["move-learn-tool-v1"]??false,"move-learn-early-comparison-v1":features0["move-learn-early-comparison-v1"]??false,"shop-interface-v1":features0["shop-interface-v1"]??false,"progress-aware-cycles-v1":features0["progress-aware-cycles-v1"]??false,"exp-next-level-v1":features0["exp-next-level-v1"]??false,"pokedex-own-v1":features0["pokedex-own-v1"]??false,"exp-earned-ledger-v1":features0["exp-earned-ledger-v1"]??false,"leader-attempt-ledger-v1":features0["leader-attempt-ledger-v1"]??false,"seen-trainers-ledger-v1":features0["seen-trainers-ledger-v1"]??false,"party-coverage-v1":features0["party-coverage-v1"]??false,"said-type-matches-v1":features0["said-type-matches-v1"]??false,"caught-dex-input-v1":features0["caught-dex-input-v1"]??false,"gym-door-label-v1":features0["gym-door-label-v1"]??false,"mart-stock-readout-v1":features0["mart-stock-readout-v1"]??false,"menu-refusal-recovery-v1":features0["menu-refusal-recovery-v1"]??false,"menu-item-guidance-v1":features0["menu-item-guidance-v1"]??false,"explorer-family-guidance-v1":features0["explorer-family-guidance-v1"]??false,"coherent-healing-feedback-v1":features0["coherent-healing-feedback-v1"]??false,"factual-healing-guidance-v1":features0["factual-healing-guidance-v1"]??false,"move-learn-settle-v1":features0["move-learn-settle-v1"]??false,"move-learn-question-v1":features0["move-learn-question-v1"]??false,"move-learn-comparison-v1":features0["move-learn-comparison-v1"]??false,"effectiveness-heard-v1":features0["effectiveness-heard-v1"]??false,"game-said-goals-v1":features0["game-said-goals-v1"]??false,"pending-field-dialogue-v1":features0["pending-field-dialogue-v1"]??false,"story-battle-heal-first-v1":features0["story-battle-heal-first-v1"]??false,"navigation-tool-use-guard-v1":features0["navigation-tool-use-guard-v1"]??false,"semantic-current-map-feedback-v1":features0["semantic-current-map-feedback-v1"]??false,"short-cycle-fixed-point-v1":features0["short-cycle-fixed-point-v1"]??false,"navigation-refusal-reasons-v3":features0["navigation-refusal-reasons-v3"]??false,"exit-labels-v3":features0["exit-labels-v3"]??false,"yes-no-answer-readout-v1":features0["yes-no-answer-readout-v1"]??false,"story-battle-heal-gate-v1":features0["story-battle-heal-gate-v1"]??false,"party-item-confirmation-v1":features0["party-item-confirmation-v1"]??false,"semantic-navigation-v1":features0["semantic-navigation-v1"]??false,"semantic-navigation-v2":features0["semantic-navigation-v2"]??false,"deterministic-exploration-v1":features0["deterministic-exploration-v1"]??false,"original-speed-pacing-v1":features0["original-speed-pacing-v1"]??false,"evolution-decision-v1":features0["evolution-decision-v1"]??false,"observed-instructions-v1":features0["observed-instructions-v1"]??false,"starter-decision-salience-v1":features0["starter-decision-salience-v1"]??false,"safe-navigation-strides-v1":features0["safe-navigation-strides-v1"]??false,"ineffective-navigation-v2":features0["ineffective-navigation-v2"]??false,"supervisor-briefing-v2":features0["supervisor-briefing-v2"]??false,"reachable-story-guidance-v1":features0["reachable-story-guidance-v1"]??false,"text-only-supervisor-v2":features0["text-only-supervisor-v2"]??false,"battle-decision-ready-v1":features0["battle-decision-ready-v1"]??false,"battle-refusal-loop-v1":features0["battle-refusal-loop-v1"]??false,"visited-terrain-navigation-v1":features0["visited-terrain-navigation-v1"]??false,"battle-effective-damage-v1":features0["battle-effective-damage-v1"]??false,"deterministic-warp-navigation-v1":features0["deterministic-warp-navigation-v1"]??false,"stale-story-goal-v2":features0["stale-story-goal-v2"]??false,"context-token-budget-v1":features0["context-token-budget-v1"]??false,"briefing-repeat-count-v1":features0["briefing-repeat-count-v1"]??false,"navigate-already-here-v1":features0["navigate-already-here-v1"]??false,"fixed-point-breaker-v1":features0["fixed-point-breaker-v1"]??false,"story-character-stall-gate-v1":features0["story-character-stall-gate-v1"]??false,"positive-supervisor-v1":features0["positive-supervisor-v1"]??false,"auto-talk-v1":features0["auto-talk-v1"]??features0["fixed-point-breaker-v1"]??false,"duplicate-turn-collapse-v1":features0["duplicate-turn-collapse-v1"]??false,"unfinished-activity-v1":features0["unfinished-activity-v1"]??false,"exit-labels-v2":features0["exit-labels-v2"]??false,"heal-before-trainers-v2":features0["heal-before-trainers-v2"]??false,"gym-heal-warning-v1":features0["gym-heal-warning-v1"]??false,"respawn-readout-v1":features0["respawn-readout-v1"]??false,"trainer-sight-check-v1":features0["trainer-sight-check-v1"]??false,"caught-nickname-prompt-v1":features0["caught-nickname-prompt-v1"]??false,"fail-open-input-v1":features0["fail-open-input-v1"]??false,"whiteout-healed-v1":features0["whiteout-healed-v1"]??false,"field-move-gates-v1":features0["field-move-gates-v1"]??false,"gym-readiness-readout-v1":features0["gym-readiness-readout-v1"]??false,"same-target-no-progress-v1":features0["same-target-no-progress-v1"]??false,"story-progress-clock-v1":features0["story-progress-clock-v1"]??false};
 const merged:FeatureSet={...features,"scripted-place-guidance-v1":features["scripted-place-guidance-v1"]??false,"trigger-script-loop-v1":features["trigger-script-loop-v1"]??false,"cache-aligned-window-v1":features["cache-aligned-window-v1"]??false,"jit-guide-reuse-v1":features["jit-guide-reuse-v1"]??false,"save-state-task-truth-v1":features["save-state-task-truth-v1"]??false,"navigation-evidence-memory-v1":features["navigation-evidence-memory-v1"]??false,"pushback-loop-detection-v1":features["pushback-loop-detection-v1"]??false,"pushback-press-result-v1":features["pushback-press-result-v1"]??false,"battle-observation-loop-v1":features["battle-observation-loop-v1"]??false,"in-game-naming-readout-v1":features["in-game-naming-readout-v1"]??false,"no-nickname-guidance-v1":features["no-nickname-guidance-v1"]??false,"battle-message-waiting-v1":features["battle-message-waiting-v1"]??false,"connection-edge-tiles-v1":features["connection-edge-tiles-v1"]??false,"explorer-guidance-v1":features["explorer-guidance-v1"]??false,"automatic-running-v1":features["automatic-running-v1"]??false,"expanded-menu-battle-information-v1":features["expanded-menu-battle-information-v1"]??false,"field-dialogue-phase-v1":features["field-dialogue-phase-v1"]??false,"dialogue-safe-batches-v1":features["dialogue-safe-batches-v1"]??false,"interaction-loop-detection-v1":features["interaction-loop-detection-v1"]??false,"state-only-decisions-v1":features["state-only-decisions-v1"]??false,"named-interactions-v1":features["named-interactions-v1"]??false,"world-destinations-v1":features["world-destinations-v1"]??false,"bounded-navigation-v1":features["bounded-navigation-v1"]??false,"ledge-hops-v1":features["ledge-hops-v1"]??false,"one-way-tiles-v1":features["one-way-tiles-v1"]??false,"counter-talk-v1":features["counter-talk-v1"]??false,"walkable-floor-v1":features["walkable-floor-v1"]??false,"full-map-navigation-v1":features["full-map-navigation-v1"]??false,"grass-cost-navigation-v1":features["grass-cost-navigation-v1"]??false,"elevation-transitions-v1":features["elevation-transitions-v1"]??true,"game-evidence-priority-v1":features["game-evidence-priority-v1"]??false,"dialogue-log-v1":features["dialogue-log-v1"]??false,"loop-guard-supervisor-v1":features["loop-guard-supervisor-v1"]??false,"instruction-ledger-v1":features["instruction-ledger-v1"]??false,"next-milestone-hint-v1":features["next-milestone-hint-v1"]??false,"double-context-window-v1":features["double-context-window-v1"]??false,"fresh-retry-v1":features["fresh-retry-v1"]??false,"named-warp-destinations-v1":features["named-warp-destinations-v1"]??false,"milestone-stall-stop-v1":features["milestone-stall-stop-v1"]??false,"text-only-supervisor-v1":features["text-only-supervisor-v1"]??false,"character-presence-v1":features["character-presence-v1"]??false,"navigation-refusal-reasons-v1":features["navigation-refusal-reasons-v1"]??false,"transition-press-result-v1":features["transition-press-result-v1"]??false,"stall-briefing-v1":features["stall-briefing-v1"]??false,"battle-details-v2":features["battle-details-v2"]??false,"dialogue-auto-advance-v1":features["dialogue-auto-advance-v1"]??false,"warp-arrival-settle-v1":features["warp-arrival-settle-v1"]??false,"dialogue-context-kept-v1":features["dialogue-context-kept-v1"]??false,"displayed-place-names-v1":features["displayed-place-names-v1"]??false,"transition-loop-detection-v1":features["transition-loop-detection-v1"]??false,"blocked-batch-result-v1":features["blocked-batch-result-v1"]??false,"adjacent-tiles-v1":features["adjacent-tiles-v1"]??false,"readout-rules-in-prompt-v1":features["readout-rules-in-prompt-v1"]??false,"script-line-presence-v1":features["script-line-presence-v1"]??false,"offscreen-objects-v1":features["offscreen-objects-v1"]??false,"navigate-first-prompt-v1":features["navigate-first-prompt-v1"]??false,"presence-penalty-v1":features["presence-penalty-v1"]??false,"levelup-box-v1":features["levelup-box-v1"]??false,"disproved-beliefs-v1":features["disproved-beliefs-v1"]??false,"same-plan-breaker-v1":features["same-plan-breaker-v1"]??false,"navigation-truth-v1":features["navigation-truth-v1"]??false,"navigation-refusal-reasons-v2":features["navigation-refusal-reasons-v2"]??false,"low-hp-trainer-warning-v2":features["low-hp-trainer-warning-v2"]??false,"battle-triage-guidance-v1":features["battle-triage-guidance-v1"]??false,"battle-text-auto-advance-v1":features["battle-text-auto-advance-v1"]??false,"briefing-exits-v1":features["briefing-exits-v1"]??false,"untaken-exits-v1":features["untaken-exits-v1"]??false,"people-ledger-v1":features["people-ledger-v1"]??false,"transition-coherence-v1":features["transition-coherence-v1"]??false,"trainer-heal-guidance-v1":features["trainer-heal-guidance-v1"]??false,"low-hp-trainer-warning-v1":features["low-hp-trainer-warning-v1"]??false,"briefing-battle-outcomes-v1":features["briefing-battle-outcomes-v1"]??false,"blocked-exit-fact-v1":features["blocked-exit-fact-v1"]??false,"battle-loss-recap-v1":features["battle-loss-recap-v1"]??false,"readout-truth-v1":features["readout-truth-v1"]??false,"birch-speech-pages-v1":features["birch-speech-pages-v1"]??false,"blackout-readout-v1":features["blackout-readout-v1"]??false,"open-goal-prompt-v1":features["open-goal-prompt-v1"]??false,"surf-gated-exits-v1":features["surf-gated-exits-v1"]??false,"story-destinations-v1":features["story-destinations-v1"]??false,"exit-reachability-v1":features["exit-reachability-v1"]??false,"cross-map-goal-v1":features["cross-map-goal-v1"]??false,"explorer-guidance-v2":features["explorer-guidance-v2"]??false,"ineffective-loops-v1":features["ineffective-loops-v1"]??false,"people-id-cards-v1":features["people-id-cards-v1"]??false,"heal-before-trainers-v1":features["heal-before-trainers-v1"]??false,"harness-trust-v1":features["harness-trust-v1"]??false,"cited-destination-v1":features["cited-destination-v1"]??false,"harness-trust-v2":features["harness-trust-v2"]??false,"battle-move-tool-v1":features["battle-move-tool-v1"]??false,"tutorial-party-owner-v1":features["tutorial-party-owner-v1"]??false,"mid-frame-readout-v1":features["mid-frame-readout-v1"]??false,"unset-dynamic-warp-v1":features["unset-dynamic-warp-v1"]??false,"status-names-v1":features["status-names-v1"]??false,"surf-gated-exits-v2":features["surf-gated-exits-v2"]??false,"instruction-ledger-v2":features["instruction-ledger-v2"]??false,"no-exit-here-v1":features["no-exit-here-v1"]??false,"bag-healing-items-v1":features["bag-healing-items-v1"]??false,"battle-menu-loop-v1":features["battle-menu-loop-v1"]??false,"clock-view-loop-v1":features["clock-view-loop-v1"]??false,"stale-story-goal-v1":features["stale-story-goal-v1"]??false,"input-cuts-v1":features["input-cuts-v1"]??false,"loop-guard-screen-v1":features["loop-guard-screen-v1"]??false,"reopened-dialogue-loop-v1":features["reopened-dialogue-loop-v1"]??false,"dialog-button-b-v1":features["dialog-button-b-v1"]??false,"just-in-time-prompt-v1":features["just-in-time-prompt-v1"]??false,"just-in-time-prompt-v2":features["just-in-time-prompt-v2"]??false,"faced-interaction-history-v1":features["faced-interaction-history-v1"]??false,"poison-readout-v1":features0["poison-readout-v1"]??false,"berry-readout-v1":features0["berry-readout-v1"]??false};
 // Registry order, whatever order the preset file lists them in.
 return Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,merged[id]])) as FeatureSet;
}
export const PlayPresetV1Schema=Type.Object({version:Type.Literal(1),...common,flags:PlayFlagsSchema},closed);
// v2 names every switch explicitly; viewer-queued runs use it.
export const PresetStartSchema=Type.Object({kind:Type.Literal("save_state"),path:Type.String({minLength:1,maxLength:4096}),sha1:Type.String({pattern:"^[0-9a-f]{40}$"})},closed);
export const PlayPresetV2Schema=Type.Object({version:Type.Literal(2),...common,features:FeatureSetSchema,start:Type.Optional(PresetStartSchema)},closed);
export const PlayPresetSchema=Type.Union([PlayPresetV1Schema,PlayPresetV2Schema]);
export type PlayPresetV1=Static<typeof PlayPresetV1Schema>;
export type PlayPresetV2=Omit<Static<typeof PlayPresetV2Schema>,"features"> & {features:FeatureSet};
export type PlayPreset=PlayPresetV1|PlayPresetV2;
export type PlayFlags=Static<typeof PlayFlagsSchema>;
export function parsePlayPreset(value:unknown):PlayPreset{
 const v2=typeof value==="object"&&value!==null&&"version" in value&&value.version===2;
 const schema=v2?PlayPresetV2Schema:PlayPresetV1Schema;
 if(!Value.Check(schema,value)){const [first]=Value.Errors(schema,value);throw new Error(`Invalid play preset: ${first?.instancePath ?? ""} ${first?.message ?? "schema mismatch"}`);}
 const preset:PlayPreset=v2?{...value,features:normalizeFeatures(value.features)}:value;
 if(preset.target!==null&&!MILESTONES.some(item=>item.name===preset.target&&item.kind!=="legacy"))throw new Error(`Invalid play preset: target ${preset.target} is not a native milestone`);
 if(preset.target!==null&&MEASUREMENT_ONLY_MILESTONES.has(preset.target))throw new Error(`Invalid play preset: target ${preset.target} is measurement-only; a target is written into the model's goal`);
 if(preset.stopAt!==undefined){
  if(!MILESTONES.some(item=>item.name===preset.stopAt&&item.kind!=="legacy")||MEASUREMENT_ONLY_MILESTONES.has(preset.stopAt))throw new Error("Invalid play preset: stopAt must be a native target milestone");
  if(preset.target!==null&&preset.target!==preset.stopAt)throw new Error("Invalid play preset: target and stopAt conflict");
 }
 if(preset.version===2){const problems=[...dependencyProblems(preset.features),...stateOnlyProblems(preset.features)];if(problems.length>0)throw new Error(`Invalid play preset: ${problems.join("; ")}`);}
 return preset;
}
// Frozen comparison manifests were written against the four-flag contract.
export function parsePlayPresetV1(value:unknown):PlayPresetV1{
 const preset=parsePlayPreset(value);
 if(preset.version!==1)throw new Error("Invalid play preset: comparison presets must be version 1");
 return preset;
}
export function presetFeatures(preset:PlayPreset):FeatureSet{
 return preset.version===2?{...preset.features}:flagFeatures(preset.flags);
}
function legacyFlagFeatures({loopGuard,activeUi,interfaceDocs,objectives}:PlayFlags):FeatureSet{
 return {...ALL_ON,"scripted-place-guidance-v1":false,"trigger-script-loop-v1":false,"cache-aligned-window-v1":false,"jit-guide-reuse-v1":false,"navigation-evidence-memory-v1":false,"pushback-loop-detection-v1":false,"pushback-press-result-v1":false,"battle-observation-loop-v1":false,"in-game-naming-readout-v1":false,"no-nickname-guidance-v1":false,"battle-message-waiting-v1":false,"connection-edge-tiles-v1":false,"explorer-guidance-v1":false,"automatic-running-v1":false,"expanded-menu-battle-information-v1":false,"field-dialogue-phase-v1":false,"dialogue-safe-batches-v1":false,"interaction-loop-detection-v1":false,"state-only-decisions-v1":false,"named-interactions-v1":false,"world-destinations-v1":false,"bounded-navigation-v1":false,"ledge-hops-v1":false,"one-way-tiles-v1":false,"full-map-navigation-v1":false,"grass-cost-navigation-v1":false,"counter-talk-v1":false,"walkable-floor-v1":false,"game-evidence-priority-v1":false,"dialogue-log-v1":false,"loop-guard-supervisor-v1":false,"instruction-ledger-v1":false,"next-milestone-hint-v1":false,"double-context-window-v1":false,"fresh-retry-v1":false,"named-warp-destinations-v1":false,"milestone-stall-stop-v1":false,"text-only-supervisor-v1":false,"character-presence-v1":false,"navigation-refusal-reasons-v1":false,"transition-press-result-v1":false,"stall-briefing-v1":false,"battle-details-v2":false,"dialogue-auto-advance-v1":false,"warp-arrival-settle-v1":false,"transition-loop-detection-v1":false,"blocked-batch-result-v1":false,"adjacent-tiles-v1":false,"script-line-presence-v1":false,"offscreen-objects-v1":false,"navigate-first-prompt-v1":false,"presence-penalty-v1":false,"levelup-box-v1":false,"disproved-beliefs-v1":false,"same-plan-breaker-v1":false,"navigation-truth-v1":false,"navigation-refusal-reasons-v2":false,"low-hp-trainer-warning-v2":false,"battle-triage-guidance-v1":false,"displayed-place-names-v1":false,"dialogue-context-kept-v1":false,"readout-rules-in-prompt-v1":false,"deterministic-loop-guard-v1":loopGuard,"active-ui-ownership-v1":activeUi,"contextual-interface-docs-v1":interfaceDocs,"objective-tracking-v1":objectives,"repeat-attempt-guard-v1":objectives,"native-objective-completion-v1":objectives,"battle-text-auto-advance-v1":false,"briefing-exits-v1":false,"untaken-exits-v1":false,"people-ledger-v1":false,"trainer-heal-guidance-v1":false,"low-hp-trainer-warning-v1":false,"briefing-battle-outcomes-v1":false,"blocked-exit-fact-v1":false,"battle-loss-recap-v1":false,"transition-coherence-v1":false,"readout-truth-v1":false,"birch-speech-pages-v1":false,"blackout-readout-v1":false,"open-goal-prompt-v1":false,"surf-gated-exits-v1":false,"story-destinations-v1":false,"exit-reachability-v1":false,"cross-map-goal-v1":false,"explorer-guidance-v2":false,"ineffective-loops-v1":false,"people-id-cards-v1":false,"heal-before-trainers-v1":false,"harness-trust-v1":false,"cited-destination-v1":false,"harness-trust-v2":false,"battle-move-tool-v1":false,"tutorial-party-owner-v1":false,"mid-frame-readout-v1":false,"unset-dynamic-warp-v1":false,"status-names-v1":false,"surf-gated-exits-v2":false,"instruction-ledger-v2":false,"no-exit-here-v1":false,"bag-healing-items-v1":false,"battle-menu-loop-v1":false,"clock-view-loop-v1":false,"stale-story-goal-v1":false,"input-cuts-v1":false,"loop-guard-screen-v1":false,"reopened-dialogue-loop-v1":false,"just-in-time-prompt-v1":false,"just-in-time-prompt-v2":false,"faced-interaction-history-v1":false,"save-state-task-truth-v1":false,"dialog-button-b-v1":false};
}
export function flagFeatures(flags:PlayFlags):FeatureSet{return {...legacyFlagFeatures(flags),"player-map-visibility-v1":false,"destination-first-navigation-v1":false,"pokenav-call-auto-advance-v1":false,"neutral-yes-no-readout-v1":false,"instruction-memory-cap-v1":false,"instruction-memory-junk-filter-v1":false,"refusal-ledger-bound-v1":false,"disproved-beliefs-bound-v1":false,"supervisor-briefing-bound-v1":false,"compact-map-grid-v1":false,"scene-journal-safe-capture-v1":false,"self-named-speaker-v1":false,"story-briefing-native-milestones-v1":false,"retire-reached-story-line-v1":false,"gateway-current-turn-v1":false,"gateway-tool-schemas-v1":false,"gateway-schema-hint-v1":false,"type-gap-team-last-message-v1":false,"map-observability-v1":true,"type-gap-team-v1":false,"supplies-v1":false,"untalked-in-gym-v1":false,"context-exact-count-v1":false,"no-story-foreknowledge-v1":false,"instruction-memory-dedup-v1":false,"grass-strides-v1":false,"scene-followup-prompt-v1":false,"pokenav-short-list-v1":false,"menu-option-honest-refusal-v1":false,"instruction-goal-advisory-v1":false,"goal-review-repair-feedback-v1":false,"cutscene-journal-v1":false,"mauville-puzzle-readout-v1":true,"caught-nickname-prompt-v2":false,"moving-npc-target-v1":false,"citation-evidence-v1":false,"bag-ineffective-loop-v1":false,"bag-press-feedback-v1":false,"bag-pocket-truth-v1":false,"menu-option-tool-v1":false,"instruction-goal-ledger-v1":false,"native-task-goal-retirement-v1":false,"player-elevation-readout-v1":false,"party-menu-message-v1":false,"drought-progress-facts-v1":false,"refusal-ledger-v1":false,"whiteout-outcomes-v2":false,"active-warp-exits-v1":false,"available-exits-presentation-v1":false,"interface-guidance-v1":false,"trainer-observed-party-v1":false,"blackout-transition-v1":false,"restored-memory-run-v1":false,"navigation-cycle-stop-v1":false,"elevation-aware-map-v1":false,"screen-center-player-v1":false,"campaign-progress-clock-v1":false,"move-learn-offer-identity-v1":false,"move-learn-goal-reminder-v1":false,"leader-loss-immediate-v1":false,"battle-action-history-v1":false,"leader-preparation-comparison-v1":false,"roxanne-campaign-reminder-v1":false,"coherent-battle-observation-v1":false,"map-cycle-recovery-v1":false,"random-starter-v1":false,"turn-drought-clock-v1":false,"static-npc-template-approach-v1":false,"owned-battle-context-v1":false,"reachable-section-alternatives-v1":false,"delivered-place-evidence-v1":false,"boundary-crossing-facts-v1":false,"npc-approach-feedback-v1":false,"leader-loss-comparison-v1":false,"rejected-movement-stride-v1":false,"battle-move-learn-input-v1":false,"navigation-recovery-v1":false,"milestone-drought-suppression-v1":false,"milestone-instruction-memory-v1":false,"trigger-navigation-boundary-v1":false,"gym-evidence-v1":false,"rejected-movement-step-v1":false,"observed-field-dialogue-v1":false,"birch-intro-pages-v1":false,"story-goal-player-name-v1":false,"cut-off-reply-feedback-v1":false,"trainer-sight-check-v2":false,"auto-talk-v2":false,"rejected-movement-prefix-v1":false,"away-note-buildings-v1":false,"current-map-display-name-v1":false,"window-escape-route-v1":false,"auto-talk-field-only-v1":false,"auto-talk-v3":false,"untalked-people-header-v1":false,"map-wide-triggers-v1":false,"drought-battle-heal-hold-v1":false,"tool-prompt-docs-v1":false,"field-ownership-feedback-v1":false,"move-learn-loop-fingerprint-v1":false,"stale-plan-fact-v1":false,"post-battle-readout-v1":false,"move-learn-tool-v1":false,"move-learn-early-comparison-v1":false,"poison-readout-v1":false,"berry-readout-v1":false,"shop-interface-v1":false,"progress-aware-cycles-v1":false,"exp-next-level-v1":false,"pokedex-own-v1":false,"exp-earned-ledger-v1":false,"leader-attempt-ledger-v1":false,"seen-trainers-ledger-v1":false,"party-coverage-v1":false,"said-type-matches-v1":false,"caught-dex-input-v1":false,"gym-door-label-v1":false,"mart-stock-readout-v1":false,"menu-refusal-recovery-v1":false,"menu-item-guidance-v1":false,"explorer-family-guidance-v1":false,"coherent-healing-feedback-v1":false,"factual-healing-guidance-v1":false,"move-learn-settle-v1":false,"move-learn-question-v1":false,"move-learn-comparison-v1":false,"effectiveness-heard-v1":false,"game-said-goals-v1":false,"story-battle-heal-first-v1":false,"pending-field-dialogue-v1":false,"exit-labels-v3":false,"navigation-tool-use-guard-v1":false,"semantic-current-map-feedback-v1":false,"short-cycle-fixed-point-v1":false,"navigation-refusal-reasons-v3":false,"yes-no-answer-readout-v1":false,"story-battle-heal-gate-v1":false,"party-item-confirmation-v1":false,"original-speed-pacing-v1":false,"semantic-navigation-v2":false,"evolution-decision-v1":false,"observed-instructions-v1":false,"starter-decision-salience-v1":false,"semantic-navigation-v1":false,"deterministic-exploration-v1":false,"safe-navigation-strides-v1":false,"ineffective-navigation-v2":false,"supervisor-briefing-v2":false,"reachable-story-guidance-v1":false,"text-only-supervisor-v2":false,"battle-decision-ready-v1":false,"battle-refusal-loop-v1":false,"visited-terrain-navigation-v1":false,"battle-effective-damage-v1":false,"deterministic-warp-navigation-v1":false,"stale-story-goal-v2":false,"context-token-budget-v1":false,"briefing-repeat-count-v1":false,"navigate-already-here-v1":false,"fixed-point-breaker-v1":false,"story-character-stall-gate-v1":false,"positive-supervisor-v1":false,"auto-talk-v1":false,"duplicate-turn-collapse-v1":false,"unfinished-activity-v1":false,"exit-labels-v2":false,"heal-before-trainers-v2":false,"gym-heal-warning-v1":false,"respawn-readout-v1":false,"trainer-sight-check-v1":false,"caught-nickname-prompt-v1":false,"fail-open-input-v1":false,"whiteout-healed-v1":false,"gym-readiness-readout-v1":false,"same-target-no-progress-v1":false,"story-progress-clock-v1":false,"field-move-gates-v1":false};}
// The four legacy flags recorded in run_start evaluation for every preset.
export function presetFlags(preset:PlayPreset):PlayFlags{
 if(preset.version===1)return {...preset.flags};
 const f=preset.features;
 return {loopGuard:f["deterministic-loop-guard-v1"],activeUi:f["active-ui-ownership-v1"],interfaceDocs:f["contextual-interface-docs-v1"],objectives:f["objective-tracking-v1"]};
}

// A checkpoint start is verified against its recorded SHA-1 before the run launches.
export function presetStart(preset:PlayPreset,read:(path:string)=>Buffer):{kind:"boot"}|Static<typeof PresetStartSchema>{
 if(preset.version!==2||preset.start===undefined)return {kind:"boot"};
 // The launcher and server run in other directories, so the checked file and the loaded file must share one absolute path.
 const path=resolve(preset.start.path);
 const actual=createHash("sha1").update(read(path)).digest("hex");
 if(actual!==preset.start.sha1)throw new Error(`Checkpoint SHA-1 mismatch for ${path}: preset ${preset.start.sha1}, file ${actual}`);
 return {...preset.start,path};
}

// A measurement boundary can stop a segment without narrowing the model goal.
export function terminationTarget(preset:PlayPreset|null):string|null {return preset?.stopAt??preset?.target??null;}
