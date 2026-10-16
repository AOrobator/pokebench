import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {ALL_ON,FEATURES,dependencyProblems,featureInfo,playHarnessFeatures,serverFeatureEnv,stateOnlyProblems,type FeatureSet,type SwitchableFeature} from "./features.js";
import {BATTLE_TRIAGE_SECTION,EXPLORER_GUIDANCE_SECTION,EXPLORER_TALK_IS_CHEAP,GAME_EVIDENCE_SECTION,NAVIGATE_TO_USAGE,playSystemPrompt} from "./play-config.js";
import {objectivePrompt} from "./objective-tools.js";
import {objectiveSwitches} from "./play-config.js";
import {parsePlayPreset,presetFeatures} from "./play-preset.js";

const ID="explorer-guidance-v1" as SwitchableFeature;
const fixture=JSON.parse(readFileSync(new URL("../test-support/explorer-guidance-incumbent.json",import.meta.url),"utf8")) as {preset:Record<string,unknown>&{features:Record<string,boolean>}};
const INCUMBENT:FeatureSet=presetFeatures(parsePlayPreset(fixture.preset));
// SWITCHABLE_FEATURES at main e8a46f22, before this switch existed.
const MAIN_SWITCHES=["navigation-evidence-memory-v1","automatic-running-v1","expanded-menu-battle-information-v1","ram-state-v1","live-map-v1","live-player-position-v1","world-coordinate-grid-v1","live-object-sprites-v1","world-targets-v1","named-interactions-v1","world-destinations-v1","bounded-navigation-v1","grass-cost-navigation-v1","field-dialogue-phase-v1","dialogue-safe-batches-v1","interaction-loop-detection-v1","active-field-message-buffer-v1","naming-cursor-v1","story-state-v1","coordinate-script-conditions-v1","state-only-decisions-v1","contextual-interface-docs-v1","active-ui-ownership-v1","press-result-v1","field-control-lock","warp-activation-guidance-v1","ledge-hops-v1","one-way-tiles-v1","counter-talk-v1","walkable-floor-v1","deterministic-loop-guard-v1","objective-tracking-v1","repeat-attempt-guard-v1","native-objective-completion-v1","full-map-navigation-v1","elevation-transitions-v1","game-evidence-priority-v1","dialogue-log-v1","loop-guard-supervisor-v1","instruction-ledger-v1","next-milestone-hint-v1","double-context-window-v1","fresh-retry-v1","named-warp-destinations-v1","milestone-stall-stop-v1","text-only-supervisor-v1","character-presence-v1","navigation-refusal-reasons-v1","transition-press-result-v1","stall-briefing-v1","battle-details-v2","dialogue-auto-advance-v1","warp-arrival-settle-v1","dialogue-context-kept-v1","displayed-place-names-v1","transition-loop-detection-v1","blocked-batch-result-v1"] as const satisfies readonly SwitchableFeature[];
// sha256 over every prompt main e8a46f22 built from the incumbent and from the incumbent with each
// main switch flipped, for no target and for RIVAL_HOUSE_ENTERED (computed on main before this change).
const MAIN_PROMPTS_SHA="3242a86cc3f71375fc30b30c9cf81ea970591561cfb6cdd0a962648eb26826be";
const PLAIN:FeatureSet={...INCUMBENT,"objective-tracking-v1":false,"repeat-attempt-guard-v1":false,"native-objective-completion-v1":false,"dialogue-auto-advance-v1":false,"game-evidence-priority-v1":false,"bounded-navigation-v1":false,[ID]:false};

function promptsDigest(base:FeatureSet):string{
 const h=createHash("sha256");
 for(const target of [null,"RIVAL_HOUSE_ENTERED"]){h.update(playSystemPrompt(base,target));for(const id of MAIN_SWITCHES)h.update(playSystemPrompt({...base,[id]:!base[id]},target));}
 return h.digest("hex");
}

it("OFF builds every main prompt byte for byte",()=>{
 expect(INCUMBENT[ID]).toBe(false);
 expect(promptsDigest({...INCUMBENT,[ID]:false})).toBe(MAIN_PROMPTS_SHA);
 expect(promptsDigest({...INCUMBENT,[ID]:true})).not.toBe(MAIN_PROMPTS_SHA);
});

it("ON appends the talk-to-people section after every other prompt section",()=>{
 expect(playSystemPrompt({...PLAIN,[ID]:true},null)).toBe(`${playSystemPrompt(PLAIN,null)}\n\n${EXPLORER_GUIDANCE_SECTION}`);
 const evidence={...PLAIN,"game-evidence-priority-v1":true,"bounded-navigation-v1":true};
 expect(playSystemPrompt({...evidence,[ID]:true},null)).toBe(`${playSystemPrompt(evidence,null)}\n\n${EXPLORER_GUIDANCE_SECTION}`);
 expect(playSystemPrompt({...evidence,[ID]:true},null)).toContain(`${GAME_EVIDENCE_SECTION}\n\n${NAVIGATE_TO_USAGE}\n\n${EXPLORER_GUIDANCE_SECTION}`);
 const objectives={...PLAIN,"objective-tracking-v1":true};
 expect(playSystemPrompt({...objectives,[ID]:true},"RIVAL_HOUSE_ENTERED")).toBe(`${playSystemPrompt({...PLAIN,[ID]:true},"RIVAL_HOUSE_ENTERED")}\n\n${objectivePrompt(objectiveSwitches(objectives))}`);
});

