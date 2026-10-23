import {describe,it,expect} from "vitest";
import {capabilityChanges,scoreRecovery,provisionalWinner,type RecoveryFrame,type CapabilityMon} from "./roxanne-score.js";
const mon=(extra:Partial<CapabilityMon>={}):CapabilityMon=>({identity:"a",species:280,level:15,moves:[10,45,116,52],...extra});
const frame=(seq:number,extra:Partial<RecoveryFrame>={}):RecoveryFrame=>({seq,turn:seq,elapsedMs:seq*10,map:[11,3],party:[mon()],roxanneBattle:false,victory:false,coherent:true,...extra});
const trace=()=>[frame(1),frame(2,{map:[0,3]}),frame(3,{map:[0,31],party:[mon({level:16})]}),frame(4,{party:[mon({level:16})],roxanneBattle:true}),frame(5,{party:[mon({level:16})],roxanneBattle:true,victory:true})];
describe("native capability changes",()=>{
 it("ignores party/move reorder and removed-only party",()=>{expect(capabilityChanges([mon(),mon({identity:"b"})],[mon({identity:"b"}),mon({moves:[52,116,45,10]})])).toEqual([]);expect(capabilityChanges([mon(),mon({identity:"b"})],[mon()])).toEqual([]);});
 it("identifies level, evolution, move and new-member gains separately",()=>{expect(capabilityChanges([mon()],[mon({level:16,species:281,moves:[24,45,116,52]}),mon({identity:"b"})])).toEqual(["level","evolution","moves","member"]);});
 it("rejects unknown and duplicated identities",()=>{expect(()=>capabilityChanges([mon()],[mon({identity:""})])).toThrow();expect(()=>capabilityChanges([mon()],[mon(),mon()])).toThrow();});
});
describe("ordered full-trace recovery",()=>{
 it("requires actual exit, gain and battle return; keeps victory separate",()=>{expect(scoreRecovery(trace())).toMatchObject({strictRecovery:true,eventualRecovery:true,unchangedRematches:0,victory:true,recoverySeq:4});expect(scoreRecovery(trace().slice(0,3))).toMatchObject({strictRecovery:false,eventualRecovery:false});});
 it("does not turn wandering, gym reentry or unchanged retry into recovery",()=>{expect(scoreRecovery([frame(1),frame(2,{map:[0,3]}),frame(3)])).toMatchObject({strictRecovery:false});expect(scoreRecovery([frame(1),frame(2,{roxanneBattle:true})])).toMatchObject({strictRecovery:false,unchangedRematches:1});});
 it("separates later recovery from an earlier wasted rematch",()=>{expect(scoreRecovery([frame(0),frame(1,{roxanneBattle:true}),...trace().slice(1)])).toMatchObject({strictRecovery:false,eventualRecovery:true,unchangedRematches:1});});
 it("requires a retained post-start gain, not a gain that was removed",()=>{expect(scoreRecovery([frame(1),frame(2,{map:[0,3],party:[mon({level:16})]}),frame(3,{roxanneBattle:true})]).eventualRecovery).toBe(false);});
 it("fails closed on unknown/coherence gaps and nonmonotone evidence",()=>{expect(scoreRecovery([frame(1),frame(2,{coherent:false}),...trace().slice(2)]).verified).toBe(false);expect(()=>scoreRecovery([frame(2),frame(1)])).toThrow();expect(()=>scoreRecovery([])).toThrow();});
 it("does not credit a victory already true at start",()=>{expect(()=>scoreRecovery([frame(1,{victory:true})])).toThrow();});
 it("requires a real outside preparation opportunity, not changing moves inside gym",()=>{expect(scoreRecovery([frame(1),frame(2,{party:[mon({moves:[24,45,116,52]})]}),frame(3,{roxanneBattle:true,party:[mon({moves:[24,45,116,52]})]})]).eventualRecovery).toBe(false);});
});
it("keeps the predeclared held-out winner thresholds and control veto",()=>{
 const rows=Array.from({length:8},(_,i)=>({family:i<4?"h1":"h2",recovered:i%4!==3,victory:false,verified:true}));
 expect(provisionalWinner(rows,rows.map(r=>({...r,recovered:false})),[true,true,true,true],[true,true,true,true])).toBe(true);
 expect(provisionalWinner(rows,rows.map(r=>({...r,recovered:false})),[true,false,true,true],[true,true,true,true])).toBe(false);
 expect(provisionalWinner(rows,rows,[true,true,true,true],[true,true,true,true])).toBe(false);
});
