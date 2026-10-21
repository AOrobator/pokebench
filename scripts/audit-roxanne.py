"""Inventory retained native observations without changing original logs or images."""
import json, pathlib, hashlib, sys
root=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else pathlib.Path(__file__).resolve().parents[1]/'runs'
out=root/'roxanne-first-interaction/inventory.jsonl'
out.parent.mkdir(parents=True,exist_ok=True)
paths=sorted(root.rglob('events.jsonl'))
with out.open('w') as target:
 for i,p in enumerate(paths):
  h=hashlib.sha256(); n=0; gym=0; first=None; candidates=[]; frames=[]; start=None; errors=0
  with p.open('rb') as f:
   limit=p.stat().st_size
   while n<limit:
    line=f.readline(min(4*1024*1024,limit-n)); n+=len(line); h.update(line)
    try: e=json.loads(line)
    except Exception: errors+=1; continue
    if e.get('type')=='run_start': start={k:e.get(k) for k in ['run','start_state','controller','harness_features']}
    if e.get('type')=='state' and e.get('map_id')==[11,3]:
     gym+=1; d=(e.get('world_context') or {}).get('dialogue') or ''; opp=e.get('trainer_opponent') or {}
     if 'ROXANNE' in d or (opp.get('trainer_id')==265 and opp.get('battle_active')):
      if len(candidates)<12:candidates.append({k:e.get(k) for k in ['seq','t','screen','in_battle','field_controls_locked','trainer_opponent','world_context']})
     if first is None and ('Hello, I am ROXANNE' in d or (opp.get('trainer_id')==265 and opp.get('battle_active'))):first=e.get('seq')
    if e.get('type')=='human_sample' and gym: 
     if len(frames)<3:frames.append(e)
  row={'path':str(p),'bytes':n,'sha256':h.hexdigest(),'start':start,'gym_states':gym,'first':first,'candidates':candidates,'frames':frames,'parse_errors':errors}
  target.write(json.dumps(row)+'\n'); target.flush()
  if gym:print(p.parent.name,gym,first,flush=True)
 print('FINISHED',len(paths),flush=True)
