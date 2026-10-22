import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { humanPlan, humanLease, humanPlayUrl, viewerRunUrl } from './human.js';
import { withRun, type RunHost } from './run.js';
import { FrameStore } from './frames.js';
import { parseEvent } from './events.js';
const root = () => mkdtempSync(join(tmpdir(), 'human-'));
it('records explicit human identity and exact measurement policy without model tools', () => {
 const plan = humanPlan(root(), 'human-test', 8040, 'a'.repeat(40));
 expect(plan.controller).toEqual({kind:'human',name:'Operator',rom_sha1:'a'.repeat(40),input_policy:'frame-held-v1',sample_ms:100,screenshot_ms:500,nominal_fps:59.7275});
 expect(plan.tools).toEqual([]); expect(plan.model.max_tokens).toBe(0); expect(plan.harnessFeatures).not.toContain('probe');
});
it('takes the human lease exclusively and cleans up only its own acquisition', () => {
 const r=root(); const release=humanLease(r,'human-test');
 expect(()=>humanLease(r,'other')).toThrow();
 expect(JSON.parse(readFileSync(join(r,'.human-gameplay.lock','owner.json'),'utf8'))).toMatchObject({run:'human-test'});
 release(); release(); expect(existsSync(join(r,'.human-gameplay.lock'))).toBe(false);
});
it('preserves a terminal crash receipt when human server launch fails', async () => {
 const r=root(); const plan=humanPlan(r,'human-test',8040,'a'.repeat(40));
 const host:RunHost={ serverHealthy:()=>Promise.resolve(false),launchServer:()=>Promise.reject(Error('failed launch')),harness:()=>({commit:'a'.repeat(40),dirty:false}),vendorPin:()=> 'b'.repeat(40),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.reject(Error('not started'))}};
 await expect(withRun(plan,host,new FrameStore(r),()=> Promise.resolve("operator_stop"))).rejects.toThrow('failed launch');
 const events=readFileSync(join(r,'human-test','events.jsonl'),'utf8').trim().split('\n').map(parseEvent);
 expect(events[0]).toMatchObject({type:'run_start',controller:{kind:'human'}});
 expect(events.at(-1)).toMatchObject({type:'run_end',reason:'crash'});
});
it('samples idle human play but stops before sampling after a terminal boundary', async()=>{
 const {humanLoop}=await import('./human.js');let samples=0,boundaries=0,waits=0;let stopped=false;
 await humanLoop({stopped:()=>stopped,sample:()=>{samples++;return Promise.resolve();},boundary:()=>{boundaries++;if(boundaries===3)stopped=true;return Promise.resolve();},wait:()=>{waits++;return Promise.resolve();}});
 expect([samples,boundaries,waits]).toEqual([2,3,2]);
 await humanLoop({stopped:()=>true,sample:()=>Promise.reject(Error("unexpected")),boundary:()=>Promise.resolve(),wait:()=>Promise.resolve()});
});

it('finishes on the recorded stop request without making another observation',async()=>{
 const {driveHuman}=await import('./human.js');const path=join(root(),'control.jsonl');
 writeFileSync(path,JSON.stringify({v:1,seq:1,at:new Date().toISOString(),action:'stop'})+'\n');
 const recorded:unknown[]=[];let samples=0;
 expect(await driveHuman({recordControl:body=>{recorded.push(body);},checkMilestones:()=>{samples++;return Promise.resolve();}},'http://127.0.0.1:8040',path,new AbortController().signal)).toBe('operator_stop');
 expect(samples).toBe(0);expect(recorded).toContainEqual({action:'stop',status:'applied',request:1});
});
it('handles abort and rejects malformed control records without hanging',async()=>{
 const {driveHuman}=await import('./human.js');const recorder={recordControl:()=>{},checkMilestones:()=>Promise.resolve()};const path=join(root(),'control.jsonl');
 const aborted=new AbortController();aborted.abort();expect(await driveHuman(recorder,'http://127.0.0.1:8040',path,aborted.signal)).toBe('operator_abort');
 writeFileSync(path,'bad\n');await expect(driveHuman(recorder,'http://127.0.0.1:8040',path,new AbortController().signal)).rejects.toThrow('invalid control');
});

