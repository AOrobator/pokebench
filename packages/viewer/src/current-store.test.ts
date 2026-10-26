import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Log, START } from "../test-support/events.js";
import { emptyCurrent, foldCurrent } from "./current-state.js";
import { openCurrentStore } from "./current-store.js";
const roots:string[]=[];const opened:ReturnType<typeof openCurrentStore>[]=[];
afterEach(()=>{for(const s of opened.splice(0))s.close();for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true});});
function setup(){const dir=mkdtempSync(join(tmpdir(),"current-store-"));roots.push(dir);const db=join(dir,"current.sqlite");const s=openCurrentStore(db);opened.push(s);const l=new Log();const e=l.add(0,START);const state=foldCurrent(emptyCurrent(),e);return {db,s,state};}
const source={generation:"generation-1",identity:"1:2",offset:100,size:100,mtime:1,anchor:"anchor",evidence:""};
it("atomically persists state, consumed cursor and sparse history across restart",()=>{const {db,s,state}=setup();const saved=s.commit(state,source,[{seq:0,turn:0,offset:0,end:100}]);expect(saved.revision).toBe(1);s.close();const next=openCurrentStore(db);opened.push(next);expect(next.get(state.run)).toEqual(saved);expect(next.seek(state.run,source.generation,1)).toMatchObject({seq:0,offset:0});expect(next.revision()).toBe(1);});
it("rolls back all parts of a failed commit and rejects stale output",()=>{const {s,state}=setup();expect(()=>s.commit(state,source,[{seq:0,turn:0,offset:0,end:101}])).toThrow();expect(s.get(state.run)).toBeNull();expect(s.revision()).toBe(0);s.commit(state,source,[]);expect(()=>s.commit(state,{...source,offset:99},[])).toThrow();expect(s.revision()).toBe(1);});
it("allows independent read-only connections but excludes a second writer",()=>{const {db,s,state}=setup();s.commit(state,source,[]);expect(()=>openCurrentStore(db)).toThrow();const reader=openCurrentStore(db,{readOnly:true});opened.push(reader);expect(reader.get(state.run)?.state.turn).toBe(0);expect(()=>reader.commit(state,source,[])).toThrow();s.close();const replacement=openCurrentStore(db);opened.push(replacement);expect(replacement.get(state.run)).not.toBeNull();});
it("revisions support reset, tombstones and bounded journal retention",()=>{const {s,state}=setup();const epoch=s.epoch;for(let n=0;n<3;n++)s.commit(state,{...source,generation:String(n)},[],2);expect(s.changes(`${epoch}:0`)).toMatchObject({reset:true});expect(s.changes(`${epoch}:2`)).toMatchObject({reset:false,revision:3});expect(s.changes("foreign:2")).toMatchObject({reset:true});s.remove(state.run);expect(s.get(state.run)).toBeNull();expect(s.changes(`${epoch}:3`).runs).toEqual([{run:state.run,removed:true}]);});
it("refuses invalid cursors and source coordinates",()=>{const {s,state}=setup();for(const offset of [-1,101,NaN])expect(()=>s.commit(state,{...source,offset},[])).toThrow();expect(s.changes("bad")).toMatchObject({reset:true});expect(()=>s.seek("../bad",source.generation,1)).toThrow();});
