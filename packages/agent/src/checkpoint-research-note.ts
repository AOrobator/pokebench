import {createHash} from "node:crypto";
import {Type,type Static} from "typebox";
import {Value} from "typebox/value";
import type {FeatureSet} from "./features.js";

export const CHECKPOINT_RESEARCH_NOTE_LIMITS={fileBytes:65536,textBytes:8192} as const;
const Descriptor=Type.Object({version:Type.Literal(1),policyId:Type.String({pattern:"^[a-z0-9][a-z0-9._-]{0,99}$"}),text:Type.String({minLength:1}),sha256:Type.String({pattern:"^[a-f0-9]{64}$"})},{additionalProperties:false});
type Descriptor=Static<typeof Descriptor>;
export interface CheckpointResearchNote {readonly descriptor:Descriptor;readonly sourceSha256:string;}
export interface CheckpointResearchNoteFile {readonly path:string;readonly sha256:string;}
interface Limits {readonly fileBytes:number;readonly textBytes:number;}
const sha=(text:string):string=>createHash("sha256").update(text).digest("hex");

// The live configuration boundary supplies the file and expected digest explicitly.
// OFF returns before validating or reading a file; the behavioral factory reads no environment.
export function loadCheckpointResearchNote(features:FeatureSet,start:{readonly kind:"boot"|"save_state"},file:CheckpointResearchNoteFile|undefined,read:(path:string)=>string,limits:Limits=CHECKPOINT_RESEARCH_NOTE_LIMITS):CheckpointResearchNote|null {
 if(!features["checkpoint-research-note-v1"])return null;
 if(start.kind!=="save_state")throw new Error("checkpoint research note requires a save-state start");
 if(!features["save-state-task-truth-v1"])throw new Error("checkpoint research note requires save-state-task-truth-v1");
 if(file===undefined||file.path.trim()===""||!/^[a-f0-9]{64}$/.test(file.sha256))throw new Error("checkpoint research note requires an explicit file and SHA-256");
 const body=read(file.path);
 if(Buffer.byteLength(body,"utf8")>limits.fileBytes)throw new Error("checkpoint research note file size exceeds its byte limit");
 if(sha(body)!==file.sha256)throw new Error("checkpoint research note file SHA-256 mismatch");
 const value:unknown=JSON.parse(body);
 if(!Value.Check(Descriptor,value))throw new Error("invalid checkpoint research note descriptor");
 if(value.text.trim()==="")throw new Error("checkpoint research note text is empty");
 if(Buffer.byteLength(value.text,"utf8")>limits.textBytes)throw new Error("checkpoint research note text size exceeds its byte limit");
 if(sha(value.text)!==value.sha256)throw new Error("checkpoint research note text SHA-256 mismatch");
 return Object.freeze({descriptor:Object.freeze({...value}),sourceSha256:file.sha256});
}

export function checkpointResearchTask(base:string,start:{readonly kind:"boot"|"save_state"},features:FeatureSet,note:CheckpointResearchNote|null):string {
 if(!features["checkpoint-research-note-v1"])return base;
 if(start.kind!=="save_state")throw new Error("checkpoint research note requires a save-state start");
 if(!features["save-state-task-truth-v1"])throw new Error("checkpoint research note requires save-state-task-truth-v1");
 if(note===null)throw new Error("checkpoint research note requires a validated descriptor");
 return `${base}\n\n${note.descriptor.text}`;
}

export function checkpointResearchNoteReceipt(note:CheckpointResearchNote,initialTask:string) {
 return {version:1 as const,feature:"checkpoint-research-note-v1" as const,placement:"initial_user_message" as const,policyId:note.descriptor.policyId,source_sha256:note.sourceSha256,text_sha256:note.descriptor.sha256,text_bytes:Buffer.byteLength(note.descriptor.text,"utf8"),initial_task_sha256:sha(initialTask),descriptor:note.descriptor};
}
