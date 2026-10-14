import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import type {AddressInfo} from 'node:net';
import {expect,it} from 'vitest';
import {Type} from 'typebox';
import {Value} from 'typebox/value';
import {StateBodySchema} from './events.js';
import {observeTool} from './game-tools.js';
import {Governor,piLoop,play} from './harness.js';
import {discoverModels,selectModel} from './gateway.js';
import {gatewayLoopConfig} from './provider.js';

const Observation=Type.Object({state:StateBodySchema,state_text:Type.String(),screenshot_base64:Type.String()});
const Fixture=Type.Object({on:Observation,off:Observation,rom_sha1:Type.String(),source_revision:Type.String()});
it('native information switch reaches the pinned model HTTP seam while raw measurements remain identical',async()=>{
 const raw:unknown=JSON.parse(readFileSync(new URL('../test-support/information-ablation-native.json',import.meta.url),'utf8'));
 if(!Value.Check(Fixture,raw))throw Error('Native fixture no longer meets the observation contract');
 expect(raw.on.state).toEqual(raw.off.state);expect(raw.on.screenshot_base64).toBe(raw.off.screenshot_base64);
 expect(raw.rom_sha1).toBe('f3ae088181bf583e55daf962a92bb46f4f1d07b7');
 const requests:unknown[]=[];
 const server=createServer((req,res)=>{
  if(req.url==='/v1/models'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[{id:'information-fixture',context_window:65536,max_tokens:4096}]}));return;}
  let body='';req.setEncoding('utf8');req.on('data',(part:string)=>{body+=part;});req.on('end',()=>{
   requests.push(JSON.parse(body) as unknown);res.writeHead(200,{'content-type':'text/event-stream'});
   const delta={role:'assistant',tool_calls:[{index:0,id:`observe-${String(requests.length)}`,type:'function',function:{name:'observe',arguments:'{}'}}]};
   for(const [value,finish] of [[delta,null],[{},'tool_calls']] as const)res.write(`data: ${JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:0,model:'information-fixture',choices:[{index:0,delta:value,finish_reason:finish}]})}\n\n`);
   res.end('data: [DONE]\n\n');
  });
 });
 await new Promise<void>(resolve=>{server.listen(0,'127.0.0.1',resolve);});
 try{
  const {port}=server.address() as AddressInfo;const gatewayUrl=`http://127.0.0.1:${String(port)}/v1`;
  const model=selectModel(await discoverModels({gatewayUrl,visionModels:['information-fixture']}),'information-fixture');
  for(const mode of ['on','off'] as const){
   requests.length=0;const signal=new AbortController();const governor=new Governor({limits:{maxTurns:2,maxWallMs:10000,failureLimit:3},retry:()=>{},abort:()=>{signal.abort();},now:()=>0});
   const tool=observeTool('http://fixture',()=>Promise.resolve(Response.json(raw[mode])));
   const loop=piLoop({systemPrompt:'Observe the game.',tools:[tool],base:gatewayLoopConfig(model,'off'),governor,signal:signal.signal,transformContext:messages=>Promise.resolve(messages),emit:()=>{}});
   expect(await play({role:'user',content:'Observe',timestamp:0},governor,loop)).toBe('budget');
   expect(requests).toHaveLength(2);
   const delivered=JSON.stringify(requests[1]);
   if(mode==='on')expect(delivered).toContain('selected OPTIONS');else{expect(delivered).not.toContain('selected OPTIONS');expect(delivered).toContain('detailed controls unprovided');}
   expect(delivered).toContain(raw[mode].screenshot_base64);
   // Corrected rich state remains tool details for the recorder, never silently
   // copied into the provider's text and defeating the approved ablation.
   expect(delivered).not.toContain('berry_trees');
   expect(delivered).not.toContain('decode_mode');
  }
 }finally{await new Promise<void>((resolve,reject)=>{server.close(error=>{if(error)reject(error);else resolve();});});}
});
