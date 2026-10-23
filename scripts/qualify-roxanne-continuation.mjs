// CPU/disk only. Build real production context and tool factories; never execute a tool or model.
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=resolve(fileURLToPath(new URL('..',import.meta.url)));
const mod=name=>import(join(repo,'packages/agent/dist',name+'.js'));
const [{digest},{parseRun,recordedFeatures,recordedConversation},{qualifyRestoredContext},{parseRestoredMessages,verifyRestoreBundle},{contextTools,playGameTools,loopSupervisor,stallBriefing,contextBudget},{gameTools},{toolSwitches},{RunRecorder},{RunLog},{FrameStore},{StateWatcher},{Governor,attachLoopGuard,slideWindow}]=await Promise.all(['roxanne-campaign','decision-probe','roxanne-continuation','roxanne-restore','play-wiring','game-tools','play-config','recorder','run-log','frames','game-state','harness'].map(mod));
const [directory,runsRoot]=process.argv.slice(2);if(!directory||!runsRoot)throw Error('usage: <qualified-directory> <source-runs-root>');
const prefix=readFileSync(join(directory,'events-prefix.jsonl'),'utf8'),run=parseRun(prefix),features=recordedFeatures(run);
const bundle=JSON.parse(readFileSync(join(directory,'bundle.json'),'utf8')),reference=parseRestoredMessages(JSON.parse(readFileSync(join(directory,'history.json'),'utf8')));
verifyRestoreBundle(bundle,readFileSync(join(directory,'checkpoint.state')),reference,prefix);
let unavailableFrames=0;const timeline=new Map();
const sourceDir=join(runsRoot,bundle.sourceRun);
const signature=reference.flatMap(m=>m.role==='assistant'?m.content:[]).find(p=>p.type==='thinking')?.thinkingSignature??'reasoning';
const persistent=parseRestoredMessages(recordedConversation(run,{thinkingSignature:signature,rerender:()=>{throw Error('no renderer calls in recorded restoration');},frame:path=>{
 const full=resolve(sourceDir,path),rel=relative(sourceDir,full);if(isAbsolute(path)||rel.startsWith('..')||isAbsolute(rel))throw Error('frame outside source run');
 try{return readFileSync(full).toString('base64');}catch(error){if(error.code!=='ENOENT')throw error;unavailableFrames++;return Buffer.from('UNAVAILABLE HISTORICAL FRAME; MUST BE PRUNED').toString('base64');}
}},(turn,history)=>timeline.set(turn,history)));
if(bundle.conversationHash!==undefined&&bundle.conversationHash!==digest(persistent))throw Error("persistent conversation changed after qualification");
const root=mkdtempSync(join(tmpdir(),'roxanne-continuation-qualification-'));
const log=RunLog.create(root,'offline-qualification',()=>new Date(),run.events.at(-1).seq+1),frames=new FrameStore(root,1000000,()=>{});
const source=new StateWatcher('http://127.0.0.1:1'); // constructor is pure; network is denied in the rehearsal sandbox.
const recorder=new RunRecorder({log,frames,milestones:{poll:()=>Promise.resolve([])},gameState:source,history:run.events,turnBase:bundle.turn-1});
const {v,run:sourceRun,seq,t,type,turn,...sourceMeta}=run.start;
await recorder.start({...sourceMeta,restoration:{source_run:bundle.sourceRun,source_turn:bundle.turn,prefix_sha256:bundle.eventsHash,prefix_last_seq:run.events.at(-1).seq}},false);
const governor=new Governor({limits:{maxTurns:210,maxWallMs:1800000,failureLimit:3},retry:()=>{},abort:()=>{},now:()=>0});
const detector=attachLoopGuard(recorder,governor,undefined,features['deterministic-loop-guard-v1']?'enforced':'diagnostic',features['interaction-loop-detection-v1'],loopSupervisor(features,recorder),features['transition-loop-detection-v1'],features['pushback-loop-detection-v1'],features['battle-observation-loop-v1'],features['navigation-truth-v1'],features['ineffective-loops-v1'],features['battle-menu-loop-v1'],features['clock-view-loop-v1'],features['reopened-dialogue-loop-v1'],features['trigger-script-loop-v1'],features['battle-refusal-loop-v1'],features['ineffective-navigation-v2'],features['same-target-no-progress-v1'],features);
let currentTime=Date.parse(run.start.t);recorder.subscribe(e=>{currentTime=Date.parse(e.t);});
stallBriefing(features,recorder,detector,{pausedMs:()=>0},()=>currentTime-Date.parse(run.start.t));
const context=contextTools(features,recorder,m=>Promise.resolve(m));
const tools=playGameTools(gameTools('http://127.0.0.1:1',{},fetch,toolSwitches(features)),features,source,recorder,()=>Promise.resolve(),context.tools);
const budget=contextBudget(features,{contextWindow:run.start.model.context_window},run.start.sampling.max_tokens,recorder).budget;
recorder.subscribe(e=>{if(e.type==='assistant')budget?.observe({role:'assistant',stopReason:e.stop_reason,errorMessage:e.error,usage:{input:e.usage.input,cacheRead:e.usage.cache_read,cacheWrite:e.usage.cache_write}});});
await recorder.restoreHistory(async turn=>{const past=timeline.get(turn);if(past===undefined)throw Error('missing historical context for budget restoration');budget?.fit(slideWindow([...past],context.window));await context.transformContext([]);});
const restoredBudget=budget?.snapshot()??null;
const receipt=await qualifyRestoredContext(reference,persistent,async history=>{const windowed=slideWindow([...history],context.window),out=budget?.fit(windowed).messages??windowed,warning=detector.context();if(warning)out.push({role:'user',content:warning,timestamp:0});const rendered=await context.transformContext(out);writeFileSync(join(directory,"reconstructed-context.json"),JSON.stringify(rendered));return rendered;}).catch(error=>({passed:false,reason:error.message}));
writeFileSync(join(directory,'persistent-history.json'),JSON.stringify(persistent));
const sourceTools=JSON.parse(readFileSync(join(directory,"tools.json"),"utf8"));
const currentTools=tools.map(({name,description,parameters})=>({name,description,parameters}));
const productionToolsMatch=digest(sourceTools)===bundle.toolsHash&&JSON.stringify(currentTools)===JSON.stringify(sourceTools);
writeFileSync(join(directory,"production-tools.json"),JSON.stringify(currentTools));
const result={...receipt,budgetState:restoredBudget,passed:receipt.passed&&productionToolsMatch&&governor.stopReason===null&&!detector.stopped,productionToolsMatch,conversationHash:digest(persistent),gpuCalls:0,productionToolCount:tools.length,persistentMessages:persistent.length,unavailableHistoricalFrames:unavailableFrames,governorStoppedDuringRestore:governor.stopReason!==null,detectorStoppedDuringRestore:detector.stopped};
if(result.passed){if(restoredBudget!==null){bundle.budgetHash=digest(restoredBudget);writeFileSync(join(directory,"budget.json"),JSON.stringify(restoredBudget));}bundle.conversationHash=digest(persistent);writeFileSync(join(directory,'bundle.json'),JSON.stringify(bundle,null,2)+'\n');}
writeFileSync(join(directory,'continuation-qualification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
