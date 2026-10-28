import {writeFileSync,readFileSync} from "node:fs";
import {homedir} from "node:os";
import {join} from "node:path";
import {describe,expect,it,vi} from "vitest";
import * as events from "./events.js";
import {ObservedInstructions} from "./observed-instructions.js";
import {STORY_CHECKPOINTS,LEGACY_STORY_CHECKPOINTS} from "./story-checkpoints.js";
import {codePoints,type CapEpisode} from "./instruction-memory-cap.js";
import {buildWholeGameStream,loadWholeGameScript} from "../test-support/whole-game-stream.js";
const PRET=process.env.POKEEMERALD_DIR??join(homedir(),"dev","pokeemerald");
// Named limitations approved by the coordinator; no exemption for any other step or hint.
// Reason: cap pressure after printed-name fidelity keeps DAD's reusable episode eligible.
// Reproduction receipt: runs/analysis/whole-game-story-checkpoints-20261028/diagnostic-v3-whole-dedup.json.
const KNOWN_WHOLE_DEDUP_LIMITS:Readonly<Record<string,readonly string[]>>={
 "aqua-hideout":["npc-d-progression_hint-1"],
 "tate-liza":["npc-d-progression_hint-1"],
};
const payload=(text:string):{episodes:CapEpisode[]}=>JSON.parse(text.slice(text.indexOf("\n{")+1)) as {episodes:CapEpisode[]};

