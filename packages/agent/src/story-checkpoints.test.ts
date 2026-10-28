import {existsSync,readFileSync} from "node:fs";
import {homedir} from "node:os";
import {join} from "node:path";
import {describe,expect,it} from "vitest";
import {MILESTONES} from "./milestones.js";
import {PROGRESS_CATALOG} from "./story-progress.js";
import {LEGACY_STORY_CHECKPOINTS,STORY_CHECKPOINTS} from "./story-checkpoints.js";

// Audits every checkpoint against a pret/pokeemerald checkout (731ad5bfd, POKEEMERALD_DIR or ~/dev/pokeemerald).
const PRET=process.env.POKEEMERALD_DIR??join(homedir(),"dev","pokeemerald");
const havePret=existsSync(join(PRET,"data","maps","map_groups.json"));
const cache=new Map<string,string>();
const read=(...p:string[])=>{const path=join(PRET,...p);const hit=cache.get(path);if(hit!==undefined)return hit;const text=readFileSync(path,"utf8");cache.set(path,text);return text;};

describe("story checkpoints",()=>{
 it("close only after milestones the harness already reads, each scope naming a map once",()=>{
  const known=new Set([...MILESTONES.map(m=>m.name),...PROGRESS_CATALOG.map(m=>m.name)]);
  expect(new Set(STORY_CHECKPOINTS.map(c=>c.id)).size).toBe(STORY_CHECKPOINTS.length);
  for(const c of STORY_CHECKPOINTS){
   expect(c.closes_after.length).toBeGreaterThan(0);
   expect(c.closes_after.filter(n=>!known.has(n))).toEqual([]);
   expect(new Set(c.scope.map(s=>s.map)).size).toBe(c.scope.length);
   for(const s of c.scope)expect(s.speakers.length).toBeGreaterThan(0);
  }
  expect(LEGACY_STORY_CHECKPOINTS.at(-1)?.closes_after).toEqual(["DEVON_GOODS_DELIVERED"]);
  expect(LEGACY_STORY_CHECKPOINTS).toHaveLength(15);
 });
 it.skipIf(!havePret)("match pret: map ids, speakers on those maps or in the scene's scripts, and flag numbers",()=>{
  const groups=JSON.parse(read("data","maps","map_groups.json")) as {group_order:string[]}&Record<string,string[]>;
  const ids=new Map<string,string>();
  groups.group_order.forEach((g,gi)=>{(groups[g]??[]).forEach((m,mi)=>{ids.set(m,`${String(gi)}/${String(mi)}`);});});
  const flags=read("include","constants","flags.h"),vars=read("include","constants","vars.h");
  const gameClear=read("src","post_battle_event_funcs.c");
  const before=cache.size;
  for(const c of STORY_CHECKPOINTS){
   const scripts=c.scope.map(s=>read("data","maps",s.map,"scripts.inc")).join("\n");
   for(const s of c.scope){
    expect(ids.get(s.map),`${c.id} ${s.map}`).toBe(`${String(s.map_id[0])}/${String(s.map_id[1])}`);
    const sprites=read("data","maps",s.map,"map.json"),localScripts=read("data","maps",s.map,"scripts.inc");
    for(const speaker of s.speakers){
     if(speaker===null)continue;
     expect(sprites.includes(`"OBJ_EVENT_GFX_${speaker}"`)||(LEGACY_STORY_CHECKPOINTS.includes(c)?scripts:localScripts).includes(`.string "${speaker}: `),`${c.id} ${s.map} ${speaker}`).toBe(true);
    }
   }
   for(const m of c.game_fact.matchAll(/flags? (\d+)(?: and (\d+))? \((FLAG_\w+)(?:, (FLAG_\w+))?\)/g)){
    for(const [n,name] of [[m[1],m[3]],[m[2],m[4]]] as const){
     if(n===undefined||name===undefined)continue;
     const literal=new RegExp(`#define\\s+${name}\\s+(0x[0-9A-Fa-f]+|\\d+)\\b`).exec(flags);
     if(literal?.[1]!==undefined)expect(Number(literal[1]),`${c.id} ${name}`).toBe(Number(n));
     else expect(flags,`${c.id} ${name}`).toMatch(new RegExp(`#define\\s+${name}\\s`));
    }
   }
   for(const f of c.game_fact.matchAll(/\b(FLAG_\w+)\b/g))expect(flags,`${c.id} ${f[1]??""}`).toMatch(new RegExp(`#define\\s+${f[1]??""}\\s`));
   const named=[...c.game_fact.matchAll(/\b((?:FLAG|VAR)_\w+)\b/g)].map(m=>m[1]??"");
   const setters=[...c.scope.map(s=>s.map),...(c.set_on??[])].map(m=>read("data","maps",m,"scripts.inc")).join("\n");
   if(c.game_fact.includes("FLAG_SYS_GAME_CLEAR")){
    expect(scripts).toContain("special GameClear");expect(gameClear).toContain("FlagSet(FLAG_SYS_GAME_CLEAR)");
   }else expect(named.filter(n=>new RegExp(`\\b(?:setflag|setvar|addvar)\\s+${n}\\b`).test(setters)),`${c.id} sets one of ${named.join(", ")}`).not.toEqual([]);
   for(const v of c.game_fact.matchAll(/\b(VAR_\w+)\b/g))expect(vars,`${c.id} ${v[1]??""}`).toMatch(new RegExp(`#define\\s+${v[1]??""}\\s`));
  }
  const scoped=new Set(STORY_CHECKPOINTS.flatMap(c=>c.scope.map(s=>s.map))),scripted=new Set(STORY_CHECKPOINTS.flatMap(c=>[...c.scope.map(s=>s.map),...(c.set_on??[])]));
  expect(cache.size-before).toBe(scoped.size+scripted.size);
 });
});


