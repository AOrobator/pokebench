// Play-run configuration: limits, prompts and the feature-dependent parts of
// what the model is told. The prompt constants moved here byte for byte from
// live.ts; every feature switched on reproduces the earlier prompt exactly.
import type { Limits } from "./harness.js";
import { objectivePrompt, type ObjectiveSwitches } from "./objective-tools.js";
import type { FeatureSet } from "./features.js";
import type { ToolSwitches } from "./game-tools.js";

export const PLAY_LIMITS: Limits = { maxTurns: 300, maxWallMs: 30 * 60_000, failureLimit: 3 };
export const PLAY_MAX_TOKENS = 4096;
export const PLAY_THINKING = "medium";

export const PLAY_SYSTEM_PROMPT = `You are playing Pokémon Emerald on a Game Boy Advance emulator. Your goal is to make as much story progress as you can: start a new game, get your first Pokémon, and work toward defeating the first Gym Leader in Rustboro City.

You act through game tools:
- observe: shows the current screen and a text readout of the game state read from memory (location, coordinates, party, and an ASCII map of the surroundings).
- press: presses up to 8 buttons in order (A, B, START, SELECT, UP, DOWN, LEFT, RIGHT), then shows the new screen and state.

Controls: A confirms, talks and interacts; B cancels and backs out; START opens the menu; each D-pad press moves one tile, and a press in a new direction may only turn you to face it.

Dialogue: use B to advance or dismiss ordinary dialogue. Prefer short batches, then observe. Once field controls are available, stop dismissing and move away. Extra A presses can restart an NPC conversation. Use A to initiate interactions or confirm selections; B may cancel menus and confirmation prompts.

Warps: W marks a transition location, not a universal step-on trigger. Follow its activation description in the state readout: directional exits require standing on the tile and pressing the indicated direction; doors require walking toward them; step-on warps activate by entering the tile. A is not a universal warp button. If activation is unknown, use the screen and small controlled attempts rather than assuming every W works alike. Near a transition, use short button sequences and check the new map and position before continuing; remaining buttons may act on the destination map. If field controls are locked, resolve the dialog, menu or script before trying to walk.

In every reply, think briefly about what you see and what to do next, then call a tool. Replies without a tool call do nothing.`;

export const PLAY_GOAL = "Start a new game, obtain a starter, and work toward defeating the first Gym Leader in Rustboro City.";
export const PLAY_TASK = "The game has just booted. Begin playing.";

// Documentation treatment only: retain the pre-experiment prompt verbatim above.
export const CONTEXTUAL_CONTROLS = `Buttons are contextual: their meaning depends on the current screen, selected control, and whether input is ready. Screen-specific instructions below override general controls. START does not always open a menu.

Overworld: A talks or interacts with what you face; B can dismiss ordinary dialogue; START opens the menu only when field controls permit it. D-pad input attempts movement and may only turn you on the first press. When controls are locked, direction presses cannot walk. In menus and confirmation questions, directions change the highlighted option, A chooses that option, and B may cancel. Never assume the highlighted option is YES.

State and interface documentation: use the latest screenshot and readout together. A selected key is the key under the cursor now, not the name buffer or a group of possible letters. Unknown/unavailable state does not establish that a menu is closed or that input is accepted. Readouts of the name being edited, selected key, keyboard page, and readiness describe the current editor; editor text is not a confirmed trainer name.

Naming editor (player name or Pokémon nickname): each letter is an individual key, not phone-style cycling groups. A on a character appends exactly that character; repeated A appends repeated characters rather than cycling letters. B deletes the last character. SELECT or A on PAGE changes the keyboard page. START moves the cursor to OK; it does not open a menu or submit the name. A on OK finishes editing. A on BACK deletes. Directions move the cursor through keys; edges wrap and the side-button column has three rows, so check the returned selected key rather than assuming a rectangular cursor path. If input is transitioning, observe again before interpreting a press as accepted.

Naming layout, zero-based rows and columns: uppercase and lowercase have eight character columns (0-7), plus side buttons at column 8: PAGE row 0, BACK row 1, OK row 2. Uppercase rows, with SPACE explicitly shown:
row 0: A B C D E F SPACE .
row 1: G H I J K L SPACE ,
row 2: M N O P Q R S SPACE
row 3: T U V W X Y Z SPACE
Lowercase uses the same positions with lowercase letters. Symbols have six character columns (0-5), plus PAGE/BACK/OK at column 6:
row 0: 0 1 2 3 4 SPACE
row 1: 5 6 7 8 9 SPACE
row 2: ! ? ♂ ♀ / -
row 3: … “ ” ‘ ' SPACE
When the editor fills its allowed length, it may move the cursor to OK automatically; inspect the selected key and text. After player-name editing, Birch asks a separate confirmation question. Inspect that screen and its actual selected option; editor OK alone is not final player-name acceptance. Pokémon nicknaming can use the same keyboard, so the naming screen alone does not prove which name is being edited.

Clock interface: LEFT/RIGHT adjust the clock hands; A opens a confirmation question. The question can initially select NO; repeated A is not evidence of acceptance. Check the visible highlighted option, use directions to change it if needed, and use A to choose it; B returns to adjustment. Confirm completion from the subsequent game state rather than the press alone.`;

