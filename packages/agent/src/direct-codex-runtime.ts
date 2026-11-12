// Thin filesystem boundary. Provider selection and stream capture logic are injected/pure in direct-codex.ts.
import {readFileSync,mkdirSync,openSync,writeSync,fsyncSync,closeSync,appendFileSync} from "node:fs";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {codexAccessToken,directCodexModel,parseCodexProviderConfig,providerTranscriptFetch,CODEX_RESPONSES_URL} from "./direct-codex.js";
export function readDirectCodexProvider(path:string,id:string,enabled:boolean){
 const config=parseCodexProviderConfig(JSON.parse(readFileSync(path,"utf8")) as unknown);
 const model=directCodexModel(JSON.parse(readFileSync(config.modelsFile,"utf8")) as unknown,id,config.maxTokens,enabled);
 const getApiKey=():string=>{let auth:unknown;try{auth=JSON.parse(readFileSync(config.authFile,"utf8")) as unknown;}catch{throw Error("Cannot read valid Codex login credentials");}return codexAccessToken(auth,Date.now());};
 getApiKey();return {model,getApiKey};
}
export function recordDirectCodexTransport(base:typeof fetch,directory:string,turn:()=>number):typeof fetch{
 mkdirSync(directory,{recursive:true,mode:0o700});let attempt=0;
 return providerTranscriptFetch(base,{url:CODEX_RESPONSES_URL,turn,open:meta=>{
  const id=String(++attempt).padStart(6,"0"),requestFile=`${id}.request.json`,responseFile=`${id}.response.sse`;
  const request=Buffer.from(meta.request),requestSha256=createHash("sha256").update(request).digest("hex");
  const req=openSync(join(directory,requestFile),"wx",0o600);try{let offset=0;while(offset<request.length){const n=writeSync(req,request,offset);if(n<=0)throw Error("Provider transcript write failed");offset+=n;}fsyncSync(req);}finally{closeSync(req);}
  const fd=openSync(join(directory,responseFile),"wx",0o600),hash=createHash("sha256"),startedAt=Date.now();let bytes=0;
  const index=(row:object):void=>{const p=join(directory,"index.jsonl");appendFileSync(p,JSON.stringify(row)+"\n",{mode:0o600});const f=openSync(p,"r+");try{fsyncSync(f);}finally{closeSync(f);}};
  index({kind:"request",attempt,turn:meta.turn,requestFile,responseFile,requestSha256,requestBytes:request.length,startedAt,reasoning:"provider summaries and opaque encrypted records retained as delivered"});
  return {write(chunk:Uint8Array){let offset=0;while(offset<chunk.length){const n=writeSync(fd,chunk,offset);if(n<=0)throw Error("Provider transcript write failed");offset+=n;}hash.update(chunk);bytes+=chunk.length;fsyncSync(fd);},close(result){try{fsyncSync(fd);}finally{closeSync(fd);}index({kind:"response",attempt,turn:meta.turn,responseFile,responseSha256:hash.digest("hex"),bytes,elapsedMs:Date.now()-startedAt,...result});}};
 }});
}
