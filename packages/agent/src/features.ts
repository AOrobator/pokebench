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
] as const;
export type SwitchableFeature = (typeof SWITCHABLE_FEATURES)[number];

export const MEASUREMENT_FEATURES = [
  "story-milestones-v2",
  "clock-milestone-v1",
  "new-game-created-v1",
  "post-clock-navigation-milestones-v1",
  "rustboro-gym-trainer-milestones-v1", "native-progress-activity-v1", "battle-choices-v1",
  "continuous-battle-state-v1", "validated-pokemon-v1", "menu-observability-v1", "native-action-history-v1", "full-raw-ram-v1", "remaining-native-milestones-v1",
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
  on("navigation-evidence-memory-v1", "guidance", "NAVIGATION EVIDENCE MEMORY", RAM, "Pins bounded observed dialogue, visited rooms and attempted-target outcomes before each turn; optional remember_destination retains a model hypothesis with evidence references. No route or objective enforcement. Off: ordinary sliding conversation and no memory tool."),
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
  return SWITCHABLE_FEATURES.flatMap((id) => {
    const needs = featureInfo(id).needs;
    return features[id] && needs !== null && !features[needs] ? [`${id} needs ${needs}`] : [];
  });
}

// Observation switches the game server applies to its readout.
export const SERVER_FEATURES: readonly SwitchableFeature[] = [
  "expanded-menu-battle-information-v1",
  "ram-state-v1", "live-map-v1", "live-player-position-v1", "world-coordinate-grid-v1", "live-object-sprites-v1",
  "world-targets-v1", "named-interactions-v1", "world-destinations-v1", "bounded-navigation-v1", "field-dialogue-phase-v1", "active-field-message-buffer-v1", "naming-cursor-v1", "story-state-v1",
  "coordinate-script-conditions-v1", "field-control-lock", "warp-activation-guidance-v1", "ledge-hops-v1", "one-way-tiles-v1",
  "full-map-navigation-v1", "counter-talk-v1",
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
    ...when("active-ui-ownership-v1"), "story-milestones-v2", "new-game-created-v1", "post-clock-navigation-milestones-v1", "rustboro-gym-trainer-milestones-v1", "native-progress-activity-v1", "battle-choices-v1", "continuous-battle-state-v1", "validated-pokemon-v1", "menu-observability-v1", "native-action-history-v1", "full-raw-ram-v1", "remaining-native-milestones-v1",
    ...(target === null ? [] : ["native-target-stop-v1"]), "deterministic-loop-diagnostics-v1", LOOP_POLICY_FEATURE,
    ...when("deterministic-loop-guard-v1"), ...when("contextual-interface-docs-v1"),
    ...when("navigation-evidence-memory-v1"), ...when("automatic-running-v1"), ...when("expanded-menu-battle-information-v1"), ...when("state-only-decisions-v1"), ...when("objective-tracking-v1"), ...when("repeat-attempt-guard-v1"), ...when("native-objective-completion-v1"),
    ...when("full-map-navigation-v1"),
  ];
}

// The inverse: which switches a recorded run had, from its harness_features.
export function featuresOf(harnessFeatures: readonly string[]): FeatureSet {
  return Object.fromEntries(SWITCHABLE_FEATURES.map((id) => [id, harnessFeatures.includes(id)])) as Record<SwitchableFeature, boolean>;
}

export function stateOnlyProblems(features:FeatureSet):string[]{
 if(!features["state-only-decisions-v1"])return [];
 return (["objective-tracking-v1","deterministic-loop-guard-v1","bounded-navigation-v1","press-result-v1","navigation-evidence-memory-v1"] as const).filter(id=>features[id]).map(id=>`state-only-decisions-v1 requires ${id} OFF`);
}
