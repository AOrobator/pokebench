import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type,type Static} from "typebox";
import {Value} from "typebox/value";
import type {StateSource} from "./game-state.js";

const integer=Type.Integer({minimum:0});
export const SceneJournalSchema=Type.Object({
 first_id:Type.Integer({minimum:1}),last_id:integer,errors:integer,last_error:Type.Union([Type.String(),Type.Null()]),omitted_images:integer,
 entries:Type.Array(Type.Object({id:Type.Integer({minimum:1}),frame:integer,text:Type.String(),image:Type.Optional(Type.String({minLength:1,maxLength:300_000}))},{additionalProperties:false}),{maxItems:512}),
},{additionalProperties:false});
export type SceneJournalReply=Static<typeof SceneJournalSchema>;
export function parseSceneJournal(value:unknown):SceneJournalReply {
 if(!Value.Check(SceneJournalSchema,value))throw new Error("Malformed scene journal");
 let previous=value.first_id-1;
 for(const entry of value.entries){
  if(entry.id<=previous||entry.id>value.last_id)throw new Error("Scene journal event order is invalid");
  previous=entry.id;
  if(entry.image!==undefined){
   const png=Buffer.from(entry.image,"base64");
   if(png.length<24||png.subarray(0,8).toString("hex")!=="89504e470d0a1a0a"||png.readUInt32BE(16)!==240||png.readUInt32BE(20)!==160)throw new Error("Malformed scene journal image");
  }
 }
 return value;
}
const GAME_TOOLS=new Set(["observe","press","navigate_to","navigate_to_target","explore_map","battle_action","learn_move","choose_evolution","select_menu_option"]);

// This outer wrapper runs after the complete action/auto-advance composition.
// Content is ordinary tool_result text/images: the recorder, context, Activity
// History and replay keep the same evidence the gameplay model receives.
export function withSceneJournal(tools:readonly AgentTool[],enabled:boolean,state:Pick<StateSource,"sceneEvents">):AgentTool[]{
 if(!enabled)return [...tools];
 const read=state.sceneEvents?.bind(state);
 if(read===undefined)throw new Error("cutscene-journal-v1 needs the frame-owned scene journal");
 let after=0,errors=0;
 return tools.map(tool=>!GAME_TOOLS.has(tool.name)?tool:{...tool,execute:async(id,params,signal,update)=>{
  const result=await tool.execute(id,params,signal,update);
  let reply:SceneJournalReply;
  try{reply=parseSceneJournal(await read(after,signal));if(reply.last_id<after)throw new Error("Scene journal cursor moved backward; capture continuity lost");}
  catch(error){
   signal?.throwIfAborted();
   return append(result,`Scene history unavailable: ${error instanceof Error?error.message:String(error)}. Intermediate action may be missing; do not infer what happened.`,[]);
  }
  const lines:string[]=[];
  if(after<reply.first_id-1)lines.push(`CAPTURE GAP: scene events ${String(after+1)}–${String(reply.first_id-1)} are no longer available.`);
  if(reply.errors>errors)lines.push(`CAPTURE GAP: ${String(reply.errors-errors)} frame reads failed; latest: ${reply.last_error??"unknown"}.`);
  for(const e of reply.entries)lines.push(`[scene event ${String(e.id)}, native step ${String(e.frame)}] ${e.text}`);
  if(reply.omitted_images>0)lines.push(`${String(reply.omitted_images)} additional visual samples omitted; text events above remain listed.`);
  const images=reply.entries.flatMap(e=>e.image===undefined?[]:[e.image]);
  after=reply.last_id;errors=reply.errors;
  return lines.length===0?result:append(result,`Scene history since the previous delivered game result (chronological; sprite labels are not character names; unnamed speakers remain unknown):\n${lines.join("\n")}`,images);
 }});
}
function append(result:AgentToolResult<unknown>,text:string,images:readonly string[]):AgentToolResult<unknown>{
 return {...result,content:[...result.content,{type:"text",text},...images.map(data=>({type:"image" as const,data,mimeType:"image/png"})),...(images.length===0?[]:[{type:"text" as const,text:"End of historical scene samples. The current observation is the original game image/readout before this scene-history block."}])]};
}
