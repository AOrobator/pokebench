// The harness feature registry: every feature id a play run can record, what
// it changes for the model, and whether the operator can switch it off. The
// descriptions are user-facing copy for the viewer's switchboard; each was
// checked against the code that produces the feature's output.

export type FeatureGroup = "observation" | "guidance" | "guard" | "measurement";

export const SWITCHABLE_FEATURES = [
  "navigation-evidence-memory-v1",
  "automatic-running-v1",
  "expanded-menu-battle-information-v1",
  "ram-state-v1",
  "live-map-v1",
  "live-player-position-v1",
  "world-coordinate-grid-v1",
  "live-object-sprites-v1",
  "world-targets-v1",
  "named-interactions-v1",
  "world-destinations-v1",
  "bounded-navigation-v1",
  "grass-cost-navigation-v1",
  "field-dialogue-phase-v1",
  "dialogue-safe-batches-v1",
  "interaction-loop-detection-v1",
  "active-field-message-buffer-v1",
  "naming-cursor-v1",
  "story-state-v1",
  "coordinate-script-conditions-v1",
  "state-only-decisions-v1",
  "contextual-interface-docs-v1",
  "active-ui-ownership-v1",
  "press-result-v1",
  "field-control-lock",
  "warp-activation-guidance-v1",
  "ledge-hops-v1",
  "one-way-tiles-v1",
  "counter-talk-v1",
  "walkable-floor-v1",
  "deterministic-loop-guard-v1",
  "objective-tracking-v1",
  "repeat-attempt-guard-v1",
  "native-objective-completion-v1",
  "full-map-navigation-v1",
  "elevation-transitions-v1",
  "game-evidence-priority-v1",
  "dialogue-log-v1",
  "loop-guard-supervisor-v1",
  "instruction-ledger-v1",
  "next-milestone-hint-v1",
  "double-context-window-v1",
  "fresh-retry-v1",
  "named-warp-destinations-v1",
  "milestone-stall-stop-v1",
  "text-only-supervisor-v1",
  "character-presence-v1",
  "navigation-refusal-reasons-v1",
  "transition-press-result-v1",
  "stall-briefing-v1",
  "dialogue-auto-advance-v1",
] as const;
export type SwitchableFeature = (typeof SWITCHABLE_FEATURES)[number];

export const MEASUREMENT_FEATURES = [
  "story-milestones-v2",
  "clock-milestone-v1",
  "new-game-created-v1",
  "post-clock-navigation-milestones-v1",
  "rustboro-gym-trainer-milestones-v1", "native-progress-activity-v1", "battle-choices-v1",
  "continuous-battle-state-v1", "validated-pokemon-v1", "menu-observability-v1", "native-action-history-v1", "full-raw-ram-v1", "remaining-native-milestones-v1",
  "birch-rescue-requested-v1",
  "rival-house-exit-v1",
  "native-target-stop-v1",
  "deterministic-loop-diagnostics-v1",
] as const;
export type MeasurementFeature = (typeof MEASUREMENT_FEATURES)[number];

export type FeatureId = SwitchableFeature | MeasurementFeature;
export type FeatureSet = Readonly<Record<SwitchableFeature, boolean>>;

export interface FeatureInfo {
  readonly id: FeatureId;
  readonly group: FeatureGroup;
  readonly title: string;
  readonly description: string;
  readonly needs: SwitchableFeature | null;
  readonly switchable: boolean;
}

const RAM = "ram-state-v1";

function on(id: SwitchableFeature, group: Exclude<FeatureGroup, "measurement">, title: string, needs: SwitchableFeature | null, description: string): FeatureInfo {
  return { id, group, title, description, needs, switchable: true };
}
function measured(id: MeasurementFeature, title: string, description: string): FeatureInfo {
  return { id, group: "measurement", title, description, needs: null, switchable: false };
}

