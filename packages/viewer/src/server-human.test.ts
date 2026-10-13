import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,expect,it} from 'vitest';
import {Log,START} from '../test-support/events.js';
import {startViewer,type Viewer} from './server.js';
const viewers:Viewer[]=[];afterEach(async()=>{for(const v of viewers.splice(0))await v.close();});
async function fixture(fetchFn:typeof fetch,kind:'human'|'model'='human',ended=false){
 const r=mkdtempSync(join(tmpdir(),'server-human-'));mkdirSync(join(r,'human'));
 const log=new Log();log.add(0,{...START,...(kind==='human'?{controller:{kind:'human',name:'Operator',rom_sha1:'a'.repeat(40),input_policy:'frame-held-v1',sample_ms:100,nominal_fps:59.7275}}:{})});
 if(ended)log.add(1000,{type:'run_end',turn:0,reason:'operator_stop',furthest_milestone:null,turns:0,wall_ms:1000,tokens:{input:0,output:0},frames:{saved:0,bytes:0}});
 writeFileSync(join(r,'human','events.jsonl'),log.events.map(e=>JSON.stringify({...e,run:'human'})).join('\n')+'\n');writeFileSync(join(r,'human','human-token'),'secret');
 const viewer=await startViewer({runsRoot:r,staticDir:join(import.meta.dirname,'../static'),appDir:join(import.meta.dirname,'../dist'),port:0,fetchFn});viewers.push(viewer);return viewer;
}
async function post(v:Viewer,op:string,body:unknown,origin=v.url.slice(0,-1)){
 return fetch(`${v.url}api/runs/human/human/${op}`,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
}
it('serves a separate minimal Play page, human modules and typed input proxy without exposing credentials',async()=>{
 const inputs:unknown[]=[];
 const v=await fixture((input,init)=>{inputs.push({url:input instanceof Request?input.url:typeof input==="string"?input:input.href,headers:init?.headers,body:init?.body});return Promise.resolve(Response.json({accepted:true}));});
 const page=await (await fetch(`${v.url}play`)).text();expect(page).toContain('data-play="surface"');expect(page).not.toContain('next-model');expect(page).not.toContain('<details');
 expect((await fetch(`${v.url}human.css`)).status).toBe(200);
 expect((await fetch(`${v.url}app/human-play.js`)).status).toBe(200);
 expect((await fetch(`${v.url}app/agent-spectator.js`)).status).toBe(200);
 const start=await(await fetch(`${v.url}api/runs/human/start`)).json() as unknown;expect(start).toMatchObject({controller:{kind:'human'}});
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
 expect((await fetch(`${v.url}api/runs/human/audio.wav`)).status).toBe(409);
});
it('proxies bounded human audio and preserves follower cursors',async()=>{
 const v=await fixture(()=>Promise.resolve(new Response(Buffer.alloc(48),{headers:{'X-Audio-Next':'1','X-Audio-Skipped':'0','X-Audio-Epoch':'2'}})));
 const response=await fetch(`${v.url}api/runs/human/audio.wav?since=-1&max_frames=12000`);expect(response.status).toBe(200);expect(response.headers.get('X-Audio-Next')).toBe('1');expect(response.headers.get('X-Audio-Epoch')).toBe('2');expect((await response.arrayBuffer()).byteLength).toBe(48);
 for(const q of ['since=-2','max_frames=12001','max_frames=0','since=hello'])expect((await fetch(`${v.url}api/runs/human/audio.wav?${q}`)).status).toBe(400);
});
it.each([502,200])('surfaces failed or invalid upstream audio status %s',async(status)=>{
 const v=await fixture(()=>Promise.resolve(new Response('',{status})));
 expect((await fetch(`${v.url}api/runs/human/audio.wav`)).status).toBe(502);
});

it('does not claim successful input for an invalid upstream acknowledgment',async()=>{
 const v=await fixture(()=>Promise.resolve(Response.json({accepted:false})));
 expect((await post(v,'claim',{session:'session-one'})).status).toBe(502);
});
