import {CampaignController,digest,type CampaignJob} from "./roxanne-campaign.js";
import {INITIAL_PROMPTS,candidate,revise,selectParent,nominatable,runFrozenBatch,type Candidate,type DevelopmentResult,type EpisodeHost} from "./roxanne-campaign-runner.js";
import {makeTargetValidation} from "./roxanne-campaign.js";
import {provisionalWinner,type ValidationRow} from "./roxanne-score.js";

export interface QualifiedStart{readonly id:string;readonly family:string;readonly restoreHash:string;readonly qualified:boolean}
export interface AutonomousInputs{readonly development:readonly [QualifiedStart,QualifiedStart];readonly readiness:readonly [QualifiedStart,QualifiedStart];readonly endpoints:readonly [string,string];readonly seed:number}
export interface AutonomousHost extends EpisodeHost{
 /** Called only after finalist wording and development replication are locked. No content reaches revision. */
 qualifyHeldout(frozenPrompt:Candidate):Promise<readonly [QualifiedStart,QualifiedStart]>;
 freezeFinalist(candidate:Candidate):Promise<void>;
 /** Persist exact wording and lineage before any episode refers to its hash. */
 freezeCandidate(candidate:Candidate):Promise<void>;
 report(result:AutonomousResult):Promise<void>;
}
export interface AutonomousResult{readonly status:"provisional_winner"|"no_winner"|"stopped";readonly reason:string;readonly finalist:Candidate|null;readonly development:readonly DevelopmentResult[];readonly validation:readonly ValidationRow[];readonly baseline:readonly ValidationRow[];readonly readiness:readonly boolean[];readonly baselineReadiness:readonly boolean[];readonly gpuMs:number}
function checkStarts(starts:readonly QualifiedStart[]):void{
 if(starts.length!==2||new Set(starts.map(s=>s.id)).size!==2||starts.some(s=>!s.qualified||!/^[a-f0-9]{64}$/.test(s.restoreHash)))throw new Error("two qualified restore starts required");
}
function devJobs(phase:string,arms:readonly Candidate[],starts:readonly QualifiedStart[],endpoints:readonly [string,string]):CampaignJob[]{
 const jobs:CampaignJob[]=[];
 for(const [i,start]of starts.entries())for(const [n,arm]of [null,...arms].entries())jobs.push({id:`${phase}-${String(jobs.length+1)}`,arm:arm?.id??"baseline",family:start.family,endpoint:endpoints[(n+i)%2]??"",capMs:1_800_000,promptHash:arm?.hash??digest(""),restoreHash:start.restoreHash});
 return jobs;
}
/** Orchestration has no network/process authority: every effect is an injected, separately authorized host. */
export async function runAutonomousCampaign(controller:CampaignController,inputs:AutonomousInputs,host:AutonomousHost):Promise<AutonomousResult>{
 checkStarts(inputs.development);checkStarts(inputs.readiness);
 if(new Set(inputs.readiness.map(s=>s.family)).size!==2||new Set([...inputs.development,...inputs.readiness].map(s=>s.restoreHash)).size!==4||new Set(inputs.development.map(s=>s.family)).size!==2||new Set(inputs.endpoints).size!==2||!Number.isSafeInteger(inputs.seed)||controller.state.batches.length!==0)throw new Error("fresh campaign, two families and two endpoints required; reconcile existing state instead of restarting");
 const rows:DevelopmentResult[]=[];const families:[string,string]=[inputs.development[0].family,inputs.development[1].family];
 let finalist:Candidate|null=null;const validation:ValidationRow[]=[],baseline:ValidationRow[]=[],readiness:boolean[]=[],baselineReadiness:boolean[]=[];
 const finish=async(status:AutonomousResult["status"],reason:string):Promise<AutonomousResult>=>{const result={status,reason,finalist,development:rows,validation,baseline,readiness,baselineReadiness,gpuMs:controller.state.spentMs};if(status!=="provisional_winner")controller.stop(reason);await host.report(result);return result;};
 const runDev=async(phase:"explore"|"revise"|"replicate",arms:readonly Candidate[],starts:readonly QualifiedStart[]):Promise<void>=>{
  for(const arm of arms)await host.freezeCandidate(arm);
  const jobs=devJobs(phase,arms,starts,inputs.endpoints);const batch=await runFrozenBatch(controller,phase,jobs,host);
  for(const job of jobs){if(job.arm==="baseline")continue;const arm=arms.find(a=>a.id===job.arm),outcome=batch.outcomes.get(job.id),judgment=batch.judgments.get(job.id);const controlJob=jobs.find(j=>j.arm==="baseline"&&j.family===job.family),control=controlJob===undefined?undefined:batch.outcomes.get(controlJob.id),controlJudgment=controlJob===undefined?undefined:batch.judgments.get(controlJob.id);
   if(arm===undefined||outcome===undefined||judgment===undefined||control===undefined||!judgment.verified||!outcome.nativeScore.verified||!control.nativeScore.verified||controlJudgment?.verified!==true)throw new Error("complete locked trace judgments required before adaptation");
   rows.push({candidate:arm,family:job.family,recovered:outcome.nativeScore.strictRecovery,baselineRecovered:control.nativeScore.strictRecovery,unchanged:outcome.nativeScore.unchangedRematches,wins:Number(outcome.nativeScore.victory),tokens:judgment.tokens,factualError:judgment.factualError,evidence:judgment.evidence.join(";"),diagnosis:judgment.diagnosis});
  }
 };
 try{
  const a=candidate("a",INITIAL_PROMPTS.a),b=candidate("b",INITIAL_PROMPTS.b);await runDev("explore",[a,b],inputs.development);
  const parent=selectParent(rows);if(parent===null)return await finish("no_winner","no development parent");
  const own=rows.filter(r=>r.candidate.hash===parent.hash);const problem=own.find(r=>!r.recovered&&r.diagnosis!=="none"&&r.evidence.length>0);
  const next=own.every(r=>r.recovered)?parent:problem===undefined?null:revise(parent,problem.diagnosis,[problem.evidence]);
  if(next===null)return await finish("no_winner","no evidenced focused revision; keep protected reserve");
  await runDev("revise",[next],inputs.development);
  const eligible=[a,b,next].filter((v,i,all)=>all.findIndex(x=>x.hash===v.hash)===i&&nominatable(rows,v.hash,families,true));
  finalist=selectParent(rows.filter(r=>eligible.some(c=>c.hash===r.candidate.hash)));if(finalist===null)return await finish("no_winner","no exact prompt clears preliminary two-family gates");
  await runDev("replicate",[finalist],[inputs.development[0]]);
  if(rows.at(-1)?.recovered!==true||!nominatable(rows,finalist.hash,families,true))return await finish("no_winner","final replication failed");
  await host.freezeFinalist(finalist);
  const heldout=await host.qualifyHeldout(finalist);checkStarts(heldout);
  const exposed=new Set([...inputs.development,...inputs.readiness].map(s=>s.family));if(new Set(heldout.map(s=>s.family)).size!==2||heldout.some(s=>exposed.has(s.family)))throw new Error("heldout source-family leakage or insufficient families");
  const targetJobs=makeTargetValidation(finalist.id,finalist.hash,[heldout[0].family,heldout[1].family],inputs.endpoints,[heldout[0].restoreHash,heldout[1].restoreHash],inputs.seed);
  const target=await runFrozenBatch(controller,"validate",targetJobs,host);
  for(const job of targetJobs){const outcome=target.outcomes.get(job.id),judge=target.judgments.get(job.id);if(outcome===undefined||judge===undefined)throw new Error("missing heldout grade");const row={family:job.family,recovered:outcome.nativeScore.strictRecovery,victory:outcome.nativeScore.victory,verified:outcome.nativeScore.verified&&judge.verified&&!judge.factualError};(job.arm==="baseline"?baseline:validation).push(row);}
  const controlJobs:CampaignJob[]=[];for(const start of inputs.readiness)for(const endpoint of inputs.endpoints)for(const arm of [null,finalist])controlJobs.push({id:`control-${String(controlJobs.length+1)}`,arm:arm?.id??"baseline",family:start.family,endpoint,capMs:600_000,promptHash:arm?.hash??digest(""),restoreHash:start.restoreHash});
  const controls=await runFrozenBatch(controller,"controls",controlJobs,host);
  for(const job of controlJobs){const outcome=controls.outcomes.get(job.id),judge=controls.judgments.get(job.id);const passed=outcome?.readinessPassed===true&&outcome.nativeScore.verified&&judge?.verified===true&&!judge.factualError;(job.arm==="baseline"?baselineReadiness:readiness).push(passed);}
  return await finish(provisionalWinner(validation,baseline,readiness,baselineReadiness)?"provisional_winner":"no_winner","frozen validation completed; result is not powered confirmation or promotion");
 }catch(error){controller.stop(error instanceof Error?error.message:"campaign failed");return await finish("stopped",controller.state.stopped??"campaign stopped");}
}
