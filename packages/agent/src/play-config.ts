// Play-run configuration: limits, prompts and the feature-dependent parts of
// what the model is told. The prompt constants moved here byte for byte from
// live.ts; every feature switched on reproduces the earlier prompt exactly.
import type { Limits } from "./harness.js";
import { objectivePrompt, type ObjectiveSwitches } from "./objective-tools.js";
import type { FeatureSet } from "./features.js";
import type { ToolSwitches } from "./game-tools.js";
import { NAVIGATE_RULES } from "./navigation.js";
import { mapRulesSection } from "./map-rules.js";
import { MOVING_AROUND_FULL, MOVING_AROUND_LOCAL, navigateFirstToolList } from "./navigate-first.js";

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

export const GAME_EVIDENCE_SECTION = `Game evidence first: this game, as observed, is the source of truth. What characters have told you, the names of people, objects and rooms in the readout, the location line and the story flags outrank what you remember about Pokémon games, guides or walkthroughs. Your memory of the series can be wrong about this moment of this game. Before choosing where to go, name the observed evidence that supports it: who said it, where, and what they said. When your expectation and the game disagree, for example a different person, a different room or unexpected dialogue, believe the game, say so in one sentence, and change your plan. Do not keep pursuing a goal no character or readout in this game has given you; if nothing tells you where to go, explore places you have not tried yet.`;

export const DIALOGUE_AUTO_ADVANCE_SECTION = `Dialogue auto-advance: once a press or navigate_to opens or continues a field message, the harness advances it with B itself, page by page, until the next decision point: field control returns, a YES/NO or other menu opens, the naming screen, a battle, a screen change, or a cutscene that keeps controls locked. The result lists every page shown, whole, with speaker, map, position and turn. Buttons left in your batch once the conversation opens are not sent, so you never need A or B to read dialogue; decide your next action from the returned state. A menu is left for you to choose. get_dialogue searches every page recorded this run by speaker, words, map or recency.`;

export const EXPLORER_GUIDANCE_SECTION = "Talk to people: in this game, people tell you where to go next. After each story event, and whenever you are unsure where to go, talk to everyone in the room you are in before you leave, including the families and neighbours of characters you have met. People often say something new once the story has moved on, so talk again to people you spoke to before. A short remark, such as where someone has gone, is a direction to follow, not small talk.";

export const EXPLORER_TALK_IS_CHEAP = "Talking is cheap: face the person and press A; the harness reads the conversation until your next decision.";
export const BATTLE_TEXT_AUTO_ADVANCE_SECTION = `Battle text auto-advance: in a battle the harness also advances the battle messages itself, pressing B on each message that waits, until the action or move menu is ready, a YES/NO question opens, another screen opens (bag, party, summary, naming) or the battle ends. The result lists every battle message shown, whole and in order, with its battle turn, including the ones that pass on their own. Buttons left in your batch once the battle text starts are not sent, so you never need A or B to read battle text; choose from the menu that is open.`;

export const NO_NICKNAME_SECTION = "Nicknames: this is a speed run, and naming a Pokémon only costs time. When the game offers to give a Pokémon a nickname, answer NO. If you are already on the naming screen for a Pokémon's nickname, do not type or fix letters: press START to move the cursor to OK, then A. Any nickname is fine, and with nothing typed the Pokémon keeps its own name.";

export const NAVIGATE_TO_USAGE = `Use navigate_to for any walk of two or more tiles on the current map, using coordinates from the readout. To go through a door or stairs, give the warp's own coordinates as the destination; at a directional exit, arrive on its tile, then press the direction its activation describes. When navigate_to stops early, read its reason and pick a reachable tile or a different listed exit instead of falling back to long runs of single presses. Use press for talking, menus, dialogue and short adjustments.`;

