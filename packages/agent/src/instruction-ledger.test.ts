import {expect,it} from "vitest";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {InstructionLedger,instructionLedger} from "./instruction-ledger.js";
import {ALL_ON,featureInfo,stateOnlyProblems} from "./features.js";
import {playSystemPrompt,playTools} from "./play-config.js";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";

const ev=(body:Record<string,unknown>,seq:number,turn=1):RunEvent=>checkEvent({v:1,run:"ledger-test",t:"2026-10-14T12:00:00.000-04:00",turn,seq,...body});
const MOM={name:"MOM",kind:"object",x:4,y:4,elevation:0,activation:"press_a",availability:"live",facing:null,local_id:1,destination:null};
const st=(seq:number,extra:Record<string,unknown>={},turn=1)=>ev({type:"state",...IN_GAME,started:true,screen:"overworld",location:"HOUSE 1F",map_id:[1,0],position:{x:3,y:4},facing:"right",field_controls_locked:true,interaction_targets:[MOM],world_context:{objects:[],triggers:[],dialogue:null},...extra},seq,turn);
const deliver=(l:InstructionLedger,seq:number,extra:Record<string,unknown>={},turn=1)=>{l.observe(st(seq,extra,turn));l.observe(ev({type:"tool_result",id:`t${String(seq)}`,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:seq},seq+1,turn));};
const said=(text:string)=>({world_context:{objects:[],triggers:[],dialogue:text}});

it("pins received instructions, rooms visited and what was heard there",()=>{
 const l=new InstructionLedger(ALL_ON);
 deliver(l,1,said("Welcome home, dear."),2);
 deliver(l,3,said("Go meet the family that moved in."),5);
 deliver(l,5,{...said("The professor is out right now."),location:"OTHER BUILDING",map_id:[1,4],interaction_targets:[],facing:"up"},9);
 const text=l.text();
 expect(text).toContain("INSTRUCTION LEDGER");
 expect(text).toContain("not a walkthrough");
 expect(text).toMatch(/turn 5 · HOUSE 1F \(map 1\/0\) · facing MOM at 4,4: "Go meet the family that moved in\."/);
 expect(text.indexOf("Go meet the family")).toBeLessThan(text.indexOf("Welcome home"));
 expect(text).toMatch(/OTHER BUILDING \(map 1\/4\) \(first turn 9\): last heard "The professor is out right now\."/);
 expect(text).toMatch(/HOUSE 1F \(map 1\/0\) \(first turn 2\)/);
 expect(text).toContain("Contradictions you recorded: none");
});

