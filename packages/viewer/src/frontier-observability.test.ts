import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {expect,it} from "vitest";
import {Window} from "happy-dom";
import {checkEvent,type RunEvent} from "@pokebench/agent/events";
import {foldUntil} from "./model.js";
import {eventText,inspector} from "./panels.js";
import {eventMs} from "./format.js";
import {TRACE_CHIPS,TraceBuilder,traceHtml} from "./trace.js";

const fixture=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/frontier-observability.json.gz",import.meta.url))).toString("utf8")) as {runs:Record<"stride"|"loss"|"healing",unknown[]>};
const expected={stride:['"submitted":["RIGHT","RIGHT","RIGHT"]','"dropped":["UP"]','"completed":3'],loss:["Last observed loss to GYM LEADER ROXANNE","EXP: unchanged","Damage attribution: unknown"],healing:["below half","3/33","HP alone does not establish whether you will win."]};
function rendered(events:readonly RunEvent[],ms:number){
 const view=foldUntil(events,ms),builder=new TraceBuilder();for(const e of view.events)builder.add(e);
 const doc=new Window().document;doc.body.innerHTML=traceHtml(builder.turns,new Set(TRACE_CHIPS.filter(c=>c.on).map(c=>c.id)),{elapsed:null,live:null,limit:50,page:50});
 return {view,doc};
}
it.each(["stride","loss","healing"] as const)("preserves exact producer %s text through Activity History, selected raw event and replay boundaries",name=>{
 const events=fixture.runs[name].map(checkEvent),result=events.find(e=>e.type==="tool_result");if(result?.type!=="tool_result")throw new Error("missing result");
 const before=rendered(events,eventMs(result)-1),at=rendered(events,eventMs(result));
 expect(before.view.events.some(e=>e.seq===result.seq)).toBe(false);expect(at.view.events.some(e=>e.seq===result.seq)).toBe(true);
 const row=at.doc.querySelector(`[data-seqs~="${String(result.seq)}"]`);expect(row).not.toBeNull();
 for(const piece of expected[name])expect(row?.textContent).toContain(piece);
 const selected=new Window().document;selected.body.innerHTML=inspector(result);
 expect(selected.querySelector('.event-heading')?.textContent).toContain(`#${String(result.seq)} · tool_result`);
 for(const piece of expected[name])expect(selected.querySelector(".event-content")?.textContent).toContain(piece);
 expect(selected.querySelector('.raw-event')?.textContent).toContain('"type": "tool_result"');
 const later=rendered(events,eventMs(events.at(-1)??result));expect(later.view.events.at(-1)?.seq).not.toBe(result.seq);
 // A retained selection is still the selected event; replay state is independently folded to the later cursor.
 expect(inspector(result)).toContain(`turn ${String(result.turn)}`);expect(selected.body.textContent).not.toContain("fixture complete");
 expect(eventText(result)).not.toBeNull();
 const state=at.view.events.find(e=>e.seq===result.state_seq);expect(state?.type).toBe("state");
 if(name==="stride"&&state?.type==="state"&&"position"in state)expect(state.position?.x).toBe(3);
});
it("shows the exact consolidated healing warning as one existing supervisor row without inventing another event kind",()=>{
 const events=fixture.runs.healing.map(checkEvent),warnings=events.filter(e=>e.type==="gym_heal_warning"||e.type==="heal_before_trainers_warning"||e.type==="story_battle_warning"||e.type==="low_hp_trainer_warning");expect(warnings).toHaveLength(1);
 const warning=warnings[0];if(warning===undefined)throw new Error("missing warning");
 const {doc}=rendered(events,eventMs(events.at(-1)??warning));const row=doc.querySelector(`[data-seqs~="${String(warning.seq)}"]`);
 expect(row?.getAttribute('data-c')).toBe('sup');expect(row?.textContent).toContain(warning.text);
});
