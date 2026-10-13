import {mkdtempSync,readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {humanSampler, type HumanRecording} from './human.js';
import {RunRecorder} from './recorder.js';
import {RunLog} from './run-log.js';
import {FrameStore} from './frames.js';
import {parseEvent} from './events.js';
import {RUN_START_META} from '../test-support/events.js';
const state={screen:'title',started:false,name:null,location:null,map_id:null,position:null,facing:null,in_battle:false,party:[],money:null,badges:[],play_time_s:null};
const png='iVBORw0KGgo=';
const segment={id:1,start_frame:0,end_frame:6,buttons:['A','UP'],start_ms:1000,end_ms:1100,request_seq:1,session:'human-test'};
const snapshot=(extra:Record<string,unknown>={})=>({frame:6,paused:false,failed:false,last_id:1,segments:[segment],observation:{state,screenshot_base64:png},...extra});
const root=()=>mkdtempSync(join(tmpdir(),'human-recording-'));
it('records the applied journal before acknowledging it on a later snapshot, including pause clocks',async()=>{
 const urls:string[]=[];const bodies:unknown[]=[];let n=0;
 const fetcher:typeof fetch=(input,init)=>{urls.push(input instanceof Request?input.url:String(input));expect(init?.headers).toEqual({'x-human-token':'secret'});return Promise.resolve(Response.json(n++===0?snapshot():snapshot({paused:true,segments:[]})));};
 const sample=humanSampler({recordHumanInput:body=>{bodies.push(body);},recordHumanSample:(frame,paused)=>{bodies.push({frame,paused});}},'http://test','secret',fetcher);
 await sample();expect(urls).toEqual(['http://test/pokebench/human/snapshot?after=0']);
 await sample();expect(urls[1]).toContain('after=1');expect(bodies).toEqual([segment,{frame:6,paused:false},{frame:6,paused:true}]);
});
it('does not acknowledge inputs when durable sample recording fails',async()=>{
 const urls:string[]=[];let fail=true;
 const recording:HumanRecording={recordHumanInput:()=>{},recordHumanSample:()=>{if(fail)throw Error('disk full');}};
 const sample=humanSampler(recording,'http://test','secret',(input)=>{urls.push(input instanceof Request?input.url:String(input));return Promise.resolve(Response.json(snapshot()));});
 await expect(sample()).rejects.toThrow('disk full');fail=false;await sample();expect(urls.every(url=>url.endsWith('after=0'))).toBe(true);
});
it.each([
 {segments:[{...segment,buttons:['INVALID']}]},
 {segments:[{...segment,end_frame:0}]},
 {segments:[{...segment,start_ms:1200}]},
 {segments:[{...segment,id:2}]},
 {last_id:2},
 {segments:[{...segment,start_frame:1}]},
 {frame:7},
 {failed:true},
 {observation:{state,screenshot_base64:'bad'}},
 {observation:{state:{},screenshot_base64:png}},
])('fails closed for malformed journal/sample %j',async(extra)=>{
 let recorded=0;const sample=humanSampler({recordHumanInput:()=>{recorded++;},recordHumanSample:()=>{recorded++;}},'http://test','secret',()=>Promise.resolve(Response.json(snapshot(extra))));
 await expect(sample()).rejects.toThrow();expect(recorded).toBe(0);
});
it('rejects a regressing emulator frame without acknowledging it',async()=>{
 let n=0;const sample=humanSampler({recordHumanInput:()=>{},recordHumanSample:()=>{}},'http://test','secret',()=>Promise.resolve(Response.json(snapshot(n++===0?{}:{frame:5,segments:[]}))));
 await sample();await expect(sample()).rejects.toThrow('regressing');
});
it('saves replay screenshots and game-state evidence without tool or thinking events',async()=>{
 const r=root();const log=RunLog.create(r,'human-test');const recorder=new RunRecorder({log,frames:new FrameStore(r),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(state)}});
 await recorder.start({...RUN_START_META,controller:{kind:'human',name:'Operator',rom_sha1:'a'.repeat(40),input_policy:'frame-held-v1',sample_ms:100,nominal_fps:59.7275}},false);
 recorder.recordHumanInput({...segment,buttons:['A','UP']});recorder.recordHumanSample(6,false,png,state);recorder.end('operator_stop');
 const events=readFileSync(log.eventsPath,'utf8').trim().split('\n').map(parseEvent);const sample=events.find(event=>event.type==='human_sample');
 expect(sample?.type).toBe('human_sample');if(sample?.type!=='human_sample')throw Error('missing sample');
 expect(readFileSync(join(log.runDir,sample.screenshot.path)).toString('base64')).toBe(png);
 expect(events.at(-1)).toMatchObject({type:'run_end',frames:{saved:1,bytes:8}});
 expect(events.filter(event=>event.type==='state')).toHaveLength(1);expect(events.some(event=>event.type==='tool_result'||event.type==='assistant')).toBe(false);
});
it('protects other active run frames and refuses a cap overflow before writing a human frame',()=>{
 const r=root();mkdirSync(join(r,'model','frames'),{recursive:true});const model=join(r,'model','frames','000001_0.png');writeFileSync(model,Buffer.alloc(90));writeFileSync(join(r,'model','events.jsonl'),'{}\n');
 const store=new FrameStore(r,100,()=>{});store.protectActiveRuns();const log=RunLog.create(r,'human-test');
 expect(()=>store.save(log,0,0,Buffer.alloc(20).toString('base64'))).toThrow('active recordings');expect(existsSync(model)).toBe(true);expect(existsSync(join(log.runDir,'frames','000000_0.png'))).toBe(false);
});
it('records native idle milestones with the exact sampled emulator frame and state sequence',async()=>{
 const {StateMilestones}=await import('./milestones.js');const r=root();const log=RunLog.create(r,'human-test');const recorder=new RunRecorder({log,frames:new FrameStore(r),milestones:new StateMilestones({read:()=>Promise.resolve(state)}),gameState:{read:()=>Promise.resolve(state)}});
 await recorder.start(RUN_START_META,false);recorder.recordHumanSample(100,false,png,state);recorder.recordHumanSample(106,false,png,{...state,screen:'birch_speech'});
 const events=readFileSync(log.eventsPath,'utf8').trim().split('\n').map(parseEvent);const milestone=events.find(event=>event.type==='milestone'&&event.name==='NEW_GAME_CREATED');
 expect(milestone).toMatchObject({type:'milestone',emulator_frame:106,origin:'observed'});if(milestone?.type!=='milestone')throw Error('missing milestone');
 expect(events.find(event=>event.seq===milestone.evidence?.[0])).toMatchObject({type:'state',screen:'birch_speech'});
});
it('evicts completed recordings under the ordinary cap while preserving active recordings',()=>{
 const r=root();for(const [run,n] of [['completed',70],['model',20]] as const){mkdirSync(join(r,run,'frames'),{recursive:true});writeFileSync(join(r,run,'frames','000001_0.png'),Buffer.alloc(n));writeFileSync(join(r,run,'events.jsonl'),run==='completed'?'{"type":"run_end"}\n':'{}\n');}
 const store=new FrameStore(r,100,()=>{});store.protectActiveRuns();const log=RunLog.create(r,'human-test');store.save(log,0,0,Buffer.alloc(20).toString('base64'));
 expect(existsSync(join(r,'completed','frames','000001_0.png'))).toBe(false);expect(existsSync(join(r,'model','frames','000001_0.png'))).toBe(true);expect(store.usage()).toBe(40);
});
it('freezes and drains the final applied input journal before a human stop returns',async()=>{
 const {driveHuman}=await import('./human.js');const path=join(root(),'control.jsonl');writeFileSync(path,JSON.stringify({v:1,seq:1,at:new Date().toISOString(),action:'stop'})+'\n');const calls:string[]=[];const input:unknown[]=[];
 const fetcher:typeof fetch=(request)=>{const url=request instanceof Request?request.url:String(request);calls.push(url);return Promise.resolve(Response.json(url.endsWith('/pause')?{paused:true}:snapshot()));};
 const result=await driveHuman({recordControl:()=>{},checkMilestones:()=>Promise.resolve(),recordHumanInput:body=>{input.push(body);},recordHumanSample:()=>{}},'http://test',path,new AbortController().signal,fetcher,'secret');
 expect(result).toBe('operator_stop');expect(calls).toEqual(['http://test/pokebench/pause','http://test/pokebench/human/snapshot?after=0']);expect(input).toEqual([segment]);
});
it('stops the emulator when sampling fails and retains the recording failure',async()=>{
 const {driveHuman}=await import('./human.js');const calls:string[]=[];const fetcher:typeof fetch=(request)=>{const url=request instanceof Request?request.url:String(request);calls.push(url);return Promise.resolve(Response.json(url.endsWith('/pause')?{paused:true}:snapshot({failed:true})));};
 await expect(driveHuman({recordControl:()=>{},checkMilestones:()=>Promise.resolve(),recordHumanInput:()=>{},recordHumanSample:()=>{}},'http://test',join(root(),'control.jsonl'),new AbortController().signal,fetcher,'secret')).rejects.toThrow('recording stopped');expect(calls.at(-1)).toBe('http://test/pokebench/pause');
});
it('rejects an unconfirmed human freeze without recording or excluding a paused interval',async()=>{
 const {driveHuman}=await import('./human.js');const path=join(root(),'control.jsonl');writeFileSync(path,JSON.stringify({v:1,seq:1,at:new Date().toISOString(),action:'pause'})+'\n');const recorded:unknown[]=[];let samples=0;
 const started=Date.now();await expect(driveHuman({recordControl:body=>{recorded.push(body);},checkMilestones:()=>{samples++;return Promise.resolve();}},'http://test',path,new AbortController().signal,()=>Promise.resolve(new Response('unavailable',{status:503})))).rejects.toThrow('HTTP 503');
 expect(Date.now()-started).toBeLessThan(1000);expect(samples).toBe(0);
 expect(recorded).toEqual([{action:'pause',status:'pending',request:1},{action:'pause',status:'failed',request:1}]);
});
it('writes terminal crash for a rejected freeze with no applied pause receipt',async()=>{
 const {driveHuman,humanPlan}=await import('./human.js');const {withRun}=await import('./run.js');
 const r=root();const plan={...humanPlan(r,'human-test',8040,'a'.repeat(40)),harnessFeatures:[]};
 const host={serverHealthy:()=>Promise.resolve(false),launchServer:(dir:string)=>{writeFileSync(join(dir,'control.jsonl'),JSON.stringify({v:1,seq:1,at:new Date().toISOString(),action:'pause'})+'\n');return Promise.resolve({serverDir:join(dir,'server'),stop:()=>Promise.resolve()});},harness:()=>({commit:'a'.repeat(40),dirty:false}),vendorPin:()=> 'b'.repeat(40),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(state)}};
 await expect(withRun(plan,host,new FrameStore(r),recorder=>driveHuman(recorder,'http://test',join(r,'human-test','control.jsonl'),new AbortController().signal,()=>Promise.resolve(new Response('unavailable',{status:503})),'secret'))).rejects.toThrow('HTTP 503');
 const events=readFileSync(join(r,'human-test','events.jsonl'),'utf8').trim().split('\n').map(parseEvent);
 expect(events.at(-1)).toMatchObject({type:'run_end',reason:'crash'});expect(events.filter(event=>event.type==='operator_control'&&event.action==='pause')).toMatchObject([{status:'pending'},{status:'failed'}]);
});
it('keeps L/R human-only without expanding model or probe action schemas',async()=>{
 const {Value}=await import('typebox/value');const {pressTool}=await import('./game-tools.js');const {parseProbeCommand}=await import('./probe.js');const {BUTTONS,HUMAN_BUTTONS}=await import('./events.js');
 const tool=pressTool('http://test',{beforePress:()=>{},afterPress:()=>Promise.resolve()});
 expect(BUTTONS).toHaveLength(8);expect(HUMAN_BUTTONS).toHaveLength(10);
 expect(Value.Check(tool.parameters,{buttons:['A','UP']})).toBe(true);
 for(const button of ['L','R']){expect(Value.Check(tool.parameters,{buttons:[button]})).toBe(false);expect(()=>parseProbeCommand(JSON.stringify({action:'press',buttons:[button]}))).toThrow();}
 const sample=humanSampler({recordHumanInput:body=>{expect(body.buttons).toEqual(['L','R']);},recordHumanSample:()=>{}},'http://test','secret',()=>Promise.resolve(Response.json(snapshot({segments:[{...segment,buttons:['L','R']}]}))));
 await sample();
 expect(parseEvent(JSON.stringify({v:1,run:'human-test',seq:1,t:'2026-10-13T14:00:00.000-04:00',turn:0,type:'human_input',...segment,buttons:['L','R']}))).toMatchObject({type:'human_input',buttons:['L','R']});
});
it('keeps nested human frames invisible to a legacy model writer using the base root',()=>{
 const r=root();const humanRoot=join(r,'human');mkdirSync(join(humanRoot,'human-run','frames'),{recursive:true});const humanFrame=join(humanRoot,'human-run','frames','000001_0.png');writeFileSync(humanFrame,Buffer.alloc(90));writeFileSync(join(humanRoot,'human-run','events.jsonl'),'{"type":"run_start"}\n');
 mkdirSync(join(r,'completed-model','frames'),{recursive:true});writeFileSync(join(r,'completed-model','frames','000001_0.png'),Buffer.alloc(90));
 const legacyModelWriter=new FrameStore(r,100,()=>{});const log=RunLog.create(r,'model-new');legacyModelWriter.save(log,0,0,Buffer.alloc(20).toString('base64'));
 expect(readFileSync(humanFrame)).toHaveLength(90);expect(legacyModelWriter.usage()).toBe(20);expect(new FrameStore(humanRoot,100,()=>{}).usage()).toBe(90);
});