export const FEATURES: readonly FeatureInfo[] = [
  on("navigation-evidence-memory-v1", "guidance", "NAVIGATION EVIDENCE MEMORY", RAM, "Pins the recent observed dialogue, visited rooms and attempted-target outcomes (whole entries, never clipped) before each turn; optional remember_destination retains a model hypothesis with evidence references. No route or objective enforcement. Off: ordinary sliding conversation and no memory tool."),
  on("automatic-running-v1", "guidance", "AUTOMATIC RUNNING", RAM, "Adds simultaneous B to ordinary directional travel only when native running permission and controls are verified each frame. walking=true overrides it. Off: ordinary sequential button input."),
  on("expanded-menu-battle-information-v1", "observation", "EXPANDED MENU + BATTLE INFORMATION", RAM, "Adds newly decoded menu selections, contents and continuous battle descriptions to model text. Off: these descriptions are explicitly unprovided; corrected typed RAM, native journals, milestones and diagnostics remain recorded."),
  on("ram-state-v1", "observation", "RAM GAME-STATE READOUT", null,
    "Reads the game's memory every observation and adds a text readout beside the screenshot: screen, on-screen dialog, menu, player name, location, party, money, badges, battle and play time. Off: observe and press return only the screenshot, and the system prompt's tool lines and the tool descriptions no longer promise a readout; interface docs, if on, still mention readouts."),
  on("live-map-v1", "observation", "LIVE MAP", RAM,
    "Draws the tiles within 7 steps of the player from live memory as a text grid (@ player, N object, W warp, # collision, g grass, ~ water) with nearby objects and warp destinations. Off: no map; the model judges walkable space from the screenshot. The system prompt's tool summary still mentions a map."),
  on("live-player-position-v1", "observation", "PLAYER POSITION", RAM,
    "Adds the player's X,Y tile and facing, read from the live player object rather than the save block, which only updates on warps. Off: the Position line is dropped, and press results and the objective record leave coordinates and facing out; the map, if on, still marks the player with @ on its coordinate grid, the system prompt's tool summary still mentions coordinates, and the repeat-attempt guard still warns on returning to the same tile."),
  on("world-coordinate-grid-v1", "observation", "COORDINATE GRID", "live-map-v1",
    "Labels the map's rows and columns with the world coordinates that positions and targets use, so 'door at 5,1' can be found on the grid. Off: map rows are printed unlabeled."),
  on("live-object-sprites-v1", "observation", "NPCS + OBJECTS", RAM,
    "Lists people and objects within 7 tiles at their live positions, with each one's sprite kind (a graphic, not a name). Off: the list is dropped; the map's N marks stay if the map is on."),
  on("world-targets-v1", "observation", "WORLD TARGETS", RAM,
    "Lists every interaction candidate on the current map from its event data: objects, warps, signs and step triggers, each with where it is and whether you press A or step on it. Off: the model discovers interactions by trying."),
  on("named-interactions-v1", "observation", "NAMED INTERACTIONS", "world-targets-v1",
    "Names verified background scripts, live object sprite kinds and metatile interactions beside their current positions. Unresolved identities remain explicit. Off: original generic interaction labels."),
  on("world-destinations-v1", "observation", "MAP DESTINATIONS", RAM,
    "Adds current map bounds, game-defined boundary connections and named warp destinations to observations. Conditions may still block passage. Off: original map IDs; no story route is supplied."),
  on("bounded-navigation-v1", "guidance", "BOUNDED NAVIGATION", "live-map-v1",
    "Adds navigate_to for up to eight ordinary walking attempts using the live local map, plus the current map ID needed by the tool. The model chooses destinations. Stops on blocked movement, locks or map changes; unsupported terrain is avoided. Off: no navigate_to tool."),
  on("grass-cost-navigation-v1", "guidance", "GRASS-AVOIDING NAVIGATION", "bounded-navigation-v1",
    "navigate_to counts each step into tall or long grass as 1.5 steps, so it takes a slightly longer route around grass when one exists, to avoid wild encounters. Adapted from PokeAgent's grass penalty, which leaves long grass at 1. Off: every walkable step costs the same."),
  on("field-dialogue-phase-v1", "observation", "DIALOGUE PHASE", RAM,
    "Reports a qualified field-message printer phase, buffer position and whether A/B can advance a page, or the qualified script/interface activity retaining its window. Unknown ownership stays unavailable; no story route is supplied. Off: incumbent dialogue readout."),
  on("dialogue-safe-batches-v1", "guard", "SAFE INTERFACE INPUT", RAM,
    "Limits interaction/menu inputs and locked or unavailable interface batches to one submitted button, then returns a fresh frame. Freely walking directional batches remain available. Off: submits all requested buttons together."),
  on("interaction-loop-detection-v1", "guard", "INTERACTION LOOP DETECTION", RAM,
    "Extends loop diagnostics to equivalent button batches and qualified input-ready field messages, including repeated page cycles. Loop guard independently controls warnings and bounded termination. Off: incumbent single-input/unlocked-field checks."),
  on("active-field-message-buffer-v1", "observation", "DIALOGUE AS TEXT", RAM,
    "Copies the game's active field-message buffer into the readout. It can include pages not yet shown on screen. Off: the buffer is dropped; the readout's short Dialog line for the visible box stays."),
  on("naming-cursor-v1", "observation", "NAMING CURSOR", RAM,
    "On the name-entry keyboard, reports the name typed so far, the keyboard page and the key under the cursor. Off: the model reads the keyboard from the screenshot."),
  on("story-state-v1", "observation", "STORY FLAGS", RAM,
    "Lists story steps the game's own flags and variables say are done (name confirmed, clock set, rival met, starter received…). Off: the line is dropped; progress has to be inferred from the screen."),
  on("coordinate-script-conditions-v1", "observation", "SCRIPT TRIGGERS", RAM,
    "Lists nearby tiles that start a script when stepped on, the game variable each one checks, and whether its condition matches now. Off: the list is dropped; the model learns about them by walking into them."),
  on("state-only-decisions-v1","guidance","STATE-ONLY DECISIONS",RAM,"Automatically supplies a fresh screenshot and state before each single action, with no conversation history or observe tool. Requires objective enforcement, active loop intervention, bounded navigation and legacy press-result feedback OFF. Off: ordinary conversational tool loop."),
  on("contextual-interface-docs-v1", "guidance", "INTERFACE DOCS", null,
    "Replaces the one-line controls in the system prompt with screen-specific instructions for the overworld, menus, the naming keyboard layout and the clock. Off: only the one-line general controls."),
  on("active-ui-ownership-v1", "guidance", "ACTIVE UI OWNERSHIP", RAM,
    "Says which interface owns button input right now (Birch speech, menus, naming, clock), whether it is ready, what is selected and what the buttons do there. Off: the game server stops reading interface ownership altogether, so the Interface line is dropped, the Menu line reports only an unverified menu cursor, and the recorded state and loop guard see no interface state either."),
  on("press-result-v1", "guidance", "PRESS RESULTS", RAM,
    "After each press, adds one line comparing the game state before and after: moved, turned, changed map or screen, interface changed, controls locked, or blocked. Off: the model compares screenshots itself, though objective tracking, if on, still labels each attempt moved, turned, progress, no change or unavailable."),
  on("field-control-lock", "guidance", "FIELD CONTROL LOCK", RAM,
    "Says whether a dialog, menu or script has locked field controls, so direction presses cannot walk. Off: the line is dropped, press results no longer say locked, and the objective record's evidence leaves it out; a blocked press looks like walking into a wall. Objective tracking, if on, still labels a press made while locked as unavailable rather than no change."),
  on("warp-activation-guidance-v1", "guidance", "WARP GUIDANCE", "live-map-v1",
    "Annotates each nearby warp with how it activates (step on, directional exit, door) from its tile behavior, and adds a paragraph on warps to the system prompt. Off: warps are listed without activation and the paragraph is removed."),
  on("ledge-hops-v1", "guidance", "LEDGE HOPS", "live-map-v1",
    "Draws ledges on the map as v ^ < > arrows with a legend saying each is a one-way hop in the arrow's direction, and lets navigate_to hop a ledge in that direction. Off: ledges keep their collision glyph (# almost always) and navigate_to treats them as walls."),
  on("one-way-tiles-v1", "guidance", "ONE-WAY TILES", "live-map-v1",
    "Draws collision-free tiles with walled sides (such as the chair in the player's bedroom) as + on the map, with a legend and a list of each tile's walled sides, and makes navigate_to never cross a walled side. Off: they are drawn as clear terrain (.) and navigate_to treats them as walls."),
  on("counter-talk-v1", "guidance", "COUNTER TALK", "live-map-v1",
    "Draws counter tiles (like the one in front of a Pokémon Center nurse) as = with a legend saying you cannot walk onto one but can talk across it, and navigate_to names the tile and direction for talking to someone behind a counter. Off: counters keep their collision glyph # and navigate_to gives no counter hint."),
  on("walkable-floor-v1", "guidance", "WALKABLE FLOOR", null,
    "Only matters when bounded navigation is on. Lets navigate_to walk every collision-free tile the game lets you walk on, such as sand, cave floor, mountain tops, puddles, shallow water and bridges, and still refuses surfable water, sliding and ice tiles, holes, one-way tiles, ledges and Acro Bike rails. Off: navigate_to only walks plain ground, grass and doors, so it treats sand and cave floor as walls although the map draws them as clear terrain (.)."),
  on("deterministic-loop-guard-v1", "guard", "LOOP GUARD", null,
    "Watches for repeated planning without acting, repeated observing, presses that change nothing, action cycles and repeated tool rejections. It warns the model first and ends the run as stuck if the loop continues. Off: loops are still logged but never warn or stop."),
  on("objective-tracking-v1", "guard", "OBJECTIVE TRACKING", RAM,
    "Gives the model get/set/update objective tools, requires an active objective before pressing, and pins the objective, recent attempts (moved, turned, progress, no change, unavailable) and recent game-state facts into context every turn. Facts whose observation switch is off (position, naming, field lock) are left out. Off: no objective tools or record."),
  on("repeat-attempt-guard-v1", "guard", "REPEAT-ATTEMPT GUARD", "objective-tracking-v1",
    "After two presses of the same buttons from the same state change nothing, blocks a third until the model updates its objective with a retry reason; also warns on returning to the same tile repeatedly. Off: attempts are recorded without warnings or blocks."),
  on("native-objective-completion-v1", "guard", "NATIVE COMPLETION", "objective-tracking-v1",
    "Story objectives complete automatically when the game records the milestone, and the model cannot mark them complete itself. Off: nothing completes automatically; the model reports objectives complete on its own say-so."),
  on("full-map-navigation-v1", "guidance", "WHOLE-MAP NAVIGATION", "bounded-navigation-v1",
    "Replaces the 15x15 local map with the whole current map, one character per tile, and lets navigate_to walk the full route (up to 512 presses), re-planning before each press. Stops on blocked or unexpected movement, locks and map changes as before, and after 16 presses without the route getting shorter; a route never crosses a warp unless it is the destination. Off: local map and up to eight attempts per call."),
  on("elevation-transitions-v1", "guidance", "ELEVATION TRANSITIONS", null,
    "Applies only while A* navigation is on. navigate_to follows the game's height rule: stairs (height 0) change the walker's layer, bridges and decks (height 15) never block, and a ledge landing sets the layer the game would. Nothing the model reads changes. Off: navigate_to uses the earlier rule, where 0 keeps the current layer and 15 blocks like any other height."),
  on("game-evidence-priority-v1", "guidance", "GAME EVIDENCE FIRST", null,
    "Adds a system-prompt section saying received dialogue, readout labels, location and story flags outrank what the model remembers about Pokémon, to cite who said what before picking a destination, and to change plan when the game disagrees. With bounded navigation on, also says to use navigate_to for walks of two or more tiles and to target a warp's own coordinates. Names no destination or story step. Off: no such section."),
  on("dialogue-log-v1", "guidance", "DIALOGUE LOG", "active-field-message-buffer-v1",
    "Records every dialogue page the model was actually shown, with turn, location, position and the character faced when the readout names one, and adds recall_dialogue to search it by words, location or recency. Replies return every requested page whole; repeats after other dialogue are kept. Off: no log and no tool."),
  on("loop-guard-supervisor-v1", "guard", "LOOP SUPERVISOR", "deterministic-loop-guard-v1",
    "Where the loop guard would end the run as stuck, it posts a SUPERVISOR briefing instead and the run continues: current room and position, the last dialogue shown, recent attempts with outcomes, and listed targets here not yet tried. Story steps are the readout's own Story line, and nothing in the briefing is clipped. It briefs as soon as a loop is found, then again every 6 looping calls for as long as the loop lasts. Names no route or story goal. Off: the guard ends the run as stuck."),
  on("instruction-ledger-v1", "guidance", "INSTRUCTION LEDGER", "active-field-message-buffer-v1",
    "Pins a short ledger before each decision: the last three dialogue pages the model was shown (with the faced character when named), the rooms it visited with the last line heard in each, and contradictions it recorded with note_contradiction, each citing event numbers it was shown. Entries are never clipped; recorded as ledger_context. Names no goal or route. Off: no ledger and no tool."),
  on("next-milestone-hint-v1", "guidance", "NEXT-MILESTONE HINT", null,
    "HINT ARM: names the next main-story milestone to pursue. Adds get_next_milestone (always callable, named in the system prompt) and, whenever a main-path milestone is earned, pins a message saying what was achieved and what the next milestone is. Milestones follow the order a recorded human run earned them. This tells the model where to go, so results measure hinted play. Off: no tool and no message."),
  on("double-context-window-v1", "guidance", "DOUBLED CONTEXT WINDOW", null,
    "Keeps twice as much recent play in the prompt: up to the last 40 turns (older turns drop 20 at a time) and the last 12 tool results in full with their screenshots (older ones collapse to a one-line summary, 6 at a time). The prompt grows to roughly twice the size, so each turn is slower. Presets must keep it OFF with state-only decisions, which send no history. Off: up to the last 20 turns (dropped 10 at a time) and the last 6 full tool results (collapsed 3 at a time)."),
  on("fresh-retry-v1", "guard", "FRESH RETRY", null,
    "When a reply calls no tool, the retry is sent without that reply: the model sees its last tool result and the nudge to keep playing, not its own failed answer and reasoning. The reply is still recorded and still counts toward the failure limit. Off: the failed reply stays in the context and the retry sees it."),
  on("named-warp-destinations-v1", "observation", "NAMED WARP DESTINATIONS", "live-map-v1",
    "Names the map each warp leads to, using the game's own map table, in the Warps line and in the warp's interaction candidate: (14,8) -> LITTLEROOT TOWN MAYS HOUSE 1F (map 1/2). The name is the same one the Location line shows after walking through. Unknown and dynamic destinations keep their ID. Off: warps show only the map ID, such as map 1/2."),
  on("milestone-stall-stop-v1", "guard", "MILESTONE STALL STOP", null,
    "Ends the run as stalled after 10 minutes of play with no new milestone. The clock starts at run start and restarts at each newly observed milestone; milestones already present at the start do not count, and operator pauses are excluded, as for the wall budget. The wall budget stays the hard cap. The model is not told. Off: the run continues until the wall budget, turn limit or another stop ends it."),
  on("text-only-supervisor-v1", "guard", "TEXT-ONLY SUPERVISOR", null,
    "When the model's replies call no tool often enough to reach the failure limit (three in a row by default), the run does not end. The model gets a SUPERVISOR note instead of the usual nudge: where it is, its last story progress, the recent dialogue, what is listed here that it has not tried, and that only a tool call (observe, press or another listed tool) changes the game. The streak then restarts. After the third note in a row with no successful tool call between them, the next streak ends the run as a model error. State-only decisions, which send no follow-up messages, require it off. Invalid tool calls and gateway errors still end the run at the limit. Each note is recorded. Off: three replies in a row with no tool call end the run as a model error."),
  on("character-presence-v1", "observation", "STORY CHARACTER PRESENCE", RAM, "Lists which of the game's story characters (PROF. BIRCH, the rival, MOM, NORMAN, WALLY, ROXANNE, STEVEN) the current map's own object list places here, with live positions when they are on screen, and names those that are not on this map. A sprite kind such as SCIENTIST_1 or FAT_MAN is never one of these characters. Says nothing about where an absent character is. Off: no such line."),
  on("navigation-refusal-reasons-v1", "guidance", "NAVIGATION REFUSAL REASONS", "bounded-navigation-v1", "When navigate_to cannot walk, it says why and what would work: a message is waiting for A or B (dismiss it first); the target is a person or object (stand on a named free neighbouring tile, face it and press A); the target is a wall, water or other blocked tile; or the target is outside this map. Off: the generic refusal text."),
  on("transition-press-result-v1", "guidance", "TRANSITION PRESS RESULTS", "press-result-v1", "Press results name what really happened at transitions: warped from one map and tile to another (with both map names), moved by a script while field controls were locked (not by the press), and a conversation restarted with text already shown. Off: warps read as ordinary moves, scripted motion is reported as the press's movement, and a restarted conversation reads as an interface change."),
  on("stall-briefing-v1", "guard", "STALL BRIEFING", "loop-guard-supervisor-v1", "Posts the loop supervisor's briefing for stalls the loop guard does not detect: walking back and forth between the same two maps (on the second round trip), and every 5 minutes of play without a new milestone. The run continues. Off: briefings only when the loop guard detects a loop."),
  on("dialogue-auto-advance-v1", "guidance", "DIALOGUE AUTO-ADVANCE", "active-field-message-buffer-v1", "As soon as a press or navigate_to opens or continues a field message, the harness itself advances it with B, waiting for each page to finish printing, until the next decision point: free field control, a YES/NO or other menu (named with its options and highlighted choice), the naming screen, a battle, a screen change, or a cutscene that keeps controls locked with no message (waited out for up to 10 s). Buttons left in the model's batch once the conversation opens are not sent, so extra A presses cannot restart it. At most 50 automatic presses and 90 s per call, and a stop at either cap says so. The result lists every page shown, whole and in order, with speaker (the game's NAME: prefix, else the faced sprite kind, labelled as such), map, position and turn; get_dialogue searches every recorded page by speaker, words, map or recency. Each advance is recorded as a dialogue_auto_advance event. Needs the dialogue phase readout. Off: every requested button is sent and the model advances dialogue itself, one batch per turn; no get_dialogue."),
  measured("story-milestones-v2", "STORY MILESTONES",
    "Records each story milestone the game's own state confirms, with its turn and time. This feeds splits and the score."),
  measured("clock-milestone-v1", "CLOCK MILESTONE",
    "Detects that the bedroom clock was set from the game's story variable, not from the screen."),
  measured("new-game-created-v1", "NEW GAME CREATED",
    "Detects the moment a new game is created."),
  measured("post-clock-navigation-milestones-v1", "POST-CLOCK SPLITS",
    "Records leaving home after the clock, entering the rival house, and reaching the rival bedroom from native transition evidence."),
  measured("rustboro-gym-trainer-milestones-v1", "RUSTBORO GYM TRAINERS",
    "Records Josh, Tommy and Marc defeats from native trainer flags before gym-clear; skipped trainers auto-marked by Roxanne are never credited."),
  measured("native-progress-activity-v1", "NATIVE PROGRESS ACTIVITY", "Records trainer victories, captures, completed heals, evolutions, level gains, blackout callbacks and save attempts from native RAM evidence."),
  measured("continuous-battle-state-v1", "CONTINUOUS BATTLE STATE", "Records source-owned battlers, controllers, actual move announcements, HP/status changes and outcomes every native frame; choices remain separate."),
  measured("validated-pokemon-v1", "VALIDATED POKÉMON", "Reads checksum-qualified party and stored Pokémon, known moves/PP/status/held items; invalid decoding is a harness defect with bounded evidence."),
  measured("menu-observability-v1", "NATIVE MENUS", "Records source-owned menu phases, contents, selection and readiness with explicit unsupported-owner diagnostics."),
  measured("native-action-history-v1", "NATIVE ACTION HISTORY", "Frame-owned history for menu changes, move learning, item quantities, berries and Pokémon acquisitions/storage; selections remain distinct from completion."),
  measured("full-raw-ram-v1", "RAW RAM ARCHIVE", "Durably archives all writable GBA memory, both save-memory banks and CPU registers before each decoded observation for offline reparsing."),
  measured("remaining-native-milestones-v1", "WOODS AND ROUTE 116 SPLITS", "Records native trainer victories and Route115/116/RusturfTunnel visits."),
  measured("birch-rescue-requested-v1", "BIRCH SEND-OFF", "Records Littleroot town state 2, 3 or 4: the north exit has sent the player to help Professor Birch. Meeting the rival is the earlier town state 1 and does not count."),
  measured("rival-house-exit-v1", "LEFT RIVAL HOUSE", "Records the first step back into Littleroot Town straight from the rival family's ground floor after the rival meeting (rival state 3 or 4), with the run's home, that floor and the town as evidence. Leaving the player's own house, or the rival's house before the meeting, does not count, and a run whose home already shows the rival met gets no credit."),
  measured("battle-choices-v1", "BATTLE CHOICES", "Frame-owned committed battle choices for both human and agent recording; execution outcomes remain unobserved."),
  measured("native-target-stop-v1", "TARGET STOP",
    "Ends the run cleanly when the STOP AT milestone is recorded. Present only when a target is set."),
  measured("deterministic-loop-diagnostics-v1", "LOOP LOGGING",
    "Logs every loop the guard would act on, even with the loop guard off, so guard-on and guard-off runs can be compared."),
];

