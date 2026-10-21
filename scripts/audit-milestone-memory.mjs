// Offline audit only: reads immutable run prefixes, never calls a model or emulator.
import {createReadStream,readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {createInterface} from "node:readline";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {resolve} from "node:path";
import {ObservedInstructions} from "../packages/agent/dist/observed-instructions.js";
import {checkEvent} from "../packages/agent/dist/events.js";
const runs=resolve(process.argv[2]??"runs"),out=resolve(process.argv[3]??"runs/milestone-instruction-memory");
mkdirSync(out,{recursive:true});
const reports=[];
for(const id of ["ea04","d548","1331","fd95","8892","acfa"]){
 const fixture=JSON.parse(gunzipSync(readFileSync(new URL(`../packages/agent/src/fixtures/milestone-memory-${id}.json.gz`,import.meta.url))));
 const legacy=new ObservedInstructions(id==="ea04"),candidate=new ObservedInstructions(id==="ea04",true),hash=createHash("sha256");
 const lines=createInterface({input:createReadStream(resolve(runs,fixture.run,"events.jsonl")),crlfDelay:Infinity});let bytes=0;
 for await(const line of lines){
  const seq=/"seq":(\d+)/.exec(line.slice(0,240));if(seq&&Number(seq[1])>fixture.cutoff)break;
  const raw=line+"\n";hash.update(raw);bytes+=Buffer.byteLength(raw);
  if(!["state","tool_result","dialogue_auto_advance"].some(type=>line.slice(0,240).includes(`"type":"${type}"`)))continue;
  const event=checkEvent(JSON.parse(line));legacy.observe(event);candidate.observe(event);
 }
 const sha=hash.digest("hex");if(sha!==fixture.source_prefix_sha256||bytes!==fixture.source_prefix_bytes)throw Error(`${id}: source prefix changed`);
 const original=legacy.text(),text=candidate.text(),receipt=candidate.retention();
 if(original===null||text===null||receipt===null)throw Error(`${id}: memory absent`);
 const expected=id==="ea04"?[...fixture.expected_keep,5006,11212].sort((a,b)=>a-b):fixture.expected_keep;
 if(JSON.stringify(receipt.kept.map(e=>e.result_event))!==JSON.stringify(expected))throw Error(`${id}: keep set differs from reviewed expectations`);
 if(original.length!==fixture.original_chars)throw Error(`${id}: legacy baseline differs (${original.length} vs ${fixture.original_chars})`);
 const archive=candidate.archive();if(JSON.stringify(archive)!==JSON.stringify(legacy.archive()))throw Error(`${id}: archive changed`);
 const payload=JSON.parse(text.slice(text.indexOf("\n")+1));
 for(const ep of archive){const kept=payload.episodes.find(e=>e.result===ep.result_event);if(kept&&JSON.stringify(kept.pages)!==JSON.stringify(ep.pages.map(p=>[p.speaker,p.speaker_source,p.text,p.map,p.map_id,p.state_seq])))throw Error(`${id}: retained page changed`);}
 const report={id,run:fixture.run,cutoff:fixture.cutoff,source_prefix_bytes:bytes,source_prefix_sha256:sha,original_chars:original.length,candidate_chars:text.length,archive_unchanged:true,retention:receipt,episodes:archive.map(e=>({result_event:e.result_event,dialogue_events:e.dialogue_events,turn:e.turn,pages:e.pages,decision:[...receipt.kept,...receipt.retired].find(k=>k.result_event===e.result_event)}))};
 reports.push(report);writeFileSync(resolve(out,`${id}.json`),JSON.stringify(report,null,2)+"\n");writeFileSync(resolve(out,`${id}-model-input.txt`),text+"\n");
 console.log(`${id}: ${receipt.kept.length}/${archive.length} retained, ${receipt.retired.length} archived; ${original.length} → ${text.length} chars; prefix and archive verified`);
}
writeFileSync(resolve(out,"summary.json"),JSON.stringify(reports.map(({episodes,...r})=>r),null,2)+"\n");
