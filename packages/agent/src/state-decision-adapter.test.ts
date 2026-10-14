import {expect,it,vi} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {readDecisionSnapshot,decisionActions} from "./state-decision-adapter.js";
import type {StateAction} from "./state-decision.js";
const url="http://127.0.0.1:fixture";
function frame():string{const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.write("IHDR",12,"ascii");b.writeUInt32BE(240,16);b.writeUInt32BE(160,20);return b.toString("base64");}
function fixture(actionBody:unknown={status:"success"}){
 const calls:{path:string;init:RequestInit|undefined}[]=[];const order:string[]=[];
 const fetchFn=vi.fn<typeof fetch>((input,init)=>{const path=typeof input==="string"?input:input instanceof URL?input.href:input.url;calls.push({path,init});order.push(path.split("/").at(-1)??"");return Promise.resolve(new Response(JSON.stringify(path.endsWith("/pokebench/observation")?{state:IN_GAME,state_text:"CURRENT READOUT",screenshot_base64:frame()}:path.endsWith("/pokebench/state")?IN_GAME:path.endsWith("/queue_status")?{queue_empty:true}:actionBody),{status:200}));});
 const hooks={beforePress:vi.fn(),beforeWait:vi.fn((id:string,n:number)=>{order.push(`wait:${id}:${String(n)}`);}),afterPress:vi.fn(()=>{order.push("native-check");return Promise.resolve();})};
 const clock={now:()=>0,sleep:vi.fn((ms:number)=>{order.push(`settle:${String(ms)}`);return Promise.resolve();})};
 return {calls,order,fetchFn,hooks,clock};
}
it("uses the existing coherent validated observation owner",async()=>{
 const f=fixture();const s=await readDecisionSnapshot(url,f.fetchFn);expect(s.state).toEqual(IN_GAME);expect(s.content).toEqual([{type:"image",data:frame(),mimeType:"image/png"},{type:"text",text:"CURRENT READOUT"}]);expect(f.calls.map(x=>x.path)).toEqual([`${url}/pokebench/observation`]);
});
it("executes button presses through existing hooks and normal press timing",async()=>{
 const f=fixture();const result=await decisionActions(url,f.hooks,f.fetchFn,f.clock)("press-one",{kind:"press",buttons:["UP","A"]});
 expect(f.hooks.beforePress).toHaveBeenCalledTimes(1);expect(f.hooks.beforeWait).not.toHaveBeenCalled();expect(f.hooks.afterPress).toHaveBeenCalledTimes(1);
 const post=f.calls.find(x=>x.path.endsWith("/action"));expect(post?.init?.body).toBe(JSON.stringify({buttons:["UP","A"],hold_frames:10,release_frames:8}));expect(result.content).toContainEqual({type:"image",data:frame(),mimeType:"image/png"});
});
it("waits host milliseconds without enqueuing any vendor action",async()=>{
 const f=fixture();const result=await decisionActions(url,f.hooks,f.fetchFn,f.clock)("wait-one",{kind:"wait",duration_ms:60});
 expect(f.hooks.beforeWait).toHaveBeenCalledWith("wait-one",60);expect(f.hooks.beforePress).not.toHaveBeenCalled();expect(f.hooks.afterPress).toHaveBeenCalledTimes(1);
 expect(f.calls.map(x=>x.path)).toEqual([`${url}/pokebench/observation`]);
 expect(f.order).toEqual(["wait:wait-one:60","settle:60","native-check","observation"]);
 expect(f.clock.sleep).toHaveBeenCalledWith(60,undefined);
 expect(result.content).toContainEqual({type:"text",text:"waited 60 ms (host time)\n\nCURRENT READOUT"});
});
it.each([{kind:"wait",duration_ms:"60"},{kind:"wait",duration_ms:2001},{kind:"press",buttons:["WAIT"]},{kind:"wait",duration_ms:20,buttons:["A"]}])("rejects direct malformed adapter input %j",async input=>{
 const f=fixture();await expect(decisionActions(url,f.hooks,f.fetchFn,f.clock)("bad",input as StateAction)).rejects.toThrow("Invalid state action");expect(f.calls).toEqual([]);expect(f.hooks.beforeWait).not.toHaveBeenCalled();
});
it("aborted input never reaches the game or wait recording",async()=>{
 const f=fixture();const controller=new AbortController();controller.abort();await expect(decisionActions(url,f.hooks,f.fetchFn,f.clock)("aborted",{kind:"wait",duration_ms:10},controller.signal)).rejects.toThrow();expect(f.calls).toEqual([]);expect(f.hooks.beforeWait).not.toHaveBeenCalled();
});
it("timer failure never sends game input or claims wait completion",async()=>{
 const f=fixture();const clock={...f.clock,sleep:()=>Promise.reject(new Error("timer failed"))};
 await expect(decisionActions(url,f.hooks,f.fetchFn,clock)("rejected",{kind:"wait",duration_ms:10})).rejects.toThrow("timer failed");expect(f.hooks.afterPress).not.toHaveBeenCalled();expect(f.calls).toEqual([]);
});
it("rejects malformed coherent observations before they reach a decision",async()=>{
 const fetchFn:typeof fetch=()=>Promise.resolve(new Response(JSON.stringify({state:{...IN_GAME,position:{x:"7",y:2}},state_text:"wrong",screenshot_base64:frame()})));
 await expect(readDecisionSnapshot(url,fetchFn)).rejects.toThrow("malformed /pokebench/observation");
});
it("does not claim wait completion after an abort during settling",async()=>{
 const f=fixture();const controller=new AbortController();const clock={...f.clock,sleep:()=>{controller.abort();return Promise.resolve();}};
 await expect(decisionActions(url,f.hooks,f.fetchFn,clock)("interrupted",{kind:"wait",duration_ms:10},controller.signal)).rejects.toThrow();
 expect(f.hooks.afterPress).not.toHaveBeenCalled();expect(f.calls).toEqual([]);
});
it("the production timer aborts before any observation or game request",async()=>{
 const f=fixture();const controller=new AbortController();
 const pending=decisionActions(url,f.hooks,f.fetchFn)("cancelled",{kind:"wait",duration_ms:2000},controller.signal);
 controller.abort();await expect(pending).rejects.toThrow();expect(f.calls).toEqual([]);expect(f.hooks.afterPress).not.toHaveBeenCalled();
});
