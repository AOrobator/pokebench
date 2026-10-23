import {it,expect} from "vitest";
import {gzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent} from "./events.js";
import * as grading from "./roxanne-grading.js";
it("retains every native field when one navigation decision exceeds the grading bound",()=>{
 const events=Array.from({length:15},(_,i)=>checkEvent({v:1,run:"recorded",seq:i+1,t:"2026-10-23T13:00:00.000-04:00",turn:2,type:"state",...IN_GAME,map_grid:{objects:[],warps:[],width:120,height:100,elevation:3,rows:Array.from({length:100},(_,row)=>(row===i?"0001":"0000")+"0000".repeat(119))},position:{x:i,y:1}}));
 const body=gzipSync(JSON.stringify({messages:[{role:"system",content:"actual delivered context"}],tools:[]})),messages=[{role:"user" as const,content:"historical goal",timestamp:0},{role:"user" as const,content:"new decision result",timestamp:0}];
 expect(Buffer.byteLength(grading.gradingJson(events))).toBeGreaterThan(grading.MAX_GRADING_BYTES);
 const windows=grading.buildGradeWindows({receipts:[{index:1,turn:2,offset:1,sha256:createHash("sha256").update(body).digest("hex")}],read:()=>body,messages,events,historyMessages:1,reminder:null});
 expect(windows).toHaveLength(1);
 const packed=grading.packNativeEvents(events);expect(grading.unpackNativeEvents(packed)).toEqual(events);expect(Buffer.byteLength(grading.gradingJson(packed))).toBeLessThan(grading.MAX_GRADING_BYTES);expect(events[0]?.run).toBe("recorded");
});
it("rejects a corrupted native-event base, content hash and required-field deletion",()=>{
 const events=[1,2].map(seq=>checkEvent({v:1,run:"r",seq,t:"2026-10-23T13:00:00.000-04:00",turn:2,type:"state",...IN_GAME,map_grid:{objects:[],warps:[],width:120,height:100,elevation:3,rows:Array.from({length:100},()=>"0000".repeat(120))}}));
 const packed=grading.packNativeEvents(events),delta=packed[1];if(delta?.kind!=="delta")throw Error("fixture must exercise a native delta");
 expect(()=>grading.unpackNativeEvents([packed[0],{...delta,base:2}])).toThrow();expect(()=>grading.unpackNativeEvents([packed[0],{...delta,sha256:"0".repeat(64)}])).toThrow();expect(()=>grading.unpackNativeEvents([packed[0],{...delta,remove:[["run"]]}])).toThrow();
});

it("losslessly restores long Unicode text splices and rejects an invalid range",()=>{
 const before="Pokémon "+"🙂".repeat(300),events=[before,before.slice(0,200)+"new observation"+before.slice(210)].map((text,i)=>checkEvent({v:1,run:"r",seq:i+1,t:"2026-10-23T13:00:00.000-04:00",turn:2,type:"tool_result",id:"c",name:"observe",text,is_error:false,duration_ms:1,frames:[]}));
 const packed=grading.packNativeEvents(events),delta=packed[1];if(delta?.kind!=="delta"||delta.text.length===0)throw Error("fixture must exercise a text splice");expect(grading.unpackNativeEvents(packed)).toEqual(events);
 expect(()=>grading.unpackNativeEvents([packed[0],{...delta,text:delta.text.map(t=>({...t,prefix:1000000}))}])).toThrow(/range/);
});

it("keeps moving navigation windows bounded by reusing exact unchanged array entries",()=>{
 const events=Array.from({length:60},(_,i)=>checkEvent({v:1,run:"r",seq:i+1,t:"2026-10-23T13:00:00.000-04:00",turn:2,type:"state",...IN_GAME,navigation_grid:{elevation:3,objects:[],warps:[],tiles:Array.from({length:225},(_,j)=>({x:j%15+i,y:Math.floor(j/15),collision:0,behavior:0,elevation:3}))}}));
 const packed=grading.packNativeEvents(events);expect(grading.unpackNativeEvents(packed)).toEqual(events);expect(Buffer.byteLength(grading.gradingJson(packed))).toBeLessThan(250000);
 const body=gzipSync(JSON.stringify({messages:[{role:"system",content:"actual delivered context"}],tools:[]}));
 expect(grading.buildGradeWindows({receipts:[{index:1,turn:2,offset:0,sha256:createHash("sha256").update(body).digest("hex")}],read:()=>body,messages:[],events,historyMessages:0,reminder:null})).toHaveLength(1);
});

it("rejects malformed array copies without changing the original events",()=>{
 const events=[0,1].map((shift,i)=>checkEvent({v:1,run:"r",seq:i+1,t:"2026-10-23T13:00:00.000-04:00",turn:2,type:"state",...IN_GAME,navigation_grid:{elevation:3,objects:[],warps:[],tiles:Array.from({length:225-shift},(_,j)=>({x:j+shift,y:0,collision:0,behavior:0,elevation:3}))}}));
 const packed=grading.packNativeEvents(events),delta=packed[1];if(delta?.kind!=="delta"||delta.arrays.length===0)throw Error("array reuse required");expect(grading.unpackNativeEvents(packed)).toEqual(events);
 expect(()=>grading.unpackNativeEvents([packed[0],{...delta,arrays:[{path:["navigation_grid","tiles"],items:[225]}]}])).toThrow(/array index/);
 expect(()=>grading.unpackNativeEvents([packed[0],{...delta,arrays:[{path:["location"],items:[0]}]}])).toThrow(/array/);
 expect(()=>grading.unpackNativeEvents([packed[0],{...delta,arrays:[{path:["navigation_grid","tiles"],items:[-1]}]}])).toThrow();
 expect(events[0]?.run).toBe("r");
});