export const DOCUMENTED_PLAY_SYSTEM_PROMPT = PLAY_SYSTEM_PROMPT.replace(
  "Controls: A confirms, talks and interacts; B cancels and backs out; START opens the menu; each D-pad press moves one tile, and a press in a new direction may only turn you to face it.",
  CONTEXTUAL_CONTROLS,
);

const GOAL_SENTENCE = "Your goal is to make as much story progress as you can: start a new game, get your first Pokémon, and work toward defeating the first Gym Leader in Rustboro City.";
const OBSERVE_LINE = "- observe: shows the current screen and a text readout of the game state read from memory (location, coordinates, party, and an ASCII map of the surroundings).";
const OBSERVE_SCREEN_ONLY = "- observe: shows the current screen.";
const PRESS_LINE = "- press: presses up to 8 buttons in order (A, B, START, SELECT, UP, DOWN, LEFT, RIGHT), then shows the new screen and state.";
const PRESS_SCREEN_ONLY = "- press: presses up to 8 buttons in order (A, B, START, SELECT, UP, DOWN, LEFT, RIGHT), then shows the new screen.";
const WARP_PARAGRAPH = /\n\nWarps: [^\n]*/;

export function playGoal(target: string | null): string {
  return target === null ? PLAY_GOAL : `Reach the native game milestone ${target.replaceAll("_", " ")}.`;
}

export function playSystemPrompt(features: FeatureSet, target: string | null): string {
  let prompt = features["contextual-interface-docs-v1"] ? DOCUMENTED_PLAY_SYSTEM_PROMPT : PLAY_SYSTEM_PROMPT;
  if (features["bounded-navigation-v1"]) prompt += "\n\n- navigate_to: supply x, y and the current map_id from the Navigation map_id readout. Walks toward a coordinate on the current map using bounded A* on known local tiles. Farther targets within verified map bounds use a reachable local frontier, with up to eight ordinary button attempts. Choose the destination from observed evidence. This tool does not pick story objectives, press A, surf or solve ledges. It stops on blocked movement, locks or map changes. Inspect its returned state; reaching a directional-exit tile may still require its indicated button.";
  if (features["dialogue-safe-batches-v1"]) prompt += "\n\nInterface input safety: interaction/menu inputs or locked/unknown-interface batches submit only the first input, then return a fresh observation. Repeated A can dismiss a message and reopen the object you face. Identical text is not evidence of a mandatory cutscene or new story progress. Inspect one input before choosing the next approach.";
  if (target !== null) prompt = prompt.replace(GOAL_SENTENCE, `Your goal is: ${playGoal(target)}`);
  if (!features["ram-state-v1"]) prompt = prompt.replace(OBSERVE_LINE, OBSERVE_SCREEN_ONLY).replace(PRESS_LINE, PRESS_SCREEN_ONLY);
  if (!features["warp-activation-guidance-v1"]) prompt = prompt.replace(WARP_PARAGRAPH, "");
  if (features["ledge-hops-v1"]) prompt = prompt.replace("press A, surf or solve ledges.", "press A or surf. It hops a ledge only in its arrow direction.");
  return features["objective-tracking-v1"]
    ? `${prompt}\n\n${objectivePrompt(objectiveSwitches(features))}`
    : prompt;
}

// The objective record repeats state facts; it hides those whose switch is off.
export function objectiveSwitches(features: FeatureSet): Required<ObjectiveSwitches> {
  return {
    repeatGuard: features["repeat-attempt-guard-v1"],
    nativeCompletion: features["native-objective-completion-v1"],
    hiddenFacts: [
      ...(features["live-player-position-v1"] ? [] : (["position", "facing"] as const)),
      ...(features["naming-cursor-v1"] ? [] : (["naming"] as const)),
      ...(features["field-control-lock"] ? [] : (["field_controls_locked"] as const)),
    ],
  };
}

export function toolSwitches(features: FeatureSet): ToolSwitches {
  return { safeInterfaces:features["dialogue-safe-batches-v1"], automaticRunning:features["automatic-running-v1"], readout: features["ram-state-v1"], pressResult: features["press-result-v1"], position: features["live-player-position-v1"], fieldLock: features["field-control-lock"] };
}

export function playTools(features: FeatureSet): string[] {
  return ["observe", "press", ...(features["objective-tracking-v1"] ? ["get_objectives", "set_objective", "update_objective"] : []), ...(features["bounded-navigation-v1"] ? ["navigate_to"] : [])];
}
