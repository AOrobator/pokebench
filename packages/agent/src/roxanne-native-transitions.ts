import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {Type} from "typebox";
import {Value} from "typebox/value";
import type {RunEvent} from "./events.js";
export interface TransitionProof{readonly archives:readonly {readonly seq:number;readonly base64:string}[];readonly journal:{readonly frame:number;readonly lastId:number}}
const uint=Type.Integer({minimum:0,maximum:0xffffffff});
const Archive=Type.Object({v:Type.Literal(1),sequence:Type.Integer({minimum:1}),frame:Type.Integer({minimum:0}),timestamp_ns:Type.Integer({minimum:0}),rom_sha1:Type.String({pattern:"^[a-f0-9]{40}$"}),gprs:Type.Array(uint,{minItems:16,maxItems:16}),cpsr:uint,regions:Type.Array(Type.Object({name:Type.String(),address:uint,size:Type.Integer(),data_base64:Type.String(),sha256:Type.String()}),{minItems:7,maxItems:7})});
const layout=[["ewram",0x02000000,0x40000],["iwram",0x03000000,0x8000],["io",0x04000000,0x400],["palette",0x05000000,0x400],["vram",0x06000000,0x18000],["oam",0x07000000,0x400],["flash",0x0e000000,0x20000]] as const;
const sha=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
/** Measurement-only. WaitForVBlank ownership follows transition_coherence.py and
 * pret/pokeemerald 731ad5bf src/main.c; no party is decoded from a busy frame.
 * Originals remain in the trace so independent scoring repeats every check. */
export function verifiedTransitionSamples(events:readonly RunEvent[],proof?:TransitionProof):ReadonlySet<number>{
 const out=new Set<number>();if(proof===undefined)return out;
 const start=events.find(e=>e.type==="run_start"),journal=events.filter(e=>e.type==="native_action");
 if(start?.type!=="run_start"||start.rom_sha1===undefined||!Number.isSafeInteger(proof.journal.frame)||proof.journal.frame<0||journal.length===0||journal.length!==proof.journal.lastId||journal.some((e,i)=>e.id!==i+1||e.kind==="harness_bug"||e.frame>proof.journal.frame||e.frame<(journal[i-1]?.frame??0)))throw new Error("incomplete or blind native transition journal");
 for(const receipt of proof.archives){
  const event=events.find(e=>e.seq===receipt.seq);
  if(out.has(receipt.seq)||event?.type!=="state"||!("started"in event)||!event.started||event.map_id!==null||event.party.length!==0||event.raw_ram===undefined)throw new Error("transition proof is not a fully empty native state");
  const bytes=Buffer.from(receipt.base64,"base64");if(bytes.length>2*1024*1024||bytes.toString("base64")!==receipt.base64||sha(bytes)!==event.raw_ram.sha256)throw new Error("transition archive digest mismatch");
  const value:unknown=JSON.parse(gunzipSync(bytes,{maxOutputLength:2*1024*1024}).toString("utf8"));
  if(!Value.Check(Archive,value)||value.rom_sha1!==start.rom_sha1||value.sequence!==event.raw_ram.sequence||value.frame!==event.raw_ram.frame)throw new Error("transition archive provenance mismatch");
  for(const [i,region]of value.regions.entries()){
   const expected=layout[i],raw=Buffer.from(region.data_base64,"base64");
   if(expected===undefined||region.name!==expected[0]||region.address!==expected[1]||region.size!==expected[2]||raw.length!==region.size||raw.toString("base64")!==region.data_base64||sha(raw)!==region.sha256)throw new Error("transition archive region integrity failure");
  }
  const pc=(value.gprs[15]??0)&~1,mode=value.cpsr&0x1f;
  if(![0x10,0x11,0x12,0x13,0x17,0x1b,0x1f].includes(mode))throw new Error("invalid transition CPU mode");
  // The archive uses emulator frame_counter; journal.frame starts at server boot.
  // Compare each to its own owner only, never these two distinct clocks.
  const iwram=value.regions[1];if(iwram===undefined)throw new Error("missing transition IWRAM");
  // pret731ad5bf overworld.c:1550: CB2_WhiteOut waits120frames without RunTasks or input.
  const whiteout=start.rom_sha1==="f3ae088181bf583e55daf962a92bb46f4f1d07b7"&&start.harness_features.includes("blackout-transition-v1")&&Buffer.from(iwram.data_base64,"base64").readUInt32LE(0x22c4)===0x08085f59&&event.screen==="field_transition"&&!event.in_battle&&event.active_ui?.phase==="field_transition"&&event.active_ui.ready===false&&event.active_ui.diagnostic===null;
  if((mode===0x10||mode===0x1f)&&(value.cpsr&0x20)!==0&&pc-2>=0x080008ac&&pc-2<0x080008d4&&!whiteout)throw new Error("empty state has no verified transition proof");
  out.add(receipt.seq);
 }
 return out;
}
