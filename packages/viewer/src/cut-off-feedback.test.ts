import {expect,it} from "vitest";
import {Window} from "happy-dom";
import {Log,START} from "../test-support/events.js";
import {eventText,inspector} from "./panels.js";
import {foldUntil} from "./model.js";

it.each([4096,8192])("preserves the %s-token cut-off cause in history, raw inspection and replay",cap=>{
 const text=`Your last reply reached the output limit (${String(cap)} tokens) before it made a tool call, so nothing happened in the game. Make one tool call now.`;
 const log=new Log();log.add(0,START);
 const supervisor=log.add(10,{type:"text_only_supervisor",turn:1,replies:1,note:1,limit:3,text:`${text}\nSUPERVISOR: Get your bearings.`});
 const breaker=log.add(20,{type:"loop_breaker",turn:2,stage:2,trigger:"no_tool_call",repeats:1,collapsed:0,text});
 const replay=foldUntil(log.events,20);
 for(const event of [supervisor,breaker]){
  expect(replay.events).toContainEqual(event);
  const doc=new Window().document;doc.body.innerHTML=`<div id="history">${eventText(event)}</div>${inspector(event)}`;
  expect(doc.querySelector("#history")?.textContent).toContain(text);
  expect(doc.querySelector(".raw-event pre")?.textContent).toBe(JSON.stringify(event,null,2));
 }
 expect(foldUntil(log.events,9).events).not.toContainEqual(supervisor);
});
