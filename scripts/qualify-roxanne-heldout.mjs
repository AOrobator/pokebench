// CPU/disk-only eligibility worker. Invoked only after exact finalist text is frozen.
// Reports validity metadata only, never protected gameplay content to the planner.
import {readFileSync,writeFileSync,readdirSync,mkdirSync,openSync,closeSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const repo=resolve(fileURLToPath(new URL('..',import.meta.url))),mod=n=>import(join(repo,'packages/agent/dist',n+'.js'));
const [{digest},{eligibleHeldoutTurns},{parseRun,decisionContext,recordedFeatures}]=await Promise.all(['roxanne-campaign','roxanne-measured-host','decision-probe'].map(mod));
const [campaign,runsRoot,expectedHash]=process.argv.slice(2);if(!campaign||!runsRoot||!expectedHash)throw Error('usage: <campaign-dir> <source-runs-root> <frozen-finalist-hash>');
const finalist=JSON.parse(readFileSync(join(campaign,'frozen-finalist.json'),'utf8'));if(finalist.hash!==expectedHash||digest(finalist.text)!==expectedHash)throw Error('finalist must be frozen before eligibility');
const root=join(campaign,'protected-qualification');mkdirSync(root,{recursive:false});
const qualified=[],attempts=[];
for(const family of ['e8b4','35df','7c9f']){
 const ids=readdirSync(runsRoot).filter(name=>name.endsWith(`_${family}`));if(ids.length!==1){attempts.push({family,eligible:false,reason:'source identity unavailable or ambiguous'});continue;}
 const id=ids[0],runDir=join(runsRoot,id),run=parseRun(readFileSync(join(runDir,'events.jsonl'),'utf8')),turns=eligibleHeldoutTurns(run);
 for(const turn of turns){
  const out=join(root,`${family}-t${turn}`),stdout=openSync(join(root,`${family}-t${turn}.log`),'wx'),stderr=openSync(join(root,`${family}-t${turn}.err`),'wx');
  const exec=(argv)=>execFileSync(argv[0],argv.slice(1),{cwd:repo,env:{...process.env,PYTHONPATH:join(repo,'env')},stdio:['ignore',stdout,stderr],timeout:1800000});
  try{
   exec([join(repo,'env/.venv/bin/python'),join(repo,'scripts/qualify-roxanne-checkpoint.py'),'--run',runDir,'--turn',String(turn),'--rom','/Users/user/.roms/pokemon-emerald.gba','--out',out]);
   const q=JSON.parse(readFileSync(join(out,'qualification.json'),'utf8'));if(!q.receipt.passed)throw Error('native qualification failed');
   const prefix=parseRun(readFileSync(join(out,'events-prefix.jsonl'),'utf8'));
   // decisionContext needs the turn marker to delimit the exact prefix.
   const marker=run.events.find(e=>e.type==='turn_start'&&e.turn===turn);if(!marker)throw Error('decision marker missing');
   const context=await decisionContext({...prefix,events:[...prefix.events,marker]},turn,recordedFeatures(prefix),{thinkingSignature:'reasoning',rerender:()=>{throw Error('no rerender in restored history');},frame:path=>{const full=resolve(runDir,path),rel=relative(runDir,full);if(isAbsolute(path)||rel.startsWith('..')||isAbsolute(rel))throw Error('frame outside source');return readFileSync(full).toString('base64');}},'recorded');
   const contextPath=join(out,'frozen-reference.json');writeFileSync(contextPath,JSON.stringify(context));
   exec([process.execPath,join(repo,'scripts/qualify-roxanne-history.mjs'),out,contextPath,digest(context)]);
   exec([process.execPath,join(repo,'scripts/qualify-roxanne-continuation.mjs'),out,runsRoot]);
   const result=JSON.parse(readFileSync(join(out,'continuation-qualification.json'),'utf8'));if(!result.passed)throw Error('production restoration failed');
   qualified.push({family,directory:out});attempts.push({family,turn,qualified:true});break;
  }catch(error){attempts.push({family,turn,qualified:false,reason:String(error).split('\n')[0]});}
  finally{closeSync(stdout);closeSync(stderr);}
 }
 if(qualified.length===2)break;
}
writeFileSync(join(campaign,'protected-eligibility.json'),JSON.stringify({frozenPromptHash:expectedHash,gpuCalls:0,attempts,qualified},null,2));
console.log(JSON.stringify(qualified));if(qualified.length!==2)process.exitCode=1;
