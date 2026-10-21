#!/usr/bin/env python3
"""Bounded streaming audit of a declared historical cohort; never launches gameplay."""
import collections, datetime as dt, glob, hashlib, json, math, pathlib, re, statistics
from zoneinfo import ZoneInfo
import argparse, subprocess
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo',type=pathlib.Path,default=pathlib.Path.cwd())
parser.add_argument('--workbench',type=pathlib.Path,required=True)
parser.add_argument('--manifest',type=pathlib.Path,required=True)
parser.add_argument('--output',type=pathlib.Path,required=True)
parser.add_argument('--frontier-source',type=pathlib.Path,help='Served viewer frontier.ts matching the workbench; defaults to repo source')
args=parser.parse_args()
ROOT=args.repo.resolve();OUT=args.output.resolve();OUT.mkdir(parents=True,exist_ok=True)
WB=json.loads(args.workbench.read_text()); W={r['id']:r for r in WB['runs']}
MANIFEST=json.loads(args.manifest.read_text())
SRC=(args.frontier_source or ROOT/'packages/viewer/src/frontier.ts').resolve()
VIEWER_DIST=SRC.parent.parent/'dist/frontier.js'
if not VIEWER_DIST.exists():raise ValueError('Build matching viewer or pass --frontier-source for a built served tree: '+str(VIEWER_DIST))
coverage_code="""import{readFileSync}from'node:fs';const{milestoneStatus,FRONTIER_MILESTONES}=await import(process.argv[1]);const w=JSON.parse(readFileSync(process.argv[2],'utf8'));const m=JSON.parse(readFileSync(process.argv[3],'utf8'));console.log(JSON.stringify(Object.fromEntries(m.runIds.map(id=>{const r=w.runs.find(x=>x.id===id);if(!r)throw Error('missing run '+id);return[id,Object.fromEntries(FRONTIER_MILESTONES.map(x=>[x.id,milestoneStatus(r,x.id)]))]}))));"""
COVERAGE=json.loads(subprocess.run(['node','--input-type=module','-e',coverage_code,VIEWER_DIST.as_uri(),str(args.workbench.resolve()),str(args.manifest.resolve())],check=True,text=True,capture_output=True).stdout)
(OUT/'grading-support.json').write_text(json.dumps(COVERAGE,indent=2)+'\n')
CUTOFF=min(WB['at'],dt.datetime.fromisoformat(MANIFEST['cutoff']).timestamp()*1000) if MANIFEST.get('cutoff') else WB['at']
FRONT=re.findall(r'id: "([A-Z_0-9]+)", label: "([^"]+)"',SRC.read_text().split('] as const;')[0])
ORDER=[x[0] for x in FRONT]; LABEL=dict(FRONT)
# The viewer includes optional pre-clear gym trainers. They can describe frontier but cannot reset required-story drought.
REQUIRED=[x for x in ORDER if not x.startswith('RUSTBORO_GYM_TRAINER_')]
IDS=MANIFEST['runIds']
if len(IDS)!=len(set(IDS)):raise ValueError('manifest has duplicate run IDs')
if not IDS:raise ValueError('manifest has no runs')
SELECTED=IDS
GROUPS=MANIFEST['groups']
GROUP_BY_ID={rid:group for group,ids in GROUPS.items() for rid in ids}
if set(IDS)!=set(GROUP_BY_ID):raise ValueError('groups must partition the manifest runIds')
if sum(len(v) for v in GROUPS.values())!=len(IDS):raise ValueError('a run occurs in more than one group')
ROLES=MANIFEST.get('roles',{})
if any(v not in ('primary_census','qualitative_context') for v in ROLES.values()):raise ValueError('unsupported role')
missing=set(IDS)-set(W)
if missing:raise ValueError('workbench missing manifest run(s): '+str(missing))
KEYS=MANIFEST.get('keyMilestones',['RIVAL_MET','STARTER_CHOSEN','RIVAL_BATTLE_WON','RUNNING_SHOES_RECEIVED','PETALBURG_CITY','WALLY_TUTORIAL_COMPLETE','TEAM_AQUA_WOODS_EVENT_COMPLETE','RUSTBORO_CITY','RUSTBORO_CITY_GYM','ROXANNE_FIRST_INTERACTION','ROXANNE_DEFEATED','STONE_BADGE'])
def stamp(x):return dt.datetime.fromisoformat(x).timestamp()*1000