describe("checkpoint native reader linkage",()=>{
 it.skipIf(!havePret)("binds every closing milestone to the same native flag/variable cited by its checkpoint",()=>{
  const flags=read("include","constants","flags.h"),vars=read("include","constants","vars.h");
  const opponents=read("include","constants","opponents.h");
  const number=(symbol:string):number=>{
   const definition=new RegExp(`#define\\s+${symbol}\\s+([^\r\n]+)`).exec(flags+"\n"+vars+"\n"+opponents)?.[1]?.split("//")[0]?.trim();
   if(definition===undefined)throw Error(`missing native symbol ${symbol}`);
   const parts=definition.replace(/[()]/g,"").match(/[+-]?[^+-]+/g)??[];
   return parts.reduce((sum,part)=>{const p=part.replace(/^[+-]/,"").trim();const value=/^0x[\da-f]+$|^\d+$/i.test(p)?Number(p):number(p);return sum+(part.startsWith("-")?-value:value);},0);
  };
  const milestones=readFileSync(join(import.meta.dirname,"milestones.ts"),"utf8");
  const story=readFileSync(join(import.meta.dirname,"../../../env/pokebench_env/story.py"),"utf8");
  const progress=readFileSync(join(import.meta.dirname,"../../../env/pokebench_env/story_progress.py"),"utf8");
  for(const c of STORY_CHECKPOINTS){
   if(!LEGACY_STORY_CHECKPOINTS.includes(c)){
    const citations=[...c.game_fact.matchAll(/((?:FLAG|VAR)_\w+) \(include\/constants\/(flags|vars)\.h:(\d+)\)/g)];
    expect(citations.length,`${c.id} line citations`).toBeGreaterThan(0);
    for(const cite of citations){
     const source=cite[2]==="flags"?flags:vars;
     expect(source.split("\n")[Number(cite[3])-1],`${c.id} ${cite[0]}`).toMatch(new RegExp(`#define\\s+${cite[1]??""}\\s`));
    }
   }
   const names=[...c.game_fact.matchAll(/\b((?:FLAG|VAR)_\w+)\b/g)].map(m=>m[1]??"");
   const native=new Set(names.map(number));
   for(const name of c.closes_after){
    const reader=PROGRESS_CATALOG.find(m=>m.name===name);
    if(reader!==undefined){
     const inputs=[reader.flag,reader.variable,...(reader.anyFlags??[]),...(reader.allFlags??[])].filter((n):n is number=>n!==undefined);
     if(reader.field!==undefined){
      const position=["rustboro_stage","devon_stage"].indexOf(reader.field);
      const field=[...progress.matchAll(/stage\((0x[0-9a-f]+),/gi)][position]?.[1];
      expect(field,`${c.id}: ${name} native field`).toBeDefined();inputs.push(Number(field));
     }
     expect(inputs.length,`${c.id}: ${name} native predicate`).toBeGreaterThan(0);
     for(const n of inputs)expect(native.has(n),`${c.id}: ${name} native input ${String(n)} not in ${names.join(", ")}`).toBe(true);
    }else{
     const body=new RegExp(`name: "${name}",[^\r\n]+`).exec(milestones)?.[0]??"";
     const field=/(?:stage|flag)\("(\w+)"/.exec(body)?.[1];
     if(field!==undefined){
      const raw=new RegExp(`"${field}"\\s*:\\s*\\(?(0x[0-9a-f]+)`,"i").exec(story)?.[1];
      expect(raw,`${name}: decoder field ${field}`).toBeDefined();expect(native.has(Number(raw)),`${c.id}: ${name} ${field}`).toBe(true);
     }else{
      expect(name).toBe("STONE_BADGE");expect(body).toContain('s.badges.includes("STONE")');expect(native.has(number("FLAG_BADGE01_GET"))).toBe(true);
     }
    }
   }
  }
 });
});
