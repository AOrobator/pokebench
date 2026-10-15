import {expect,it} from "vitest";
import {DialogueLog,dialogueLog} from "./dialogue-log.js";
import {ALL_ON,featureInfo} from "./features.js";
import {playSystemPrompt,playTools} from "./play-config.js";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";

const event=(body:Record<string,unknown>,seq:number,turn=1):RunEvent=>checkEvent({v:1,run:"dialogue-test",t:"2026-10-14T12:00:00.000-04:00",turn,seq,...body});
const MOM={name:"MOM",kind:"object",x:4,y:4,elevation:0,activation:"press_a",availability:"live",facing:null,local_id:1,destination:null};
const state=(seq:number,extra:Record<string,unknown>={},turn=1)=>event({type:"state",...IN_GAME,started:true,screen:"overworld",location:"HOUSE 1F",map_id:[1,0],position:{x:3,y:4},facing:"right",field_controls_locked:true,interaction_targets:[MOM],world_context:{objects:[],triggers:[],dialogue:"Go see the neighbors."},...extra},seq,turn);
const result=(seq:number,stateSeq:number,turn=1)=>event({type:"tool_result",id:`t${String(seq)}`,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:stateSeq},seq,turn);
const deliver=(log:DialogueLog,seq:number,extra:Record<string,unknown>={},turn=1)=>{log.observe(state(seq,extra,turn));log.observe(result(seq+1,seq,turn));};
const recall=async(log:DialogueLog,args:Record<string,unknown>)=>{
 const out=await log.tool().execute("r",args);const first=out.content[0];
 if(first?.type!=="text")throw Error("expected text");return first.text;
};

it("records each delivered dialogue page once, with turn, room, position and the faced character",async()=>{
 const log=new DialogueLog(ALL_ON);
 deliver(log,1,{},3);deliver(log,3,{},4);
 deliver(log,5,{world_context:{objects:[],triggers:[],dialogue:"The professor is out."},location:"LAB",map_id:[1,4],interaction_targets:[]},9);
 expect(log.entries()).toHaveLength(2);
 const text=await recall(log,{});
 expect(text).toContain("Go see the neighbors.");
 expect(text).toContain("turn 3");expect(text).toContain("HOUSE 1F");expect(text).toContain("at 3,4");
 expect(text).toContain("facing MOM at 4,4");
 expect(text.indexOf("The professor is out.")).toBeLessThan(text.indexOf("Go see the neighbors."));
});

it("ignores samples the model never received, empty dialogue, menus and unstarted games",()=>{
 const log=new DialogueLog(ALL_ON);
 log.observe(state(1));
 log.observe(result(2,99));
 deliver(log,3,{world_context:{objects:[],triggers:[],dialogue:""}});
 deliver(log,5,{world_context:null});
 deliver(log,7,{started:false});
 expect(log.entries()).toHaveLength(0);
});

it("records the same words again after other dialogue, so repeats are visible",()=>{
 const log=new DialogueLog(ALL_ON);
 deliver(log,1);deliver(log,3,{world_context:{objects:[],triggers:[],dialogue:"Other words."}});deliver(log,5);
 expect(log.entries().map(e=>e.text)).toEqual(["Go see the neighbors.","Other words.","Go see the neighbors."]);
});

it("filters by words and room, case-insensitively, and limits how many entries come back",async()=>{
 const log=new DialogueLog(ALL_ON);
 for(let i=0;i<30;i++)deliver(log,i*2+1,{world_context:{objects:[],triggers:[],dialogue:`Line ${String(i)} about ${i%2===0?"stairs":"doors"}`},location:i<15?"HOUSE 1F":"TOWN"});
 const stairs=await recall(log,{contains:"STAIRS"});
 expect(stairs).toContain("15 of 30 entries match");expect(stairs).not.toContain("doors");
 const town=await recall(log,{room:"town",last:3});
 expect(town).toContain("Line 29");expect(town).toContain("Line 27");expect(town).not.toContain("Line 26");
 expect(town).toContain("3 shown");
 expect(await recall(log,{contains:"nothing like this"})).toContain("No recorded dialogue matches");
});

it("returns every requested page whole, however long",async()=>{
 const log=new DialogueLog(ALL_ON);
 for(let i=0;i<20;i++)deliver(log,i*2+1,{world_context:{objects:[],triggers:[],dialogue:`${String(i)} ${"x".repeat(3000)}`}});
 const text=await recall(log,{last:20});
 for(let i=0;i<20;i++)expect(text).toContain(`${String(i)} ${"x".repeat(3000)}`);
 expect(text).not.toMatch(/truncated|omitted/);
 expect(text).toContain("20 shown.");
});