def signature(s):
 if not s:return None
 b=s.get('battle') or {};u=s.get('active_ui') or {};wc=s.get('world_context') or {}
 return json.dumps({'map':s.get('map_id'),'pos':s.get('position'),'face':s.get('facing'),'screen':s.get('screen'),'ui':{k:u.get(k) for k in ['phase','selected','ready','value']},'locked':s.get('field_controls_locked'),'dialogue':wc.get('dialogue'),'battleTurn':b.get('turn'),'battleHP':[(x.get('battler'),x.get('hp'),x.get('status1'),[(m.get('move_id'),m.get('pp')) for m in x.get('moves',[])]) for x in b.get('battlers',[])],'party':[{k:x.get(k) for k in ['identity','species','level','hp','max_hp','status','held_item','moves']} for x in s.get('party',[])],'resources':s.get('resources'),'money':s.get('money'),'badges':s.get('badges'),'story':s.get('story')},sort_keys=True)

def canon(name,args):
 # Exclude justification prose: exact equality refers to logical tool and payload, not explanation text.
 return name+' '+json.dumps({k:v for k,v in args.items() if k!='because'},sort_keys=True,separators=(',',':'))

def negative(e):
 s=e.get('text','');low=s.lower()
 if e.get('is_error'):return 'tool_error'
 rules=[('wrong_map',['requested map is not current','is on another map;']),('not_waiting_for_choice',['battle action: nothing pressed:']),('no_route',['no supported route to a valid approach','not reachable on foot from here; 0']),('collision_target',['is a wall or other solid tile','is a ledge, which you can only hop']),('trainer_guard',['not walked: a trainer you have not beaten can see'])]
 for k,needles in rules:
  if any(x in low for x in needles):return k
 return None

def median(x):return statistics.median(x) if x else None

