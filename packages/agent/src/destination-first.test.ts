import {readFileSync} from "node:fs";
import {Type} from "typebox";
import {expect,it} from "vitest";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {featuresOf,featureInfo,playHarnessFeatures,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {normalizeFeatures,flagFeatures} from "./play-preset.js";
import {playSystemPrompt} from "./play-config.js";
import {playGameTools} from "./play-wiring.js";
import {IN_GAME} from "../test-support/events.js";
import {DESTINATION_POLICY,DESTINATION_RECOVERY,withDestinationFirst} from "./destination-first.js";

const ID="destination-first-navigation-v1";
const fixture=JSON.parse(readFileSync(new URL("../test-support/navigate-first-sh02.json",import.meta.url),"utf8")) as {harness_features:string[];system_prompt:string};
const OLD=featuresOf(fixture.harness_features);
const ON:FeatureSet={...OLD,[ID]:true,"semantic-navigation-v2":true};
const field={...IN_GAME,screen:"overworld" as const,active_ui:null,field_controls_locked:false};
const connection='- NORTH -> ROUTE 103 (map 0/18), offset 0; walk off the map from (8,0): stand on one of these edge tiles and press UP; navigate_to_target target {"kind":"connection","direction":"NORTH"}';
const result={content:[{type:"text" as const,text:`current observation\n${connection}`}],details:{state:field}};
const fake=(name:string):AgentTool=>({name,label:name,description:"old description",parameters:Type.Object({}),execute:()=>Promise.resolve(result)});
const recorder={lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),subscribe:()=>undefined};

it("OFF preserves a recorded prompt byte for byte and tool/result identity",async()=>{
 expect(playSystemPrompt({...OLD,[ID]:false},null)).toBe(fixture.system_prompt);
 const base=[fake("press"),fake("navigate_to")];
 expect(withDestinationFirst(base,{...ON,[ID]:false})).toBe(base);
 expect(await base[0]!.execute("x",{})).toBe(result);
});
it("replaces the competing movement and warp guidance in the production prompt",()=>{
 const prompt=playSystemPrompt(ON,null);
 expect(prompt).toContain(DESTINATION_POLICY);
 expect(prompt.match(/Choose destinations rather than individual walking steps/g)).toHaveLength(1);
 expect(prompt).not.toContain("single-tile steps or turns");
 expect(prompt).not.toContain("two or more tiles");
 expect(prompt).not.toContain("Near a transition, use short button sequences");
 expect(prompt).toContain("handles approach, facing and activation");
});
it("production factory delivers immediate guidance, target-first readouts and descriptions without extra actions",async()=>{
 const tools=playGameTools([fake("press"),fake("observe")],ON,{read:()=>Promise.resolve(field)},recorder);
 const press=tools.find(t=>t.name==="press")!;
 expect(press.description).toContain("intentional facing adjustment");
 expect(tools.find(t=>t.name==="navigate_to")!.description).toContain("another location on the current map");
 const r=await press.execute("walk",{buttons:["UP","UP"]});
 const text=r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
 expect(text).toContain(DESTINATION_RECOVERY);
 expect(text).toContain('navigate_to_target target {"kind":"connection","direction":"NORTH"}; activation mechanics handled by the tool: walk off');
 expect(r.details).toBe(result.details);
});
it("registers default OFF, records ON and enables both current arms explicitly",()=>{
 expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(299);
 expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:"bounded-navigation-v1"});
 expect(normalizeFeatures({...OLD,[ID]:undefined})[ID]).toBe(false);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 expect(playHarnessFeatures(ON,null)).toContain(ID);
 const recipe=JSON.parse(readFileSync(new URL("../../../experiments/feature-configs/current.json",import.meta.url),"utf8")) as {features:Record<string,boolean>;onInBoth:string[];switches:string[]};
 expect(recipe.features[ID]).toBe(true);expect(recipe.onInBoth).toContain(ID);expect(recipe.switches).not.toContain(ID);
});
