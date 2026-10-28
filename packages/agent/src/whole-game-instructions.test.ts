import {existsSync,writeFileSync} from "node:fs";
import {homedir} from "node:os";
import {join} from "node:path";
import {describe,expect,it,vi} from "vitest";
import * as events from "./events.js";
import {ObservedInstructions} from "./observed-instructions.js";
import {STORY_CHECKPOINTS,LEGACY_STORY_CHECKPOINTS} from "./story-checkpoints.js";
import {codePoints,type CapEpisode} from "./instruction-memory-cap.js";
import {buildWholeGameStream,loadWholeGameScript} from "../test-support/whole-game-stream.js";
const PRET=process.env.POKEEMERALD_DIR??join(homedir(),"dev","pokeemerald");
const havePret=existsSync(join(PRET,"data/maps/map_groups.json"));
const payload=(text:string):{episodes:CapEpisode[]}=>JSON.parse(text.slice(text.indexOf("\n{")+1)) as {episodes:CapEpisode[]};

describe.skipIf(!havePret)("deterministic pret-only whole-game instruction stream",()=>{
 it("audits source keys and emits independently valid linear events through the endgame",()=>{
  const entries=loadWholeGameScript(PRET);
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
   expect(a.at(-1)?.entry.id).toBe("optional-rayquaza");
   expect(entries.filter(e=>e.role==="filler").map(e=>e.region)).toEqual(expect.arrayContaining(["a","b","c","d","e","f"]));
  }finally{spy.mockRestore();}
 });
 for(const wholeGame of [false,true])for(const dedup of [false,true])it(`checks every story step: cap ON, whole-game ${String(wholeGame)}, dedup ${String(dedup)}`,()=>{
  const entries=loadWholeGameScript(PRET),steps=buildWholeGameStream(entries,20261028);
  const memory=new ObservedInstructions(true,true,true,true,wholeGame),places=new ObservedInstructions(true,true);
  const checkpoints=wholeGame?STORY_CHECKPOINTS:LEGACY_STORY_CHECKPOINTS;
  const completed=new Map<string,number>();const summary:Record<string,unknown>[]=[];
  const feed=(es:readonly events.RunEvent[])=>{for(const e of es){memory.observe(e);places.observe(e);if(e.type==="milestone"&&!completed.has(e.name))completed.set(e.name,e.turn);}};
  const text=()=>memory.text(dedup?places.placeEpisodes():undefined)??"";
  const closed=(e:CapEpisode)=>checkpoints.some(c=>c.closes_after.every(n=>completed.has(n))&&e.turn<=Math.max(...c.closes_after.map(n=>completed.get(n)??0))&&e.pages.every(p=>c.scope.some(s=>JSON.stringify(s.map_id)===JSON.stringify(p[4])&&s.speakers.includes(p[0]))));
  for(const step of steps){
   feed(step.before);
   const shown=text(),kept=payload(shown).episodes;
   expect(codePoints(shown),step.entry.id).toBeLessThanOrEqual(16000);
   expect(kept.some(e=>e.result===step.resultSeq),`${step.entry.id}: current instruction`).toBe(true);
   for(const e of kept)expect(closed(e),`${step.entry.id}: completed episode ${String(e.result)}`).toBe(false);
   const next=String.fromCharCode(step.entry.region.charCodeAt(0)+1);
   const activeHints=steps.filter(s=>s.entry.category==="PROGRESSION_HINT"&&[step.entry.region,next].includes(s.entry.region)&&s.resultSeq<=step.resultSeq);
   for(const hint of activeHints)expect(kept.some(e=>e.result===hint.resultSeq),`${step.entry.id}: active hint ${hint.entry.id}`).toBe(true);
   feed(step.after);
   const after=text();expect(codePoints(after)).toBeLessThanOrEqual(16000);
   for(const e of payload(after).episodes)expect(closed(e),`${step.entry.id} after: completed episode ${String(e.result)}`).toBe(false);
   if(step.entry.role==="story")summary.push({id:step.entry.id,region:step.entry.region,whole_game:wholeGame,dedup,chars:codePoints(shown),episodes_kept:kept.length,episodes_left_out:memory.archive().length-kept.length,speakers:[...new Set(kept.flatMap(e=>e.pages.map(p=>p[0])))],active_hints:activeHints.map(h=>h.entry.id),text:shown});
  }
  const report=process.env.POKEBENCH_WHOLE_GAME_REPORT;
  if(report!==undefined)writeFileSync(`${report}-${wholeGame?"whole":"legacy"}-${dedup?"dedup":"split"}.json`,JSON.stringify(summary,null,2));
 });
});
