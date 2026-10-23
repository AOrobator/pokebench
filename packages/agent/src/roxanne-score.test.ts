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

it("does not count a level earned inside the losing gym battle as outside preparation",()=>{const frames=[frame(1),frame(2,{roxanneBattle:true}),frame(3,{roxanneBattle:true,party:[mon({level:16})]}),frame(4,{map:[0,3],party:[mon({level:16})]}),frame(5,{party:[mon({level:16})],roxanneBattle:true})];expect(scoreRecovery(frames).eventualRecovery).toBe(false);});

it("censors recovery and victory outside the equal declared episode caps",()=>{const fs=trace().map(f=>({...f,elapsedMs:f.seq>=4?1_800_001:f.elapsedMs}));expect(scoreRecovery(fs)).toMatchObject({eventualRecovery:false,victory:false});expect(scoreRecovery(trace(),{turns:3,ms:1_800_000}).eventualRecovery).toBe(false);expect(scoreRecovery(trace(),{turns:5,ms:50}).victory).toBe(true);});
it("reports native ea04 victory but vetoes recovery qualification across its archived evidence gaps",async()=>{
 const {readFileSync}=await import("node:fs");const {gunzipSync}=await import("node:zlib");const {checkEvent}=await import("./events.js");const {recoveryFrames}=await import("./roxanne-score.js");
 const json:unknown=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/roxanne-ea04-recovery.json.gz",import.meta.url))).toString());if(!Array.isArray(json))throw new Error("invalid recording fixture");
 const events=json.map(checkEvent),frames=recoveryFrames(events,17303);
 expect(scoreRecovery(frames,{turns:1000,ms:4_000_000})).toMatchObject({verified:false,strictRecovery:false,eventualRecovery:false,unchangedRematches:1,recoverySeq:22229,victory:true});
 expect(scoreRecovery(frames)).toMatchObject({strictRecovery:false,victory:false});
});
it("retains native victory even when preparation evidence is unavailable",()=>{expect(scoreRecovery([frame(1),frame(2,{coherent:false}),frame(3,{victory:true})])).toMatchObject({verified:false,eventualRecovery:false,victory:true});});
it("requires an acquired nonzero move, not deletion alone",()=>{
 expect(capabilityChanges([mon()],[mon({moves:[0,45,116,52]})])).toEqual([]);
 expect(scoreRecovery([frame(1),frame(2,{map:[0,3],party:[mon({moves:[0,45,116,52]})]}),frame(3,{roxanneBattle:true,party:[mon({moves:[0,45,116,52]})]})])).toMatchObject({strictRecovery:false,eventualRecovery:false,changes:[]});
});
it("ties outside preparation to the particular capability retained at rematch",()=>{
 const a=mon(),b=mon({identity:"b"}),inside=mon({moves:[24,45,116,52]});
 const fs=[frame(1),frame(2,{map:[0,3],party:[a,b]}),frame(3,{map:[0,3],party:[a]}),frame(4,{party:[inside]}),frame(5,{party:[inside],roxanneBattle:true})];
 expect(scoreRecovery(fs)).toMatchObject({verified:true,strictRecovery:false,eventualRecovery:false});
 // Changing A outside does count even if B was removed, and level gains survive further levels.
 expect(scoreRecovery([...fs.slice(0,3),frame(4,{map:[0,3],party:[inside]}),frame(5,{party:[inside],roxanneBattle:true})])).toMatchObject({strictRecovery:true,changes:["moves"]});
 expect(scoreRecovery([frame(1),frame(2,{map:[0,3],party:[mon({level:16})]}),frame(3,{party:[mon({level:17})],roxanneBattle:true})])).toMatchObject({strictRecovery:true});
 // An unrelated inside level gain cannot borrow another member's discarded outside level gain.
 expect(scoreRecovery([frame(1,{party:[a,b]}),frame(2,{map:[0,3],party:[a,mon({identity:"b",level:16})]}),frame(3,{map:[0,3],party:[a]}),frame(4,{party:[mon({level:16})],roxanneBattle:true})])).toMatchObject({strictRecovery:false});
});

it("does not relabel an inside level gain as outside preparation when a different member is acquired",()=>{
 const leveled=mon({level:16}),b=mon({identity:"b"});
 expect(scoreRecovery([frame(1),frame(2,{party:[leveled],roxanneBattle:true}),frame(3,{map:[0,3],party:[leveled]}),frame(4,{map:[0,3],party:[leveled,b]}),frame(5,{map:[0,3],party:[leveled]}),frame(6,{party:[leveled],roxanneBattle:true})])).toMatchObject({verified:true,eventualRecovery:false});
});

it.each([
 ["member",[mon(),mon({identity:"b"})]],
 ["level",[mon({level:16})]],
 ["evolution",[mon({species:281})]],
 ["moves",[mon({moves:[24,45,116,52]})]],
] as const)("requires the acquired outside %s capability at rematch",(kind,party)=>{
 const outside=frame(2,{map:[0,3],party}),retained=frame(3,{party,roxanneBattle:true});
 expect(scoreRecovery([frame(1),outside,retained])).toMatchObject({strictRecovery:true,changes:[kind]});
 // A distinct gym-only move cannot borrow the discarded outside gain.
 const inside=kind==="moves"?mon({level:16}):mon({moves:[24,45,116,52]});
 expect(scoreRecovery([frame(1),outside,frame(3,{map:[0,3]}),frame(4,{party:[inside],roxanneBattle:true})])).toMatchObject({strictRecovery:false,eventualRecovery:false});
 if(kind==="evolution")expect(scoreRecovery([frame(1),frame(2,{map:[0,3]}),frame(3,{party,roxanneBattle:true})])).toMatchObject({strictRecovery:false});
});
it("retains an observed native victory on the incoherent frame itself",()=>{
 expect(scoreRecovery([frame(1),frame(2,{coherent:false,victory:true})])).toMatchObject({verified:false,strictRecovery:false,eventualRecovery:false,victory:true});
});
it("verified transition nonsamples preserve acquisition provenance and never create capabilities",()=>{
 const transition=frame(2,{transition:true,party:[],map:[]});
 expect(scoreRecovery([frame(1),transition,frame(3,{map:[0,31],party:[mon({level:16})]}),frame(4,{roxanneBattle:true,party:[mon({level:16})]})])).toMatchObject({verified:true,strictRecovery:true});
 expect(scoreRecovery([frame(1),transition,frame(3,{roxanneBattle:true})])).toMatchObject({verified:true,strictRecovery:false,unchangedRematches:1});
 expect(scoreRecovery([frame(1),{...transition,coherent:false},...trace().slice(2)]).verified).toBe(false);
 const battleGain=[frame(0),frame(1,{roxanneBattle:true}),transition,frame(3,{map:[0,31],party:[mon({level:16})]}),frame(4,{roxanneBattle:true,party:[mon({level:16})]})];
 expect(scoreRecovery(battleGain).strictRecovery).toBe(false);
});
