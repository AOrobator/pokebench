import {Value} from "typebox/value";
import {AuthoredSceneLabelSchema,type AuthoredSceneLabel,type RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";

type Page=Extract<RunEvent,{type:"dialogue_auto_advance"}>["pages"][number];
type Source=Partial<Pick<Page,"scene_label"|"map_id"|"battle_turn"|"battle_message_id">>;

export function authoredSceneLabel(page:Source):AuthoredSceneLabel|null {
 const label=page.scene_label;
 if(label===undefined||!Value.Check(AuthoredSceneLabelSchema,label)||page.battle_turn!==undefined||page.battle_message_id!==undefined||page.map_id?.[0]!==label.map_id[0]||page.map_id[1]!==label.map_id[1])return null;
 return label;
}

export function authoredSceneSpeaker(page:Source):string|null {
 const label=authoredSceneLabel(page);
 return label===null?null:`${label.speaker} (authored script role)`;
}

// Probe replay and production capture share the same OFF projection. Original
// speaker/source/on_screen fields always remain evidence for existing policies.
export function applySceneLabelsToPages(pages:readonly Page[],features:Pick<FeatureSet,"authored-scene-labels-v1">):Page[] {
 return pages.map(page=>{
  if(features["authored-scene-labels-v1"]&&authoredSceneLabel(page)!==null)return page;
  const {scene_label:discarded,...raw}=page;
  return discarded===undefined?page:raw;
 });
}