def extract(rid):
 w=W[rid];split_seqs={x['seq'] for x in w['splits']};split_wall={};p=ROOT/'runs'/rid/'events.jsonl';h=hashlib.sha256();c=collections.Counter();start=end=None;laststate=None;laststate_seq=None;pending={};calls=[];feedback=[];guards=[];breaker=[];assists=[];battleout=[];previousout=None;lat=[];tokens={'input':0,'output':0};press=0;buttons=0;rawram={};extensions=[];init=None;runtime=[]
 with p.open('rb') as f:
  for raw in f:
   h.update(raw);e=json.loads(raw);t=e['type'];n=e['turn'];seq=e['seq'];c[t]+=1
   if seq in split_seqs and start is not None:split_wall[seq]=round(stamp(e['t'])-stamp(start['t']))
   if t=='run_start':start=e
   elif t=='run_end':end=e
   elif t=='state':
    if init is None:init={k:e.get(k) for k in ['started','screen','story','map_id','position']}
    laststate=e;laststate_seq=seq;b=e.get('battle') or {};bo=b.get('outcome')
    if bo and bo!='ongoing' and (bo,b.get('outcome_code'))!=previousout:battleout.append({'turn':n,'seq':seq,'outcome':bo,'code':b.get('outcome_code'),'map':e.get('map_id')})
    previousout=(bo,b.get('outcome_code'))
   elif t=='assistant':
    lat.append(e.get('latency_ms',0));u=e.get('usage',{});tokens['input']+=u.get('input',0);tokens['output']+=u.get('output',0)
   elif t=='tool_call':
    x={'turn':n,'seq':seq,'name':e['name'],'args':{k:v for k,v in e['args'].items() if k!='because'},'canonical':canon(e['name'],e['args']),'preSignature':signature(laststate),'preStateSeq':laststate_seq};pending[e['id']]=x;calls.append(x)
   elif t=='tool_result':
    x=pending.pop(e['id'],None);k=negative(e)
    if x:x.update({'resultSeq':seq,'resultStateSeq':e.get('state_seq'),'negative':k,'postSignature':signature(laststate),'durationMs':e.get('duration_ms'),'isError':e.get('is_error')})
    if k:
     lines=e.get('text','').splitlines();ex=next((l for l in lines if any(s in l.lower() for s in ['navigation:','battle action:','error','refused'])),e.get('text','')[:450]);feedback.append({'turn':n,'seq':seq,'callSeq':x['seq'] if x else None,'class':k,'excerpt':ex[:600],'stateSeq':e.get('state_seq')})
   elif t=='loop_guard':guards.append({k:e.get(k) for k in ['turn','seq','kind','phase','mode','evidence']})
   elif t=='loop_breaker':breaker.append({k:e.get(k) for k in ['turn','seq','stage','trigger','repeats']})
   elif t=='button_press':press+=1;buttons+=len(e.get('buttons',[]))
   elif t in ['auto_talk','story_battle_warning','heal_before_trainers_warning','text_only_supervisor','stall_gate']:assists.append({k:e.get(k) for k in ['type','turn','seq','kind','reason','outcome']})
   elif t=='operator_control' and e.get('status')=='applied':
    if e['action'].startswith('extend'):extensions.append({k:e.get(k) for k in ['turn','seq','action','previous_max_wall_ms','max_wall_ms']})
    runtime.append({k:e.get(k) for k in ['turn','seq','action','paused_ms']})
 if end is None:raise ValueError('active log not eligible: '+rid)
 if stamp(end['t'])>CUTOFF:raise ValueError('run ended after frozen cutoff: '+rid)
 if h.hexdigest()!=w['measurement']['logSha256']:raise ValueError('workbench/log hash mismatch '+rid)
 earned=[dict(s,wallFromStartMs=split_wall.get(s['seq'])) for s in w['splits'] if not s.get('screenshotEvidence')]
 grade=[s for s in earned if s['name'] in ORDER];rank=max((ORDER.index(s['name']) for s in grade),default=-1)
 needed=[s for s in grade if s['name'] in REQUIRED];drought=[];prev={'name':'RUN_START','turn':0,'elapsedMs':0,'seq':0};high=-1
 for s in sorted(needed,key=lambda s:s['seq']):
  ix=REQUIRED.index(s['name'])
  if ix>high:
   drought.append({'from':prev['name'],'to':s['name'],'turns':s['turn']-prev['turn'],'elapsedMs':max(0,s['elapsedMs']-prev['elapsedMs']),'fromSeq':prev['seq'],'toSeq':s['seq'],'censored':False});prev=s;high=ix
 drought.append({'from':prev['name'],'to':'RUN_END','turns':end['turns']-prev['turn'],'elapsedMs':max(0,w['elapsedMs']-prev['elapsedMs']),'fromSeq':prev['seq'],'toSeq':end['seq'],'censored':True})
 immediate=[];recurring=[];prior={}
 for i,x in enumerate(calls):
  if i:
   a=calls[i-1]
   if a.get('negative') and a['canonical']==x['canonical'] and a.get('postSignature')==x['preSignature']:immediate.append({'previousCallSeq':a['seq'],'negativeFeedbackSeq':a.get('resultSeq'),'repeatCallSeq':x['seq'],'turn':x['turn'],'class':a['negative'],'command':x['canonical']})
  key=(x['canonical'],x['preSignature'])
  a=prior.get(key)
  if a and a.get('negative') and 0<x['turn']-a['turn']<=30:recurring.append({'previousCallSeq':a['seq'],'negativeFeedbackSeq':a.get('resultSeq'),'repeatCallSeq':x['seq'],'turn':x['turn'],'gapTurns':x['turn']-a['turn'],'class':a['negative'],'command':x['canonical']})
  prior[key]=x
 recovery_cost=[]
 for gap in drought:
  failures=[x for x in feedback if gap['fromSeq']<x['seq']<=gap['toSeq']]
  if not failures:continue
  first=failures[0]
  sent=[g for g in guards if first['seq']<=g['seq']<gap['toSeq'] and g['mode']=='enforced' and g['phase'] in ('warning','supervisor')]
  recovery_cost.append({'fromSeq':first['seq'],'fromTurn':first['turn'],'toSeq':gap['toSeq'],'toMilestone':gap['to'],'turnsUntilRequiredFrontierProgress':(end['turns'] if gap['censored'] else next(m['turn'] for m in earned if m['seq']==gap['toSeq']))-first['turn'],'censored':gap['censored'],'negativeFeedbackEventsInWindow':len(failures),'recordedEnforcedWarningCount':len(sent),'assistance':'recorded warning in window' if sent else 'no recorded warning in window'})
 summary={'negativeFeedbackCount':len(feedback),'negativeClasses':dict(collections.Counter(x['class'] for x in feedback)),'immediateSameStateFailedRepeats':len(immediate),'sameStateFailedRecurrencesWithin30Turns':len(recurring),'toolResults':c['tool_result'],'toolCalls':c['tool_call'],'assistantTurns':c['assistant'],'loopGuardWarnings':sum(x['phase']=='warning' for x in guards),'loopGuardSupervisors':sum(x['phase']=='supervisor' for x in guards),'loopGuardWouldWarn':sum(x['phase']=='would_warn' for x in guards),'loopGuardRecoveredLabels':sum(x['phase']=='recovered' for x in guards),'breakerStage2':sum(x['stage']==2 for x in breaker),'assistantLatencyMedianMs':median(lat),'assistantLatencyTotalMs':sum(lat),'buttonPressEvents':press,'buttonInputs':buttons}
 features=start.get('evaluation',{}).get('features');feature_sig=hashlib.sha256(json.dumps(features,sort_keys=True).encode()).hexdigest() if features is not None else None
 return {'id':rid,'modelGroup':GROUP_BY_ID[rid],'role':ROLES.get(rid,'primary_census'),'arm':w.get('arm'),'status':w['status'],'endReason':end['reason'],'excluded':w['excluded'],'problem':w['problem'],'started':start['t'],'ended':end['t'],'turns':end['turns'],'activeMs':w['elapsedMs'],'wallMs':end['wall_ms'],'tokens':end.get('tokens',tokens),'provenance':{'model':start['model'],'sampling':start['sampling'],'harness':start['harness'],'vendorPin':start['vendor_pin'],'piVersion':start['pi_version'],'startState':start['start_state'],'resumeLabel':w['config'].get('resume'),'featureSignature':feature_sig,'features':features,'preset':start.get('evaluation',{}).get('preset_id'),'budgets':start.get('budgets'),'effectiveMaxWallMs':extensions[-1]['max_wall_ms'] if extensions else start.get('budgets',{}).get('max_wall_ms'),'extensions':extensions,'logSha256':h.hexdigest(),'logBytes':p.stat().st_size,'pausedMs':w['measurement']['pausedMs'],'sourceConfig':w['config']['source']},'initialObservedState':init,'gradingStatus':COVERAGE[rid],'milestones':earned,'frontier':{'name':ORDER[rank] if rank>=0 else None,'rank':rank,'split':next((s for s in grade if s['name']==ORDER[rank]),None) if rank>=0 else None},'requiredStoryGaps':drought,'recoveryCostProxies':recovery_cost,'longestRequiredStoryGapByTurns':max(drought,key=lambda x:x['turns']),'longestRequiredStoryGapByTime':max(drought,key=lambda x:x['elapsedMs']),'diagnostics':summary,'negativeFeedback':feedback,'immediateFailedRepeats':immediate,'failedRecurrences':recurring,'loopGuards':guards,'loopBreakers':breaker,'assistanceEvents':assists,'operatorControls':runtime,'battleOutcomes':battleout,'rawRam':{'indexExists':(p.parent/'raw-ram/index.jsonl').exists(),'observationIndexExists':(p.parent/'raw-ram/observations.jsonl').exists(),'fullyReparsedForThisReport':False}}

