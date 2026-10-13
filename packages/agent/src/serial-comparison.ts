import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile, rm, access, open, realpath } from "node:fs/promises";
import { dirname, join, resolve, isAbsolute } from "node:path";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import { parseEvent, RUN_END_REASONS } from "./events.js";
import { MILESTONES } from "./milestones.js";
import { parsePlayPreset } from "./play-preset.js";

const closed = { additionalProperties:false };
const text=Type.String({minLength:1});
const id=Type.String({pattern:"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$"});
const sha=Type.String({pattern:"^[a-f0-9]{64}$"});
const artifact=Type.Object({path:text,sha256:sha},closed);
const arm=Type.Enum(["diagnostic","enforced"] as const);
const TrialSchema=Type.Object({runId:id,lane:id,arm},closed);
const ManifestSchema=Type.Object({
  version:Type.Literal(1),id,repoRoot:text,sourceCommit:Type.String({pattern:"^[a-f0-9]{40}$"}),
  build:Type.Object({path:text,sha256:sha,treeSha256:sha},closed),
  presets:Type.Object({diagnostic:artifact,enforced:artifact},closed),
  lanes:Type.Array(Type.Object({id,model:text,gatewayUrl:text,endpointFile:Type.Union([artifact,Type.Null()]),serving:artifact,environment:artifact,imageTool:artifact,configurationSha256:sha},closed),{minItems:3,maxItems:3}),
  criteria:Type.Object({completionLossTolerance:Type.Literal(0),medianSpeedGain:Type.Literal(0.1)},closed),
  trials:Type.Array(TrialSchema,{minItems:24,maxItems:24}),
},closed);
export type ComparisonManifest=Static<typeof ManifestSchema>;
export type ComparisonTrial=Static<typeof TrialSchema>;
export function sha256(data:string|Buffer):string{return createHash("sha256").update(data).digest("hex");}
export function counterbalancedTrials(cohort:string,lanes:string[]):ComparisonTrial[]{
  const trials:ComparisonTrial[]=[];
  for(let round=0;round<4;round++)for(let half=0;half<2;half++)for(const [index,lane] of lanes.entries()){
    trials.push({runId:`${cohort}_${String(trials.length+1).padStart(2,"0")}`,lane,arm:(round+half+index)%2===0?"diagnostic":"enforced"});
  }
  return trials;
}
export function prepareComparison(value:unknown):ComparisonManifest{
  if(!Value.Check(ManifestSchema,value))throw new Error("invalid frozen comparison manifest");
  const m=value;
  if(!isAbsolute(m.repoRoot)||resolve(m.repoRoot)!==m.repoRoot)throw new Error("repoRoot must be absolute and resolved");
  if(m.build.path!==join(m.repoRoot,"packages/agent/dist/live.js"))throw new Error("build must name the normal play entrypoint");
  if(new Set(m.lanes.map(l=>l.id)).size!==3||new Set(m.lanes.map(l=>l.model)).size!==3)throw new Error("three distinct discovered lanes required");
  for(const lane of m.lanes){
    const url=new URL(lane.gatewayUrl);
    if(!["http:","https:"].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error("gateway must not contain credentials/query/hash");
    if(lane.endpointFile!==null&&!isAbsolute(lane.endpointFile.path))throw new Error("endpoint file must be absolute");
  }
  for(const file of [m.build,...Object.values(m.presets),...m.lanes.flatMap(l=>[l.serving,l.environment,l.imageTool])])if(!isAbsolute(file.path))throw new Error("artifact paths must be absolute");
  if(JSON.stringify(m.trials)!==JSON.stringify(counterbalancedTrials(m.id,m.lanes.map(l=>l.id))))throw new Error("trial order differs from frozen counterbalanced 24-trial plan");
  return structuredClone(m);
}
export interface LaunchCommand{runId:string;argv:string[];env:Record<string,string>;cwd:string}
export interface Outcome{exitCode:number|null;reason:string;eventsSha256:string|null;failureCode?:string}
export interface LedgerEntry{type:"launch"|"outcome";manifestSha256:string;runId:string;at:string;exitCode?:number|null;reason?:string;eventsSha256?:string|null;failureCode?:string}
export interface ComparisonHost{
  verify:(m:ComparisonManifest)=>Promise<void>;readLedger:()=>Promise<LedgerEntry[]>;append:(row:LedgerEntry)=>Promise<void>;
  acquire:()=>Promise<()=>Promise<void>>;runExists:(runId:string)=>Promise<boolean>;launch:(command:LaunchCommand)=>Promise<Outcome>;now:()=>string;
}
const LedgerSchema=Type.Union([
 Type.Object({type:Type.Literal("launch"),manifestSha256:sha,runId:id,at:text},closed),
 Type.Object({type:Type.Literal("outcome"),manifestSha256:sha,runId:id,at:text,exitCode:Type.Union([Type.Integer(),Type.Null()]),reason:text,eventsSha256:Type.Union([sha,Type.Null()]),failureCode:Type.Optional(Type.Enum(["spawn_error","event_missing","event_invalid","child_nonzero","launcher_error","timed_out"] as const))},closed),
]);
class ComparisonFailure extends Error{constructor(readonly code:string){super(code);}}
function parseLedger(value:unknown):LedgerEntry{if(!Value.Check(LedgerSchema,value))throw new Error("invalid typed ledger row");return value;}
function canonical(value:unknown):string{
 if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
 if(typeof value==="object"&&value!==null)return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
 return JSON.stringify(value);
}
function resumeIndex(rows:LedgerEntry[],m:ComparisonManifest,digest:string):number{
  rows.forEach(parseLedger);
  if(rows.length%2!==0)throw new Error("uncertain launch in ledger; inspect and reconcile without replacing trial");
  for(let i=0;i<rows.length;i+=2){
    const launch=rows[i],outcome=rows[i+1],trial=m.trials[i/2];
    if(!Number.isFinite(Date.parse(launch?.at??""))||!Number.isFinite(Date.parse(outcome?.at??""))||Date.parse(outcome?.at??"")<Date.parse(launch?.at??""))throw new Error("invalid ledger timestamps");
    if(!trial||launch?.type!=="launch"||outcome?.type!=="outcome"||launch.manifestSha256!==digest||outcome.manifestSha256!==digest||launch.runId!==trial.runId||outcome.runId!==trial.runId||!RUN_END_REASONS.includes(outcome.reason as typeof RUN_END_REASONS[number])||outcome.exitCode!==0||typeof outcome.eventsSha256!=="string"||!/^[a-f0-9]{64}$/.test(outcome.eventsSha256))throw new Error("invalid or infrastructure-failed ledger; reconcile before resume");
  }
  return rows.length/2;
}
export async function superviseComparison(m:ComparisonManifest,host:ComparisonHost):Promise<void>{
  prepareComparison(m);
  const digest=sha256(JSON.stringify(m));
  const release=await host.acquire();
  try{
    const start=resumeIndex(await host.readLedger(),m,digest);
    for(const trial of m.trials.slice(start)){
      await host.verify(m);
      if(await host.runExists(trial.runId))throw new Error(`run directory exists: ${trial.runId}`);
      const lane=m.lanes.find(l=>l.id===trial.lane);
      if(lane===undefined)throw new Error("unknown trial lane");
      const env:Record<string,string>={POKEBENCH_MODEL:lane.model,POKEBENCH_GATEWAY_URL:lane.gatewayUrl,POKEBENCH_PLAY_PRESET:m.presets[trial.arm].path,POKEBENCH_RUN_ID:trial.runId,POKEBENCH_GAME_SERVER_URL:"http://127.0.0.1:8070"};
      if(lane.endpointFile!==null)env["POKEBENCH_ENDPOINT_FILE"]=lane.endpointFile.path;
      await host.append({type:"launch",manifestSha256:digest,runId:trial.runId,at:host.now()});
      let outcome:Outcome;
      try{outcome=await host.launch({runId:trial.runId,argv:[m.build.path,"play"],env,cwd:m.repoRoot});}
      catch(error){outcome={exitCode:null,reason:"infrastructure_failure",eventsSha256:null,failureCode:error instanceof ComparisonFailure?error.code:"launcher_error"};}
      await host.append({type:"outcome",manifestSha256:digest,runId:trial.runId,at:host.now(),...outcome});
      if(outcome.exitCode!==0||outcome.eventsSha256===null||!RUN_END_REASONS.includes(outcome.reason as typeof RUN_END_REASONS[number]))throw new Error(`infrastructure failure retained for ${trial.runId}; cohort stopped`);
    }
  }finally{await release();}
}

const ReceiptSchema=Type.Object({version:Type.Literal(1),kind:Type.Enum(["serving","environment","image-tool"] as const),qualified:Type.Literal(true),model:text,gatewayUrl:text,sourceCommit:Type.String({pattern:"^[a-f0-9]{40}$"}),validUntil:Type.String({format:"date-time"}),configurationSha256:sha,evidence:text},closed);
async function readArtifact(file:Static<typeof artifact>):Promise<string>{
  const bytes=await readFile(file.path);
  if(sha256(bytes)!==file.sha256)throw new Error(`artifact hash mismatch: ${file.path}`);
  return bytes.toString("utf8");
}
export async function distDigest(root:string):Promise<string>{
  const records:string[]=[];
  async function walk(dir:string):Promise<void>{
    for(const item of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const path=join(dir,item.name);
      if(item.isSymbolicLink())throw new Error("build tree cannot contain symlinks");
      if(item.isDirectory())await walk(path);
      else records.push(`${path.slice(root.length+1)}:${sha256(await readFile(path))}`);
    }
  }
  await walk(root);return sha256(records.join("\n"));
}
export async function verifyComparisonFiles(m:ComparisonManifest,now=Date.now(),git:(args:string[])=>string=args=>execFileSync("git",args,{cwd:m.repoRoot,encoding:"utf8"})):Promise<void>{
  if(await realpath(m.repoRoot)!==m.repoRoot)throw new Error("repoRoot must be its canonical filesystem path");
  if(git(["rev-parse","HEAD"]).trim()!==m.sourceCommit||git(["status","--porcelain"]).trim()!=="")throw new Error("source commit/cleanliness mismatch");
  await readArtifact(m.build);
  if(await distDigest(dirname(m.build.path))!==m.build.treeSha256)throw new Error("build tree hash mismatch");
  const passive=parsePlayPreset(JSON.parse(await readArtifact(m.presets.diagnostic)) as unknown);
  const enforced=parsePlayPreset(JSON.parse(await readArtifact(m.presets.enforced)) as unknown);
  if(passive.flags.loopGuard||!enforced.flags.loopGuard)throw new Error("preset loop guard arms mismatch");
  for(const preset of [passive,enforced])if(preset.target!=="PLAYER_NAME_CONFIRMED"||preset.limits.maxWallMs!==600000||preset.limits.maxTurns!==300||preset.limits.failureLimit!==3||!preset.flags.activeUi||!preset.flags.interfaceDocs||!preset.flags.objectives)throw new Error("preset must match naming protocol and common instrumentation");
  const normalize=(p:typeof passive)=>canonical({...p,id:"",flags:{...p.flags,loopGuard:false}});
  if(normalize(passive)!==normalize(enforced))throw new Error("presets differ beyond loop guard enforcement");
  for(const lane of m.lanes)if(lane.endpointFile!==null)await readArtifact(lane.endpointFile);
  for(const lane of m.lanes)for(const [kind,file] of [["serving",lane.serving],["environment",lane.environment],["image-tool",lane.imageTool]] as const){
    const receipt:unknown=JSON.parse(await readArtifact(file));
    if(!Value.Check(ReceiptSchema,receipt)||receipt.kind!==kind||receipt.model!==lane.model||receipt.gatewayUrl!==lane.gatewayUrl||receipt.configurationSha256!==lane.configurationSha256||receipt.sourceCommit!==m.sourceCommit||!Number.isFinite(Date.parse(receipt.validUntil))||Date.parse(receipt.validUntil)<=now)throw new Error(`unqualified or stale ${kind} receipt for lane ${lane.id}`);
  }
}
export function filesystemComparisonHost(m:ComparisonManifest,options:{node?:string;now?:()=>string;verify?:ComparisonHost["verify"];watchdogMs?:number;interruptGraceMs?:number;killGraceMs?:number}={}):ComparisonHost{
  const runs=join(m.repoRoot,"runs"),receipts=join(runs,"launch-receipts",m.id),ledger=join(receipts,"trials.jsonl"),lock=join(runs,".naming-gameplay.lock");
  return{
    verify:options.verify??(async manifest=>verifyComparisonFiles(manifest)),
    now:options.now??(()=>new Date().toISOString()),
    readLedger:async()=>{try{return (await readFile(ledger,"utf8")).split("\n").filter(l=>l!=="").map(l=>parseLedger(JSON.parse(l) as unknown));}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return [];throw error;}},
    append:async row=>{await mkdir(receipts,{recursive:true});const handle=await open(ledger,"a",0o600);try{await handle.writeFile(`${JSON.stringify(row)}\n`);await handle.sync();}finally{await handle.close();}},
    acquire:async()=>{await mkdir(runs,{recursive:true});await mkdir(lock);try{await writeFile(join(lock,"owner.json"),JSON.stringify({pid:process.pid,cohort:m.id}),{flag:"wx"});}catch(error){await rm(lock,{recursive:true});throw error;}return async()=>rm(lock,{recursive:true});},
    runExists:async run=>{try{await access(join(runs,run));return true;}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return false;throw error;}},
    launch:async command=>{
      const inherited={...process.env};delete inherited["POKEBENCH_ENDPOINT_FILE"];
      await mkdir(receipts,{recursive:true});
      const stdout=await open(join(receipts,`${command.runId}.stdout.log`),"wx",0o600);
      const stderr=await open(join(receipts,`${command.runId}.stderr.log`),"wx",0o600);
      let exitCode:number|null;
      try{
        exitCode=await new Promise<number|null>((done,reject)=>{
          const child=spawn(options.node??process.execPath,command.argv,{cwd:command.cwd,env:{...inherited,...command.env},stdio:["ignore",stdout.fd,stderr.fd]});
          let timedOut=false;
          let terminate:ReturnType<typeof setTimeout>|undefined,kill:ReturnType<typeof setTimeout>|undefined;
          const timer=setTimeout(()=>{
            timedOut=true;child.kill("SIGINT");
            terminate=setTimeout(()=>{child.kill("SIGTERM");kill=setTimeout(()=>{child.kill("SIGKILL");},options.killGraceMs??1000);},options.interruptGraceMs??30000);
          },options.watchdogMs??840000);
          const clear=():void=>{clearTimeout(timer);clearTimeout(terminate);clearTimeout(kill);};
          child.once("error",()=>{clear();reject(new ComparisonFailure("spawn_error"));});
          child.once("exit",code=>{clear();if(timedOut)reject(new ComparisonFailure("timed_out"));else done(code);});
        });
      }finally{await stdout.close();await stderr.close();}
      let bytes:Buffer;
      try{bytes=await readFile(join(runs,command.runId,"events.jsonl"));}catch{throw new ComparisonFailure("event_missing");}
      let events:ReturnType<typeof parseEvent>[];
      try{events=bytes.toString("utf8").split("\n").filter(l=>l!=="").map(parseEvent);}catch{throw new ComparisonFailure("event_invalid");}
      const start=events[0],end=events.at(-1);
      if(start?.type!=="run_start"||end?.type!=="run_end"||events.some((e,i)=>e.run!==command.runId||e.seq!==i)||events.filter(e=>e.type==="run_start").length!==1||events.filter(e=>e.type==="run_end").length!==1||start.harness.commit!==m.sourceCommit||start.harness.dirty||start.model.id!==command.env["POKEBENCH_MODEL"]||start.start_state.kind!=="boot"||start.isolation.run_data_id!==command.runId||start.isolation.server_dir!==join(runs,command.runId,"server"))throw new ComparisonFailure("event_invalid");
      const preset=parsePlayPreset(JSON.parse(await readFile(command.env["POKEBENCH_PLAY_PRESET"]??"","utf8")) as unknown);
      if(start.evaluation?.preset_id!==preset.id||start.evaluation.target!==preset.target||start.evaluation.failure_limit!==preset.limits.failureLimit||canonical(start.evaluation.flags)!==canonical(preset.flags)||start.budgets.max_wall_ms!==preset.limits.maxWallMs||start.budgets.max_turns!==preset.limits.maxTurns||start.sampling.thinking_level!==preset.sampling.thinkingLevel||start.sampling.max_tokens!==preset.sampling.maxTokens)throw new ComparisonFailure("event_invalid");
      if(end.reason==="milestone"){
        const proof=end.target_proof,marker=events.find(e=>e.seq===proof?.milestone_seq),last=events.filter(e=>e.type==="state"&&e.seq<(marker?.seq??0)).at(-1);
        const definition=MILESTONES.find(d=>d.name===preset.target);
        if(!proof||proof.state_evidence.length!==1||proof.name!==preset.target||marker?.type!=="milestone"||marker.name!==proof.name||marker.origin!=="observed"||marker.kind!==definition?.kind||canonical(marker.evidence)!==canonical(proof.state_evidence)||last?.type!=="state"||!("started" in last)||proof.state_evidence.at(-1)!==last.seq||definition?.reached(last)!==true)throw new ComparisonFailure("event_invalid");
      }
      return {exitCode,reason:end.reason,eventsSha256:sha256(bytes),...(exitCode!==0?{failureCode:"child_nonzero"}:{})};
    },
  };
}

