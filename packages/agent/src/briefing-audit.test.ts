import {describe,expect,it} from "vitest";
import {featuresOf,type FeatureSet} from "./features.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {checkEvent} from "./events.js";
import {IN_GAME} from "../test-support/events.js";

const ID="briefing-exits-v1";
// The stall or loop each recorded supervisor note briefed, read back from its own headline.
// The briefing at a recorded supervisor note, replayed with briefing-exits-v1 set as given.
const line=(text:string,head:string):string=>text.split("\n").find(l=>l.startsWith(head))??"";
const UNTRIED="- Listed here that you have not tried yet";

describe("briefing-exits-v1 audit fixes on recorded runs",()=>{

 describe("only evidence that the script ran counts (review round 9)",()=>{
  // A synthetic room: a live step trigger at (3,2) above the start tile (3,3), a person to the right at (4,3).
  const trigger={kind:"coordinate_trigger",x:3,y:2,elevation:0,activation:"step",availability:"conditional",facing:null,local_id:null,destination:null,name:null};
  const person={kind:"object",x:4,y:3,elevation:0,activation:"A",availability:"live",facing:null,local_id:7,destination:null,name:"MANIAC"};
  const base={...IN_GAME,started:true,screen:"overworld",location:"ROOM",map_id:[5,5],position:{x:3,y:3},facing:"up",field_controls_locked:false,interaction_targets:[trigger,person]};
  const live={objects:[],triggers:[{x:3,y:2,elevation:0,variable:16384,required_value:1,current_value:1,condition_met:true,script_pointer:136000000}],dialogue:null};
  const deadCtx={...live,triggers:[{x:3,y:2,elevation:0,variable:16384,required_value:1,current_value:0,condition_met:false,script_pointer:136000000}]};
  function run(steps:{buttons:string[];sent?:string[];states:Record<string,unknown>[];pages?:{at:[number,number];source:"faced_sprite"|null}[]}[],story:(i:number)=>string=()=>"a",world=live,from={x:3,y:3},features:FeatureSet=ON){
   const b=new SupervisorBriefing(features);let seq=0;
   const ev=(body:Record<string,unknown>)=>checkEvent({v:1,run:"r9",t:"2026-10-16T06:00:00.000-04:00",turn:seq,seq:++seq,...body});
   let where=from;
   const state=(extra:Record<string,unknown>)=>{const e=ev({type:"state",...base,position:where,world_context:world,...extra});if(e.type==="state"&&"started"in e&&e.position!==null)where=e.position;b.observe(e);return e.seq;};
   const first=state({});b.observe(ev({type:"tool_result",id:"c0",name:"observe",is_error:false,duration_ms:1,text:"Story: a",frames:[],state_seq:first}));
   steps.forEach((s,i)=>{
    b.observe(ev({type:"tool_call",id:`c${String(i+1)}`,name:"press",args:{buttons:s.buttons}}));
    const pre=state({});
    b.observe(ev({type:"button_press",tool_call_id:`c${String(i+1)}`,buttons:[s.buttons[0]],before_state_seq:pre}));
    let last=pre;
    const pageStates:number[]=[];
    for(const extra of s.states){last=state(extra);pageStates.push(last);}
    if(s.pages!==undefined)b.observe(ev({type:"dialogue_auto_advance",tool_call_id:`c${String(i+1)}`,tool:"press",requested:s.buttons,sent:s.sent??s.buttons,dropped:s.buttons.slice((s.sent??s.buttons).length),auto_presses:1,pages:s.pages.map((p,j)=>({state_seq:pageStates[j]??last,map:"ROOM",map_id:[5,5],position:{x:p.at[0],y:p.at[1]},speaker:p.source===null?null:"MANIAC",speaker_source:p.source,text:`page ${String(j)}`})),stop:"field_free",detail:"closed",duration_ms:1}));
    b.observe(ev({type:"tool_result",id:`c${String(i+1)}`,name:"press",is_error:false,duration_ms:1,text:`Story: ${story(i+1)}`,frames:[],state_seq:last}));
   });
   return line(b.text("cycle",9),UNTRIED);
  }
  const ON:FeatureSet={...featuresOf(["world-targets-v1","named-interactions-v1","live-player-position-v1","active-field-message-buffer-v1","bounded-navigation-v1"]),[ID]:true};
  it("a push-back with direction-only buttons, a script and the player back on the start tile counts",()=>{
   expect(run([{buttons:["UP"],states:[{field_controls_locked:true,facing:"down"}]}])).not.toContain("coordinate_trigger");
  });
  it("A then a dropped UP (the A opened a conversation) does not try the trigger above (Codex)",()=>{
   expect(run([{buttons:["A","UP"],sent:["A"],states:[{field_controls_locked:true}],pages:[{at:[3,3],source:null}]}])).toContain("coordinate_trigger at 3,2 (step)");
  });
  it("UP then A with dialogue is not a push-back: the dialogue may be the A (Grok)",()=>{
   expect(run([{buttons:["UP","A"],states:[{field_controls_locked:true}],pages:[{at:[3,3],source:null}]}])).toContain("coordinate_trigger at 3,2 (step)");
  });
  it("a dialogue page shown while standing on a trigger tile does not try it (Claude, Grok)",()=>{
   // The player arrived on (3,2) (a door mat, say) and stands there while a page shows.
   expect(run([{buttons:["B"],states:[{}],pages:[{at:[3,2],source:null}]}],undefined,live,{x:3,y:2})).toContain("coordinate_trigger at 3,2 (step)");
  });
  it("a page from a sign or script while facing a person does not count as talking to them; A or a faced-sprite page does (Grok)",()=>{
   expect(run([{buttons:["DOWN"],states:[{facing:"right"}],pages:[{at:[3,3],source:null}]}])).toContain("MANIAC at 4,3 (A)");
   expect(run([{buttons:["DOWN"],states:[{facing:"right"}],pages:[{at:[3,3],source:"faced_sprite"}]}])).not.toContain("MANIAC");
  });
  it("a trigger crossed while unmet is listed, unlabelled, once a story step enables it (Codex round 10)",()=>{
   const listed=run([{buttons:["UP"],states:[{position:{x:3,y:2}}]},{buttons:["DOWN"],states:[{position:{x:3,y:3},world_context:live}]}],i=>i>=2?"b":"a",deadCtx);
   expect(listed).toContain("coordinate_trigger at 3,2 (step)");
   expect(listed).not.toContain("did not match");
  });
  it("a one-shot script that flips its own condition by the arrival state was still tried (Claude round 10)",()=>{
   // Met before the step; the arrival state already shows it unmet (the script set its variable).
   const listed=run([{buttons:["UP"],states:[{position:{x:3,y:2},world_context:deadCtx}]}]);
   expect(listed).not.toContain("coordinate_trigger at 3,2");
  });
  it("a trigger walked onto while its condition was shown unmet stays listed, labelled, also after a story step (Claude)",()=>{
   const listed=run([{buttons:["UP"],states:[{position:{x:3,y:2}}]},{buttons:["DOWN"],states:[{position:{x:3,y:3}}]}],i=>i>=2?"b":"a",deadCtx);
   expect(listed).toContain("coordinate_trigger at 3,2 (step; its condition did not match when the readout last showed it, so stepping on it then did nothing)");
  });
 });
});
