import {existsSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,expect,it} from 'vitest';
import {Log,START} from '../test-support/events.js';
import {startViewer,type Viewer} from './server.js';
const RUN='human-test';
const viewers:Viewer[]=[];afterEach(async()=>{for(const v of viewers.splice(0))await v.close();});
async function fixture(fetchFn:typeof fetch,kind:'human'|'model'='human',ended=false){
 const r=mkdtempSync(join(tmpdir(),'server-human-'));const dir=kind==='human'?join(r,'human',RUN):join(r,RUN);mkdirSync(dir,{recursive:true});
 const log=new Log();log.add(0,{...START,...(kind==='human'?{controller:{kind:'human',name:'Operator',rom_sha1:'a'.repeat(40),input_policy:'frame-held-v1',sample_ms:100,nominal_fps:59.7275}}:{})});
 if(ended)log.add(1000,{type:'run_end',turn:0,reason:'operator_stop',furthest_milestone:null,turns:0,wall_ms:1000,tokens:{input:0,output:0},frames:{saved:0,bytes:0}});
 writeFileSync(join(dir,'events.jsonl'),log.events.map(e=>JSON.stringify({...e,run:RUN})).join('\n')+'\n');writeFileSync(join(dir,'human-token'),'secret');
 const viewer=await startViewer({runsRoot:r,staticDir:join(import.meta.dirname,'../static'),appDir:join(import.meta.dirname,'../dist'),port:0,fetchFn});viewers.push(viewer);return Object.assign(viewer,{runsRoot:r,runDir:dir});
}
async function post(v:Viewer,op:string,body:unknown,origin=v.url.slice(0,-1)){
 return fetch(`${v.url}api/runs/${RUN}/human/${op}`,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
}
it('serves a separate minimal Play page, human modules and typed input proxy without exposing credentials',async()=>{
 const inputs:unknown[]=[];
 const v=await fixture((input,init)=>{inputs.push({url:input instanceof Request?input.url:typeof input==="string"?input:input.href,headers:init?.headers,body:init?.body});return Promise.resolve(Response.json({accepted:true}));});
 const page=await (await fetch(`${v.url}play`)).text();expect(page).toContain('data-play="surface"');expect(page).not.toContain('next-model');expect(page).not.toContain('<details');
 expect((await fetch(`${v.url}human.css`)).status).toBe(200);
 expect((await fetch(`${v.url}app/human-play.js`)).status).toBe(200);
 expect((await fetch(`${v.url}app/agent-spectator.js`)).status).toBe(200);
 const start=await(await fetch(`${v.url}api/runs/${RUN}/start`)).json() as unknown;expect(start).toMatchObject({controller:{kind:'human'}});
 const claim=await post(v,'claim',{session:'session-one'});expect(claim.status).toBe(200);expect(await claim.json()).toEqual({accepted:true});
 expect((await post(v,'input',{session:'session-one',seq:1,buttons:['A','UP']})).status).toBe(200);
 expect((await post(v,'input',{session:'session-one',seq:2,buttons:[],release:true})).status).toBe(200);
 expect(inputs[0]).toMatchObject({url:'http://127.0.0.1:8011/pokebench/human/claim',headers:{'x-human-token':'secret'}});
 expect(page).not.toContain('secret');
 expect((await post(v,'input',{session:'session-one',seq:3,buttons:['NO']})).status).toBe(400);
 expect((await post(v,'claim',{session:'session-one'},'http://evil.example')).status).toBe(403);
});
it.each([['model',false],['human',true]] as const)('rejects controls for %s ended=%s',async(kind,ended)=>{
 const v=await fixture(()=>Promise.reject(Error('must not proxy')),kind,ended);
 expect((await post(v,'claim',{session:'session-one'})).status).toBe(409);
 expect((await fetch(`${v.url}api/runs/${RUN}/audio.wav`)).status).toBe(409);
});
it('proxies bounded human audio and preserves follower cursors',async()=>{
 const v=await fixture(()=>Promise.resolve(new Response(Buffer.alloc(48),{headers:{'X-Audio-Next':'1','X-Audio-Skipped':'0','X-Audio-Epoch':'2'}})));
 const response=await fetch(`${v.url}api/runs/${RUN}/audio.wav?since=-1&max_frames=12000`);expect(response.status).toBe(200);expect(response.headers.get('X-Audio-Next')).toBe('1');expect(response.headers.get('X-Audio-Epoch')).toBe('2');expect((await response.arrayBuffer()).byteLength).toBe(48);
 for(const q of ['since=-2','max_frames=12001','max_frames=0','since=hello'])expect((await fetch(`${v.url}api/runs/${RUN}/audio.wav?${q}`)).status).toBe(400);
});
it.each([502,200])('surfaces failed or invalid upstream audio status %s',async(status)=>{
 const v=await fixture(()=>Promise.resolve(new Response('',{status})));
 expect((await fetch(`${v.url}api/runs/${RUN}/audio.wav`)).status).toBe(502);
});

it('does not claim successful input for an invalid upstream acknowledgment',async()=>{
 const v=await fixture(()=>Promise.resolve(Response.json({accepted:false})));
 expect((await post(v,'claim',{session:'session-one'})).status).toBe(502);
});

it('writes all human controls through the nested launch layout and the driver consumes them',async()=>{
 const v=await fixture(()=>Promise.resolve(Response.json({ok:true})));
 for(const [index,action] of ['pause','resume','stop'].entries()){
  const response=await fetch(`${v.url}api/runs/${RUN}/control`,{method:'POST',headers:{'content-type':'application/json',origin:v.url.slice(0,-1)},body:JSON.stringify({action})});
  expect({status:response.status,body:await response.json()}).toEqual({status:200,body:{request:index+1}});
 }
 const path=join(v.runDir,'control.jsonl');
 expect(readFileSync(path,'utf8').trim().split('\n').map(line=>JSON.parse(line) as unknown)).toMatchObject([{seq:1,action:'pause'},{seq:2,action:'resume'},{seq:3,action:'stop'}]);
 expect(existsSync(join(v.runsRoot,RUN,'control.jsonl'))).toBe(false);
 const {driveHuman}=await import('../../agent/src/human.js');const receipts:unknown[]=[];
 expect(await driveHuman({recordControl:body=>{receipts.push(body);},checkMilestones:()=>Promise.resolve()},'http://test',path,new AbortController().signal,()=>Promise.resolve(Response.json({paused:false})))).toBe('operator_stop');
 expect(receipts).toMatchObject([{action:'pause',status:'pending',request:1},{action:'resume',status:'applied',request:2},{action:'stop',status:'pending',request:3},{action:'stop',status:'applied',request:3}]);
});