def wilson(s,n):
 if n==0:return None
 z=1.959963984540054;p=s/n;d=1+z*z/n;a=(p+z*z/(2*n))/d;b=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [a-b,a+b]

def aggregate(runs):
 ans=[]
 for model in GROUPS:
  rr=[r for r in runs if r['modelGroup']==model and r['role']=='primary_census'];valid=[r for r in rr if not r['excluded'] and not r['problem']]
  def outcome(r,m,h,axis):
   s=next((s for s in r['milestones'] if s['name']==m),None);v=s.get('wallFromStartMs' if axis=='wallMs' else axis) if s else None
   if r['problem'] is not None:return 'U'
   if v is not None and v<=h:return 'S'
   if r['gradingStatus'].get(m)=='unsupported':return 'U'
   exposure=r['turns'] if axis=='turn' else r['wallMs'] if axis=='wallMs' else r['activeMs']
   return 'F' if exposure>=h else 'U'
  reaches=[]
  for m in REQUIRED:
   values=[next((s for s in r['milestones'] if s['name']==m),None) for r in rr];vals=[s for s in values if s]
   reaches.append({'name':m,'reached':len(vals),'n':len(rr),'unsupported':sum(r['gradingStatus'].get(m)=='unsupported' for r in rr),'medianTurnAmongReachers':median([s['turn'] for s in vals]),'medianActiveMsAmongReachers':median([s['elapsedMs'] for s in vals]),'medianInputTokensAmongReachers':median([s.get('inputTokens',0) for s in vals]),'medianOutputTokensAmongReachers':median([s.get('outputTokens',0) for s in vals]),'runIds':[r['id'] for r,s in zip(rr,values) if s]})
  horizons=[]
  for axis,hs in [('turn',[100,150,200,300,500,1000]),('elapsedMs',[1800000,3600000,7200000]),('wallMs',[1800000,3600000,7200000])]:
   for h in hs:
    for m in KEYS:
     cc=collections.Counter(outcome(r,m,h,axis) for r in rr);s,f,u=[cc[k] for k in 'SFU'];n=s+f+u
     horizons.append({'axis':axis,'horizon':h,'milestone':m,'S':s,'F':f,'U':u,'N':n,'unsupported':sum(r['gradingStatus'].get(m)=='unsupported' for r in rr),'deliveredSuccessShare':s/n if n else None,'possibleCompletionBounds':[s/n,(s+u)/n] if n else None,'observedShare':s/(s+f) if s+f else None,'wilson95Observed':wilson(s,s+f)})
  budget_endpoints=[]
  for budget in sorted({r['provenance']['effectiveMaxWallMs'] for r in rr if r['provenance'].get('effectiveMaxWallMs') is not None}):
   assigned=[r for r in rr if r['provenance']['effectiveMaxWallMs']==budget]
   for milestone in KEYS:
    states=[]
    for r in assigned:
     hit=any(s['name']==milestone for s in r['milestones'])
     states.append('S' if hit else 'U' if r['gradingStatus'].get(milestone)=='unsupported' or r['endReason'] in ('operator_abort','operator_stop') or r['problem'] is not None else 'F')
    cc=collections.Counter(states);budget_endpoints.append({'budgetMs':budget,'milestone':milestone,'S':cc['S'],'F':cc['F'],'U':cc['U'],'N':len(assigned),'runIds':[r['id'] for r in assigned],'definition':'Accepted split by actual observed stop of runs assigned this effective wall budget; aborted/unsupported remain U. Not an exact active-time horizon.'})
  def d(k):return [r['diagnostics'][k] for r in rr]
  ans.append({'model':model,'n':len(rr),'nRankingEligible':len(valid),'runIds':[r['id'] for r in rr],'endReasons':dict(collections.Counter(r['endReason'] for r in rr)),'reaches':reaches,'horizons':horizons,'budgetEndpoints':budget_endpoints,'medians':{'turns':median([r['turns'] for r in rr]),'inputTokens':median([r['tokens']['input'] for r in rr]),'outputTokens':median([r['tokens']['output'] for r in rr]),'negativeFeedbackCount':median(d('negativeFeedbackCount')),'immediateSameStateFailedRepeats':median(d('immediateSameStateFailedRepeats')),'sameStateFailedRecurrencesWithin30Turns':median(d('sameStateFailedRecurrencesWithin30Turns')),'assistantLatencyMedianMs':median(d('assistantLatencyMedianMs')),'longestRequiredStoryGapTurns':median([r['longestRequiredStoryGapByTurns']['turns'] for r in rr]),'longestRequiredStoryGapMs':median([r['longestRequiredStoryGapByTime']['elapsedMs'] for r in rr])},'totals':{k:sum(d(k)) for k in ['negativeFeedbackCount','immediateSameStateFailedRepeats','sameStateFailedRecurrencesWithin30Turns','toolResults','toolCalls','loopGuardWarnings','loopGuardSupervisors','loopGuardWouldWarn','loopGuardRecoveredLabels']},'armCounts':dict(collections.Counter(r['arm'] for r in rr))})
 return ans

