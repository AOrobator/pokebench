// Disk-only qualification against the immutable, source-pinned historical probe baseline.
// This intentionally makes no claim that an unavailable original HTTP wire body exists.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=resolve(fileURLToPath(new URL('..',import.meta.url)));
const {buildRestoreBundle,verifyRestoreBundle,parseRestoredMessages}=await import(join(repo,'packages/agent/dist/roxanne-restore.js'));
const [directory,contextFile,expectedContextSha]=process.argv.slice(2);
if(!directory||!contextFile||!/^[a-f0-9]{64}$/.test(expectedContextSha??''))throw Error('usage: <native-qualified-directory> <frozen-baseline-context> <expected-sha256>');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const contextBytes=readFileSync(contextFile);if(sha(contextBytes)!==expectedContextSha)throw Error('frozen context digest mismatch');
const context=JSON.parse(contextBytes),q=JSON.parse(readFileSync(join(directory,'qualification.json'),'utf8'));
if(!q.receipt.passed)throw Error('native checkpoint not qualified');
const history=parseRestoredMessages(context.messages);
const prefix=readFileSync(join(directory,'events-prefix.jsonl'),'utf8');
const state=JSON.parse(readFileSync(join(directory,'source-state.json'),'utf8'));
if(context.turn!==q.turn)throw Error('context decision turn mismatch');
const lastResult=[...history].reverse().find(m=>m.role==='toolResult');
if(!lastResult)throw Error('no delivered observation in history');
const text=lastResult.content.filter(p=>p.type==='text').map(p=>p.text).join('\n');
if(!text.includes('RUSTBORO')||!(/(?:you lost|Last observed loss|Battles with GYM LEADER)/.test(history.flatMap(m=>typeof m.content==='string'?[m.content]:m.content.filter(p=>p.type==='text').map(p=>p.text)).join('\n'))))throw Error('source history lacks expected gym/loss-ledger delivery');
const input={sourceRun:q.sourceRun,sourceCommit:q.sourceCommit,turn:q.turn,stateSeq:q.stateSeq,stateBytes:readFileSync(join(directory,'checkpoint.state')),nativeReceipt:q.receipt,history,eventsPrefix:prefix,systemPrompt:context.systemPrompt,toolsHash:sha(JSON.stringify(context.tools)),rtcUnixMs:q.rtcUnixMs};
const bundle=buildRestoreBundle(input);verifyRestoreBundle(bundle,input.stateBytes,history,prefix);
writeFileSync(join(directory,'history.json'),JSON.stringify(history));
writeFileSync(join(directory,'tools.json'),JSON.stringify(context.tools));
writeFileSync(join(directory,'bundle.json'),JSON.stringify(bundle,null,2)+'\n');
writeFileSync(join(directory,'history-qualification.json'),JSON.stringify({passed:true,mode:'validated-reconstructed-historical-context',originalWireBodyAvailable:false,contextFileSha256:expectedContextSha,historySha256:bundle.historyHash,prefixSha256:bundle.eventsHash,sourceStateSeq:state.seq,messages:history.length,images:history.flatMap(m=>typeof m.content==='string'?[]:m.content).filter(p=>p.type==='image').length,lossHistoryPreserved:true,toolsSha256:bundle.toolsHash,rtcUnixMs:bundle.rtcUnixMs,gpuCalls:0},null,2)+'\n');
console.log(JSON.stringify({sourceRun:q.sourceRun,turn:q.turn,passed:true,messages:history.length,historySha256:bundle.historyHash}));