it("records contradictions only with evidence the model was shown",async()=>{
 const l=new InstructionLedger(ALL_ON);deliver(l,1,said("Hello."));deliver(l,3);
 const note=l.tool();
 await expect(note.execute("c",{expected:"x",observed:"y",evidence:[999]})).rejects.toThrow(/unknown event #999/);
 await expect(note.execute("c",{expected:"",observed:"y",evidence:[1]})).rejects.toThrow(/expected/);
 await expect(note.execute("c",{expected:"x",observed:"y",evidence:[]})).rejects.toThrow(/1–4/);
 const ok=await note.execute("c",{expected:"The person here would be the professor",observed:"The object at 10,8 is SCIENTIST_1 and said the professor is out",evidence:[1,3]});
 expect(ok.content[0]).toMatchObject({type:"text"});
 expect(l.text()).toContain("expected: The person here would be the professor; observed: The object at 10,8 is SCIENTIST_1");
 expect(l.text()).toContain("evidence #1,#3");
 for(let i=0;i<10;i++)await note.execute("c",{expected:`e${String(i)}`,observed:`o${String(i)}`,evidence:[1]});
 expect(l.text()).not.toContain("expected: e1;");expect(l.text()).toContain("expected: e9;");
 expect(l.text().match(/expected:/g)).toHaveLength(8);
});

it("keeps every pinned entry whole and stays honest when position, names or dialogue are unavailable",()=>{
 const big=new InstructionLedger(ALL_ON);
 for(let i=0;i<50;i++)deliver(big,i*2+1,{...said(`${String(i)} ${"x".repeat(2000)}`),location:`ROOM ${String(i)}`});
 expect(big.text()).toContain(`49 ${"x".repeat(2000)}`);expect(big.text()).not.toContain("truncated");
 const plain=new InstructionLedger({...ALL_ON,"named-interactions-v1":false,"live-player-position-v1":false});
 deliver(plain,1,said("Hi."));
 expect(plain.text()).not.toContain("MOM");expect(plain.text()).not.toContain("3,4");
 const empty=new InstructionLedger(ALL_ON);
 expect(empty.text()).toContain("Received instructions: none recorded");
 expect(empty.text()).toContain("Rooms visited: none recorded");
});

it("appends the ledger to the model context and records exactly what was delivered",async()=>{
 const recorded:Record<string,unknown>[]=[];const subscribers:((e:RunEvent)=>void)[]=[];
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordLedgerContext:(body:{text:string;evidence:number[]})=>{recorded.push(body);}};
 expect(instructionLedger({...ALL_ON,"instruction-ledger-v1":false},recorder,m=>Promise.resolve(m))).toBeNull();
 const ledger=instructionLedger({...ALL_ON,"instruction-ledger-v1":true},recorder,m=>Promise.resolve(m));
 if(ledger===null)throw Error("expected ledger");
 for(const fn of subscribers){fn(st(1,said("Hello there.")));fn(ev({type:"tool_result",id:"t",name:"press",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:1},2));}
 const out:AgentMessage[]=await ledger.transformContext([]);
 const last=out.at(-1);
 expect(last?.role).toBe("user");
 expect(JSON.stringify(last)).toContain("Hello there.");
 expect(recorded).toHaveLength(1);expect(recorded[0]?.["evidence"]).toEqual([1]);
 expect(()=>checkEvent({v:1,run:"r",t:"2026-10-14T12:00:00.000-04:00",turn:1,seq:9,type:"ledger_context",...recorded[0]})).not.toThrow();
 expect(ledger.tool.name).toBe("note_contradiction");
});

it("registers the switch with its dependency, prompt line, tool and state-only exclusion",()=>{
 expect(featureInfo("instruction-ledger-v1")).toMatchObject({group:"guidance",needs:"active-field-message-buffer-v1"});
 const on={...ALL_ON,"instruction-ledger-v1":true},off={...ALL_ON,"instruction-ledger-v1":false};
 expect(playTools(on)).toContain("note_contradiction");expect(playTools(off)).not.toContain("note_contradiction");
 expect(playSystemPrompt(on,null)).toContain("INSTRUCTION LEDGER");expect(playSystemPrompt(off,null)).not.toContain("INSTRUCTION LEDGER");
 expect(stateOnlyProblems({...ALL_ON,"state-only-decisions-v1":true})).toContain("state-only-decisions-v1 requires instruction-ledger-v1 OFF");
});

it("skips menus and unmatched results, names unknown rooms and cites contradiction evidence",async()=>{
 const l=new InstructionLedger(ALL_ON);
 l.observe(st(1));l.observe(ev({type:"tool_result",id:"x",name:"press",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:99},2));
 deliver(l,3,{screen:"menu"});
 deliver(l,5,{location:null});
 deliver(l,7,{location:null,...said("Hi.")});
 expect(l.text()).toMatch(/unknown room \(map 1\/0\) \(first turn 1\): last heard "Hi\."/);
 const quiet=new InstructionLedger(ALL_ON);deliver(quiet,1);
 expect(quiet.text()).toContain("HOUSE 1F (map 1/0) (first turn 1): nothing heard");
 await l.tool().execute("c",{expected:"a",observed:"b",evidence:[5]});
 expect(l.evidence()).toEqual([5,7]);
});

it("records a schema-valid ledger event even with every section full",async()=>{
 const l=new InstructionLedger(ALL_ON);
 for(let i=0;i<20;i++)deliver(l,i*2+1,{...said(`line ${String(i)}`),location:`ROOM ${String(i)}`,map_id:[1,i]});
 const note=l.tool();
 for(let i=0;i<8;i++)await note.execute("c",{expected:`e${String(i)}`,observed:`o${String(i)}`,evidence:[1+i*4,3+i*4,5+i*4,7+i*4].filter(n=>n<40)});
 expect(()=>checkEvent({v:1,run:"r",t:"2026-10-14T12:00:00.000-04:00",turn:1,seq:99,type:"ledger_context",text:l.text(),evidence:l.evidence()})).not.toThrow();
});
