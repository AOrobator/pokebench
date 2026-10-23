import {it,expect} from "vitest";
import {gzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import {checkEvent} from "./events.js";
import {RUN_START_META} from "../test-support/events.js";
import {verifiedTransitionSamples} from "./roxanne-native-transitions.js";
const sha=(b:Buffer)=>createHash("sha256").update(b).digest("hex");
const layout=[["ewram",0x02000000,0x40000],["iwram",0x03000000,0x8000],["io",0x04000000,0x400],["palette",0x05000000,0x400],["vram",0x06000000,0x18000],["oam",0x07000000,0x400],["flash",0x0e000000,0x20000]] as const;
function fixture(){
 const ram={v:1,sequence:2,frame:2,timestamp_ns:1,rom_sha1:"a".repeat(40),gprs:Array<number>(16).fill(0),cpsr:0x12,regions:layout.map(([name,address,size])=>{const b=Buffer.alloc(size);return {name,address,size,data_base64:b.toString("base64"),sha256:sha(b)};})};
 const bytes=gzipSync(JSON.stringify(ram)),t="2026-10-23T08:00:00.000-04:00";
 const events=[checkEvent({v:1,run:"source",seq:0,t,turn:0,type:"run_start",...RUN_START_META,rom_sha1:ram.rom_sha1}),checkEvent({v:1,run:"source",seq:1,t,turn:1,type:"state",screen:"field_transition",started:true,name:null,location:null,map_id:null,position:null,facing:null,in_battle:false,party:[],money:null,badges:[],play_time_s:null,raw_ram:{v:1,sequence:2,frame:2,path:"raw-ram/00000002.json.gz",sha256:sha(bytes)}}),checkEvent({v:1,run:"source",seq:2,t,turn:1,type:"native_action",id:1,frame:3,server_timestamp:1,kind:"native_input",details:{buttons:[]}})];
 return {ram,events,proof:{archives:[{seq:1,base64:bytes.toString("base64")}],journal:{frame:3,lastId:1}}};
}
it("accepts only hash-bound fully empty non-idle native snapshots with a complete terminal journal",()=>{const {events,proof}=fixture();expect([...verifiedTransitionSamples(events,proof)]).toEqual([1]);});
it.each(["hash","cpu","region","frame","rom","partial","journal","blind"] as const)("rejects %s evidence defects",defect=>{
 const {ram,events,proof}=fixture();const receipt=proof.archives[0];if(receipt===undefined)throw Error("fixture");
 if(defect==="cpu"){ram.cpsr=0x3f;ram.gprs[15]=0x080008b0;}
 if(defect==="region"){const r=ram.regions[0];if(r===undefined)throw Error("fixture");r.data_base64="";}
 if(defect==="frame")ram.frame=7;
 if(defect==="rom")ram.rom_sha1="b".repeat(40);
 if(["cpu","region","frame","rom"].includes(defect)){const b=gzipSync(JSON.stringify(ram));receipt.base64=b.toString("base64");const s=events[1];if(s?.type!=="state"||!("started"in s)||s.raw_ram===undefined)throw Error("fixture");s.raw_ram.sha256=sha(b);}
 if(defect==="hash")receipt.base64=Buffer.from("tamper").toString("base64");
 if(defect==="partial"){const s=events[1];if(s?.type!=="state"||!("started"in s))throw Error("fixture");s.map_id=[11,3];}
 if(defect==="journal")proof.journal.lastId=2;
 if(defect==="blind"){const e=events[2];if(e?.type!=="native_action")throw Error("fixture");e.kind="harness_bug";}
 expect(()=>verifiedTransitionSamples(events,proof)).toThrow();
});
it("leaves absent evidence unqualified and rejects duplicate receipts",()=>{const {events,proof}=fixture();expect(verifiedTransitionSamples(events).size).toBe(0);const first=proof.archives[0];if(first===undefined)throw Error("fixture");proof.archives.push(first);expect(()=>verifiedTransitionSamples(events,proof)).toThrow();});

function whiteout(){
 const f=fixture(),rom="f3ae088181bf583e55daf962a92bb46f4f1d07b7";
 f.ram.cpsr=0x3f;f.ram.gprs[15]=0x080008c8;f.ram.rom_sha1=rom;
 const iwram=f.ram.regions[1];if(!iwram)throw Error("fixture");const bytes=Buffer.from(iwram.data_base64,"base64");bytes.writeUInt32LE(0x08085f59,0x22c4);iwram.data_base64=bytes.toString("base64");iwram.sha256=sha(bytes);
 const packed=gzipSync(JSON.stringify(f.ram));f.proof.archives[0]={seq:1,base64:packed.toString("base64")};
 const start=f.events[0],state=f.events[1];if(start?.type!=="run_start"||state?.type!=="state"||!("started"in state)||!state.raw_ram)throw Error("fixture");start.rom_sha1=rom;start.harness_features=["blackout-transition-v1"];state.raw_ram.sha256=sha(packed);state.active_ui={phase:"field_transition",selected:null,ready:false,controls:"Whiting out; input is not active yet",diagnostic:null};return f;
}
it("qualifies the exact ROM-bound declared whiteout wait even at an idle frame",()=>{const f=whiteout();expect([...verifiedTransitionSamples(f.events,f.proof)]).toEqual([1]);});
it.each(["undeclared","unknown","rom","screen","diagnostic","ready","phase","battle","blind","journal"] as const)("does not use the whiteout exception for %s evidence",defect=>{
 const f=whiteout(),start=f.events[0],state=f.events[1],native=f.events[2];if(start?.type!=="run_start"||state?.type!=="state"||!("started"in state)||!state.active_ui||!state.raw_ram||native?.type!=="native_action")throw Error("fixture");
 if(defect==="undeclared")start.harness_features=[];
 if(defect==="screen")state.screen="unsupported";
 if(defect==="diagnostic")state.active_ui.diagnostic="coverage failure";
 if(defect==="ready")state.active_ui.ready=true;
 if(defect==="phase")state.active_ui.phase="unsupported";
 if(defect==="battle")state.in_battle=true;
 if(defect==="blind")native.kind="harness_bug";
 if(defect==="journal")f.proof.journal.lastId=2;
 if(defect==="unknown"){const r=f.ram.regions[1];if(!r)throw Error("fixture");const b=Buffer.from(r.data_base64,"base64");b.writeUInt32LE(0x08085f5b,0x22c4);r.data_base64=b.toString("base64");r.sha256=sha(b);}
 if(defect==="rom"){f.ram.rom_sha1="b".repeat(40);start.rom_sha1=f.ram.rom_sha1;}
 if(defect==="unknown"||defect==="rom"){const b=gzipSync(JSON.stringify(f.ram));f.proof.archives[0]={seq:1,base64:b.toString("base64")};state.raw_ram.sha256=sha(b);}
 expect(()=>verifiedTransitionSamples(f.events,f.proof)).toThrow();
});
