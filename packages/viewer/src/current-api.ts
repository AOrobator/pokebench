import {packCurrentAnswer} from "./current-metadata.js";
import {createHash} from "node:crypto";
import type {IncomingMessage,ServerResponse} from "node:http";
import {CurrentPoolError,type CurrentPool} from "./current-pool.js";
import type {CurrentQuery,CurrentAnswer} from "./current-public.js";
export interface CurrentApi {handle(req:IncomingMessage,res:ServerResponse,parts:readonly string[],now:number):Promise<boolean>}
export function createCurrentApi(pool:CurrentPool,options:{maxBytes?:number;responseMs?:number;enrich?:(answer:CurrentAnswer)=>Promise<CurrentAnswer>}={}):CurrentApi{
 const max=options.maxBytes??8*1024*1024,deadline=options.responseMs??10000;
 if(!Number.isSafeInteger(max)||max<64||max>8*1024*1024||!Number.isSafeInteger(deadline)||deadline<1||deadline>10000)throw new Error("Invalid current HTTP limits");
 return {handle:async(req,res,parts,now)=>{
  const [head,leaf,id,operation]=parts;
  const list=parts.length===2&&head==="api"&&leaf==="current-runs",updates=parts.length===2&&head==="api"&&leaf==="current-updates",selected=parts.length===4&&head==="api"&&leaf==="runs"&&id!==undefined&&(operation==="current"||operation==="history"||operation==="metadata"||operation==="progress");
  if(!list&&!updates&&!selected)return false;
  const send=(status:number,value:unknown):void=>{if(res.destroyed)return;let body=JSON.stringify(packCurrentAnswer(value));if(Buffer.byteLength(body)>max){status=413;body=JSON.stringify({error:"Current reply exceeds its byte limit"});}
   const tag='"'+createHash("sha256").update(body).digest("hex")+'"';res.setHeader("cache-control","no-cache");res.setHeader("x-content-type-options","nosniff");res.setHeader("content-type","application/json; charset=utf-8");res.setHeader("etag",tag);
   if(status===200&&req.headers["if-none-match"]===tag){res.writeHead(304);res.end();return;}res.writeHead(status);res.end(body);
  };
  const timer=setTimeout(()=>{res.destroy();},deadline);const clear=()=>{clearTimeout(timer);};res.once("close",clear);res.once("finish",clear);
  try{
   const params=new URL(req.url??"/","http://viewer.invalid").searchParams;
   const allowed=list?["after","limit"]:updates?["after","run"]:operation==="history"?["before"]:operation==="metadata"?["reference"]:operation==="progress"?["generation","after"]:[];
   if([...params.keys()].some(key=>!allowed.includes(key)||params.getAll(key).length!==1))throw new CurrentPoolError(400,"Invalid current query parameters");
   const query:CurrentQuery=list?{kind:"list",now,after:params.get("after"),...(params.has("limit")?{limit:Number(params.get("limit"))}:{})}:updates?{kind:"updates",now,after:params.get("after"),...(params.has("run")?{run:params.get("run")??""}:{})}:operation==="history"?{kind:"history",now,run:id??"",before:params.get("before")}:operation==="metadata"?{kind:"metadata",now,run:id??"",reference:params.get("reference")??""}:operation==="progress"?{kind:"progress",now,run:id??"",generation:params.get("generation")??"",after:params.get("after")}: {kind:"current",now,run:id??""};
   const raw=await pool.query(query);
   const answer:CurrentAnswer=options.enrich===undefined?raw:await options.enrich(raw);
   const status=answer.kind==="unavailable"?503:answer.kind==="current"&&answer.snapshot===null?202:answer.kind==="history"?answer.state==="reset"?409:answer.state==="oversized"?413:answer.state==="indexing"?202:200:200;
   send(status,answer);
  }catch(error){send(error instanceof CurrentPoolError?error.status:503,{error:error instanceof CurrentPoolError?error.message:"Current snapshots unavailable"});}
  return true;
 }};
}
