import type {Model} from "@mariozechner/pi-ai";

export const CODEX_BASE_URL="https://chatgpt.com/backend-api";
export const CODEX_RESPONSES_URL=`${CODEX_BASE_URL}/codex/responses`;
function object(value:unknown):Record<string,unknown>{if(typeof value!=="object"||value===null||Array.isArray(value))throw Error("Invalid Codex provider configuration");return value as Record<string,unknown>;}
export function directCodexModel(cache:unknown,id:string,maxTokens:number,enabled:boolean):Model<"openai-codex-responses">{
 if(!enabled)throw Error("Enable direct-codex-provider-v1 in the run preset before selecting this provider");
 const models=object(cache)["models"];if(!Array.isArray(models))throw Error("Invalid Codex model catalog");
 const matches=models.map(object).filter(m=>m["slug"]===id);if(matches.length!==1)throw Error(`Model ${id} is not listed uniquely in the Codex catalog`);
 const raw=matches[0];if(!raw)throw Error("Missing Codex model");
 const window=raw["context_window"],percent=raw["effective_context_window_percent"],modalities=raw["input_modalities"];
 if(typeof window!=="number"||!Number.isSafeInteger(window)||window<1||typeof percent!=="number"||percent<=0||percent>100)throw Error("Invalid Codex model context metadata");
 const contextWindow=Math.floor(window*percent/100);
 if(!Number.isSafeInteger(maxTokens)||maxTokens<1||maxTokens>=contextWindow)throw Error("Invalid Codex output token budget");
 if(!Array.isArray(modalities)||!modalities.includes("image")||!modalities.includes("text"))throw Error("Codex model must support text and image input");
 return {id,name:id,api:"openai-codex-responses",provider:"openai-codex",baseUrl:CODEX_BASE_URL,reasoning:true,input:["text","image"],contextWindow,maxTokens,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}};
}
export function codexAccessToken(auth:unknown,now:number):string{
 let token:string,expires:number;
 try{const value=object(object(auth)["tokens"])["access_token"];if(typeof value!=="string")throw Error();token=value;if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))throw Error();const encoded=token.split(".")[1];if(!encoded)throw Error();const payload=object(JSON.parse(Buffer.from(encoded,"base64url").toString("utf8")) as unknown);if(typeof payload["exp"]!=="number")throw Error();expires=payload["exp"]*1000;}catch{throw Error("Invalid Codex credentials; sign in with Codex before running");}
 if(expires<=now+60000)throw Error("Codex credentials expired or expire within one minute; refresh the Codex login");
 return token;
}
export interface CodexProviderConfig {readonly authFile:string;readonly modelsFile:string;readonly maxTokens:number}
export function parseCodexProviderConfig(value:unknown):CodexProviderConfig{
 const raw=object(value),authFile=raw["auth_file"],modelsFile=raw["models_file"],maxTokens=raw["max_tokens"];
 if(typeof authFile!=="string"||!authFile.startsWith("/")||typeof modelsFile!=="string"||!modelsFile.startsWith("/")||typeof maxTokens!=="number"||!Number.isSafeInteger(maxTokens)||maxTokens<1)throw Error("Codex provider file requires absolute auth_file/models_file paths and positive max_tokens");
 return {authFile,modelsFile,maxTokens};
}
export function directCodexOptions(payload:unknown):Record<string,unknown>{
 const raw=object(payload),rest={...raw};
 delete rest["chat_template_kwargs"];
 return {...rest,store:false,stream:true,...(raw["reasoning"]===undefined?{}:{reasoning:{...object(raw["reasoning"]),summary:"detailed"}})};
}
export interface TranscriptSink {write(bytes:Uint8Array):void;close(result:{readonly complete:boolean;readonly status:number|null}):void}
export interface TranscriptPorts {readonly url:string;readonly turn:()=>number;readonly open:(meta:{readonly turn:number;readonly request:string})=>TranscriptSink}
/** Passive byte capture: no model calls, queues, polling, message edits or extra tool turns. */
export function providerTranscriptFetch(base:typeof fetch,ports:TranscriptPorts):typeof fetch{
 return async(input,init)=>{
  const url=input instanceof Request?input.url:String(input),method=init?.method??(input instanceof Request?input.method:"GET");
  if(url!==ports.url||method!=="POST")return base(input,init);
  if(typeof init?.body!=="string")throw Error("Direct provider capture requires the exact serialized request body");
  const sink=ports.open({turn:ports.turn(),request:init.body});let status:number|null=null,closed=false,cancelled=false;let pendingPull:Promise<void>|null=null;
  const close=(complete:boolean):void=>{if(!closed){closed=true;sink.close({complete,status});}};
  try{
   const response=await base(input,init);status=response.status;
   if(!response.body){close(true);return response;}
   const reader=response.body.getReader();
   const body=new ReadableStream<Uint8Array>({
    pull(controller){
     const task=(async()=>{try{const next=await reader.read();if(next.done){close(true);if(!cancelled)controller.close();}else{sink.write(next.value);if(!cancelled)controller.enqueue(next.value);}}catch(error){try{await reader.cancel(error);}catch{/* Preserve the original capture failure. */}close(false);if(!cancelled)controller.error(error);}})();
     pendingPull=task;return task.finally(()=>{if(pendingPull===task)pendingPull=null;});
    },
    async cancel(reason){
     // pi stops at response.completed and cancels its parser. Preserve the remaining
     // upstream bytes through EOF; only an actual request abort cancels the source.
     cancelled=true;
     try{
      if(pendingPull!==null)await pendingPull;
      if(closed)return;
      if(init.signal?.aborted){await reader.cancel(reason);close(false);return;}
      for(;;){const next=await reader.read();if(next.done){close(true);return;}sink.write(next.value);}
     }catch(error){close(false);throw error;}
    },
   });
   return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
  }catch(error){close(false);throw error;}
 };
}
