import {createHash} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {featureInfo,featuresOf,playHarnessFeatures,stateOnlyProblems,SWITCHABLE_FEATURES} from "./features.js";
import {flagFeatures,normalizeFeatures,parsePlayPreset,terminationTarget} from "./play-preset.js";
import {deliverInitialPlayTask,initialPlayTask,playGoal,playSystemPrompt} from "./play-config.js";
import {CHECKPOINT_RESEARCH_NOTE_LIMITS,loadCheckpointResearchNote,checkpointResearchNoteReceipt} from "./checkpoint-research-note.js";
const ID="checkpoint-research-note-v1";
const off={...featuresOf([]),"save-state-task-truth-v1":true},on={...off,[ID]:true};
const save={kind:"save_state" as const};
const sha=(text:string)=>createHash("sha256").update(text).digest("hex");
const descriptor=(text="Investigate the observed unfinished request before returning to an older itinerary.")=>({version:1,policyId:"observed-episode-v1",text,sha256:sha(text)});
const file=(value:unknown=descriptor())=>{const body=JSON.stringify(value);return {body,config:{path:"/frozen/candidate.json",sha256:sha(body)}};};
const load=(value:unknown=descriptor(),limits:{fileBytes:number;textBytes:number}=CHECKPOINT_RESEARCH_NOTE_LIMITS)=>{const f=file(value);const note=loadCheckpointResearchNote(on,save,f.config,()=>f.body,limits);if(note===null)throw new Error("missing note");return note;};
describe(ID,()=>{
 it("is appended at registry index314, optional/default OFF, and recorded only when ON",()=>{
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(313);
  expect(featureInfo(ID).needs).toBe("save-state-task-truth-v1");
  expect(featureInfo(ID).description).toContain(" Off: ");
  const {"checkpoint-research-note-v1":omitted,...legacy}=off;expect(omitted).toBe(false);
  expect(normalizeFeatures(legacy)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:false,activeUi:false,interfaceDocs:false,objectives:false})[ID]).toBe(false);
  expect(playHarnessFeatures(off,null)).not.toContain(ID);expect(playHarnessFeatures(on,null).at(-1)).toBe(ID);
  expect(stateOnlyProblems({...on,"state-only-decisions-v1":true})).toEqual([`state-only-decisions-v1 requires ${ID} OFF`]);
 });
 it("OFF performs no file I/O and preserves exact initial task, system prompt and goal",()=>{
  const read=vi.fn(()=>{throw new Error("must not read");});
  expect(loadCheckpointResearchNote(off,{kind:"boot"},{path:"bad",sha256:"bad"},read)).toBeNull();expect(read).not.toHaveBeenCalled();
  const note=load();
  expect(initialPlayTask(save,null,off,note)).toBe("The game has resumed from a recorded checkpoint. Continue playing from the current state.");
  expect(playGoal(null,on)).toBe(playGoal(null,off));expect(playSystemPrompt(on,null)).toBe(playSystemPrompt(off,null));
 });
 it("delivers exact frozen text through the initial-task production consumer without changing target/stopAt",()=>{
  const note=load();let message:unknown;
  expect(deliverInitialPlayTask(save,null,on,()=>123,task=>{message=task;return "delivered";},note)).toBe("delivered");
  const expected="The game has resumed from a recorded checkpoint. Continue playing from the current state.\n\n"+descriptor().text;
  expect(message).toEqual({role:"user",content:expected,timestamp:123});
  expect(checkpointResearchNoteReceipt(note,expected)).toEqual({version:1,feature:ID,placement:"initial_user_message",policyId:descriptor().policyId,source_sha256:file().config.sha256,text_sha256:descriptor().sha256,text_bytes:Buffer.byteLength(descriptor().text),initial_task_sha256:sha(expected),descriptor:descriptor()});
  const p=parsePlayPreset({version:2,id:"native-test",target:null,features:on,limits:{maxTurns:20,maxWallMs:1000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096}});
  expect(p.target).toBeNull();expect(terminationTarget(p)).toBeNull();
  expect(initialPlayTask(save,"STONE_BADGE",on,note)).toBe(initialPlayTask(save,"STONE_BADGE",off)+"\n\n"+descriptor().text);
 });
 it("rejects missing descriptor, boot, wrong file hash and nontruthful save configuration before reading or delivery",()=>{
  const f=file(),read=vi.fn(()=>f.body);
  expect(()=>loadCheckpointResearchNote(on,{kind:"boot"},f.config,read)).toThrow(/save-state/);expect(read).not.toHaveBeenCalled();
  expect(()=>loadCheckpointResearchNote(on,save,undefined,read)).toThrow(/file and SHA/);
  expect(()=>loadCheckpointResearchNote({...on,"save-state-task-truth-v1":false},save,f.config,read)).toThrow(/save-state-task-truth/);
  expect(()=>loadCheckpointResearchNote(on,save,{...f.config,sha256:"0".repeat(64)},read)).toThrow(/file SHA/);
  expect(()=>loadCheckpointResearchNote(on,save,{...f.config,sha256:"bad"},read)).toThrow(/file and SHA/);
  const noRead=vi.fn(()=>f.body);expect(()=>loadCheckpointResearchNote(on,save,{...f.config,path:"  "},noRead)).toThrow(/file and SHA/);expect(noRead).not.toHaveBeenCalled();
  expect(()=>initialPlayTask(save,null,on)).toThrow(/validated/);
  expect(()=>initialPlayTask(save,null,{...on,"save-state-task-truth-v1":false},load())).toThrow(/save-state-task-truth/);
  expect(()=>initialPlayTask({kind:"boot"},null,on,load())).toThrow(/save-state/);
 });
 it.each([
  {...descriptor(),version:2},{...descriptor(),extra:true},{...descriptor(),policyId:"bad id"},
  {...descriptor(),text:""},descriptor("  "),{...descriptor(),sha256:"0".repeat(64)},
  {...descriptor(),sha256:"BAD"},null,[],
 ])("rejects schema/content changes: %j",value=>{expect(()=>load(value)).toThrow();});
 it("uses byte bounds, rejects malformed JSON and tests tiny injected limits without filling production caps",()=>{
  expect(CHECKPOINT_RESEARCH_NOTE_LIMITS).toEqual({fileBytes:65536,textBytes:8192});
  const f=file();expect(()=>loadCheckpointResearchNote(on,save,f.config,()=>f.body,{fileBytes:2,textBytes:2})).toThrow(/file size/);
  expect(()=>load(descriptor("éé"),{fileBytes:1000,textBytes:3})).toThrow(/text size/);
  expect(()=>loadCheckpointResearchNote(on,save,{path:"x",sha256:sha("{")},()=>"{")).toThrow();
 });
});