it("follows the battle and healing section when both guidance sections are on",()=>{
 const both={...PLAIN,"battle-triage-guidance-v1":true,"dialogue-auto-advance-v1":true,[ID]:true};
 expect(playSystemPrompt(both,null)).toBe(`${playSystemPrompt({...both,[ID]:false},null)}\n\n${EXPLORER_GUIDANCE_SECTION} ${EXPLORER_TALK_IS_CHEAP}`);
 expect(playSystemPrompt(both,null).endsWith(`${BATTLE_TRIAGE_SECTION}\n\n${EXPLORER_GUIDANCE_SECTION} ${EXPLORER_TALK_IS_CHEAP}`)).toBe(true);
});

it("comes last, after the map rules and the battle and healing section, when all three are on",()=>{
 // Explorer stays last: the map rules are readout reference kept next to the navigation text, the two
 // strategy sections close the prompt together, and no section main already places moves when ON.
 const all={...PLAIN,"readout-rules-in-prompt-v1":true,"battle-triage-guidance-v1":true,"dialogue-auto-advance-v1":true,[ID]:true};
 const prompt=playSystemPrompt(all,null);
 expect(prompt).toBe(`${playSystemPrompt({...all,[ID]:false},null)}\n\n${EXPLORER_GUIDANCE_SECTION} ${EXPLORER_TALK_IS_CHEAP}`);
 const rules=prompt.indexOf("\n\nMap symbols and rules"),battle=prompt.indexOf(`\n\n${BATTLE_TRIAGE_SECTION}`),explorer=prompt.indexOf(`\n\n${EXPLORER_GUIDANCE_SECTION}`);
 expect(rules).toBeGreaterThan(0);expect(battle).toBeGreaterThan(rules);expect(explorer).toBeGreaterThan(battle);
});

it("says talking is cheap only when dialogue auto-advance reads conversations for the model",()=>{
 const auto={...PLAIN,"dialogue-auto-advance-v1":true};
 expect(playSystemPrompt({...auto,[ID]:true},null)).toBe(`${playSystemPrompt(auto,null)}\n\n${EXPLORER_GUIDANCE_SECTION} ${EXPLORER_TALK_IS_CHEAP}`);
 expect(playSystemPrompt({...PLAIN,[ID]:true},null)).not.toContain(EXPLORER_TALK_IS_CHEAP);
 expect(EXPLORER_TALK_IS_CHEAP).toBe("Talking is cheap: face the person and press A; the harness reads the conversation until your next decision.");
});

it("tells the model to talk to people, again after the story moves, and to act on what they say",()=>{
 expect(EXPLORER_GUIDANCE_SECTION).toBe("Talk to people: in this game, people tell you where to go next. After each story event, and whenever you are unsure where to go, talk to everyone in the room you are in before you leave, including the families and neighbours of characters you have met. People often say something new once the story has moved on, so talk again to people you spoke to before. A short remark, such as where someone has gone, is a direction to follow, not small talk.");
 expect(EXPLORER_GUIDANCE_SECTION.split(/\s+/).length).toBeLessThanOrEqual(90);
});

it("names no character, place or story step",()=>{
 const names=/\b(rival|birch|professor|may|brendan|mom|mother|next door|lab|littleroot|oldale|petalburg|rustboro|route|starter|gym|badge|pok[eé]dex|pok[eé]mon|truck|clock|bedroom|house|town|city|roxanne|wally|norman)\b/i;
 expect(EXPLORER_GUIDANCE_SECTION).not.toMatch(names);
 expect(EXPLORER_TALK_IS_CHEAP).not.toMatch(names);
});

it("reaches the model through the production preset path",()=>{
 const on=presetFeatures(parsePlayPreset({...fixture.preset,features:{...fixture.preset.features,[ID]:true}}));
 expect(on[ID]).toBe(true);
 expect(playSystemPrompt(on,null)).toContain(EXPLORER_GUIDANCE_SECTION);
 expect(playSystemPrompt(INCUMBENT,null)).not.toContain(EXPLORER_GUIDANCE_SECTION.slice(0,30));
 expect(playHarnessFeatures(on,null)).toContain(ID);
 expect(playHarnessFeatures(INCUMBENT,null)).not.toContain(ID);
});

it("is a default-off standalone guidance switch, recorded last, that state-only mode refuses",()=>{
 expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:null,switchable:true,title:"TALK TO PEOPLE"});
 expect(featureInfo(ID).description).toContain(" Off: ");
 expect(playHarnessFeatures(ALL_ON,null).at(-10)).toBe(ID);
 expect(FEATURES.filter(f=>f.switchable).at(-10)?.id).toBe(ID);
 expect(serverFeatureEnv({...ALL_ON,[ID]:false}).POKEBENCH_FEATURES_OFF).toBe("");
 expect(dependencyProblems({...ALL_ON,"dialogue-auto-advance-v1":false,[ID]:true})).not.toContain(expect.stringContaining(ID));
 expect(stateOnlyProblems({...INCUMBENT,"state-only-decisions-v1":true,[ID]:true})).toContain(`state-only-decisions-v1 requires ${ID} OFF`);
 expect(stateOnlyProblems({...INCUMBENT,"state-only-decisions-v1":true,[ID]:false})).not.toContain(`state-only-decisions-v1 requires ${ID} OFF`);
});