/** Prepare writes immutable protocol bytes only; execution is a separate explicit command. */
export async function comparisonCommand(args:string[],hostFactory:(m:ComparisonManifest)=>ComparisonHost=filesystemComparisonHost):Promise<string>{
  const [mode,path]=args;
  if(args.length!==2||!path||(mode!=="prepare"&&mode!=="execute"))throw new Error("usage: serial-comparison-cli.js prepare|execute <manifest.json>");
  const m=prepareComparison(JSON.parse(await readFile(resolve(path),"utf8")) as unknown);
  const bytes=JSON.stringify(m),digest=sha256(bytes);
  const destination=join(m.repoRoot,"runs","launch-receipts",m.id);
  if(mode==="prepare"){
    await mkdir(destination,{recursive:true});
    await writeFile(join(destination,"manifest.json"),`${bytes}\n`,{flag:"wx",mode:0o600});
    return `Prepared ${String(m.trials.length)} trials (${digest}); no gameplay launched. Qualification required before execute.`;
  }
  const frozen=await readFile(join(destination,"manifest.json"),"utf8");
  if(sha256(frozen.trimEnd())!==digest)throw new Error("frozen prepared manifest differs from execution input");
  await superviseComparison(m,hostFactory(m));
  return `Cohort ${m.id} complete; all launched outcomes retained. No automatic promotion.`;
}