describe("deterministic pret-only whole-game instruction stream",()=>{
 it("audits source keys and emits independently valid linear events through the endgame",()=>{
  const entries=loadWholeGameScript(PRET);
  expect(entries.every(e=>e.page_names!==undefined)).toBe(true);
  const spy=vi.spyOn(events,"checkEvent");
  try{
   const a=buildWholeGameStream(entries,20261028),calls=spy.mock.calls.length;
   expect(a.length).toBeGreaterThan(40);
   const flat=a.flatMap(s=>[...s.before,...s.after]);expect(calls).toBe(flat.length);
   expect(flat.map(e=>e.seq)).toEqual(flat.map(e=>e.seq).sort((a,b)=>a-b));
   for(const e of flat)expect(events.checkEvent(e)).toEqual(e);
   expect(buildWholeGameStream(entries,20261028)).toEqual(a);
   expect(buildWholeGameStream(entries,1)).not.toEqual(a);
   const names=new Set(flat.filter(e=>e.type==="milestone").map(e=>e.name));
   for(const c of STORY_CHECKPOINTS)for(const name of c.closes_after)expect(names.has(name),name).toBe(true);
   const norman=a.find(s=>s.entry.id==="norman")?.before.find(e=>e.type==="dialogue_auto_advance");
   if(norman?.type!=="dialogue_auto_advance")throw Error("missing Norman scene");
   expect(norman.pages.every(p=>p.speaker==="DAD"&&p.speaker_source==="name_prefix")).toBe(true);
   const twins=a.find(s=>s.entry.id==="tate-liza")?.before.find(e=>e.type==="dialogue_auto_advance");
   if(twins?.type!=="dialogue_auto_advance")throw Error("missing twins scene");
   expect(twins.pages[0]?.speaker).toBe("TATE");expect(twins.pages[1]?.speaker).toBe("LIZA");
   expect(a.at(-1)?.entry.id).toBe("optional-rayquaza");
   expect(entries.filter(e=>e.role==="filler").map(e=>e.region)).toEqual(expect.arrayContaining(["a","b","c","d","e","f"]));
  }finally{spy.mockRestore();}
 });
 it("reads each pret file once and rejects invalid source identities and text instead of guessing",()=>{
  const path=join(import.meta.dirname,"../test-support/whole-game-script.json");
  const source=JSON.parse(readFileSync(path,"utf8")) as Record<string,unknown>[];
  const counts=new Map<string,number>();
  loadWholeGameScript(PRET,path,p=>{counts.set(p,(counts.get(p)??0)+1);return readFileSync(p,"utf8");});
  expect(Math.max(...counts.values())).toBe(1);
  const first=source[0];if(first===undefined)throw Error("missing source fixture");
  const fixture=(rows:unknown,change?:(path:string,text:string)=>string)=>()=>loadWholeGameScript(PRET,"fixture.json",p=>p==="fixture.json"?JSON.stringify(rows):change?.(p,readFileSync(p,"utf8"))??readFileSync(p,"utf8"));
  expect(fixture({bad:true})).toThrow("malformed whole-game script");
  expect(fixture([first,first])).toThrow("duplicate entry");
  expect(fixture([{...first,map_id:[99,99]}])).toThrow("map id mismatch");
  expect(fixture([{...first,name_prefix:"MOM"}])).toThrow("one speaker attribution required");
  const {speaker_gfx:removed,...plain}=first;expect(removed).toBeDefined();
  expect(fixture([plain])).toThrow("one speaker attribution required");
  expect(fixture([{...first,milestone_after:["MISSING"]}])).toThrow("unknown milestone");
  expect(fixture([{...first,text_label:"NotARealText"}])).toThrow("missing pret text");
  expect(fixture([{...first,speaker_gfx:"OBJ_EVENT_GFX_NOT_REAL"}])).toThrow("missing sprite");
  expect(fixture([{...plain,name_prefix:"NOT REAL"}])).toThrow("missing printed name");
  expect(fixture([first],(p,t)=>p.endsWith("map_groups.json")?"{}":t)).toThrow("malformed pret map groups");
  expect(fixture([{...first,page_names:[]}])).toThrow("page attribution count");
  const pageNames=first.page_names as string[];
  expect(fixture([{...first,page_names:["NOT REAL",...pageNames.slice(1)]}])).toThrow("page printed name");
  expect(fixture([{...first,page_names:[pageNames[0],null,...pageNames.slice(2)]}])).toThrow("lost printed name");
  const {page_names:pageNamesRemoved,...withoutPages}=first;expect(pageNamesRemoved).toBeDefined();
  expect(fixture([withoutPages])()).toHaveLength(1);
  const twins=source.find(e=>e.id==="tate-liza");if(twins===undefined)throw Error("missing twins fixture");
  const names=twins.page_names as string[];
  expect(fixture([{...twins,page_names:[names[0],"TATE",...names.slice(2)]}])).toThrow("page printed name");
  const label=String(first.text_label);
  expect(fixture([first],(p,t)=>p.endsWith("scripts.inc")?t.replaceAll(`msgbox ${label}`,"msgbox OtherText"):t)).toThrow("uncalled pret text");
  expect(fixture([first],(p,t)=>p.endsWith("scripts.inc")?t.replace('MOM: {PLAYER}',String.raw`MOM: \q{PLAYER}`):t)).toThrow("unsupported text escape");
  expect(fixture([first],(p,t)=>p.endsWith("scripts.inc")?t.replace('MOM: {PLAYER}',String.raw`\pMOM: {PLAYER}`):t)).toThrow("empty pret page");
 });
 it("handles empty fixtures, duplicate completion events and both native rival variants",()=>{
  expect(buildWholeGameStream([])).toEqual([]);
  const entries=loadWholeGameScript(PRET),rival=entries.find(e=>e.id==="route110-itemfinder");
  if(rival===undefined)throw Error("missing rival fixture");
  const source={...rival,id:"source-rival",name_prefix:"BRENDAN",milestone_after:["ROUTE_110_RIVAL_DEFEATED","AQUA_HIDEOUT_ACCESS_OPENED","DYNAMO_BADGE"]};
  const steps=buildWholeGameStream([source,{...source,id:"repeat-rival"}]);
  const milestones=steps.flatMap(s=>s.after).filter(e=>e.type==="milestone");
  expect(milestones.map(e=>e.name)).toEqual(source.milestone_after);
  expect(steps[1]?.after).toEqual([]);
  const after=steps[0]?.after.find(e=>e.type==="state"&&"started" in e);
  if(after?.type!=="state"||!("started" in after))throw Error("missing completion state");
  const flag=(n:number)=>(Number.parseInt(after.story_progress?.flags.slice(2*(n>>3),2*(n>>3)+2)??"0",16)&(1<<(n&7)))!==0;
  expect(flag(1801)).toBe(true);expect(flag(821)).toBe(true);expect(flag(822)).toBe(true);expect(after.badges).toContain("DYNAMO");
 });
 it("rehearses six source-owned signs separately, retaining unknown attribution and the main stream unchanged",()=>{
  const script=join(import.meta.dirname,"../test-support/whole-game-signs.json");
  const signs=loadWholeGameScript(PRET,script);expect(signs).toHaveLength(6);
  expect(loadWholeGameScript(PRET)).toHaveLength(136);
  const steps=buildWholeGameStream(signs);
  for(const whole of [false,true])for(const dedup of [false,true]){
   const memory=new ObservedInstructions(true,true,true,true,whole),places=new ObservedInstructions(true,true);
   for(const step of steps){
    for(const event of [...step.before,...step.after]){memory.observe(event);places.observe(event);}
    const shown=memory.text(dedup?places.placeEpisodes():undefined)??"";
    expect(codePoints(shown)).toBeLessThanOrEqual(16000);
    const kept=payload(shown).episodes;
    expect(kept).toHaveLength(step.before[0]?.turn??0);
    expect(kept.every(e=>e.pages.every(p=>p[0]===null&&p[1]===null))).toBe(true);
   }
  }
  const rows=JSON.parse(readFileSync(script,"utf8")) as Record<string,unknown>[];
  const first=rows[0];if(first===undefined)throw Error("missing sign fixture");
  const load=(row:Record<string,unknown>)=>()=>loadWholeGameScript(PRET,"sign.json",p=>p==="sign.json"?JSON.stringify([row]):readFileSync(p,"utf8"));
  const {sign_script:removed,...withoutScript}=first;expect(removed).toBeDefined();
  expect(load(withoutScript)).toThrow("sign script required");
  expect(load({...first,sign_script:"NotARealSign"})).toThrow("missing sign script");
  expect(load({...first,text_label:"Route101_Text_PleaseHelp"})).toThrow("sign text mismatch");
 });
 for(const wholeGame of [false,true])for(const dedup of [false,true])it(`checks every story step: cap ON, whole-game ${String(wholeGame)}, dedup ${String(dedup)}`,()=>{
  const entries=loadWholeGameScript(PRET),steps=buildWholeGameStream(entries,20261028);
  const memory=new ObservedInstructions(true,true,true,true,wholeGame),places=new ObservedInstructions(true,true);
  const checkpoints=wholeGame?STORY_CHECKPOINTS:LEGACY_STORY_CHECKPOINTS;
  const completed=new Map<string,number>();const summary:Record<string,unknown>[]=[];const misses:{step:string;hint:string}[]=[];
  const feed=(es:readonly events.RunEvent[])=>{for(const e of es){memory.observe(e);places.observe(e);if(e.type==="milestone"&&!completed.has(e.name))completed.set(e.name,e.turn);}};
  const text=()=>memory.text(dedup?places.placeEpisodes():undefined)??"";
  const closed=(e:CapEpisode)=>checkpoints.some(c=>c.closes_after.every(n=>completed.has(n))&&e.turn<=Math.max(...c.closes_after.map(n=>completed.get(n)??0))&&e.pages.every(p=>c.scope.some(s=>JSON.stringify(s.map_id)===JSON.stringify(p[4])&&s.speakers.includes(p[0]))));
  for(const step of steps){
   feed(step.before);
   const shown=text(),kept=payload(shown).episodes;
   expect(codePoints(shown),step.entry.id).toBeLessThanOrEqual(16000);
   expect(kept.some(e=>JSON.stringify(e.pages.map(p=>p[2]))===JSON.stringify(step.entry.pages)),`${step.entry.id}: current instruction or existing exact episode`).toBe(true);
   for(const e of kept)expect(closed(e),`${step.entry.id}: completed episode ${String(e.result)}`).toBe(false);
   const next=String.fromCharCode(step.entry.region.charCodeAt(0)+1);
   const activeHints=steps.filter(s=>s.entry.category==="PROGRESSION_HINT"&&[step.entry.region,next].includes(s.entry.region)&&s.resultSeq<=step.resultSeq);
   const missingHints=activeHints.filter(h=>!kept.some(e=>e.result===h.resultSeq));
   if(wholeGame)expect(missingHints.map(h=>h.entry.id),`${step.entry.id}: active hints (only two named known limits)`).toEqual(dedup?KNOWN_WHOLE_DEDUP_LIMITS[step.entry.id]??[]:[]);
   for(const hint of missingHints)misses.push({step:step.entry.id,hint:hint.entry.id});
   feed(step.after);
   const after=text();expect(codePoints(after)).toBeLessThanOrEqual(16000);
   for(const e of payload(after).episodes)expect(closed(e),`${step.entry.id} after: completed episode ${String(e.result)}`).toBe(false);
   if(step.entry.role==="story")summary.push({id:step.entry.id,region:step.entry.region,whole_game:wholeGame,dedup,chars:codePoints(shown),episodes_kept:kept.length,episodes_left_out:memory.archive().length-kept.length,speakers:[...new Set(kept.flatMap(e=>e.pages.map(p=>p[0])))],active_hints:activeHints.map(h=>h.entry.id),missing_hints:missingHints.map(h=>h.entry.id),text:shown});
  }
  if(wholeGame)expect(misses).toEqual(dedup?[{step:"aqua-hideout",hint:"npc-d-progression_hint-1"},{step:"tate-liza",hint:"npc-d-progression_hint-1"}]:[]);
  else expect(misses[0]).toEqual({step:dedup?"winona":"submarine-theft",hint:dedup?"npc-c-progression_hint-2":"npc-d-progression_hint-1"});
  const report=process.env.POKEBENCH_WHOLE_GAME_REPORT;
  if(report!==undefined)writeFileSync(`${report}-${wholeGame?"whole":"legacy"}-${dedup?"dedup":"split"}.json`,JSON.stringify(summary,null,2));
 });
});