runs=[]
for rid in SELECTED:
 r=extract(rid);runs.append(r);print(rid,r['frontier']['name'],r['diagnostics']['negativeFeedbackCount'],flush=True)
# Reference selection exactly mirrors served frontier, including derived native-state splits, excluding screenshot-only.
def rank(w):return max((ORDER.index(s['name']) for s in w['splits'] if s['name'] in ORDER and not s.get('screenshotEvidence')),default=-1)
def eligible(w):return w.get('config') is not None and w['excluded'] is None and w['problem'] is None and w.get('measurement',{}).get('controller')=='agent' and not any(re.search('probe|synthetic|replay',x) for x in w.get('measurement',{}).get('features',[])) and (w['config']['start']=='boot' or w['config'].get('resume')=='MAIN_MENU') and w['status'] in ['ended','live','paused']
best_candidates=sorted([w for w in WB['runs'] if eligible(w)],key=lambda w:(-rank(w),next((s['elapsedMs'] for s in w['splits'] if s['name']==ORDER[rank(w)] and not s.get('screenshotEvidence')),float('inf')),w['id']))
best=best_candidates[0] if best_candidates else None
def ref(w,note):return {'id':w['id'],'model':w['model'],'start':w['config']['start'],'resume':w['config'].get('resume'),'status':w['status'],'note':note,'splits':[s for s in w['splits'] if not s.get('screenshotEvidence')],'logSha256':w.get('measurement',{}).get('logSha256'),'activeMs':w['elapsedMs']}
human=W.get(MANIFEST.get('humanReferenceId'))
data={'schemaVersion':1,'snapshot':{'atUnixMs':WB['at'],'atNewYork':dt.datetime.fromtimestamp(WB['at']/1000,ZoneInfo('America/New_York')).isoformat(),'workbenchSha256':hashlib.sha256(args.workbench.read_bytes()).hexdigest(),'frontierSourcePath':str(SRC),'frontierSourceSha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'frontierDistSha256':hashlib.sha256(VIEWER_DIST.read_bytes()).hexdigest(),'manifestSha256':hashlib.sha256(args.manifest.read_bytes()).hexdigest(),'cutoffUnixMs':CUTOFF},'cohortDefinitions':{'primary':MANIFEST.get('description','Explicit manifest cohort'),'n':sum(r['role']=='primary_census' for r in runs),'qualitativeContextRunIds':[r['id'] for r in runs if r['role']=='qualitative_context'],'excludedFromPrimary':MANIFEST.get('excluded',[]),'selectionCaveat':MANIFEST.get('selectionCaveat','Historical descriptive comparison; not a randomized causal experiment.')},'frontierOrder':[{'id':x,'label':LABEL[x]} for x in ORDER],'requiredStoryOrder':REQUIRED,'keyMilestones':KEYS,'runs':runs,'modelSummaries':aggregate(runs),'references':{'human':ref(human,'Historical human power-on boot: display separately; MAIN_MENU FAST-save agent elapsed times are not directly comparable. Human turn count is not an LLM-turn metric.') if human is not None else {'available':False,'reason':'Manifest humanReferenceId not supplied or absent from workbench.'},'bestActualAgent':ref(best,'Exact served frontierReferences selection at snapshot, progress first then active time; one achieved run, not a stitched record envelope.') if best is not None else {'available':False,'reason':'No eligible frontier agent in supplied workbench.'},'priorBaseline':MANIFEST.get('priorBaseline',{'available':False,'reason':'Manifest supplies no qualified matched predecessor.'})},'methodology':{'splits':'Kept workbench splits without screenshotEvidence; native-state derived splits retain upper-bound marking. Raw run_end furthest_milestone is not used for ranking.','start':'All agent start-state receipts are retained. MAIN_MENU save is not fresh boot.','time':'Workbench active elapsed time excludes operator pauses. Raw wall and pause duration are retained separately.','wallHorizon':'For wallMs, split time is event ISO timestamp minus run_start ISO timestamp; end exposure uses recorded run_end.wall_ms. Submillisecond/clock precision differences exist between timestamp elapsed and monotonic budget timer. Separate budgetEndpoints reports accepted success at actual assigned-budget stop without pretending it observed a full exact active horizon.','tokens':'Repeated input/context tokens are included in API usage; not unique words. Tokenizer differs by model. Output includes server-reported output usage. No monetary or energy cost was measured.','recoveryCost':'Non-overlapping required-frontier gaps with strict negative feedback: from the first negative response until the next monotonic required-frontier advance, or censored at run end. This is an upper-bound task-progress latency proxy, not all attributable wasted effort. Warning presence in the window is recorded assistance context, not causal benefit.','progress':'Ordered required story frontier excludes optional gym trainers from no-progress clock. A long gap is a task-progress proxy, not proof every intervening turn was wasted.','negativeFeedback':'Predefined strict response patterns for wrong map, nothing pressed, route refusal, collision target, trainer guard, plus is_error. Counts are exposure/feature dependent, not ground-truth mistakes.','failedRepeat':'Same logical tool+arguments (because prose removed), same decoded map/position/facing/screen/UI/lock/dialogue/battle-turn/HP/status/PP/party/resources/money/badges/story state, immediately after strict negative feedback. Nonadjacent recurrences share command and pre-state within30 turns. Neither metric infers intent or causality.','horizons':'S: graded split reached by horizon. F: observed through horizon without split. U: stopped before horizon without split, or milestone unsupported by the recorded build according to served milestoneStatus. S/N with completion bounds and observed S/(S+F) Wilson95; intervals do not correct adaptive tuning, small N, confounds, or informative censoring.','loopRecovery':'Existing type-specific recovery collector exported separately; exit from interface/new tile/battle turn is not story-task recovery. Full30-turn windows distinguished from truncated windows, and would_warn diagnostic-only events separated from delivered warnings.','thinking':'Private thinking text is not graded or used as causal evidence.','gradingSupport':'Served viewer milestoneStatus reports missing detector capability as unsupported; an unreached unsupported milestone stays U, even after the horizon. Positive state-derived graded splits still count as S.'},'missingMeasurements':['Causal intelligence ranking from same-harness randomized cross-model trial','A full population of manually adjudicated model mistakes and opportunities','Causal supervisor benefit versus matched no-warning control','Monetary energy GPU utilization and inference throughput measurements','Full raw-RAM reparse of every observation for every episode','Reliable long-term recurrence beyond recorded exposure','Human LLM-turn/token equivalents']}
(OUT/'metrics.json').write_text(json.dumps(data,indent=2)+'\n')
print('WROTE',OUT/'metrics.json')
