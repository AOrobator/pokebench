// R1–R6 use only pret 731ad5bfd labels/text and source-attested signals; no walkthrough prose.
import flavorData from "./data/npc-flavor-labels.json" with {type:"json"};
import source from "./data/instruction-memory-junk-source.json" with {type:"json"};
import {PRET_MAP_SECTIONS} from "./pret-map-sections.js";
import type {CapEpisode,CapRow} from "./instruction-memory-cap.js";

export type JunkRule="R1"|"R2"|"R3"|"R4"|"R5"|"R6";
type Category="PROGRESSION_HINT"|"USEFUL_OPTIONAL"|"FLAVOR";
interface Label {readonly text_label:string;readonly map:string;readonly text:string;readonly category:Category}
export interface JunkContext {
 readonly hasLead:boolean;
 readonly player:string;
 readonly rockSmashReceived:boolean;
 readonly receipt:(page:CapRow)=>boolean;
 readonly facedTrainer:(page:CapRow)=>boolean;
 readonly storySprite:(page:CapRow)=>boolean;
}
const labels=flavorData as readonly Label[];
const maps=source.maps as Readonly<Record<string,readonly number[]>>;
const escape=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
// pret .string controls delimit whole displayed pages. All placeholder substitutions match a whole page.
export const pretPages=(text:string):string[]=>text.replaceAll("\\l","\\n").split("\\p").map(p=>p.replaceAll("\\n","\n"));
class Pages {
 private readonly literal=new Set<string>();
 private readonly dynamic:{pattern:RegExp;players:string[]}[]=[];
 constructor(texts:readonly string[]){for(const text of texts)for(const page of pretPages(text)){
  if(/\{[A-Z_0-9]+\}/.test(page)){
   const players:string[]=[];const pattern=escape(page).replace(/\\\{([A-Z_0-9]+)\\\}/g,(_whole:string,key:string)=>{if(key!=="PLAYER")return ".+";const name=`p${String(players.length)}`;players.push(name);return `(?<${name}>.+)`;});
   this.dynamic.push({pattern:new RegExp("^"+pattern+"$","s"),players});
  }
  else this.literal.add(page);
 }}
 has(text:string,player?:string):boolean{return this.literal.has(text)||this.dynamic.some(({pattern,players})=>{const match=pattern.exec(text);return match!==null&&(player===undefined||players.every(name=>match.groups?.[name]===player));});}
}
const service=new Pages(source.service.map(p=>p.text)),berry=new Pages(source.berry.map(p=>p.text));
const sign=new Pages([source.keep_sign.text]),rock=new Pages(source.rock_smash.map(p=>p.text));
const flavor=new Pages(labels.filter(l=>l.category==="FLAVOR").map(l=>l.text));
const protectedPages=new Pages(labels.filter(l=>l.category!=="FLAVOR").map(l=>l.text));
const anyLabel=new Pages(labels.map(l=>l.text));
const normalized=(s:string)=>s.toUpperCase().replace(/[^A-Z0-9]/g,"");
function onMap(page:CapRow,name:string):boolean {
 const id=maps[name];if(id===undefined)return false;
 return page[4]===null?page[3]!==null&&normalized(page[3])===normalized(name):page[4][0]===id[0]&&page[4][1]===id[1];
}
const upstairs=Object.keys(maps).filter(name=>name.endsWith("_PokemonCenter_2F"));
const word=(term:string,edge="A-Za-z0-9")=>new RegExp(`(?<![${edge}])${escape(term)}(?![${edge}])`);
const places=[...new Set([...PRET_MAP_SECTIONS,...PRET_MAP_SECTIONS.filter(n=>/ (?:TOWN|CITY)$/.test(n)).map(n=>n.replace(/ (?:TOWN|CITY)$/,"") ),"ROUTE"])];
const names=Object.entries(source.signals).filter(([key])=>key.startsWith("b_")||key==="e_person").flatMap(([,terms])=>terms);
const terms=Object.entries(source.signals).filter(([key])=>!key.startsWith("b_")&&key!=="e_person"&&key!=="v4_gating").flatMap(([,words])=>words);
const nameSignals=[...new Set([...places,...names])].map(term=>word(term));
const phraseSignals=terms.map(term=>word(term,"a-z"));
export function junkSignalsV4(text:string):boolean {
 const flat=text.replaceAll("\\n"," ").replaceAll("\\p"," ").replaceAll("\\l"," ").replaceAll("\n"," ");
 if(nameSignals.some(pattern=>pattern.test(flat)))return true;
 const low=flat.toLowerCase();if(phraseSignals.some(pattern=>pattern.test(low)))return true;
 if(source.signals.v4_gating.some(term=>low.includes(term)))return true;
 const caps=flat.match(/[A-ZÉ][A-Zé'’.\-]{2,}/g)??[];
 if(caps.some(term=>!["POKéMON","POKé"].includes(term)&&!["POKéMON","POKé"].includes(term.replace(/^[.'’\-]+|[.'’\-]+$/g,""))))return true;
 return flat.includes("{STR_VAR")||/^[A-Z][A-Z .'’]+: /.test(flat);
}
export const junkPageKey=(page:CapRow):string=>JSON.stringify([page[0],page[2]]);
// R4 lives in the cap owner, which alone knows which newer copies survive its fill.
export function junkRule(episode:CapEpisode,context:JunkContext):Exclude<JunkRule,"R4">|null {
 const pages=episode.pages;if(pages.length===0)return null;
 const receipt=context.receipt,content=pages.filter(p=>!receipt(p));
 // Operator exception: native flag 0x6B retires this precise pret exchange, never a bag-name guess.
 if(content.length>0&&pages.every(p=>onMap(p,"MauvilleCity_House1")&&(receipt(p)||rock.has(p[2]))))return context.rockSmashReceived?"R6":null;
 // Every useful/hint page keeps its whole episode, even when another page is FLAVOR.
 if(content.some(p=>protectedPages.has(p[2])))return null;
 if(pages.some(p=>sign.has(p[2])))return null;
 if(content.length>0&&pages.every(p=>receipt(p)||service.has(p[2],context.player))||pages.every(p=>upstairs.some(map=>onMap(p,map))))return "R1";
 if(pages.every(p=>receipt(p)||p[0]?.startsWith("BERRY_TREE")===true||berry.has(p[2]))&&pages.some(p=>p[0]?.startsWith("BERRY_TREE")===true||berry.has(p[2])))return "R2";
 if(!context.hasLead&&pages.every(p=>p[1]==="faced_target"))return "R3";
 if(content.length>0&&pages.every(p=>receipt(p)||context.facedTrainer(p)))return "R5";
 if(context.hasLead||content.length===0||!pages.every(p=>receipt(p)||p[1]==="faced_sprite"&&p[0]!==null&&!p[0].startsWith("RIVAL_")&&!context.storySprite(p)))return null;
 if(content.every(p=>flavor.has(p[2])))return "R6";
 if(content.every(p=>!anyLabel.has(p[2]))&&!junkSignalsV4(content.map(p=>p[2]).join("\n")))return "R6";
 return null;
}
