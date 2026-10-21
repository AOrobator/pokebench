// Read-only reduction of an exhaustive inventory. The inventory is emitted by audit-roxanne.py;
// native backfills remain projections, never appended historical milestone events.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readNativeRecording } from '../packages/viewer/dist/frontier-recording.js';
import { qualifiedNativeMilestone } from '../packages/agent/dist/milestones.js';
const [inventoryPath, previewRoot, outputPath] = process.argv.slice(2);
if (!inventoryPath || !previewRoot || !outputPath) throw Error('Usage: node scripts/backfill-roxanne.mjs inventory.jsonl scratch-runs-root output.json');
const inventory=readFileSync(inventoryPath,'utf8').trim().split('\n').map(line=>JSON.parse(line));
const report={recordings:inventory.length,inspectedGymRecordings:0,recovered:0,rows:[]};
for(const row of inventory){
 const id=row.start?.run;
 if(!row.gym_states){report.rows.push({path:row.path,id,status:row.parse_errors?'unknown: malformed source lines':'no recorded gym-state evidence',logBytes:row.bytes,logSha256:row.sha256});continue;}
 report.inspectedGymRecordings++;
 const file=join(previewRoot,row.start?.controller?.kind==='human'?'human':'',id,'events.jsonl');
 try {
  const recording=readNativeRecording(file,id,qualifiedNativeMilestone,500000,true);
  const split=recording.splits.find(s=>s.name==='ROXANNE_FIRST_INTERACTION');
  const evidence=recording.measurement.rawSplits.find(s=>s.name==='ROXANNE_FIRST_INTERACTION');
  if(split)report.recovered++;
  report.rows.push({path:row.path,id,status:split?'recovered':'no confirmed Roxanne interaction',split:split??null,evidence:evidence??null,logSha256:recording.measurement.logSha256,logBytes:recording.measurement.logBytes,skipped:recording.skipped,otherSplitNames:recording.splits.filter(s=>s.name!=='ROXANNE_FIRST_INTERACTION').map(s=>s.name)});
 }catch(error){report.rows.push({path:row.path,id,status:'unknown: reader rejected recording',error:String(error)});}
 writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');
}
writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({recordings:report.recordings,inspectedGymRecordings:report.inspectedGymRecordings,recovered:report.recovered}));
