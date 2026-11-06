// instruction-memory-cap-v1: rule A′ over the episodes either memory form keeps. Whole episodes only, never cut.
// Proven-done episodes are never kept (pret templates, story checkpoints, receipts, trainer flags). The rest are added
// in priority order (story anchor, nearby maps, named target, recency; newest first) while the block fits: a hard cap.
// The reference implementation is runs/analysis/bounded-input-20261028/rule_a2.py, which recorded runs must match
// byte for byte.
import type {RunEvent} from "./events.js";
import {RETIREMENT_RULES} from "./milestone-memory-rules.js";
import {PRET_MAP_SECTIONS} from "./pret-map-sections.js";
import {progressReached} from "./story-progress.js";
import {junkRule,junkPageKey,type JunkRule} from "./instruction-memory-junk.js";
import {STORY_CHARACTERS,canonicalStoryCharacterName} from "./script-line-presence.js";
import {LEGACY_STORY_CHECKPOINTS,STORY_CHECKPOINTS} from "./story-checkpoints.js";


export const INSTRUCTION_MEMORY_CAP_CHARS=16000;
export const CAPPED_SELECTION="Finished episodes, and less relevant ones over the size cap, are left out.";
// The cap counts characters as code points, as Python len() does in the reference implementation.
export const codePoints=(s:string):number=>Array.from(s).length;
// observed_locations grows with every map entered; under the cap only the newest whole entries that fit in
// CAP_LOCATION_CHARS (as JSON) are sent, with a count of the rest.
export const CAP_LOCATION_CHARS=2000;
export const omittedLine=(n:number):string=>`${String(n)} other episodes are left out and remain in the run recording.`;
// instruction-memory-dedup-v1 appends two source-map columns (strings or nulls); the cap reads only the first six.
export type CapRow=readonly [speaker:string|null,source:string|null,text:string,map:string|null,mapId:readonly number[]|null,stateEvent:number|null,...extra:(string|null)[]];
export interface CapEpisode {readonly result:number;readonly dialogue:readonly number[];readonly turn:number;readonly pages:readonly CapRow[]}
export type CapStep="anchor"|"done"|"nearby"|"named"|"recency"|"junk";
export interface CapDecision {readonly result:number;readonly step:CapStep;readonly fact:string;readonly kept:boolean;readonly rule?:JunkRule}
export interface CapSelection {readonly kept:CapEpisode[];readonly omitted:number;readonly decisions:CapDecision[]}