it("states the faced character only when the readout supports it",async()=>{
 const blind=new DialogueLog({...ALL_ON,"named-interactions-v1":false});deliver(blind,1);
 expect(await recall(blind,{})).not.toContain("MOM");
 const noPosition=new DialogueLog({...ALL_ON,"live-player-position-v1":false});deliver(noPosition,1);
 const text=await recall(noPosition,{});
 expect(text).not.toContain("at 3,4");expect(text).not.toContain("facing MOM");
 const nobody=new DialogueLog(ALL_ON);deliver(nobody,1,{facing:"up"});
 expect(await recall(nobody,{})).not.toContain("facing");
});

it("rejects invalid recall arguments",async()=>{
 const log=new DialogueLog(ALL_ON);
 await expect(recall(log,{last:0})).rejects.toThrow(/last/);
 await expect(recall(log,{last:21})).rejects.toThrow(/last/);
 await expect(recall(log,{contains:"x".repeat(81)})).rejects.toThrow(/80/);
});

it("exists only when the switch is on and its dialogue source is on",()=>{
 const subscribers:((e:RunEvent)=>void)[]=[];
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);}};
 expect(dialogueLog({...ALL_ON,"dialogue-log-v1":false},recorder)).toBeNull();
 const tool=dialogueLog({...ALL_ON,"dialogue-log-v1":true},recorder);
 expect(tool?.name).toBe("recall_dialogue");expect(subscribers).toHaveLength(1);
 subscribers[0]?.(state(1));
 expect(featureInfo("dialogue-log-v1")).toMatchObject({group:"guidance",needs:"active-field-message-buffer-v1"});
});

it("lists the tool and its prompt line only when on",()=>{
 const on={...ALL_ON,"dialogue-log-v1":true},off={...ALL_ON,"dialogue-log-v1":false};
 expect(playTools(on)).toContain("recall_dialogue");expect(playTools(off)).not.toContain("recall_dialogue");
 expect(playSystemPrompt(on,null)).toContain("- recall_dialogue:");expect(playSystemPrompt(off,null)).not.toContain("recall_dialogue");
});

it("falls back truthfully when location, position, facing or names are missing",async()=>{
 const log=new DialogueLog(ALL_ON);
 deliver(log,1,{location:null});
 deliver(log,3,{position:null,world_context:{objects:[],triggers:[],dialogue:"Two."}});
 deliver(log,5,{facing:null,world_context:{objects:[],triggers:[],dialogue:"Three."}});
 deliver(log,7,{facing:"sideways",world_context:{objects:[],triggers:[],dialogue:"Four."}});
 deliver(log,9,{interaction_targets:undefined,world_context:{objects:[],triggers:[],dialogue:"Five."}});
 deliver(log,11,{interaction_targets:[{...MOM,name:null}],world_context:{objects:[],triggers:[],dialogue:"Six."}});
 expect(log.entries().map(e=>[e.room,e.position,e.facing])).toEqual([["unknown room (map 1/0)","3,4","MOM at 4,4"],["HOUSE 1F (map 1/0)",null,null],["HOUSE 1F (map 1/0)","3,4",null],["HOUSE 1F (map 1/0)","3,4",null],["HOUSE 1F (map 1/0)","3,4",null],["HOUSE 1F (map 1/0)","3,4",null]]);
 expect(await recall(log,{contains:"  ",room:" "})).toContain("6 of 6 entries match");
});

it("treats two maps with the same or a missing location label as different rooms",()=>{
 const log=new DialogueLog(ALL_ON);
 deliver(log,1,{location:null,map_id:[2,1]});deliver(log,3,{location:null,map_id:[2,2]});
 deliver(log,5,{map_id:[1,0]});deliver(log,7,{map_id:[1,1]});
 expect(log.entries().map(e=>e.room)).toEqual(["unknown room (map 2/1)","unknown room (map 2/2)","HOUSE 1F (map 1/0)","HOUSE 1F (map 1/1)"]);
});

it("shows the map id to the model only when its readout shows one",async()=>{
 const hidden=new DialogueLog({...ALL_ON,"bounded-navigation-v1":false});
 deliver(hidden,1,{map_id:[1,0]});deliver(hidden,3,{map_id:[1,1]});
 expect(hidden.entries()).toHaveLength(2);
 expect(await recall(hidden,{})).not.toContain("map");
});
