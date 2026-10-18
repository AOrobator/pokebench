import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {ALL_ON,FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures,serverFeatureEnv,stateOnlyProblems,type FeatureSet,type SwitchableFeature} from "./features.js";
import * as config from "./play-config.js";
import {BATTLE_TRIAGE_SECTION,EXPLORER_GUIDANCE_SECTION,EXPLORER_TALK_IS_CHEAP,TRAINER_HEAL_SECTION,UNTAKEN_EXITS_SECTION,objectiveSwitches,playSystemPrompt} from "./play-config.js";
import {objectivePrompt} from "./objective-tools.js";
import {flagFeatures,normalizeFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";

const ID="explorer-guidance-v2" as SwitchableFeature;
const V1="explorer-guidance-v1" as SwitchableFeature;
const V2_TEXT="Talk to people: talking to people gives you information about the world and can move the story forward. When you are unsure where to go, or after the story has moved on, talking to the people around you is a good way to learn more. What people tell you is evidence; use it to decide where to go.";
// Read through the module namespace so the RED run fails on the assertion, not on a missing export.
const section=():string=>(config as Record<string,unknown>)["EXPLORER_GUIDANCE_V2_SECTION"] as string;
const fixture=JSON.parse(readFileSync(new URL("../test-support/explorer-guidance-incumbent.json",import.meta.url),"utf8")) as {preset:Record<string,unknown>&{features:Record<string,boolean>}};
const INCUMBENT:FeatureSet=presetFeatures(parsePlayPreset(fixture.preset));
// SWITCHABLE_FEATURES at main cefacbf1 (the last main merged into this branch), without this switch.
const MAIN_SWITCHES=["navigation-evidence-memory-v1","automatic-running-v1","expanded-menu-battle-information-v1","ram-state-v1","live-map-v1","live-player-position-v1","world-coordinate-grid-v1","live-object-sprites-v1","world-targets-v1","named-interactions-v1","world-destinations-v1","bounded-navigation-v1","grass-cost-navigation-v1","field-dialogue-phase-v1","dialogue-safe-batches-v1","interaction-loop-detection-v1","active-field-message-buffer-v1","naming-cursor-v1","story-state-v1","coordinate-script-conditions-v1","state-only-decisions-v1","contextual-interface-docs-v1","active-ui-ownership-v1","press-result-v1","field-control-lock","warp-activation-guidance-v1","ledge-hops-v1","one-way-tiles-v1","counter-talk-v1","walkable-floor-v1","deterministic-loop-guard-v1","objective-tracking-v1","repeat-attempt-guard-v1","native-objective-completion-v1","full-map-navigation-v1","elevation-transitions-v1","game-evidence-priority-v1","dialogue-log-v1","loop-guard-supervisor-v1","instruction-ledger-v1","next-milestone-hint-v1","double-context-window-v1","fresh-retry-v1","named-warp-destinations-v1","milestone-stall-stop-v1","text-only-supervisor-v1","character-presence-v1","navigation-refusal-reasons-v1","transition-press-result-v1","stall-briefing-v1","battle-details-v2","dialogue-auto-advance-v1","warp-arrival-settle-v1","dialogue-context-kept-v1","displayed-place-names-v1","transition-loop-detection-v1","blocked-batch-result-v1","battle-triage-guidance-v1","adjacent-tiles-v1","readout-rules-in-prompt-v1","explorer-guidance-v1","connection-edge-tiles-v1","in-game-naming-readout-v1","no-nickname-guidance-v1","battle-text-auto-advance-v1","battle-message-waiting-v1","script-line-presence-v1","offscreen-objects-v1","navigate-first-prompt-v1","presence-penalty-v1","disproved-beliefs-v1","same-plan-breaker-v1","levelup-box-v1","briefing-exits-v1","untaken-exits-v1","people-ledger-v1","trainer-heal-guidance-v1","low-hp-trainer-warning-v1","briefing-battle-outcomes-v1","blocked-exit-fact-v1","battle-loss-recap-v1","pushback-loop-detection-v1","pushback-press-result-v1","battle-observation-loop-v1","transition-coherence-v1","readout-truth-v1","birch-speech-pages-v1","blackout-readout-v1","surf-gated-exits-v1","navigation-truth-v1","navigation-refusal-reasons-v2","cross-map-goal-v1"] as const satisfies readonly SwitchableFeature[];
// sha256 over every prompt main cefacbf1 built from a base and from the base with each main switch flipped,
// for no target and for RIVAL_HOUSE_ENTERED (computed from main's build before this change; see the worklog).
const MAIN_INCUMBENT_SHA="3ebfcf0bc4dba80703f2661f8f959baa9249393fda0d160f8621fb975da7e90f";
const MAIN_ALL_ON_SHA="9bca870b33fecdbe7585455c55bd964d79bf1c7ead521e8014ed2b10cc3c1207";
const PLAIN:FeatureSet={...INCUMBENT,"objective-tracking-v1":false,"repeat-attempt-guard-v1":false,"native-objective-completion-v1":false,"dialogue-auto-advance-v1":false,"game-evidence-priority-v1":false,"bounded-navigation-v1":false,[V1]:false,[ID]:false};

function promptsDigest(base:FeatureSet):string{
 const h=createHash("sha256");
 for(const target of [null,"RIVAL_HOUSE_ENTERED"]){h.update(playSystemPrompt(base,target));for(const id of MAIN_SWITCHES)h.update(playSystemPrompt({...base,[id]:!base[id]},target));}
 return h.digest("hex");
}

it("OFF builds every main prompt byte for byte, from the incumbent and from every switch on",()=>{
 expect(INCUMBENT[ID]).toBe(false);
 expect(MAIN_SWITCHES).toEqual(SWITCHABLE_FEATURES.filter(id=>id!==ID&&id!=="ineffective-loops-v1"&&id!=="people-id-cards-v1"&&id!=="open-goal-prompt-v1"&&id!=="low-hp-trainer-warning-v2"&&id!=="story-destinations-v1"&&id!=="exit-reachability-v1"&&id!=="harness-trust-v1"&&id!=="cited-destination-v1"&&id!=="harness-trust-v2"&&id!=="heal-before-trainers-v1"&&id!=="battle-move-tool-v1"&&id!=="tutorial-party-owner-v1"&&id!=="mid-frame-readout-v1"&&id!=="unset-dynamic-warp-v1"&&id!=="status-names-v1"&&id!=="surf-gated-exits-v2"&&id!=="instruction-ledger-v2"&&id!=="no-exit-here-v1"&&id!=="bag-healing-items-v1"&&id!=="battle-menu-loop-v1"&&id!=="clock-view-loop-v1"&&id!=="stale-story-goal-v1"&&id!=="input-cuts-v1"&&id!=="loop-guard-screen-v1"&&id!=="reopened-dialogue-loop-v1"&&id!=="dialog-button-b-v1"&&id!=="just-in-time-prompt-v1"));
 expect(promptsDigest({...INCUMBENT,[ID]:false})).toBe(MAIN_INCUMBENT_SHA);
 // Later switches that add prompt text are off here, so the digest still names main's prompts before them.
 expect(promptsDigest({...ALL_ON,[ID]:false,"people-id-cards-v1":false,"open-goal-prompt-v1":false,"harness-trust-v1":false,"cited-destination-v1":false,"harness-trust-v2":false,"dialog-button-b-v1":false,"just-in-time-prompt-v1":false})).toBe(MAIN_ALL_ON_SHA);
 expect(promptsDigest({...INCUMBENT,[ID]:true})).not.toBe(MAIN_INCUMBENT_SHA);
});

it("says exactly the operator's generic text",()=>{
 expect(section()).toBe(V2_TEXT);
 expect(EXPLORER_TALK_IS_CHEAP).toBe("Talking is cheap: face the person and press A; the harness reads the conversation until your next decision.");
});

it("points toward no particular person, place or story step",()=>{
 const names=/\b(rival|birch|professor|may|brendan|mom|mother|next door|lab|littleroot|oldale|petalburg|rustboro|route|starter|gym|badge|pok[eé]dex|pok[eé]mon|truck|clock|bedroom|house|town|city|roxanne|wally|norman)\b/i;
 expect(V2_TEXT).not.toMatch(names);
 // The v1 lines the operator read as a walkthrough toward particular people.
 for(const pointer of [/famil/i,/neighbo/i,/characters you have met/i,/where someone has gone/i,/everyone in the room/i,/people you spoke to before/i])expect(V2_TEXT).not.toMatch(pointer);
});

it("ON appends the section in v1's slot, before the objective record",()=>{
 expect(playSystemPrompt({...PLAIN,[ID]:true},null)).toBe(`${playSystemPrompt(PLAIN,null)}\n\n${V2_TEXT}`);
 const objectives={...PLAIN,"objective-tracking-v1":true};
 expect(playSystemPrompt({...objectives,[ID]:true},"RIVAL_HOUSE_ENTERED")).toBe(`${playSystemPrompt({...PLAIN,[ID]:true},"RIVAL_HOUSE_ENTERED")}\n\n${objectivePrompt(objectiveSwitches(objectives))}`);
 for(const base of [PLAIN,{...PLAIN,"dialogue-auto-advance-v1":true},{...PLAIN,"readout-rules-in-prompt-v1":true,"battle-triage-guidance-v1":true,"trainer-heal-guidance-v1":true,"untaken-exits-v1":true,"game-evidence-priority-v1":true,"bounded-navigation-v1":true}]){
  const v1=playSystemPrompt({...base,[V1]:true},null),v2=playSystemPrompt({...base,[ID]:true},null);
  const tail=base["dialogue-auto-advance-v1"]?` ${EXPLORER_TALK_IS_CHEAP}`:"";
  expect(v2).toBe(v1.replace(`${EXPLORER_GUIDANCE_SECTION}${tail}`,`${V2_TEXT}${tail}`));
 }
});

it("comes after the map rules, battle triage and trainer heal sections and before untaken exits",()=>{
 const all={...PLAIN,"readout-rules-in-prompt-v1":true,"battle-triage-guidance-v1":true,"trainer-heal-guidance-v1":true,"untaken-exits-v1":true,"dialogue-auto-advance-v1":true,[ID]:true};
 const prompt=playSystemPrompt(all,null);
 const rules=prompt.indexOf("\n\nMap symbols and rules"),battle=prompt.indexOf(`\n\n${BATTLE_TRIAGE_SECTION}`),heal=prompt.indexOf(`\n\n${TRAINER_HEAL_SECTION}`),explorer=prompt.indexOf(`\n\n${V2_TEXT} ${EXPLORER_TALK_IS_CHEAP}`),exits=prompt.indexOf(`\n\n${UNTAKEN_EXITS_SECTION}`);
 expect(rules).toBeGreaterThan(0);expect(battle).toBeGreaterThan(rules);expect(heal).toBeGreaterThan(battle);expect(explorer).toBeGreaterThan(heal);expect(exits).toBeGreaterThan(explorer);
 expect(prompt.endsWith(`${V2_TEXT} ${EXPLORER_TALK_IS_CHEAP}\n\n${UNTAKEN_EXITS_SECTION}`)).toBe(true);
});

it("adds the talking-is-cheap sentence only with dialogue auto-advance, as v1 does",()=>{
 const auto={...PLAIN,"dialogue-auto-advance-v1":true};
 expect(playSystemPrompt({...auto,[ID]:true},null)).toBe(`${playSystemPrompt(auto,null)}\n\n${V2_TEXT} ${EXPLORER_TALK_IS_CHEAP}`);
 expect(playSystemPrompt({...PLAIN,[ID]:true},null)).not.toContain(EXPLORER_TALK_IS_CHEAP);
});

it("supersedes v1: with both on, only v2's section is shown, once",()=>{
 for(const base of [PLAIN,{...PLAIN,"dialogue-auto-advance-v1":true},{...ALL_ON,"state-only-decisions-v1":false}]){
  const both=playSystemPrompt({...base,[V1]:true,[ID]:true},null);
  expect(both).toBe(playSystemPrompt({...base,[V1]:false,[ID]:true},null));
  expect(both).not.toContain(EXPLORER_GUIDANCE_SECTION);
  expect(both.split(V2_TEXT).length).toBe(2);
 }
 expect(dependencyProblems({...ALL_ON,[V1]:true,[ID]:true})).toEqual([]);
});

it("leaves v1 unchanged, ON and OFF, when v2 is off",()=>{
 expect(EXPLORER_GUIDANCE_SECTION).toBe("Talk to people: in this game, people tell you where to go next. After each story event, and whenever you are unsure where to go, talk to everyone in the room you are in before you leave, including the families and neighbours of characters you have met. People often say something new once the story has moved on, so talk again to people you spoke to before. A short remark, such as where someone has gone, is a direction to follow, not small talk.");
 expect(playSystemPrompt({...PLAIN,[V1]:true},null)).toBe(`${playSystemPrompt(PLAIN,null)}\n\n${EXPLORER_GUIDANCE_SECTION}`);
 const auto={...PLAIN,"dialogue-auto-advance-v1":true};
 expect(playSystemPrompt({...auto,[V1]:true},null)).toBe(`${playSystemPrompt(auto,null)}\n\n${EXPLORER_GUIDANCE_SECTION} ${EXPLORER_TALK_IS_CHEAP}`);
 expect(playSystemPrompt({...auto,[V1]:true},null)).not.toContain(V2_TEXT);
});

it("reaches the model through the production preset path",()=>{
 const on=presetFeatures(parsePlayPreset({...fixture.preset,features:{...fixture.preset.features,[ID]:true}}));
 expect(on[ID]).toBe(true);
 expect(playSystemPrompt(on,null)).toContain(V2_TEXT);
 expect(playSystemPrompt(INCUMBENT,null)).not.toContain(V2_TEXT.slice(0,60));
 expect(playHarnessFeatures(on,null)).toContain(ID);
 expect(playHarnessFeatures(INCUMBENT,null)).not.toContain(ID);
});

it("is a default-off standalone guidance switch, recorded third to last (before ineffective-loops-v1 and people-id-cards-v1), that state-only mode refuses",()=>{
 expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:null,switchable:true,title:"TALK TO PEOPLE V2"});
 expect(featureInfo(ID).description).toContain(" Off: ");
 expect(SWITCHABLE_FEATURES.at(-28)).toBe(ID);
 expect(FEATURES.filter(f=>f.switchable).at(-28)?.id).toBe(ID);
 expect(playHarnessFeatures(ALL_ON,null).at(-28)).toBe(ID);
 expect(serverFeatureEnv({...ALL_ON,[ID]:false}).POKEBENCH_FEATURES_OFF).toBe("");
 expect(dependencyProblems({...ALL_ON,"dialogue-auto-advance-v1":false,"field-dialogue-phase-v1":false,[ID]:true})).not.toContain(expect.stringContaining(ID));
 expect(stateOnlyProblems({...INCUMBENT,"state-only-decisions-v1":true,[ID]:true})).toContain(`state-only-decisions-v1 requires ${ID} OFF`);
 expect(stateOnlyProblems({...INCUMBENT,"state-only-decisions-v1":true,[ID]:false})).not.toContain(`state-only-decisions-v1 requires ${ID} OFF`);
});

it("defaults off in presets and the legacy flag presets",()=>{
 const {"explorer-guidance-v2":_omitted,...without}=INCUMBENT;
 expect(_omitted).toBe(false);
 expect(normalizeFeatures(without)[ID]).toBe(false);
 expect(Object.keys(normalizeFeatures(without)).at(-28)).toBe(ID);
 for(const objectives of [true,false])expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives})[ID]).toBe(false);
});
