import {describe,it,expect,vi} from "vitest";
import {loadConfig} from "./config.js";
import {directCodexModel,codexAccessToken,directCodexOptions,providerTranscriptFetch} from "./direct-codex.js";
const cache={models:[{slug:"fixture-model",context_window:10000,effective_context_window_percent:95,input_modalities:["text","image"]}]};
describe("direct Codex provider",()=>{
 it("selects the native API from discovered metadata only when explicitly enabled",()=>{
  expect(loadConfig({POKEBENCH_CODEX_PROVIDER_FILE:"/owned/provider.json"}).endpoint).toEqual({kind:"codex",path:"/owned/provider.json"});
  expect(()=>directCodexModel(cache,"fixture-model",1000,false)).toThrow("direct-codex-provider-v1");
  expect(directCodexModel(cache,"fixture-model",1000,true)).toMatchObject({id:"fixture-model",api:"openai-codex-responses",contextWindow:9500,maxTokens:1000,input:["text","image"]});
  expect(()=>directCodexModel(cache,"missing",1000,true)).toThrow("not listed");
 });
 it("rejects malformed metadata and refuses to infer vision or token limits",()=>{
  expect(()=>directCodexModel({},"fixture-model",1000,true)).toThrow();
  expect(()=>directCodexModel(cache,"fixture-model",0,true)).toThrow();
  expect(()=>directCodexModel(cache,"fixture-model",10000,true)).toThrow();
  expect(()=>directCodexModel({models:[{...cache.models[0],input_modalities:["text"]}]},"fixture-model",1000,true)).toThrow("image");
 });
 it("reads only a valid unexpired ChatGPT access token without disclosing credentials",()=>{
  const token=`header.${btoa(JSON.stringify({exp:1000}))}.signature`;
  expect(codexAccessToken({tokens:{access_token:token}},0)).toBe(token);
  expect(()=>codexAccessToken({tokens:{access_token:token}},1000000)).toThrow("expired");
  expect(()=>codexAccessToken({tokens:{access_token:"secret-not-a-token"}},0)).toThrow("Invalid Codex credentials");
 });
 it("requests native reasoning summaries without chat-template fields or a second model loop",()=>{
  const p=directCodexOptions({model:"fixture-model",reasoning:{effort:"medium"},input:[],chat_template_kwargs:{x:1}});
  expect(p).toMatchObject({reasoning:{effort:"medium",summary:"detailed"},store:false,stream:true});
  expect(p).not.toHaveProperty("chat_template_kwargs");
 });
 it("records full request and raw stream before delivering bytes, with turn identity and no auth headers",async()=>{
  const writes:string[]=[],finished:unknown[]=[],opened:unknown[]=[];
  const raw='data: {"type":"response.reasoning_summary_text.delta","delta":"test reasoning"}\n\ndata: {"type":"response.output_item.done","item":{"encrypted_content":"opaque"}}\n\n';
  const base=vi.fn(async()=>new Response(raw,{headers:{"content-type":"text/event-stream"}}));
  const f=providerTranscriptFetch(base,{url:"https://fixture/responses",turn:()=>7,open:meta=>{opened.push(meta);return {write:bytes=>writes.push(new TextDecoder().decode(bytes)),close:status=>finished.push(status)};}});
  const response=await f("https://fixture/responses",{method:"POST",headers:{authorization:"Bearer secret"},body:'{"input":["exact observation"]}'});
  expect(await response.text()).toBe(raw);expect(writes.join("")).toBe(raw);
  expect(opened).toEqual([{turn:7,request:'{"input":["exact observation"]}'}]);
  expect(finished).toEqual([{complete:true,status:200}]);expect(base).toHaveBeenCalledTimes(1);
 });
 it("fails before sending when request capture fails, and reports interrupted response capture",async()=>{
  const base=vi.fn(async()=>new Response("bytes"));
  const broken=providerTranscriptFetch(base,{url:"https://fixture/responses",turn:()=>1,open:()=>{throw Error("archive failed");}});
  await expect(broken("https://fixture/responses",{method:"POST",body:"{}"})).rejects.toThrow("archive failed");expect(base).not.toHaveBeenCalled();
  const close=vi.fn();const f=providerTranscriptFetch(base,{url:"https://fixture/responses",turn:()=>1,open:()=>({write:()=>{throw Error("disk failed");},close})});
  await expect((await f("https://fixture/responses",{method:"POST",body:"{}"})).text()).rejects.toThrow("disk failed");expect(close).toHaveBeenCalledWith({complete:false,status:200});
 });
});