type State=Extract<RunEvent,{type:"state";started:boolean}>;
interface StoryLine {readonly speaker:string;readonly turn:number;readonly quote:string;readonly done?:boolean}
// pret data/maps/*_Gym*/scripts.inc: each leader's FLAG_BADGE0N_GET and "received the … BADGE from …" text.
const LEADER_BADGE:Readonly<Record<string,string>>={ROXANNE:"STONE",BRAWLY:"KNUCKLE",WATTSON:"DYNAMO",FLANNERY:"HEAT",NORMAN:"BALANCE",WINONA:"FEATHER",TATE:"MIND",LIZA:"MIND",JUAN:"RAIN"};
const PEOPLE=[...new Set([...STORY_CHARACTERS.map(c=>c.name),...Object.keys(LEADER_BADGE)])];
// pret receipt strings with {PLAYER} substituted; true marks a completion, false a page of the same exchange.
const RECEIPTS:readonly (readonly [string,boolean])[]=[
 ["{P} put away the .+\\nin the .+ POCKET\\.",true], // data/text/obtain_item.inc gText_PutItemInPocket
 ["{P} put away the .+\\nin the BAG\\.",true], // gText_PlayerPutItemInBag
 ["Obtained the .+!",true], // gText_ObtainedTheItem
 ["{P} found one .+!",true], // gText_PlayerFoundOneItem
 ["{P} received the (?:STONE|KNUCKLE|DYNAMO|HEAT|BALANCE|FEATHER|MIND|RAIN) BADGE\\nfrom .+\\.",true], // *_Gym_Text_Received*Badge
 ["Registered .+\\nin the POKéNAV\\.",true], // match_call.inc, *_Gym_Text_Registered*
 ["{P} picked the \\d+ .+\\.",true], // data/text/berry_tree.inc
 ["You found \\d+ .+!",false],
 ["Do you want to pick the\\n.+\\?",false],
];
// Readout forms that name the current story line. A finished goal prints "Story goal: none. …" and names none.
const STORY_FORMS:readonly ((line:string)=>StoryLine|null)[]=[
 line=>{const m=/^Story line heard \((.+?), turn (\d+)\): "(.*)"/.exec(line);return m===null?null:{speaker:m[1]??"",turn:Number(m[2]),quote:m[3]??""};},
 line=>{const m=/^Story goal: "(.*)" \((.+?), turn (\d+)\) ->/.exec(line);return m===null?null:{speaker:m[2]??"",turn:Number(m[3]),quote:m[1]??""};},
 line=>{const m=/^Latest story line naming a place \(turn (\d+), (.+?)\): "(.*)"/.exec(line);return m===null?null:{speaker:m[2]??"",turn:Number(m[1]),quote:m[3]??""};},
];
const OBSERVATION_TOOLS=new Set(["observe","press","navigate_to","navigate_to_target","explore_map","battle_action"]);
const FACING:Readonly<Record<string,readonly [number,number]>>={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
const key=(id:readonly number[]|null|undefined):string|null=>id===null||id===undefined?null:`${String(id[0])}/${String(id[1])}`;
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const norm=(s:string)=>s.toUpperCase().replaceAll("É","E").replace(/[^A-Z0-9]/g,"");
const word=(w:string,text:string,edge="A-Z0-9")=>new RegExp(`(?<![${edge}])${escape(w)}(?![${edge}])`).test(text);
const oneLine=(pages:readonly CapRow[])=>pages.map(p=>p[2].replaceAll("\n"," ")).join(" ");

export class InstructionMemoryCap {
 private readonly earned=new Set<string>();
 constructor(private readonly junk=false,private readonly wholeGame=false,private readonly leaderLines=false){}

 private run:string|null=null;
 private state:State|null=null;
 private readout:string|null=null;
 private readonly milestones=new Map<string,number>();
 private readonly visited=new Set<string>();
 private readonly defeated=new Map<string,boolean>();
 private readonly faced=new Map<number,{readonly trainer:string;readonly beaten:boolean}>();
 observe(event:RunEvent):void {
  this.run??=event.run;
  if(event.run!==this.run)return;
  if(event.type==="milestone"){if(!this.milestones.has(event.name))this.milestones.set(event.name,event.turn);return;}
  if(event.type==="tool_result"){if(!event.is_error&&OBSERVATION_TOOLS.has(event.name))this.readout=event.text;return;}
  if(event.type!=="state"||!("started" in event))return;
  this.state=event;
  for(const badge of event.badges)this.earned.add(badge.toUpperCase());
  if(event.location!==null)this.visited.add(event.location);
  const map=key(event.map_id),trainers=event.heal_before_trainers?.trainers??[];
  for(const t of trainers)this.defeated.set(`${String(map)}#${String(t.trainer_id)}`,t.defeated);
  const step=FACING[(event.facing??"").toLowerCase()];
  if(event.position===null||step===undefined)return;
  const x=event.position.x+step[0],y=event.position.y+step[1];
  const hit=trainers.find(t=>t.x===x&&t.y===y);
  if(hit!==undefined)this.faced.set(event.seq,{trainer:`${String(map)}#${String(hit.trainer_id)}`,beaten:hit.defeated});
 }
 // A story-destinations block marks a finished line with a "Done: …" line under it, before the next blank line.
 private story():StoryLine|null {
  const lines=(this.readout??"").split("\n");
  for(const [i,line] of lines.entries())for(const form of STORY_FORMS){
   const found=form(line);if(found===null)continue;
   const rest=lines.slice(i+1),end=rest.indexOf("");
   return {...found,done:(end===-1?rest:rest.slice(0,end)).some(l=>l.startsWith("Done: "))};
  }
  return null;
 }
 private near():Map<string,string> {
  const near=new Map<string,string>(),state=this.state;
  if(state===null)return near;
  const here=key(state.map_id);if(here!==null)near.set(here,"current map");
  for(const c of state.topology?.connections??[]){const k=key(c.destination);if(k!==null&&!near.has(k))near.set(k,`${c.direction} connection`);}
  for(const line of (this.readout??"").split("\n")){
   if(!line.startsWith("Exits you can walk to")&&!line.startsWith("You are surfing")&&!line.startsWith("Warps:")&&!line.startsWith("Unavailable from here:"))continue;
   for(const m of line.matchAll(/\(map (\d+)\/(\d+)\)/g)){const k=`${m[1]??""}/${m[2]??""}`;if(!near.has(k))near.set(k,"warp listed in the readout");}
  }
  return near;
 }
 private player():string {return this.state?.name??"";}
 private templateDone(e:CapEpisode):string|null {
  const player=this.player();
  for(const rule of RETIREMENT_RULES){
   if(rule.pages.length!==e.pages.length)continue;
   const same=rule.pages.every((t,i)=>{const p=e.pages[i];return p!==undefined&&p[2]===t.text.replaceAll("{PLAYER}",player)&&JSON.stringify(p[4])===JSON.stringify(t.map_id)&&p[0]===t.speaker&&p[1]===t.speaker_source;});
   if(same&&rule.requires.every(n=>this.milestones.has(n)))return `pret-audited template ${rule.id}; milestones ${rule.requires.length===0?"none needed":rule.requires.join(", ")}`;
  }
  return null;
 }
 // A story checkpoint closes an episode heard by the time its milestones were all recorded, every page in its scope.
 private checkpointDone(e:CapEpisode):string|null {
  for(const c of this.wholeGame?STORY_CHECKPOINTS:LEGACY_STORY_CHECKPOINTS){
   const turns=c.closes_after.map(n=>this.milestones.get(n));
   if(turns.some(t=>t===undefined))continue;
   const by=turns.reduce<number>((a,t)=>Math.max(a,t??0),0);
   if(e.turn>by||e.pages.length===0)continue;
   if(e.pages.every(p=>c.scope.some(s=>key(s.map_id)===key(p[4])&&s.speakers.includes(p[0]))))return `checkpoint ${c.id}: ${c.closes_after.join(", ")} (turn ${String(by)})`;
  }
  return null;
 }
 // junk-filter-leader-lines-v1: the junk filter keeps a gym leader's line until that badge is earned. Battle states can report no
 // badges, so earned badges are latched.
 private leaderUnbeaten(p:CapRow):boolean {
  const badge=p[0]===null?undefined:LEADER_BADGE[p[0]];
  return this.leaderLines&&badge!==undefined&&!this.earned.has(badge);
 }
 private pageDone(p:CapRow):readonly [string,boolean]|null {
  const player=escape(this.player());
  for(const [pattern,completion] of RECEIPTS)if(new RegExp(`^${pattern.replaceAll("{P}",player)}$`).test(p[2]))return ["receipt",completion];
  const faced=p[5]===null?undefined:this.faced.get(p[5]);
  // Only lines heard while the trainer was unbeaten (the challenge) retire; post-battle advice stays. Gym leaders
  // also explain their badge and TM rewards; their lines close only through the badge checkpoints.
  if(p[1]==="faced_sprite"&&faced!==undefined&&!faced.beaten&&!(p[0]!==null&&p[0] in LEADER_BADGE)&&faced.trainer.startsWith(`${String(key(p[4]))}#`)&&this.defeated.get(faced.trainer)===true)return [`trainer ${faced.trainer.split("#")[1]??""} defeated`,true];
  return null;
 }
 private done(e:CapEpisode):string|null {
  const template=this.templateDone(e)??this.checkpointDone(e);if(template!==null)return template;
  const marks=e.pages.map(p=>this.pageDone(p));
  if(marks.length===0||marks.some(m=>m===null)||!marks.some(m=>m?.[1]===true))return null;
  return `every page finished: ${[...new Set(marks.map(m=>m?.[0]??""))].sort().join("; ")}`;
 }
 private anchor(e:CapEpisode,story:StoryLine|null):readonly [boolean,string]|null {
  if(story===null||story.turn!==e.turn||!oneLine(e.pages).includes(story.quote.replaceAll("\n"," ")))return null;
  if(story.done===true)return [false,"the readout marks this story line Done"];
  const badges=new Set(this.state?.badges??[]);
  const leaders=Object.keys(LEADER_BADGE).filter(n=>word(n,story.quote,"A-Za-z0-9"));
  if(leaders.length>0&&leaders.every(n=>badges.has(LEADER_BADGE[n]??"")))return [false,`its quote names ${leaders.join(", ")}; badge flag ${leaders.map(n=>LEADER_BADGE[n]??"").join(", ")} is set`];
  return [true,`source of the readout's story line (${story.speaker}, turn ${String(story.turn)})`];
 }
 private visitedPlace(place:string):boolean {
  const stems=[norm(place),...(/ (?:TOWN|CITY)$/.test(place)?[norm(place.replace(/ (?:TOWN|CITY)$/,""))]:[])];
  return [...this.visited].some(v=>{const n=norm(v);return stems.some(s=>n.startsWith(s)&&!/[0-9]/.test(n.charAt(s.length)));});
 }
 private named(e:CapEpisode,met:ReadonlySet<string>):string[] {
  const text=oneLine(e.pages),found:string[]=[];
  for(const place of PRET_MAP_SECTIONS){
   const words=[place,...(/ (?:TOWN|CITY)$/.test(place)?[place.replace(/ (?:TOWN|CITY)$/,"")]:[])];
   if(words.some(w=>word(w,text))&&!this.visitedPlace(place))found.push(`unvisited place ${place}`);
  }
  for(const person of PEOPLE)if(word(person,text,"A-Z")&&!met.has(person))found.push(`not-yet-met person ${person}`);
  for(const item of this.state?.resources?.bag??[])if(item.pocket==="key_items"&&item.name!==null&&item.name!==undefined&&word(item.name,text,"A-Z"))found.push(`key item ${item.name} still in the bag`);
  return found;
 }
 // A hard cap: anchor, nearby, named and recency episodes are added in that order, newest first within each, while the
 // whole block fits. Each episode is measured once: its single-episode render less the empty render, plus one
 // separator measured on the first pair, plus the left-out line (whose length depends only on the count's digits).
 select(episodes:readonly CapEpisode[],render:(kept:readonly CapEpisode[],omitted:number)=>string,budget=INSTRUCTION_MEMORY_CAP_CHARS):CapSelection {
  const story=this.story(),near=this.near();
  const met=new Set(episodes.flatMap(e=>e.pages.flatMap(p=>p[0]===null?[]:[p[0]])));
  if(met.has("DAD"))met.add("NORMAN");
  type Candidate={e:CapEpisode;step:CapStep;fact:string;rule?:JunkRule;fallback?:{step:CapStep;fact:string}};
  const rows=episodes.map((e):Candidate=>{
   const anchor=this.anchor(e,story),done=this.done(e);
   if(done!==null)return {e,step:"done",fact:anchor===null?done:`${done}; ${anchor[0]?"anchor":"stale anchor"}: ${anchor[1]}`};
   if(anchor?.[0]===true)return {e,step:"anchor",fact:anchor[1]};
   const at=e.pages.find(p=>near.has(key(p[4])??""));
   if(at!==undefined)return {e,step:"nearby",fact:`heard on ${String(at[3])} (${String(key(at[4]))}): ${near.get(key(at[4])??"")??""}`};
   const names=this.named(e,met);
   const stale=anchor===null?"":`; stale anchor: ${anchor[1]}`;
   return names.length>0?{e,step:"named",fact:names.join("; ")+stale}:{e,step:"recency",fact:`names no unvisited place, unmet story person or held key item${stale}`};
  });
  const newest=(a:number,b:number)=>(rows[b]?.e.turn??0)-(rows[a]?.e.turn??0)||(rows[b]?.e.result??0)-(rows[a]?.e.result??0);
  const receipt=(p:CapRow)=>this.pageDone(p)?.[0]==="receipt";
  const moreRecent=(a:CapEpisode,b:CapEpisode)=>a.turn>b.turn||a.turn===b.turn&&a.result>b.result;
  const remember=(e:CapEpisode,known:Map<string,CapEpisode>)=>{for(const p of e.pages)if(!receipt(p)){const k=junkPageKey(p),previous=known.get(k);if(previous===undefined||moreRecent(e,previous))known.set(k,e);}};
  const covered=(e:CapEpisode,known:ReadonlyMap<string,CapEpisode>)=>{const content=e.pages.filter(p=>!receipt(p));return content.length>0&&content.every(p=>{const representative=known.get(junkPageKey(p));return representative!==undefined&&moreRecent(representative,e);});};
  const chronological=rows.map((_,i)=>i).sort(newest),duplicates:number[]=[];
  if(this.junk){
   const hm=this.state!==null&&progressReached("HM_ROCK_SMASH_RECEIVED",this.state)===true;
   for(const row of rows){
    if(row.step==="anchor"||row.step==="done")continue;
    const rule=junkRule(row.e,{player:this.player(),hasLead:this.named(row.e,met).length>0,rockSmashReceived:hm,receipt,
     facedTrainer:p=>{const hit=p[5]===null?undefined:this.faced.get(p[5]);return p[1]==="faced_sprite"&&hit!==undefined&&hit.trainer.startsWith(`${String(key(p[4]))}#`)&&!this.leaderUnbeaten(p);},
     storySprite:p=>p[0]!==null&&(canonicalStoryCharacterName(p[0])!==null||p[0] in LEADER_BADGE)});
    if(rule!==null){row.step="junk";row.rule=rule;row.fact=`pret junk rule ${rule}: every non-receipt page qualifies`;}
   }
   const newer=new Map<string,CapEpisode>();
   for(const i of chronological){const row=rows[i];if(row===undefined||row.step==="done"||row.step==="junk")continue;
    if(row.step!=="anchor"&&covered(row.e,newer)){row.fallback={step:row.step,fact:row.fact};row.step="junk";row.rule="R4";row.fact="same exact speaker/text pages also occur in newer episodes surviving the other junk rules";duplicates.push(i);}
    remember(row.e,newer);
   }
  }
  const order=(["anchor","nearby","named","recency"] as const).flatMap(group=>rows.flatMap((r,i)=>r.step===group?[i]:[]).sort(newest));
  const empty=new Map<number,number>();
  const base=(omitted:number)=>{const digits=omitted===0?0:String(omitted).length;const known=empty.get(digits);if(known!==undefined)return known;const v=codePoints(render([],omitted));empty.set(digits,v);return v;};
  const keep=new Set<number>();
  let sum=0,sep:number|null=null;
  const consider=(i:number)=>{
   const e=rows[i]?.e;if(e===undefined)return;
   const d=codePoints(render([e],0))-base(0);
   if(keep.size===1&&sep===null){const first=rows[[...keep][0]??0]?.e;if(first!==undefined)sep=codePoints(render([first,e].sort((a,b)=>episodes.indexOf(a)-episodes.indexOf(b)),0))-base(0)-sum-d;}
   const total=base(rows.length-keep.size-1)+sum+d+(keep.size===0?0:(sep??0)*keep.size);
   if(total<=budget){keep.add(i);sum+=d;}
  };
  for(const i of order)consider(i);
  // A newer copy that missed the cap cannot erase an older fitting copy. This bounded fallback adds only;
  // it never displaces the incumbent cap's chosen priorities. It reuses the same additive measuring owner.
  const fallbackOrder:number[]=[];
  if(this.junk){const represented=new Map<string,CapEpisode>();for(const i of keep){const e=rows[i]?.e;if(e!==undefined)remember(e,represented);}
   for(const i of duplicates){const row=rows[i];if(row?.fallback===undefined||covered(row.e,represented))continue;
    row.step=row.fallback.step;row.fact=row.fallback.fact+"; newer duplicate missed the cap, so this whole older copy remains eligible";delete row.rule;delete row.fallback;
    consider(i);fallbackOrder.push(i);if(keep.has(i))remember(row.e,represented);
   }
  }
  const kept=()=>rows.filter((_,i)=>keep.has(i)).map(r=>r.e);
  for(const i of [...order,...fallbackOrder].reverse()){if(codePoints(render(kept(),rows.length-keep.size))<=budget)break;keep.delete(i);}
  return {kept:rows.filter((_,i)=>keep.has(i)).map(r=>r.e),omitted:rows.length-keep.size,decisions:rows.map((r,i)=>({result:r.e.result,step:r.step,fact:r.fact,kept:keep.has(i),...(r.rule===undefined?{}:{rule:r.rule})}))};
 }
}
