// CPU-only rehearsal of the production live continuation; model endpoint is a
// private local stub. No real gateway URL is read or used. Preserve desktop focus.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,openSync,closeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const repo=resolve(fileURLToPath(new URL('..',import.meta.url))),mod=n=>import(join(repo,'packages/agent/dist',n+'.js'));
const [{loadLiveContinuation},{parseEvent}]=await Promise.all(['roxanne-live-continuation','events'].map(mod));
const rom=process.env.POKEBENCH_ROM;if(!rom)throw Error('POKEBENCH_ROM is required for CPU-native rehearsal');
const [qualified,output,mode,baselineHash]=process.argv.slice(2);if(mode!==undefined&&mode!=="baseline"&&mode!=="deadline"&&mode!=="candidate"&&mode!=="foreign-port")throw Error("unsupported rehearsal mode");if(!qualified||!output)throw Error('usage: <qualified-directory> <new-output-directory>');
mkdirSync(output,{recursive:false});const runs=join(output,'runs');mkdirSync(runs);
const reminder=mode==='candidate'?'Use the observed loss and current capabilities to choose your next strategy.':'',loaded=loadLiveContinuation({directory:qualified,prompt:reminder,seed:42,...(baselineHash===undefined?{}:{runtimeBaselineSha256:baselineHash})}),start=loaded.source.start;
const descriptor=join(output,'descriptor.json');writeFileSync(descriptor,JSON.stringify({directory:qualified,prompt:reminder,seed:42,...(baselineHash===undefined?{}:{runtimeBaselineSha256:baselineHash}),...(mode==='deadline'?{stopAt:Date.now()+15000}:{})}));
const preset=join(output,'preset.json');writeFileSync(preset,JSON.stringify({version:2,id:'roxanne-native-offline-rehearsal',target:null,stopAt:'ROXANNE_DEFEATED',features:{...loaded.runtime.features,'roxanne-campaign-reminder-v1':mode==='candidate'},start:{kind:'save_state',path:loaded.statePath,sha1:createHash('sha1').update(loaded.state).digest('hex')},limits:{maxTurns:210,maxWallMs:1800000,failureLimit:3,replyFailuresEndRun:false},sampling:{thinkingLevel:start.sampling.thinking_level,maxTokens:start.sampling.max_tokens}}));
let child,requests=0;
const fake=createServer((req,res)=>{
 if(req.method==='GET'&&req.url==='/v1/models'){res.setHeader('content-type','application/json');res.end(JSON.stringify({models:[{model:start.model.id,capabilities:['multimodal']}],data:[{id:start.model.id,meta:{n_ctx:start.model.context_window}}]}));return;}
 if(req.method!=='POST'||req.url!=='/v1/chat/completions'){res.writeHead(404);res.end();return;}
 const parts=[];req.on('data',p=>parts.push(p));req.on('end',()=>{const body=Buffer.concat(parts);writeFileSync(join(output,`stub-request-${String(++requests)}.json`),body);if(mode!=='deadline'){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'deliberate CPU-only rehearsal stop',type:'offline_rehearsal'}}));child?.kill('SIGTERM');}});
});
await new Promise(r=>fake.listen(0,'127.0.0.1',r));const address=fake.address();if(!address||typeof address==='string')throw Error('stub address');
const game=createServer((_req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({status:'healthy'}));});await new Promise(r=>game.listen(0,'127.0.0.1',r));const ga=game.address();if(!ga||typeof ga==='string')throw Error('game address');if(mode!=='foreign-port')await new Promise(r=>game.close(r));
const endpoint=join(output,'fake-endpoint.json');writeFileSync(endpoint,JSON.stringify({base_url:`http://127.0.0.1:${address.port}/v1`,api_key:'offline-only'}));
const runId='2026-10-23T00-00-00_roxanne_offline',out=openSync(join(output,'worker.log'),'wx'),err=openSync(join(output,'worker.err'),'wx');
try{
 child=spawn(process.execPath,[join(repo,'packages/agent/dist/live.js'),'play'],{cwd:repo,env:{...process.env,POKEBENCH_ROM:rom,POKEBENCH_RUNS_ROOT:runs,POKEBENCH_RUN_ID:runId,POKEBENCH_PLAY_PRESET:preset,POKEBENCH_CAMPAIGN_CONTINUATION:descriptor,POKEBENCH_ENDPOINT_FILE:endpoint,POKEBENCH_MODEL:start.model.id,POKEBENCH_GAME_SERVER_URL:`http://127.0.0.1:${ga.port}`},stdio:['ignore',out,err]});
 const code=await new Promise((r,reject)=>{child.once('error',reject);child.once('exit',r);});
 if(mode==='foreign-port'){const preserved=(await fetch(`http://127.0.0.1:${ga.port}/health`)).ok,passed=code===1&&requests===0&&preserved&&readFileSync(join(output,'worker.err'),'utf8').match(/different process group|every run needs its own/)!==null;const receipt={passed,mode:'foreign-port-refusal',gpuCalls:0,requests,exitCode:code,foreignListenerPreserved:preserved};writeFileSync(join(output,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));if(!passed)process.exitCode=1;}else{
 const events=readFileSync(join(runs,runId,'events.jsonl'),'utf8').trim().split('\n').map(parseEvent),record=JSON.parse(readFileSync(join(runs,runId,'campaign-continuation.json'),'utf8'));
 const payload=JSON.parse(readFileSync(join(output,'stub-request-1.json'),'utf8'));
 const {streamSimple}=await import(join(repo,'packages/agent/node_modules/@mariozechner/pi-ai/dist/index.js'));
 const {discoverLocal}=await mod('local-endpoint'),{playLoopBase}=await mod('provider'),{digest}=await mod('roxanne-campaign');
 const [model]=await discoverLocal({baseUrl:`http://127.0.0.1:${address.port}/v1`,apiKey:'offline-only'});if(!model)throw Error('stub model');
 const base=playLoopBase(model,start.sampling.thinking_level,'offline-only',start.sampling.max_tokens,loaded.runtime.features);let expected;
 await streamSimple(model,{systemPrompt:loaded.runtime.systemPrompt,messages:loaded.history,tools:loaded.runtime.tools},{apiKey:'offline-only',maxTokens:start.sampling.max_tokens,reasoning:start.sampling.thinking_level,onPayload:async(body,m)=>{const next=await base.onPayload?.(body,m)??body;expected={...next,seed:42};throw Error('CPU-only capture, no request');}}).result();
 if(expected===undefined)throw Error('reference payload not captured');writeFileSync(join(output,'reference-request.json'),JSON.stringify(expected));
 const firstContextMatches=mode==='candidate'?null:digest(payload)===digest(expected),reminderDelivered=mode==='candidate'?payload.messages.filter(m=>m.role==='user'&&(m.content===reminder||Array.isArray(m.content)&&m.content.some(p=>p.type==='text'&&p.text===reminder))).length===1:null;
 const runtimeMatches=baselineHash===undefined||events[0]?.harness?.commit===loaded.runtime.sourceCommit&&events[0]?.harness?.dirty===false&&events[0]?.evaluation?.features?.['move-learn-offer-identity-v1']===true&&digest(payload.tools?.find(t=>t.function?.name==='learn_move')?.function?.parameters)===digest(loaded.runtime.tools.find(t=>t.name==='learn_move')?.parameters);
 const passed=runtimeMatches&&(firstContextMatches===true||reminderDelivered===true)&&code===0&&requests===1&&events[0]?.type==='run_start'&&events[0].restoration?.source_run===loaded.bundle.sourceRun&&events.at(-1)?.type==='run_end'&&events.at(-1).reason===(mode==='deadline'?'budget':'operator_abort')&&payload.seed===42&&record.initialObservation.restoreHash===loaded.restoreHash&&(mode==='candidate'?record.reminder?.index===loaded.conversation.length&&record.messages[record.reminder.index]?.content===reminder:record.reminder===null);
 const receipt={passed,runtimeMatches,runtimeBaselineSha256:baselineHash??null,runtimeSource:loaded.runtime.sourceCommit,effectiveGuard:events[0]?.evaluation?.features?.['move-learn-offer-identity-v1']??false,deliveredLearnMove:payload.tools?.find(t=>t.function?.name==='learn_move')??null,firstContextMatches,reminderDelivered,mode:'native-server-local-stub',gpuCalls:0,requests,exitCode:code,sourceRun:loaded.bundle.sourceRun,restoredMessages:record.messages.length,terminal:events.at(-1)?.type==='run_end'?events.at(-1).reason:null};writeFileSync(join(output,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));if(!passed)process.exitCode=1;
}
}finally{if(game.listening)await new Promise(r=>game.close(r));closeSync(out);closeSync(err);await new Promise(r=>fake.close(r));}
