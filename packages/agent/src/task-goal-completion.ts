import type {RunEvent} from "./events.js";
import type {GameStateSnapshot} from "./game-state.js";
import {authoredSceneLabel} from "./authored-scene-labels.js";
import type {NativeGoalTask} from "./instruction-goals.js";
import {MILESTONES} from "./milestones.js";
import {RETIREMENT_RULES} from "./milestone-memory-rules.js";

type Page=Extract<RunEvent,{type:"dialogue_auto_advance"}>["pages"][number];
type NativeState=Extract<RunEvent,{type:"state";started:boolean}>;
export type GoalTask=NativeGoalTask;
interface Evidence {readonly seq:number;readonly values:readonly (boolean|null)[];readonly player:string|null;readonly map:readonly number[]|null}
const requirements=[...new Set([...RETIREMENT_RULES.flatMap(r=>r.requires),"RUSTBORO_GYM_COMPLETE","DEVON_GOODS_RECOVERED","DEVON_GOODS_RETURN_REPORTED"])];
const predicates=requirements.map(name=>MILESTONES.find(m=>m.name===name));
const stable=(state:GameStateSnapshot)=>state.started&&state.screen!=="unknown"&&!state.screen.includes("transition");
const values=(state:GameStateSnapshot)=>predicates.map(m=>stable(state)?m?.reached(state)??null:null);
const sameMap=(a:readonly number[]|null,b:readonly number[]|null)=>a===null?b===null:b!==null&&a.length===b.length&&a.every((v,i)=>v===b[i]);

// Match source-audited tasks, never a destination word or an inferred next objective.
// Unknown evidence remains a boundary. Store a new boundary only when its values change.
export class TaskGoalCompletion {
 constructor(private readonly nativeInstructions=false){}
 private readonly requestStates=new Set<number>();
 private readonly evidence:Evidence[]=[];
 private readonly states=new Set<number>();
 observe(state:NativeState):void {
  this.states.add(state.seq);
  if(this.nativeInstructions&&state.started&&state.map_id?.[0]===0&&state.map_id[1]===3&&state.world_context?.message?.ready===true&&state.world_context.dialogue?.includes("Help me! I was robbed by TEAM AQUA!\nI have to get the DEVON GOODS back!")===true)this.requestStates.add(state.seq);
  const next:Evidence={seq:state.seq,values:values(state),player:state.story?.name_confirmed===true?state.name:null,map:state.map_id};
  const prior=this.evidence.at(-1);
  if(prior===undefined||prior.player!==next.player||!sameMap(prior.map,next.map)||prior.values.some((v,i)=>v!==next.values[i]))this.evidence.push(next);
 }
 tasks(pages:readonly Page[]):ReadonlyMap<Page,GoalTask> {
  const tasks=new Map<Page,GoalTask>();
  if(pages.some(page=>page.battle_turn!==undefined||page.battle_message_id!==undefined))return tasks;
  const at=(page:Page)=>{
   const seq=page.state_seq;if(seq===null||!this.states.has(seq))return undefined;
   const evidence=this.evidence.findLast(e=>e.seq<=seq);
   return evidence!==undefined&&sameMap(evidence.map,page.map_id)?evidence:undefined;
  };
  const assign=(page:Page,requires:readonly string[]):void=>{
   const issued=at(page);if(issued===undefined||requires.length===0)return;
   const before=requires.map(name=>issued.values[requirements.indexOf(name)]??null);
   if(before.every(v=>v!==null)&&before.includes(false))tasks.set(page,{requires});
  };
  for(const rule of RETIREMENT_RULES){
   if(rule.requires.length===0||rule.pages.length!==pages.length)continue;
   if(rule.pages.every((expected,i)=>{
    const page=pages[i];if(page===undefined)return false;
    const player=at(page)?.player;
    if(expected.text.includes("{PLAYER}")&&player==null)return false;
    return page.text===expected.text.replaceAll("{PLAYER}",player??"")&&page.speaker===expected.speaker&&page.speaker_source===expected.speaker_source&&sameMap(page.map_id,expected.map_id);
   }))for(const page of pages)assign(page,rule.requires);
  }
  // pret/pokeemerald 731ad5bf, PetalburgCity_Gym_Text_NormanGoToRustboro.
  // Only this page requests the first gym. Later pages request a four-badge return;
  // they are a distinct task and are never retired by the first gym's completion.
  for(const page of pages)if(page.battle_turn===undefined&&page.battle_message_id===undefined&&sameMap(page.map_id,[8,1])&&page.speaker==="DAD"&&page.speaker_source==="name_prefix"&&page.text==="DAD: Hm? Aren't you going to the\nPOKéMON GYM in RUSTBORO CITY?")assign(page,["RUSTBORO_GYM_COMPLETE"]);
  if(this.nativeInstructions)for(const page of pages){
   const label=authoredSceneLabel(page);
   if(label?.beat!=="employee-request"||page.text!=="Help me! I was robbed by TEAM AQUA!\nI have to get the DEVON GOODS back!"||page.state_seq===null||!this.requestStates.has(page.state_seq))continue;
   assign(page,["DEVON_GOODS_RECOVERED"]);
   if(tasks.has(page))tasks.set(page,{requires:["DEVON_GOODS_RECOVERED"],canonical:{id:"native_devon_goods_recovery",title:"Recover the DEVON GOODS",reported_requires:["DEVON_GOODS_RECOVERED","DEVON_GOODS_RETURN_REPORTED"]}});
  }
  return tasks;
 }
 completed(task:GoalTask|undefined,state:GameStateSnapshot|undefined):string|null {
  if(task===undefined||state===undefined||!stable(state))return null;
  const now=values(state);
  return task.requires.every(name=>now[requirements.indexOf(name)]===true)?task.requires.map(name=>name.replaceAll("_"," ").toLowerCase()).join("; "):null;
 }
}