// battle-triage-guidance-v1: game rules for leaving wild battles and healing; no destinations.
export const BATTLE_TRIAGE_SECTION = "Battles and healing: you can leave a wild battle with RUN, the bottom-right option of the battle menu (FIGHT BAG / POKéMON RUN); from FIGHT press RIGHT, then DOWN, then A. An escape can fail when the foe is faster; try again. Trainer battles and some story battles cannot be fled. Run from a wild battle when your active Pokémon is below half its maximum HP, or when you are travelling to a story goal and the fight is not needed. Heal before walking into tall grass with a weak Pokémon: talking to the nurse at a POKéMON CENTER heals your whole party, and so does talking to MOM at home.";

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
  if (features["bounded-navigation-v1"] && features["full-map-navigation-v1"]) prompt += `\n\n- navigate_to: supply x, y and the current map_id from the Navigation map_id readout. Walks to a coordinate on the current map using A* over the whole current map shown in the readout, one ordinary button at a time, re-planning before every press. The route never crosses a warp unless it is the destination. Choose the destination from observed evidence. This tool does not pick story objectives, press A, surf or solve ledges. It stops on blocked or unexpected movement, locks, map changes, or when the route stops getting shorter. Inspect its returned state; reaching a directional-exit tile may still require its indicated button. ${NAVIGATE_RULES}`;
  else if (features["bounded-navigation-v1"]) prompt += `\n\n- navigate_to: supply x, y and the current map_id from the Navigation map_id readout. Walks toward a coordinate on the current map using bounded A* on known local tiles. Farther targets within verified map bounds use a reachable local frontier, with up to eight ordinary button attempts. Choose the destination from observed evidence. This tool does not pick story objectives, press A, surf or solve ledges. It stops on blocked movement, locks or map changes. Inspect its returned state; reaching a directional-exit tile may still require its indicated button. ${NAVIGATE_RULES}`;
  if (features["dialogue-safe-batches-v1"]) prompt += "\n\nInterface input safety: interaction/menu inputs or locked/unknown-interface batches submit only the first input, then return a fresh observation. Repeated A can dismiss a message and reopen the object you face. Identical text is not evidence of a mandatory cutscene or new story progress. Inspect one input before choosing the next approach.";
  if (target !== null) prompt = prompt.replace(GOAL_SENTENCE, `Your goal is: ${playGoal(target)}`);
  if (!features["ram-state-v1"]) prompt = prompt.replace(OBSERVE_LINE, OBSERVE_SCREEN_ONLY).replace(PRESS_LINE, PRESS_SCREEN_ONLY);
  if (!features["warp-activation-guidance-v1"]) prompt = prompt.replace(WARP_PARAGRAPH, "");
  if (features["ledge-hops-v1"]) prompt = prompt.replace("press A, surf or solve ledges.", "press A or surf. It hops a ledge only in its arrow direction.");
  if(features["navigation-evidence-memory-v1"])prompt+="\n\nA bounded navigation evidence ledger is supplied before each decision. It quotes observations and records attempted targets. Use it to choose destinations from observed instructions; current state overrides stale facts. remember_destination optionally retains your evidence-linked destination hypothesis; it is not required before acting and never proves completion.";
  if (features["dialogue-log-v1"]) prompt += "\n\n- recall_dialogue: searches every dialogue page you have been shown this run, newest first, with turn, location, your position and the character you faced when known. Filter by contains, room or last. Use it when you are unsure what someone told you or where you heard it.";
  if (features["next-milestone-hint-v1"]) prompt += "\n\n- get_next_milestone: tells you the next main story milestone to pursue and how many are done. Call it whenever you are unsure what to do next. When you reach a milestone, a MILESTONE REACHED message also tells you the next one.";
  if (features["instruction-ledger-v1"]) prompt += "\n\nAn INSTRUCTION LEDGER is supplied before each decision: the latest dialogue you were shown, the rooms you visited with what you heard there, and contradictions you recorded. It quotes the game; it is not a walkthrough. When the game turns out different from what you expected, record it with note_contradiction (expected, observed, 1–4 event numbers) so you do not repeat the same wrong assumption.";
  if (features["loop-guard-supervisor-v1"]) prompt += "\n\nLoop supervisor: if you repeat a pattern without new game information, a SUPERVISOR note summarizes where you are, the last dialogue you were shown, what you tried and what is listed here that you have not tried. The run continues; use the note to change strategy.";
  if (features["dialogue-auto-advance-v1"]) prompt += `\n\n${DIALOGUE_AUTO_ADVANCE_SECTION}`;
  if (features["battle-text-auto-advance-v1"]) prompt += `\n\n${BATTLE_TEXT_AUTO_ADVANCE_SECTION}`;
  // navigate-first-prompt-v1: its Moving around section replaces the one-line usage rule.
  const navigateFirst = features["navigate-first-prompt-v1"] && features["bounded-navigation-v1"];
  if (features["game-evidence-priority-v1"]) prompt += `\n\n${GAME_EVIDENCE_SECTION}${features["bounded-navigation-v1"] && !navigateFirst ? `\n\n${NAVIGATE_TO_USAGE}` : ""}`;
  if (features["no-nickname-guidance-v1"]) prompt += `\n\n${NO_NICKNAME_SECTION}`;
  // readout-rules-in-prompt-v1: the fixed map rules the server no longer prints in each readout.
  const mapRules = features["readout-rules-in-prompt-v1"] ? mapRulesSection(features) : "";
  if (mapRules !== "") prompt += `\n\n${mapRules}`;
  if (features["battle-triage-guidance-v1"]) prompt += `\n\n${BATTLE_TRIAGE_SECTION}`;
  if (features["explorer-guidance-v1"]) prompt += `\n\n${EXPLORER_GUIDANCE_SECTION}${features["dialogue-auto-advance-v1"] ? ` ${EXPLORER_TALK_IS_CHEAP}` : ""}`;
  if (navigateFirst) prompt = `${navigateFirstToolList(prompt)}\n\n${features["full-map-navigation-v1"] ? MOVING_AROUND_FULL : MOVING_AROUND_LOCAL}`;
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
  return { safeInterfaces:features["dialogue-safe-batches-v1"], automaticRunning:features["automatic-running-v1"], readout: features["ram-state-v1"], pressResult: features["press-result-v1"], position: features["live-player-position-v1"], fieldLock: features["field-control-lock"], transitions: features["transition-press-result-v1"], warpArrival: features["warp-arrival-settle-v1"], blockedBatch: features["blocked-batch-result-v1"], liveMap: features["live-map-v1"], ledges: features["ledge-hops-v1"], edgeWalls: features["one-way-tiles-v1"], counters: features["counter-talk-v1"], topology: features["world-destinations-v1"] };
}

export function playTools(features: FeatureSet): string[] {
  return ["observe", "press", ...(features["objective-tracking-v1"] ? ["get_objectives", "set_objective", "update_objective"] : []), ...(features["bounded-navigation-v1"] ? ["navigate_to"] : []), ...(features["navigation-evidence-memory-v1"] ? ["remember_destination"] : []), ...(features["dialogue-log-v1"] ? ["recall_dialogue"] : []), ...(features["instruction-ledger-v1"] ? ["note_contradiction"] : []), ...(features["next-milestone-hint-v1"] ? ["get_next_milestone"] : []), ...(features["dialogue-auto-advance-v1"] ? ["get_dialogue"] : [])];
}
