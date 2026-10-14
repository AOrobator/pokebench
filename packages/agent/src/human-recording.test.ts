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
it('keeps RAM and milestones on every poll while screenshots follow a 500ms grid with a forced final shot',async()=>{
 const {StateMilestones}=await import('./milestones.js');const r=root();const log=RunLog.create(r,'human-cadence');let clock=0;
 const recorder=new RunRecorder({log,frames:new FrameStore(r),milestones:new StateMilestones({read:()=>Promise.resolve(state)}),gameState:{read:()=>Promise.resolve(state)},now:()=>clock});
 const controller={kind:'human' as const,name:'Operator',rom_sha1:'a'.repeat(40),input_policy:'frame-held-v1' as const,sample_ms:100 as const,nominal_fps:59.7275 as const,screenshot_ms:500 as const};
 await recorder.start({...RUN_START_META,controller},false);
 const times=[0,100,499,500,950,1001,1700,1999,2000];
 for(const [index,ms] of times.entries()){clock=ms;recorder.recordHumanSample(index*6,false,png,index===0?state:{...state,screen:'birch_speech'});}
 clock=2050;recorder.recordHumanSample(54,true,png,state,true);
 clock=2400;recorder.recordHumanSample(60,false,png,state);
 clock=2500;recorder.recordHumanSample(66,false,png,state);
 recorder.end('operator_stop');
 const events=readFileSync(log.eventsPath,'utf8').trim().split('\n').map(parseEvent);
 expect(events.filter(event=>event.type==='state')).toHaveLength(12);
 expect(events.filter(event=>event.type==='human_sample').map(event=>event.frame)).toEqual([0,18,30,36,48,54,66]);
 expect(events.find(event=>event.type==='milestone'&&event.name==='NEW_GAME_CREATED')).toMatchObject({emulator_frame:6,emulator_frame_kind:'sample_upper_bound'});
 expect(events.at(-1)).toMatchObject({type:'run_end',frames:{saved:7,bytes:56}});
});
it('retains legacy human screenshot-per-poll semantics when cadence metadata is absent',async()=>{
 const r=root();const log=RunLog.create(r,'human-legacy');let clock=0;const recorder=new RunRecorder({log,frames:new FrameStore(r),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(state)},now:()=>clock});
 await recorder.start({...RUN_START_META,controller:{kind:'human',name:'Operator',rom_sha1:'a'.repeat(40),input_policy:'frame-held-v1',sample_ms:100,nominal_fps:59.7275}},false);
 for(const ms of [0,100,200]){clock=ms;recorder.recordHumanSample(ms,false,png,state);}recorder.end('operator_stop');
 const events=readFileSync(log.eventsPath,'utf8').trim().split('\n').map(parseEvent);expect(events.filter(event=>event.type==='human_sample')).toHaveLength(3);expect(events.at(-1)).toMatchObject({frames:{saved:3,bytes:24}});
});
it('skips missed screenshot intervals without producing a catch-up burst',async()=>{
 const r=root();const log=RunLog.create(r,'human-delayed');let clock=0;const recorder=new RunRecorder({log,frames:new FrameStore(r),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(state)},now:()=>clock});
 await recorder.start({...RUN_START_META,controller:{kind:'human',name:'Operator',rom_sha1:'a'.repeat(40),input_policy:'frame-held-v1',sample_ms:100,nominal_fps:59.7275,screenshot_ms:500}},false);
 for(const [index,ms] of [0,2001,2001,2001,2400,2500].entries()){clock=ms;recorder.recordHumanSample(index,false,png,state);}
 const events=readFileSync(log.eventsPath,'utf8').trim().split('\n').map(parseEvent);expect(events.filter(event=>event.type==='state')).toHaveLength(6);expect(events.filter(event=>event.type==='human_sample').map(event=>event.frame)).toEqual([0,1,5]);
});

