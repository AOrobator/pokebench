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
  "battle-details-v2",
  "dialogue-auto-advance-v1",
  "warp-arrival-settle-v1",
  "dialogue-context-kept-v1",
  "displayed-place-names-v1",
  "transition-loop-detection-v1",
  "blocked-batch-result-v1",
  "battle-triage-guidance-v1",
  "adjacent-tiles-v1",
  "readout-rules-in-prompt-v1",
  "explorer-guidance-v1",
  "connection-edge-tiles-v1",
  "in-game-naming-readout-v1",
  "no-nickname-guidance-v1",
  "disproved-beliefs-v1",
  "same-plan-breaker-v1",
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
  "route-101-after-handoff-v1",
  "bedroom-exit-v1",
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
    "Names the map each warp leads to, using the game's own map table, in the Warps line and in the warp's interaction candidate: (14,8) -> LITTLEROOT TOWN MAYS HOUSE 1F (map 1/2). The name is the same one the Location line shows after walking through. A dynamic warp (map 127/127, such as the moving truck's exit) is named from the destination the game itself holds for it (SaveBlock1.dynamicWarp, set by the map's script): (4,3) -> LITTLEROOT TOWN (dynamic warp; map 0/9). Unknown destinations keep their ID, and an unset or unknown dynamic warp stays \"dynamic destination\". Off: warps show only the map ID, such as map 1/2, and dynamic warps show \"dynamic destination\"."),
  on("milestone-stall-stop-v1", "guard", "MILESTONE STALL STOP", null,
    "Ends the run as stalled after 10 minutes of play with no new milestone. The clock starts at run start and restarts at each newly observed milestone; milestones already present at the start do not count, and operator pauses are excluded, as for the wall budget. The wall budget stays the hard cap. The model is not told. Off: the run continues until the wall budget, turn limit or another stop ends it."),
  on("text-only-supervisor-v1", "guard", "TEXT-ONLY SUPERVISOR", null,
    "When the model's replies call no tool often enough to reach the failure limit (three in a row by default), the run does not end. The model gets a SUPERVISOR note instead of the usual nudge: where it is, its last story progress, the recent dialogue, what is listed here that it has not tried, and that only a tool call (observe, press or another listed tool) changes the game. The streak then restarts. After the third note in a row with no successful tool call between them, the next streak ends the run as a model error. State-only decisions, which send no follow-up messages, require it off. Invalid tool calls and gateway errors still end the run at the limit. Each note is recorded. Off: three replies in a row with no tool call end the run as a model error."),
  on("character-presence-v1", "observation", "STORY CHARACTER PRESENCE", RAM, "Lists which of the game's story characters (PROF. BIRCH, the rival, MOM, NORMAN, WALLY, ROXANNE, STEVEN) the current map's own object list places here, with live positions when they are on screen, and names those that are not on this map. A character is named only on the maps where the game's story places that character, because battle facilities and other scripts reuse the same graphics for other people. A sprite kind such as SCIENTIST_1 or FAT_MAN is never one of these characters. Says nothing about where an absent character is. Off: no such line."),
  on("navigation-refusal-reasons-v1", "guidance", "NAVIGATION REFUSAL REASONS", "bounded-navigation-v1", "When navigate_to cannot walk, it says why and what would work: a message is waiting for A or B (dismiss it first); the target is a person or object (stand on a named free neighbouring tile, face it and press A); the target is a wall, water or other blocked tile; or the target is outside this map; a warp someone stands on (named, with other listed warps to the same map); a door whose only entry tile, the one below it (the game enters doors only walking UP), is outside the local map (call navigate_to on that tile first), occupied, unwalkable or unreachable. Off: the generic refusal text."),
  on("transition-press-result-v1", "guidance", "TRANSITION PRESS RESULTS", "press-result-v1", "Press results name what really happened at transitions: warped from one map and tile to another (with both map names), moved by a script while field controls were locked (not by the press: said only when no direction was pressed or the lock lasted through the press; a press that began locked and ended unlocked says the lock was on when it began), a conversation restarted with text already shown at the same place (also when one batch closed it and the same text began printing again), and a message box the press opened, paged or closed in place (dialogue opened / advanced / closed, naming the box as what locks field controls and saying when they are free again). Off: warps read as ordinary moves, scripted motion is reported as the press's movement, and a restarted conversation or a box the press opened or closed reads as an interface change or as \"locked\"."),
  on("stall-briefing-v1", "guard", "STALL BRIEFING", "loop-guard-supervisor-v1", "Posts the loop supervisor's briefing for stalls the loop guard does not detect: walking between the same two maps again and again (on the second round trip; it says whether the trips were out and back or had other maps in between), and every 5 minutes of play without a new milestone. Beyond the loop briefing's facts it quotes the pages shown in the call that earned the latest story milestone that came with dialogue, naming that milestone (whole, with speaker) and, for the maps walked since the last progress, lists targets not yet tried and exits to maps not entered since; the loop briefing itself is unchanged. The run continues. Off: briefings only when the loop guard detects a loop."),
  on("battle-details-v2", "observation", "BATTLE DETAILS V2", "expanded-menu-battle-information-v1", "In battle, replaces the raw battler lines with what each action allows, from game RAM and ROM tables: the battle kind (wild or trainer, PROF. BIRCH rescue), the 2x2 FIGHT/BAG/POKéMON/RUN menu with the highlighted option, and an allowed/REFUSED verdict with the game's own message only for actions the game can refuse (RUN in trainer battles, the Birch rescue, trapping abilities, MEAN LOOK/wrap/INGRAIN; BAG in link and Frontier battles; switching while trapped). RUN also says whether escape is guaranteed by speed (the odds are not computed). The foe gets everything a talented player would remember: types, exact HP, status, ability, held item, stats, non-neutral stat stages, volatile conditions and every move with type, physical/special/status, power, accuracy and PP. Your active Pokémon gets the same plus its moves in menu order with the highlighted move and 0-PP refusals; every party member gets types, ability, item, HP, status, whether it can switch in, and its full moveset. Usable, unusable and ball items are separated (balls are blocked and lost in trainer battles). An empty bag reads \"Bag: empty\". Disable, Taunt, Torment, Imprison, Encore, Choice Band locks, the escape-try counter and battle text are not read. Off: today's expanded battle lines (Battle state, Battler, Battle input) and a bare \"Bag: \" for an empty bag."),
  on("dialogue-auto-advance-v1", "guidance", "DIALOGUE AUTO-ADVANCE", "active-field-message-buffer-v1", "As soon as a press or navigate_to opens or continues a field message, the harness itself advances it with B, waiting for each page to finish printing, until the next decision point: free field control, a YES/NO or other menu (named with its options and highlighted choice), the naming screen, a battle, a screen change, or a cutscene that keeps controls locked with no message (waited out for up to 10 s). Buttons left in the model's batch once the conversation opens (its text in the buffer or its message phase) are not sent, so extra A presses cannot restart it; the result lists them. Press and navigate_to results describe the state after the advance, not the open box it started from. At most 50 automatic presses and 90 s per call, and a stop at either cap says so. The result lists every page shown, whole and in order, with speaker (the game's NAME: prefix, else the faced sprite kind, labelled as such), map, position and turn; get_dialogue searches every recorded page by speaker, words, map or recency. Each advance is recorded as a dialogue_auto_advance event. Needs the dialogue phase readout. Off: every requested button is sent and the model advances dialogue itself, one batch per turn; no get_dialogue."),
  on("warp-arrival-settle-v1", "observation", "WARP ARRIVAL SETTLE", null, "Observations after a door, stairs or warp wait, per emulated frame, until the game's own door/warp task ends (Task_DoDoorWarp, Task_WarpAndLoadMap, Task_ExitDoor, Task_ExitNonAnimDoor or Task_ExitNonDoor live while field controls are locked), so the model sees the arrival tile on the new map with field controls free. The wait is bounded at 300 emulated frames (the longest measured chain is 137); a capture taken while the animation still runs reads \"Field controls: locked (door/stairs/warp animation still running; observe again)\". A script, message or menu lock with no warp task is captured at once and keeps today's label. Each observation records settle frames and reason. With transition-press-result-v1, a warp is reported as \"warped during this press\" even when an interface owner was active in a snapshot. Off: observations wait only for palette fades and black loading frames (146 frames), a capture mid door/stairs animation reads \"Field controls: locked (dialog, menu, or script; direction presses cannot move)\", and a warp with an active interface owner reads as an interface change."),
  on("dialogue-context-kept-v1", "guidance", "DIALOGUE KEPT IN CONTEXT", null, "Story dialogue stays in the model's context for as long as its turn does. When an older tool result is collapsed to its one-line summary, every dialogue page that result showed is kept after that line, whole and byte for byte: the auto-advance page list (speaker, map, position, turn), the readout's Dialog line, and a get_dialogue or recall_dialogue result. Frames are still dropped and results without dialogue still collapse to one line; the window keeps the same turns. The loop supervisor, stall briefing and text-only supervisor also quote, whole and oldest first, every dialogue page recorded between the previous story milestone and the latest story milestone the game confirmed (by event order, not turn) (an earlier one if the latest had none), before the three newest pages. Off: a collapsed result keeps only its first line (or action and location), so dialogue older than the newest 4 to 6 results leaves the context, and the supervisors quote only the three newest pages."),
  on("displayed-place-names-v1", "observation", "DISPLAYED PLACE NAMES", RAM, "Names signs, and the Littleroot buildings the game names on its signs, by the text the game prints for this save instead of by source symbols. A sign reads as Sign text \"...\" with every line of the text its script shows, read from the ROM at the sign's own script; the script's player-gender branch is followed using the saved gender, and {PLAYER} is the saved name. Furniture with a verified name of its own (Notebook, GameCube) keeps it. For a boy, the sign at Littleroot (12,8) reads Sign text \"PROF. BIRCH'S HOUSE\" (not Mays House Sign) and (7,8) reads Sign text \"RED's HOUSE\" for a player named RED. Sign labels show where named interactions are on, and they also reach the loop supervisor's lists. The two houses (1F and 2F) and the lab take the same names in the Location line and, with the warp and world destination switches, in warp destinations: (14,8) -> PROF. BIRCH'S HOUSE 1F (map 1/2). A girl's save gets the swapped names. The same displayed name reaches press results, dialogue page headers and get_dialogue's map filter, the dialogue log and recall_dialogue's room filter, the loop supervisor, stall briefing and instruction ledger rooms, navigation memory and objective evidence, where a location condition matches either name (state JSON location_display, page map_display). Any other script shape, placeholder or an unknown gender keeps today's name; the JSON location is unchanged, so milestones and room identity are too. Off: signs keep their script-symbol names (Mays House Sign) and buildings their map-constant names (LITTLEROOT TOWN MAYS HOUSE 1F)."),
  on("transition-loop-detection-v1", "guard", "TRANSITION LOOP DETECTION", null, "Lets the loop guard see door, stairs and warp bounces. A press that lands mid-animation (field controls locked, no message, the game's script context stopped) no longer wipes the guard's cycle history; that step is skipped. Walking back and forth between the same maps with no new story, party, money, badge or item change and no new milestone counts as a cycle on the third repeat of the same 2-4 map changes, through the usual warning and supervisor briefing; the warning says the map moves are repeating. Locks with a message or a running script still reset the history as before. Off: any locked step clears the cycle history and map changes are not counted."),
  on("blocked-batch-result-v1", "guidance", "BLOCKED BATCH RESULTS", "press-result-v1", "When a press batch of one repeated direction (two or more presses) leaves the player on the same tile with field controls free before and after, and the player ends facing that direction, the press result says so: \"blocked: LEFT ×3 did not move you; you are still at (10,16) facing left\" (or \"turned down -> left but did not move\"), then names what the model's own local map shows on the next tile. Terrain that cannot be entered from here (a collision tile, a counter, a ledge that only hops another way, ~ water while on foot, an edge wall, the map edge with no connection that way) reads \"blocked\" and says the direction cannot move the player from here. A person, object or warp on the next tile is described, but the result reads \"no movement\", because object height is not read and a warp is not an obstacle. Anything else reads \"no movement\" with the cause not known; height differences are never named. Each fact follows the switch that draws it: tiles only with the live map, ledges with ledge hops, edge walls with one-way tiles, counters with counter talk, map connections with world destinations, coordinates and facing with player position. Single presses, mixed or non-direction batches and locked or unverified states keep their usual text. Off: the batch reads \"unchanged world position/facing (batch or non-direction input; intermediate effects unknown)\", and a batch that only turned reads \"turned <from> -> <to>; no net movement\"."),
  on("battle-triage-guidance-v1", "guidance", "BATTLE TRIAGE GUIDANCE", null, "Adds a system-prompt section: a wild battle can be left with RUN, the bottom-right option of the FIGHT BAG / POKéMON RUN menu (from FIGHT: RIGHT, DOWN, A); trainer and some story battles cannot be fled; run when your active Pokémon is below half its maximum HP or the fight is not needed for a story goal; heal before tall grass with a weak Pokémon (a POKéMON CENTER nurse heals the whole party, and so does MOM at home). With the RAM readout on, the game server adds one line from RAM: in a wild battle with the battle menu open (action or move select) when your active Pokémon is below half its max HP and battle-details-v2's RUN rule allows RUN (\"Your TORCHIC has 5/20 HP (below half). This is a wild battle: RUN is allowed (bottom-right of the battle menu).\"); nothing in trainer battles, the PROF. BIRCH rescue or when trapped. On the field, when the first party Pokémon able to battle is below half HP, one line names the POKéMON CENTER nurse and MOM at home. Tools are unchanged. Off: no prompt section and no lines; prompt and readouts are byte-for-byte today's."),
  on("adjacent-tiles-v1", "observation", "ADJACENT TILES", "live-map-v1", "Adds one line directly under the map grid that names the four tiles next to the player in words, in the order up, down, left, right, with each tile's coordinates (only when the position line is shown) and its map glyph in brackets: \"Next tiles: up (8,6) ledge (v), hops down only, cannot be entered from here; down (8,8) clear (.); left (7,7) clear (.); right (9,7) clear (.)\". Each tile is named by the glyph the map draws for it under the run's other switches (ledges with ledge hops, edge walls with one-way tiles, counters with counter talk; otherwise # or .), from the same live tiles. \"Cannot be entered from here\" is said only where the game always refuses the step: a collision tile, a ledge pressed from a side other than its hop direction, an edge wall on that side, or a map edge with no connection (named only when map topology is shown). A ledge pressed its own way is named as the hop. Water is called not walkable on foot only when the game says the player is on foot. People, objects and warps are described, never called blockers, and height is never named. Off: no Next tiles line; the map block is unchanged."),
  on("readout-rules-in-prompt-v1", "observation", "READOUT RULES IN PROMPT", RAM, "Removes the fixed map rules from every readout and states them once in the system prompt, in a \"Map symbols and rules\" section built from the same text the server prints: the map legend line (@ player; N live object; W warp location ...; # collision; g grass; ~ water; plus ledges, edge walls and the ? outside-map mark only when this run's switches draw them), \"Terrain rules, elevation and objects can still block movement.\", the \"Warp destinations are ...\" note (with warp activation guidance) and \"Trigger elevation must also match the player on entry (0 matches any elevation).\" (with coordinate script conditions). In the prompt the legend says each warp's activation is listed in the readout's Warps line, and edge-wall sides in its Edge walls line. Under the map the readout keeps one line, \"Map symbols and rules: see the system prompt.\" The counter legend (= ...) depends on the map, so a map that draws a counter keeps it as its own line under that pointer; the prompt never describes it. If the whole map is unavailable and the local map is shown instead, that readout keeps its own legend and rules. Nothing else in the readout changes or moves: the Edge walls, Live objects and Warps lines, script-trigger lists and interaction candidates stay. State-only decisions have no system prompt section, so they need this switch off. Off: every readout prints the legend and rules under its map as before, and the system prompt has no map rules section."),
  on("explorer-guidance-v1", "guidance", "TALK TO PEOPLE", null, "Adds a short system-prompt section saying that in this game people tell you where to go next: after each story event, and whenever the model is unsure where to go, talk to everyone in the room before leaving, including the families and neighbours of characters met; talk again to people met earlier, since they often say something new once the story moves on; and treat a short remark, such as where someone has gone, as a direction to follow. With dialogue auto-advance on, it adds that talking is cheap (face the person and press A; the harness reads the conversation until the model's next decision). Names no character, place or story step. State-only decisions require it off. Off: no such section."),
  on("connection-edge-tiles-v1", "observation", "CONNECTION EDGE TILES", null, "Each walking map connection in the Map connections readout lists the exact edge tiles you can walk off, read from the game's live map (the connected map's blocks in the padding, the connection offset and the connected map's size): for example \"NORTH -> ROUTE101 (map 0/16), offset 0; walk off the map from (10,0) or (11,0): stand on one of these edge tiles and press UP\". A tile is listed only when it and the tile one step out are both passable on foot (no collision, water, wall on that side or height mismatch); an edge with none says so. People standing there are not checked. The loop supervisor and stall briefing add the same tiles as a line, and a navigate_to refusal whose nearest reachable tile is one of them names the map it leads to and the button that crosses. Off: \"boundary continuation: walk across the matching edge in this direction\", no supervisor line and the plain refusal."),
  on("in-game-naming-readout-v1", "observation", "IN-GAME NAMING READOUT", "naming-cursor-v1", "Naming screens opened during play (a Pokémon nickname, a box name, a caught Pokémon's name) get the same readout the player-name screen has, read from game RAM: the name being edited, the keyboard page, the cursor column and row with the selected key, and whether input is ready. Off: only the player-name screen before the game starts has it; during play the readout shows no naming lines."),
  on("no-nickname-guidance-v1", "guidance", "NO NICKNAMES", null, "Adds one system-prompt paragraph for a speed run: when the game offers to nickname a Pokémon, answer NO; if already on a Pokémon's nickname screen, do not edit it but press START (cursor to OK) then A, since any nickname is fine and an empty one keeps the Pokémon's own name. Off: no nickname guidance."),
  on("disproved-beliefs-v1", "guidance", "DISPROVED BELIEFS LEDGER", "story-state-v1", "Pins a ledger before each decision, once it has an entry: \"Things the game has contradicted\". Each entry pairs what the model pursued with the game's evidence against it, both from this run's records. Two sources: a move a script pushed back (a press or navigate_to during which dialogue began with the player on one tile and the call ended one tile back on the same map, against the way it was going: the tile, every turn it was tried, the latest action and the pages shown, whole); and a story character the model's own sentence placed on a tile (\"Prof. Birch is at (7,7)\") while the readout it had just seen said Not on this map for that character (the sentence, every turn, the whole Story characters line, and any conversation on that map naming the character). Names are only the readout's own story-character names, in its spelling or title case (MAY or May, never the word may; the game's PROF. also as Prof. or Professor), never possessive, a sprite kind or in parentheses, in a sentence with no negation or hedge (not, n't, never, away, might, maybe, probably, if, may, could and the like). Needs the story state: a story-flag change retires entries. An entry leaves when any story flag changes, when that map's readout lists the character as here, or when the player reaches the tile the push-back refused. Nothing is clipped; recorded as belief_ledger. Off: no ledger."),
  on("same-plan-breaker-v1", "guard", "SAME-PLAN BREAKER", "deterministic-loop-guard-v1", "Posts a SUPERVISOR note through the loop guard when the model's last 3 plans (each reply's thinking and text) are near-identical (every pair at least 0.80 by token LCS: 2·LCS/(|a|+|b|) over lowercase words, numbers and symbols) and none of those 3 decisions reached a game state outside the two states just before them (screen, map, position, facing, field-control lock, story flags, party species/level/HP/status, battle phase/turn/battlers, menu phase and selection, dialogue text), with field controls free or battle input ready in at least one. The note is factual and quotes the latest plan whole: \"Your last 3 plans (turns a, b, c) were the same and the game state did not change: …\", or names the two states it went back and forth between. Intro, naming and transition states never qualify. It re-arms after 3 more decisions; the run continues. Off: no such note."),
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
  measured("route-101-after-handoff-v1", "BACK ON ROUTE 101", "Records the first step onto Route 101 from Littleroot Town or Oldale Town after Professor Birch's lab handoff (Birch lab state 3, 4 or 5), with a pre-handoff state, the town and the route as evidence. The model is never told about it, and it does not restart the stall clocks. A run that starts after the handoff gets no credit."),
  measured("bedroom-exit-v1", "LEFT BEDROOM", "Records the first walk down from the player's bedroom to the same family's ground floor after the clock is set, while the intro state is still 6 (the clock is set and Mom has not yet sent the player to meet the rival), with the bedroom and the ground floor as evidence. A save whose intro state is already 7 has left the bedroom before and gets no credit. The model is never told about it, and it does not restart the stall clocks."),
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
  "battle-details-v2", "warp-arrival-settle-v1", "displayed-place-names-v1", "battle-triage-guidance-v1",
  "adjacent-tiles-v1", "readout-rules-in-prompt-v1", "connection-edge-tiles-v1", "in-game-naming-readout-v1",
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
    ...when("active-ui-ownership-v1"), "story-milestones-v2", "new-game-created-v1", "post-clock-navigation-milestones-v1", "rustboro-gym-trainer-milestones-v1", "native-progress-activity-v1", "battle-choices-v1", "continuous-battle-state-v1", "validated-pokemon-v1", "menu-observability-v1", "native-action-history-v1", "full-raw-ram-v1", "remaining-native-milestones-v1", "birch-rescue-requested-v1", "rival-house-exit-v1", "route-101-after-handoff-v1", "bedroom-exit-v1",
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
    ...when("battle-details-v2"),
    ...when("dialogue-auto-advance-v1"),
    ...when("warp-arrival-settle-v1"),
    ...when("dialogue-context-kept-v1"),
    ...when("displayed-place-names-v1"),
    ...when("transition-loop-detection-v1"),
    ...when("blocked-batch-result-v1"),
    ...when("battle-triage-guidance-v1"),
    ...when("adjacent-tiles-v1"),
    ...when("readout-rules-in-prompt-v1"),
    ...when("explorer-guidance-v1"),
    ...when("connection-edge-tiles-v1"),
    ...when("in-game-naming-readout-v1"),
    ...when("no-nickname-guidance-v1"),
    ...when("disproved-beliefs-v1"),
    ...when("same-plan-breaker-v1"),
  ];
}

// The inverse: which switches a recorded run had, from its harness_features.
export function featuresOf(harnessFeatures: readonly string[]): FeatureSet {
  return Object.fromEntries(SWITCHABLE_FEATURES.map((id) => [id, harnessFeatures.includes(id)])) as Record<SwitchableFeature, boolean>;
}

export function stateOnlyProblems(features:FeatureSet):string[]{
 if(!features["state-only-decisions-v1"])return [];
 return (["objective-tracking-v1","deterministic-loop-guard-v1","bounded-navigation-v1","press-result-v1","navigation-evidence-memory-v1","game-evidence-priority-v1","dialogue-log-v1","instruction-ledger-v1","disproved-beliefs-v1","next-milestone-hint-v1","double-context-window-v1","fresh-retry-v1","text-only-supervisor-v1","dialogue-auto-advance-v1","readout-rules-in-prompt-v1","explorer-guidance-v1"] as const).filter(id=>features[id]).map(id=>`state-only-decisions-v1 requires ${id} OFF`);
}
