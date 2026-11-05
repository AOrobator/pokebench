// rq-slim-prompt-v1: paragraphs taken out of the standing prompt. Moved ones reach the model only when
// rayquazaGuideContext sees their trigger; dropped ones stay in the scene where they apply.
export const RQ_MOVED_SECTIONS=["PokéNav calls","- choose_evolution","- learn_move","Surf:"] as const;
const SCENE_DROPS:Readonly<Record<string,readonly string[]>>={overworld:["Trainer battles and your rival"],battle:["Overworld:"],menu:["Overworld:"]};

export function rqSlim(text:string,scene:string):string {
 const gone=[...RQ_MOVED_SECTIONS,...(SCENE_DROPS[scene]??[])];
 return text.split("\n\n").filter(part=>!gone.some(prefix=>part.startsWith(prefix))).join("\n\n");
}