export const ALL_ON: FeatureSet = Object.fromEntries(SWITCHABLE_FEATURES.map((id) => [id, true])) as Record<SwitchableFeature, boolean>;

export function featureInfo(id: FeatureId): FeatureInfo {
  const info = FEATURES.find((item) => item.id === id);
  if (info === undefined) throw new Error(`unknown feature ${id}`);
  return info;
}

export function dependencyProblems(features: FeatureSet): string[] {
  return [...SWITCHABLE_FEATURES.flatMap((id) => {
    const needs = featureInfo(id).needs;
    return features[id] && needs !== null && !features[needs] ? [`${id} needs ${needs}`] : [];
  }),
  // Waiting for a page to finish printing reads the dialogue phase as well as the buffer.
  ...(features["dialogue-auto-advance-v1"] && !features["field-dialogue-phase-v1"] ? ["dialogue-auto-advance-v1 needs field-dialogue-phase-v1"] : [])];
}

// Observation switches the game server applies to its readout.
export const SERVER_FEATURES: readonly SwitchableFeature[] = [
  "expanded-menu-battle-information-v1",
  "ram-state-v1", "live-map-v1", "live-player-position-v1", "world-coordinate-grid-v1", "live-object-sprites-v1",
  "world-targets-v1", "named-interactions-v1", "world-destinations-v1", "bounded-navigation-v1", "field-dialogue-phase-v1", "active-field-message-buffer-v1", "naming-cursor-v1", "story-state-v1",
  "coordinate-script-conditions-v1", "field-control-lock", "warp-activation-guidance-v1", "ledge-hops-v1", "one-way-tiles-v1",
  "full-map-navigation-v1", "counter-talk-v1", "named-warp-destinations-v1", "character-presence-v1",
];

