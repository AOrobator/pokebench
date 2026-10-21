import{readFileSync,writeFileSync,createReadStream}from'node:fs';
import{createInterface}from'node:readline';
import{createHash}from'node:crypto';
import{pathToFileURL}from'node:url';
const parseArgs=process.argv.slice(2),ri=parseArgs.indexOf('--repo'),repoRoot=ri<0?process.cwd():parseArgs[ri+1];
const{recoveryCollector}=await import(pathToFileURL(repoRoot+'/packages/agent/dist/loop-recovery.js').href);
const argv=process.argv.slice(2),value=k=>{const i=argv.indexOf(k);return i<0?null:argv[i+1]};
const root=value('--repo')??process.cwd(),out=value('--output');
if(!out)throw Error('usage: node recovery.mjs --repo REPO --output DIR');
const data=JSON.parse(readFileSync(out+'/metrics.json','utf8'));
const rows=[];
for(const r of data.runs){
 const col=recoveryCollector();const fireMeta=new Map();let n=0;
 for await(const l of createInterface({input:createReadStream(root+'/runs/'+r.id+'/events.jsonl'),crlfDelay:Infinity})){
  if(!l.trim())continue;const e=JSON.parse(l);col.observe(e);n++;
  if(e.type==='loop_guard')fireMeta.set(e.seq,{phase:e.phase,mode:e.mode,kind:e.kind});
 }
 const v=col.result();const ints=v.interventions.map(x=>({...x,...(fireMeta.get(x.seq)||{}),fullWindowObserved:r.turns>=x.turn+30,taskProgressWithin30:data.runs.find(q=>q.id===r.id).milestones.some(m=>data.requiredStoryOrder.includes(m.name)&&m.turn>x.turn&&m.turn<=x.turn+30),sameSourceReappearanceWithin30:x.relapsed}));
 const groups=[];
 for(const type of [...new Set(ints.map(x=>x.type))]){
  const all=ints.filter(x=>x.type===type),eligible=all.filter(x=>x.fullWindowObserved&&x.phase!=='would_warn'&&x.mode!=='diagnostic');
  groups.push({type,allNotices:all.length,completeDeliveredWindowN:eligible.length,recovered:eligible.filter(x=>x.recovered).length,safe:eligible.filter(x=>x.safe).length,relapsed:eligible.filter(x=>x.relapsed).length,taskProgress:eligible.filter(x=>x.taskProgressWithin30).length,truncated:all.filter(x=>!x.fullWindowObserved).length,diagnosticOnly:all.filter(x=>x.phase==='would_warn'||x.mode==='diagnostic').length});
 }
 rows.push({id:r.id,model:r.modelGroup,role:r.role,events:n,interventions:ints,completeDeliveredGroups:groups,rawCollectorRates:v.rates});
 console.log(r.id,ints.length,'notices');
}
const source=root+'/packages/agent/dist/loop-recovery.js';
writeFileSync(out+'/recovery.json',JSON.stringify({schemaVersion:1,windowTurns:30,source,sourceSha256:createHash('sha256').update(readFileSync(source)).digest('hex'),notes:['Existing production collector measures type-specific local recovery; navigation means new tile/story event, battle means a battle turn/end, dialogue/interface means closing it, story_character means talk/story event. None establishes causal warning benefit.','CompleteDeliveredGroups excludes would_warn/diagnostic-only notices and windows with fewer than30 later observed turns; rawCollectorRates retain original truncated windows and must not be read as matched causal baselines.','taskProgressWithin30 is any earned required-story milestone within30 turns, a secondary proxy; no claim that the warning caused it.','Relapsed means same source fired again within30 turns, not manually adjudicated recurrence of the exact mistake.'],runs:rows},null,2)+'\n');
