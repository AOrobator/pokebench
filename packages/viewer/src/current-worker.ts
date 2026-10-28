import {parentPort,workerData} from "node:worker_threads";
import {createCurrentReader,CurrentReadError} from "./current-read.js";
import {parseCurrentQuery,parseCurrentAnswer} from "./current-public.js";
const object=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null&&!Array.isArray(v);
export function startCurrentWorker():void{
 const port=parentPort,data:unknown=workerData;if(port===null||!object(data)||typeof data["runsRoot"]!=="string"||typeof data["database"]!=="string"||typeof data["audit"]!=="boolean")throw new Error("Invalid current worker configuration");
 let request=0;const reader=createCurrentReader({runsRoot:data["runsRoot"],database:data["database"],...(data["audit"]?{read:(record:unknown)=>{port.postMessage({kind:"source-read",id:request,record});}}:{})});
 port.on("message",(value:unknown)=>{
  if(!object(value)||!Number.isSafeInteger(value["id"])||Number(value["id"])<1){port.close();return;}request=Number(value["id"]);
  try{
   const answer=parseCurrentAnswer(reader.read(parseCurrentQuery(value["query"])));
   if(Buffer.byteLength(JSON.stringify(answer))>8*1024*1024)throw new CurrentReadError(413,"Current reply exceeds its byte limit");port.postMessage({id:request,answer});
  }catch(error){port.postMessage({id:request,status:error instanceof CurrentReadError?error.status:400,failure:error instanceof CurrentReadError?error.message:"Invalid current query or response"});}
 });
 port.on("close",()=>{reader.close();});
}
if(parentPort!==null)startCurrentWorker();
