import type {AgentMessage} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {RunRecorder} from "./recorder.js";

type State=Extract<RunEvent,{type:"state";started:boolean}>;
type Advance=Extract<RunEvent,{type:"dialogue_auto_advance"}>;
type Transform=(messages:AgentMessage[])=>Promise<AgentMessage[]>;
type Question={run:string;map:readonly number[];text:string;dialog:string;evidence:number[]};
const HEADER="CURRENT QUESTION";
const DECISION_CHECK="Decision check: Interpret YES and NO against the CURRENT QUESTION separately. Compare those two meanings with your current intention, then choose the corresponding displayed input. Distinguish what the question actually asks from what an earlier page asked. If the game's later consequence is unknown, do not invent it to justify the answer.";
const normalized=(s:string)=>s.replace(/\s+/g," ").trim();
const sameMap=(a:readonly number[]|null,b:readonly number[]|null)=>a!==null&&b!==null&&a.length===2&&a.every((v,i)=>v===b[i]);
function ready(s:State|null):{selected:"YES"|"NO";controls:string}|null {
 const ui=s?.active_ui;
 if(s===null||!s.started||s.screen!=="overworld"||s.in_battle||s.blackout_active===true||ui==null||ui.phase!=="field_yes_no"||ui.ready!==true||ui.diagnostic!==null||ui.controls.trim()===""||(ui.selected!=="YES"&&ui.selected!=="NO"))return null;
 return {selected:ui.selected,controls:ui.controls};
}
function readout(text:string,ui:{selected:"YES"|"NO";controls:string}):{dialog:string;interface:string;answer:string|null}|null {
 // A ready field menu can leave the aggregate Dialog buffer holding multiple pages. The page owner,
 // not punctuation or an inferred goal, identifies its final whole page (DewfordTown_Text_SetSailBackToPetalburg).
 if((text.match(/^Screen: /gm)?.length??0)!==1||!text.includes("\nScreen: overworld")&&!text.startsWith("Screen: overworld"))return null;
 const body=text.slice(text.search(/^Screen: /m));
 const dialogs=[...body.matchAll(/^Dialog: "(.*)"$/gm)],interfaces=[...body.matchAll(/^Interface: (.*)$/gm)];
 if(dialogs.length!==1||interfaces.length!==1)return null;
 const line=interfaces[0]?.[0],dialog=dialogs[0]?.[1];
 if(line===undefined||dialog===undefined||!line.startsWith(`Interface: field_yes_no; input ready; selected ${ui.selected};`)||!line.includes(`; ${ui.controls}`)||body.includes("STATE COVERAGE ERROR:"))return null;
 const answers=body.match(/^(?:To answer |YES\/NO controls: ).*$/gm)??[];
 if(answers.length>1)return null;
 const answer=answers[0]??null;
 if(answer!==null&&(answer.startsWith("YES/NO controls: ")?!answer.startsWith(`YES/NO controls: selected ${ui.selected};`):!answer.includes(`Pressing A now answers ${ui.selected}.`)))return null;
 return {dialog,interface:line,answer};
}

export function currentQuestionFocus(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe"|"recordLedgerContext">,base:Transform):Transform {
 if(!features["current-question-focus-v1"]||!features["dialogue-auto-advance-v1"])return base;
 let latest:State|null=null,pending:Advance|null=null,question:Question|null=null;
 let due:{id:string;tool:string;seq:number;text:string;visible:string[];evidence:number[];recorded:boolean}|null=null;
 recorder.subscribe(e=>{
  if(e.type==="state"){
   due=null;latest="started" in e?e:null;
   if(ready(latest)===null||latest===null||question!==null&&(question.run!==latest.run||!sameMap(question.map,latest.map_id)))question=null;
  }
  if(e.type==="dialogue_auto_advance"){pending=e.stop==="menu"?e:null;if(e.stop!=="menu")question=null;}
  if(e.type==="assistant"||e.type==="tool_call")due=null;
  if(e.type==="tool_result"){
   due=null;const advance=pending?.tool_call_id===e.id?pending:null;pending=null;
   const ui=ready(latest);
   if(e.is_error||latest===null||ui===null||e.run!==latest.run||e.state_seq!==latest.seq){question=null;return;}
   const current=readout(e.text,ui);
   if(current===null){question=null;return;}
   if(advance!==null&&advance.pages.length>0){
    const page=advance.pages.at(-1);
    question=page!==undefined&&advance.run===e.run&&page.state_seq!==null&&page.state_seq<=latest.seq&&sameMap(page.map_id,latest.map_id)&&normalized(current.dialog).endsWith(normalized(page.text))?{run:e.run,map:[...(latest.map_id??[])],text:page.text,dialog:current.dialog,evidence:[advance.seq,page.state_seq,e.seq]}:null;
   }
   if(question===null||question.run!==e.run||!sameMap(question.map,latest.map_id)||question.dialog!==current.dialog){question=null;return;}
   due={id:e.id,tool:e.name,seq:e.seq,text:[HEADER,question.text,current.interface,...(current.answer===null?[]:[current.answer])].join("\n")+"\n\n"+DECISION_CHECK,visible:[`Dialog: "${current.dialog}"`,current.interface,...(current.answer===null?[]:[current.answer])],evidence:[...new Set([...question.evidence,e.seq,latest.seq])],recorded:false};
  }
  if(e.type==="ledger_context"&&e.text.startsWith(`${HEADER}\n`)&&due!==null&&e.evidence.includes(due.seq))due.recorded=true;
 },true);
 return async messages=>{
  const out=await base(messages);
  let last:AgentMessage|undefined;
  for(const m of [...messages].reverse()){if(m.role==="assistant")break;if(m.role==="toolResult"){last=m;break;}}
  if(due===null||last?.role!=="toolResult"||last.isError||last.toolCallId!==due.id||last.toolName!==due.tool)return out;
  const delivered=last.content.filter(p=>p.type==="text").map(p=>p.text).join("\n");
  if(!due.visible.every(line=>delivered.includes(line)))return out;
  if(!due.recorded){due.recorded=true;recorder.recordLedgerContext({text:due.text,evidence:due.evidence});}
  return [...out,{role:"user",content:due.text,timestamp:Date.now()}];
 };
}