export function serverFeatureEnv(features: FeatureSet): { POKEBENCH_ACTIVE_UI: "0" | "1"; POKEBENCH_FEATURES_OFF: string } {
  return {
    POKEBENCH_ACTIVE_UI: features["active-ui-ownership-v1"] ? "1" : "0",
    POKEBENCH_FEATURES_OFF: SERVER_FEATURES.filter((id) => !features[id]).join(","),
  };
}

export const LOOP_POLICY_FEATURE = "deterministic-loop-policy-v1:p6:o3:a3:c3:r2:recovery6";

// Order matches the run_start records written before the registry existed.
export function playHarnessFeatures(features: FeatureSet, target: string | null): string[] {
  const when = (id: SwitchableFeature): string[] => (features[id] ? [id] : []);
  return [
    ...when("ram-state-v1"), ...when("live-map-v1"), ...when("field-control-lock"), ...when("naming-cursor-v1"),
    ...when("live-object-sprites-v1"), ...when("coordinate-script-conditions-v1"), ...when("active-field-message-buffer-v1"),
    ...when("world-targets-v1"), ...when("named-interactions-v1"), ...when("world-destinations-v1"), ...when("bounded-navigation-v1"), ...when("live-player-position-v1"), ...when("world-coordinate-grid-v1"),
    ...when("field-dialogue-phase-v1"), ...when("dialogue-safe-batches-v1"), ...when("interaction-loop-detection-v1"),
    ...when("press-result-v1"), ...when("warp-activation-guidance-v1"), ...when("ledge-hops-v1"), ...when("one-way-tiles-v1"), ...when("counter-talk-v1"), ...when("walkable-floor-v1"), "clock-milestone-v1", ...when("story-state-v1"),
    ...when("active-ui-ownership-v1"), "story-milestones-v2", "new-game-created-v1", "post-clock-navigation-milestones-v1", "rustboro-gym-trainer-milestones-v1", "native-progress-activity-v1", "battle-choices-v1", "continuous-battle-state-v1", "validated-pokemon-v1", "menu-observability-v1", "native-action-history-v1", "full-raw-ram-v1", "remaining-native-milestones-v1", "birch-rescue-requested-v1", "rival-house-exit-v1",
    ...(target === null ? [] : ["native-target-stop-v1"]), "deterministic-loop-diagnostics-v1", LOOP_POLICY_FEATURE,
    ...when("deterministic-loop-guard-v1"), ...when("contextual-interface-docs-v1"),
    ...when("navigation-evidence-memory-v1"), ...when("automatic-running-v1"), ...when("expanded-menu-battle-information-v1"), ...when("state-only-decisions-v1"), ...when("objective-tracking-v1"), ...when("repeat-attempt-guard-v1"), ...when("native-objective-completion-v1"),
    ...when("full-map-navigation-v1"),
    ...when("grass-cost-navigation-v1"), ...when("elevation-transitions-v1"),
    ...when("game-evidence-priority-v1"),
    ...when("dialogue-log-v1"),
    ...when("loop-guard-supervisor-v1"),
    ...when("instruction-ledger-v1"),
    ...when("next-milestone-hint-v1"),
    ...when("double-context-window-v1"),
    ...when("fresh-retry-v1"),
    ...when("named-warp-destinations-v1"),
    ...when("milestone-stall-stop-v1"),
    ...when("text-only-supervisor-v1"),
    ...when("character-presence-v1"),
    ...when("navigation-refusal-reasons-v1"),
    ...when("transition-press-result-v1"),
    ...when("stall-briefing-v1"),
    ...when("dialogue-auto-advance-v1"),
  ];
}

// The inverse: which switches a recorded run had, from its harness_features.
export function featuresOf(harnessFeatures: readonly string[]): FeatureSet {
  return Object.fromEntries(SWITCHABLE_FEATURES.map((id) => [id, harnessFeatures.includes(id)])) as Record<SwitchableFeature, boolean>;
}

export function stateOnlyProblems(features:FeatureSet):string[]{
 if(!features["state-only-decisions-v1"])return [];
 return (["objective-tracking-v1","deterministic-loop-guard-v1","bounded-navigation-v1","press-result-v1","navigation-evidence-memory-v1","game-evidence-priority-v1","dialogue-log-v1","instruction-ledger-v1","next-milestone-hint-v1","double-context-window-v1","fresh-retry-v1","text-only-supervisor-v1","dialogue-auto-advance-v1"] as const).filter(id=>features[id]).map(id=>`state-only-decisions-v1 requires ${id} OFF`);
}
