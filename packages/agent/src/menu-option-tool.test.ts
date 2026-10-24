import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {expect,it} from "vitest";
import {checkEvent,type Button} from "./events.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {menuOptionTool,menuOptionView} from "./menu-option-tool.js";
const fixture=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/pokenav-instruction-goals.json.gz",import.meta.url))).toString()) as {events:unknown[]};
const event=fixture.events.map(checkEvent).find(e=>e.seq===39512)!;
const {v: _v,run: _run,seq: _seq,t: _t,type: _type,turn: _turn,...body}=event;
const state=parseGameState(body);
function at(index:number):GameStateSnapshot {const options=state.active_ui?.details?.["options"] as string[];return {...state,active_ui:{...state.active_ui!,selected:options[index]!,details:{...state.active_ui!.details,selected_index:index}}};}
const result=(s:GameStateSnapshot)=>({content:[{type:"text" as const,text:"current observation"}],details:{state:s}});
it("selects the recorded POKéNAV from BAG with DOWN,A, stopping after the single confirmation",async()=>{
 let s=at(2);const buttons:Button[]=[];
 const tool=menuOptionTool({observe:async()=>result(s),press:async(_id,b,check)=>{check(s);buttons.push(b);s=b==="A"?{...s,active_ui:null}:at(3);return result(s);}});
 const r=await tool.execute("pick",{phase:"field_multichoice",menu_id:86,option:"POKéNAV"});
 expect(buttons).toEqual(["DOWN","A"]);expect(JSON.stringify(r)).toContain('"confirmation_sent":true');expect(JSON.stringify(r)).not.toContain('"completed":true');
});
it("requires matching current menu, visible unique option and ready cursor",async()=>{
 for(const s of [at(2),{...at(2),active_ui:{...at(2).active_ui!,ready:false}},{...at(2),active_ui:null}]){
  const buttons:Button[]=[];const tool=menuOptionTool({observe:async()=>result(s),press:async(_id,b)=>{buttons.push(b);return result(s);}});
  await tool.execute("pick",{phase:"start_menu",menu_id:null,option:"POKéNAV"});expect(buttons).toEqual([]);
 }
 expect(menuOptionView({...at(2),active_ui:{...at(2).active_ui!,phase:"field_multichoice_grid"}})).toBeNull();
});
it("stops on a changed owner at the checked input seam without sending A",async()=>{
 const buttons:Button[]=[];const tool=menuOptionTool({observe:async()=>result(at(2)),press:async(_id,b,check)=>{check({...at(2),active_ui:null});buttons.push(b);return result(at(3));}});
 const r=await tool.execute("pick",{phase:"field_multichoice",menu_id:86,option:"POKéNAV"});expect(buttons).toEqual([]);expect(JSON.stringify(r)).toContain("changed");
});