it('carries trainer RAM flags through human sampling into native milestone evidence and preserves wins after gym-clear',async()=>{
 const {StateMilestones}=await import('./milestones.js');const r=root();const log=RunLog.create(r,'gym-human');
 const story={name_confirmed:true,intro_stage:7,rival_stage:4,birch_lab_stage:5,petalburg_gym_stage:2,woods_stage:1,clock_set:true,rival_battle_won:true,pokedex_received:true,running_shoes_received:true,starter_tutorial_complete:true,rustboro_gym_complete:false,stone_badge:false,rock_tomb_received:false,rustboro_josh_defeated:false,rustboro_tommy_defeated:false,rustboro_marc_defeated:false};
 const gym={...state,screen:'overworld',started:true,location:'RUSTBORO CITY GYM',story};
 const detector=new StateMilestones({read:()=>Promise.resolve(gym)});const recorder=new RunRecorder({log,frames:new FrameStore(r),milestones:detector,gameState:{read:()=>Promise.resolve(gym)}});
 await recorder.start({...RUN_START_META,controller:{kind:'human',name:'Operator',rom_sha1:'a'.repeat(40),input_policy:'frame-held-v1',sample_ms:100,nominal_fps:59.7275,screenshot_ms:500},harness_features:['rustboro-gym-trainer-milestones-v1']},false);
 recorder.recordHumanSample(10,false,png,gym);
 recorder.recordHumanSample(20,false,png,{...gym,story:{...story,rustboro_josh_defeated:true}});
 recorder.recordHumanSample(30,false,png,{...gym,story:{...story,rustboro_gym_complete:true,rustboro_josh_defeated:null,rustboro_tommy_defeated:null,rustboro_marc_defeated:null}});
 const events=readFileSync(join(r,'gym-human','events.jsonl'),'utf8').trim().split('\n').map(parseEvent);const wins=events.filter(e=>e.type==='milestone'&&e.name.startsWith('RUSTBORO_GYM_TRAINER_'));
 expect(wins).toHaveLength(1);expect(wins[0]).toMatchObject({name:'RUSTBORO_GYM_TRAINER_JOSH_DEFEATED',kind:'story',origin:'observed',emulator_frame:20});
 const win=wins[0];if(win?.type!=='milestone')throw Error('no native win');const evidence=events.find(e=>e.seq===win.evidence?.[0]);expect(evidence).toMatchObject({type:'state',story:{rustboro_josh_defeated:true,rustboro_gym_complete:false}});
});

it('records human activity and completed heal evidence from the production sampling owner',async()=>{
 const {StateMilestones,qualifiedNativeMilestone}=await import('./milestones.js');const r=root();const log=RunLog.create(r,'progress-human');
 const stats={pokemon_captures:0,evolved_pokemon:0,used_pokecenter:0,saved_game:0};const mon={identity:'12345678:87654321',species:'TORCHIC',level:5,hp:10,max_hp:20};
 const game={...state,started:true,screen:'overworld',location:'ROUTE102',field_controls_locked:false,game_stats:stats,party:[mon],blackout_active:false};
 const recorder=new RunRecorder({log,frames:new FrameStore(r),milestones:new StateMilestones({read:()=>Promise.resolve(game)}),gameState:{read:()=>Promise.resolve(game)}});
 await recorder.start({...RUN_START_META,controller:{kind:'human',name:'Operator',rom_sha1:'a'.repeat(40),input_policy:'frame-held-v1',sample_ms:100,nominal_fps:59.7275,screenshot_ms:500},harness_features:['native-progress-activity-v1']},false);
 recorder.recordHumanSample(10,false,png,game);
 const accepted={...game,game_stats:{...stats,pokemon_captures:1,used_pokecenter:1},field_controls_locked:true};recorder.recordHumanSample(20,false,png,accepted);
 recorder.recordHumanSample(30,false,png,{...accepted,field_controls_locked:false,party:[{...mon,hp:20,level:6}]});
 const events=readFileSync(log.eventsPath,'utf8').trim().split('\n').map(parseEvent);
 const activities=events.filter(e=>e.type==='activity');expect(activities.map(e=>e.kind)).toEqual(['capture','heal','level_up']);expect(activities[0]).toMatchObject({emulator_frame:20,emulator_frame_kind:'sample_upper_bound',count:1});
 const heal=events.find(e=>e.type==='milestone'&&e.name==='FIRST_POKECENTER_HEAL');if(heal?.type!=='milestone')throw Error('missing heal');expect(heal.evidence).toHaveLength(3);expect(qualifiedNativeMilestone(heal,(heal.evidence??[]).map(seq=>events.find(e=>e.seq===seq)))).toBe(true);
 const capture=activities[0];if(capture?.type!=='activity')throw Error('missing activity');expect(events.find(e=>e.seq===capture.evidence[1])).toMatchObject({type:'state',game_stats:{pokemon_captures:1}});
});

it('retains an exact typed raw-memory reference in human and agent state events and rejects declared decoded-only capture',async()=>{
 const r=root();const log=RunLog.create(r,'raw-reference');
 const recorder=new RunRecorder({log,frames:new FrameStore(r),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(state)}});
 await recorder.start({...RUN_START_META,harness_features:['full-raw-ram-v1']},false);
 expect(()=>recorder.recordHumanSample(10,false,png,state)).toThrow('no raw RAM archive reference');
 const raw_ram={v:1 as const,sequence:2,frame:11,path:'raw-ram/00000002.json.gz',sha256:'a'.repeat(64)};
 recorder.recordHumanSample(10,false,png,{...state,raw_ram});
 recorder.recordState({...state,raw_ram});
 const events=readFileSync(log.eventsPath,'utf8').trim().split('\n').map(parseEvent);
 expect(events.filter(e=>e.type==='state').map(e=>'raw_ram' in e?e.raw_ram:undefined)).toEqual([raw_ram,raw_ram]);
 expect(()=>parseEvent(JSON.stringify({...events.find(e=>e.type==='state'),raw_ram:{...raw_ram,path:'../outside'}}))).toThrow();
});