it('forces the final human screenshot through the sampler after freezing on Finish',async()=>{
 const {driveHuman}=await import('./human.js');const path=join(root(),'control.jsonl');writeFileSync(path,JSON.stringify({v:1,seq:1,at:new Date().toISOString(),action:'stop'})+'\n');const recorded:unknown[]=[];
 const state={screen:'title',started:false,name:null,location:null,map_id:null,position:null,facing:null,in_battle:false,party:[],money:null,badges:[],play_time_s:null};
 const fetcher:typeof fetch=(request)=>Promise.resolve(Response.json((request instanceof Request?request.url:typeof request==='string'?request:request.href).endsWith('/pause')?{paused:true}:{frame:0,paused:true,failed:false,last_id:0,segments:[],observation:{state,screenshot_base64:'iVBORw0KGgo='}}));
 const recording={recordControl:()=>{},checkMilestones:()=>Promise.resolve(),recordHumanInput:()=>{},recordHumanSample:(...args:unknown[])=>{recorded.push(args);}};
 expect(await driveHuman(recording,'http://test',path,new AbortController().signal,fetcher,'secret')).toBe('operator_stop');
 expect(recorded).toEqual([[0,true,'iVBORw0KGgo=',state,true]]);
});

it('binds a restart launch to its assigned fresh human id without sampling a new suffix',async()=>{
 const {humanRunId}=await import('./human.js');let randomCalls=0;const random=()=>{randomCalls++;return 'abcd';};
 expect(humanRunId('human-assigned',new Date('2026-10-13T23:00:00Z'),random)).toBe('human-assigned');expect(randomCalls).toBe(0);
 expect(humanRunId(undefined,new Date('2026-10-13T23:00:00Z'),random)).toMatch(/_human_abcd$/);expect(randomCalls).toBe(1);
 for(const id of ['', '../escape', 'a'.repeat(129)])expect(()=>humanRunId(id,new Date(),random)).toThrow('invalid human run id');
});

it('retains the exact native final state and verifies its hash before any write',async()=>{
 const {saveHumanCheckpoint}=await import('./human.js');const {createHash}=await import('node:crypto');
 const dir=root(),data=Buffer.from('native state');
 const hash=createHash('sha256').update(data).digest('hex');
 const fetcher:typeof fetch=()=>Promise.resolve(Response.json({frame:42,sha256:hash,state_base64:data.toString('base64')}));
 await saveHumanCheckpoint('http://game','secret',dir,fetcher);
 expect(readFileSync(join(dir,'final.state'))).toEqual(data);
 expect(JSON.parse(readFileSync(join(dir,'final-state.json'),'utf8'))).toMatchObject({frame:42,sha256:hash,bytes:data.length,path:'final.state'});
 await expect(saveHumanCheckpoint('http://game','secret',root(),()=>Promise.resolve(Response.json({frame:42,sha256:'wrong',state_base64:data.toString('base64')})))).rejects.toThrow('integrity');
 await expect(saveHumanCheckpoint('http://game','secret',root(),()=>Promise.resolve(Response.json({frame:42})))).rejects.toThrow('Invalid');
 await expect(saveHumanCheckpoint('http://game','secret',root(),()=>Promise.resolve(new Response('',{status:503})))).rejects.toThrow('503');
});

it('links human play and probe runs to the viewer on 8790, not the pages server', () => {
  expect(humanPlayUrl('2026-10-22T12-35-14_human_f8d7')).toBe('http://127.0.0.1:8790/play?run=2026-10-22T12-35-14_human_f8d7#run=2026-10-22T12-35-14_human_f8d7');
  expect(viewerRunUrl('probe a&b')).toBe('http://127.0.0.1:8790/#run=probe%20a%26b');
});
