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
 const {ram,events,proof}=fixture();
 if(defect==="cpu"){ram.cpsr=0x3f;ram.gprs[15]=0x080008b0;}
 if(defect==="region")ram.regions[0].data_base64="";
 if(defect==="frame")ram.frame=7;
 if(defect==="rom")ram.rom_sha1="b".repeat(40);
 if(["cpu","region","frame","rom"].includes(defect)){const b=gzipSync(JSON.stringify(ram));proof.archives[0]!.base64=b.toString("base64");const s=events[1];if(s?.type!=="state"||!("started"in s)||s.raw_ram===undefined)throw Error("fixture");s.raw_ram.sha256=sha(b);}
 if(defect==="hash")proof.archives[0]!.base64=Buffer.from("tamper").toString("base64");
 if(defect==="partial"){const s=events[1];if(s?.type!=="state"||!("started"in s))throw Error("fixture");s.map_id=[11,3];}
 if(defect==="journal")proof.journal.lastId=2;
 if(defect==="blind"){const e=events[2];if(e?.type!=="native_action")throw Error("fixture");e.kind="harness_bug";}
 expect(()=>verifiedTransitionSamples(events,proof)).toThrow();
});
it("leaves absent evidence unqualified and rejects duplicate receipts",()=>{const {events,proof}=fixture();expect(verifiedTransitionSamples(events).size).toBe(0);proof.archives.push(proof.archives[0]!);expect(()=>verifiedTransitionSamples(events,proof)).toThrow();});
