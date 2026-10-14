import { expect, it } from "vitest";
import { LoopDetector, LOOP_POLICY } from "./loop-detection.js";
import { IN_GAME } from "../test-support/events.js";
import type { GameStateSnapshot } from "./game-state.js";

const dialogue = (offset = 30): GameStateSnapshot => ({ ...IN_GAME, screen: "overworld", started:true, map_id:[25,40], position:{x:2,y:2}, facing:"DOWN", field_controls_locked:true, active_ui:null, world_context:{objects:[],triggers:[],dialogue:"Box description", message:{phase:"page_wait", cursor:offset, ready:true}} });
it("warns on repeated full A batches in a qualified locked dialogue and gives a different-input recovery instruction", () => {
 const notices:{phase:string,message:string}[]=[];
 const d=new LoopDetector(n=>notices.push(n), {...LOOP_POLICY,ineffective:2}, "enforced", true);
 const state=dialogue();
 for(let i=0;i<2;i++)d.complete({name:"press",args:{buttons:Array(8).fill("A")},isError:false,text:"ok",beforeState:state,state,seq:i});
 expect(notices).toHaveLength(1);expect(notices[0]?.phase).toBe("warning");expect(notices[0]?.message).toMatch(/single input/);expect(notices[0]?.message).not.toMatch(/right|truck/i);
});
it("does not label advancing pages, printing, unknown owners or a non-dialogue locked cutscene as an ineffective interaction",()=>{
 for(const state of [dialogue(),{...dialogue(),world_context:{objects:[],triggers:[],dialogue:"Box description",message:{phase:"printing" as const,cursor:30,ready:false}}},{...dialogue(),world_context:undefined}]){
  const notices:unknown[]=[];const d=new LoopDetector(n=>notices.push(n),{...LOOP_POLICY,ineffective:2},"enforced",true);
  for(let i=0;i<4;i++)d.complete({name:"press",args:{buttons:["A","A"]},isError:false,text:"ok",beforeState:state,state:state.world_context?.message?.ready?dialogue(40+i):state});
  expect(notices).toEqual([]);
 }
});
it("preserves the incumbent multi-button/locked-field behavior when the new detector is off",()=>{
 const notices:unknown[]=[];const d=new LoopDetector(n=>notices.push(n));const state=dialogue();
 for(let i=0;i<4;i++)d.complete({name:"press",args:{buttons:["A","A"]},isError:false,text:"ok",beforeState:state,state});
 expect(notices).toEqual([]);
});
