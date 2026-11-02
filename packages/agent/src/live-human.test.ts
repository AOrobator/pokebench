import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mkdtempSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {RunPlan,RunHost} from './run.js';
const context=vi.hoisted(()=>({completion:Promise.resolve(),hosts:[] as RunHost[],spawn:vi.fn<(file:string,args:readonly string[],options:{env:NodeJS.ProcessEnv})=>never>(),off:vi.fn(),plans:[] as RunPlan[],leases:[] as {root:string;run:string}[],paths:[] as {repo:string;common:string}[],release:vi.fn(),git:vi.fn(),write:vi.fn(),errors:vi.fn()}));
vi.mock('node:child_process',()=>({execFileSync:(file:string,args:string[])=>{
 context.git(file,args);if(file!=='git'||args.join(' ')!=='rev-parse --git-common-dir')throw Error('unexpected process command');return '/test-owned/canonical/.git\n';
},spawn:context.spawn}));
vi.mock('node:fs',async(importOriginal)=>{
 const actual=await importOriginal<typeof import('node:fs')>();return {...actual,
 readFileSync:(path:unknown)=>{if(path==='/test-owned/fixture.rom')return Buffer.from('test ROM');throw Error('test forbids file reads');},
 writeFileSync:context.write,
 };
});
vi.mock('./config.js',()=>({loadConfig:()=>{throw Error('human entrypoint must not load model configuration');}}));
vi.mock('./human.js',async(importOriginal)=>{
 const actual=await importOriginal<typeof import('./human.js')>();return {...actual,humanLease:(root:string,run:string)=>{context.leases.push({root,run});return context.release;}};
});
vi.mock('./run.js',async(importOriginal)=>{
 const actual=await importOriginal<typeof import('./run.js')>();return {...actual,
 humanLeasePath:(repo:string,common:string)=>{context.paths.push({repo,common});return actual.humanLeasePath(repo,common);},
 withRun:(plan:RunPlan,host:RunHost)=>{context.plans.push(plan);context.hosts.push(host);return context.completion;},
 };
});
let fakeProcess:NodeJS.Process;
let pending:Promise<typeof import("./live.js")>|undefined;
async function completed():Promise<void>{ pending=import("./live.js"); await (await pending).entryCompleted; }
beforeEach(()=>{
 vi.resetModules();pending=undefined;context.completion=Promise.resolve();context.plans=[];context.hosts=[];context.spawn.mockReset().mockImplementation(()=>{throw Error("test forbids launching a service");});context.leases=[];context.paths=[];context.release.mockClear();context.off.mockClear();context.git.mockClear();context.write.mockClear();context.errors.mockClear();
 const env:NodeJS.ProcessEnv={...process.env,POKEBENCH_ROM:'/test-owned/fixture.rom',POKEBENCH_RUNS_ROOT:'/test-owned/runs',POKEBENCH_HUMAN_PORT:'8140'};delete env['POKEBENCH_HUMAN_RUN_ID'];
 fakeProcess=Object.assign(Object.create(process) as NodeJS.Process,{argv:[...process.argv.slice(0,2),'human'],env,on:vi.fn(),off:context.off,exitCode:undefined});vi.stubGlobal('process',fakeProcess);vi.spyOn(console,'error').mockImplementation(context.errors);vi.spyOn(console,'log').mockImplementation(()=>{});
});
afterEach(async()=>{try{if(pending!==undefined)await (await pending).entryCompleted;}finally{vi.unstubAllGlobals();vi.restoreAllMocks();}});
it('uses the assigned human identity and the canonical git-common-dir lease owner',async()=>{
 fakeProcess.env['POKEBENCH_HUMAN_RUN_ID']='assigned-human-run';await completed();expect(context.release).toHaveBeenCalledOnce();
 expect(context.plans).toHaveLength(1);expect(context.plans[0]).toMatchObject({runId:'assigned-human-run',runsRoot:'/test-owned/runs/human',port:8140,controller:{kind:'human'},startState:{kind:'boot'}});
 expect(context.paths).toHaveLength(1);expect(context.paths[0]?.common).toBe('/test-owned/canonical/.git');expect(context.leases).toEqual([{root:'/test-owned/canonical/runs',run:'assigned-human-run'}]);expect(context.git).toHaveBeenCalledWith('git',['rev-parse','--git-common-dir']);expect(context.write).not.toHaveBeenCalled();expect(context.errors).not.toHaveBeenCalled();
});
it('generates a human identity when no assigned identity is present',async()=>{
 await completed();expect(context.release).toHaveBeenCalledOnce();expect(context.plans).toHaveLength(1);
 const run=context.plans[0]?.runId;expect(run).toMatch(/^\d{4}-\d{2}-\d{2}T[\d-]+_human_[0-9a-f]{4}$/);expect(context.leases[0]?.run).toBe(run);expect(context.errors).not.toHaveBeenCalled();
});
it.each(['../invalid','','bad/name','a'.repeat(129)])('rejects invalid assigned identity %j before any lease or lifecycle',async(run)=>{
 fakeProcess.env['POKEBENCH_HUMAN_RUN_ID']=run;await completed();expect(context.errors).toHaveBeenCalledWith('human FAILED: Error: invalid human run id');
 expect(context.plans).toEqual([]);expect(context.leases).toEqual([]);expect(context.paths).toEqual([]);expect(context.git).not.toHaveBeenCalled();expect(context.release).not.toHaveBeenCalled();expect(context.write).not.toHaveBeenCalled();expect(fakeProcess.exitCode).toBe(1);
});

it('owns the entrypoint until run completion and signal/lease cleanup',async()=>{
 let finish:()=>void=()=>{throw Error('missing resolver');};
 context.completion=new Promise<void>(resolve=>{finish=resolve;});
 pending=import('./live.js');const module=await pending;
 let settled=false;void module.entryCompleted.then(()=>{settled=true;});
 try{
  await Promise.resolve();expect(settled).toBe(false);
  expect(module.entryCompleted).toBeInstanceOf(Promise);
  expect(context.plans).toHaveLength(1);expect(context.release).not.toHaveBeenCalled();
 }finally{finish();}
 await module.entryCompleted;
 expect(context.release).toHaveBeenCalledOnce();
 expect(context.off).toHaveBeenCalledWith('SIGINT',expect.any(Function));
 expect(context.off).toHaveBeenCalledWith('SIGTERM',expect.any(Function));
});

it('keeps default-off visibility V2 disabled in the real human launcher environment',async()=>{
 fakeProcess.env['POKEBENCH_HUMAN_RUN_ID']='assigned-human-run';
 await completed();
 const host=context.hosts[0];if(host===undefined)throw Error('missing production human host');
 const runDir=mkdtempSync(join(tmpdir(),'pb-human-run-'));
 await expect(host.launchServer(runDir,'assigned-human-run',8140)).rejects.toThrow('test forbids launching a service');
 // The capture files are opened before the spawn, so a refused launch still leaves the run's
 // evidence in place rather than orphaning two descriptors.
 expect(readdirSync(runDir).sort()).toEqual(['server-stderr.log','server-stdout.log']);
 const env=context.spawn.mock.calls[0]?.[2].env;
 expect(env?.['POKEBENCH_FEATURES_OFF']?.split(',')).toContain('player-map-visibility-v2');
});
