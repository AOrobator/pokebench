import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe,it,expect,vi} from 'vitest';
import {parseEvent, type BodyOf} from './events.js';
import {RunLog} from './run-log.js';
import {RunRecorder} from './recorder.js';
import {FrameStore} from './frames.js';
import {StateWatcher} from './game-state.js';
import {RUN_START_META,IN_GAME} from '../test-support/events.js';

const learned:Omit<BodyOf<'native_action'>,'type'|'turn'>={id:1,frame:10,server_timestamp:1000,kind:'move_learned',details:{identity:'1:2',species:'MARILL',move_id:55,move_name:'WATER GUN',before_moves:[33],after_moves:[33,55]}};
function setup(batch:unknown,enabled=true){
 const root=mkdtempSync(join(tmpdir(),'pb-actions-'));const log=RunLog.create(root,'2026-10-14T03-00-00_probe_actions');
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json(batch));
 const source=new StateWatcher('http://game',fetcher);
 const recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(IN_GAME),nativeActions:(after)=>source.nativeActions(after)}});
 return {recorder,log,fetcher,start:()=>recorder.start({...RUN_START_META,harness_features:enabled?['native-action-history-v1']:[]},false),events:()=>readFileSync(log.eventsPath,'utf8').trim().split('\n').map(parseEvent)};
}
describe('native action history',()=>{
 it('records all native events in order and acknowledges only durable history',async()=>{
  const h=setup({frame:20,last_id:2,entries:[learned,{...learned,id:2,frame:20,kind:'berry_planted'}]});await h.start();
  await h.recorder.recordNativeActions();
  expect(h.events().filter(e=>e.type==='native_action').map(e=>e.id)).toEqual([1,2]);
  expect(h.fetcher.mock.calls[0]?.[0]).toBe('http://game/pokebench/actions?after=0');
  h.fetcher.mockResolvedValue(Response.json({frame:21,last_id:2,entries:[]}));
  await h.recorder.recordNativeActions();
  expect(h.fetcher.mock.calls[1]?.[0]).toBe('http://game/pokebench/actions?after=2');
 });
 it.each([
  {frame:20,last_id:2,entries:[learned,{...learned,id:3}]},
  {frame:9,last_id:1,entries:[learned]},
  {frame:20,last_id:2,entries:[learned]},
  {frame:20,last_id:1,entries:[{...learned,kind:'guessed_move'}]},
])('rejects a broken batch before partially recording and latches the failure',async batch=>{
  const h=setup(batch);await h.start();
  await expect(h.recorder.recordNativeActions()).rejects.toThrow();
  await expect(h.recorder.recordNativeActions()).rejects.toThrow();
  expect(h.events().filter(e=>e.type==='native_action')).toHaveLength(0);
  expect(h.events().filter(e=>e.type==='telemetry_error')).toHaveLength(1);
  expect(h.fetcher).toHaveBeenCalledTimes(1);
});
// The journal stamps entries with the server's wall clock, so an NTP step regresses a timestamp
// without any hole in the journal. Frame and id stay monotone, so the run must survive.
it('records a wall-clock step instead of failing a batch that is otherwise continuous',async()=>{
  const h=setup({frame:20,last_id:2,entries:[learned,{...learned,id:2,frame:20,server_timestamp:999}]});await h.start();
  await h.recorder.recordNativeActions();
  const events=h.events();
  expect(events.filter(e=>e.type==='native_action').map(e=>e.id)).toEqual([1,2]);
  const steps=events.filter(e=>e.type==='clock_step');
  expect(steps).toHaveLength(1);
  expect(steps[0]).toMatchObject({back_ms:1000,last_id:2});
  expect(events.filter(e=>e.type==='telemetry_error')).toHaveLength(0);
  h.fetcher.mockResolvedValue(Response.json({frame:21,last_id:2,entries:[]}));
  await expect(h.recorder.recordNativeActions()).resolves.toBeUndefined();
  expect(h.fetcher.mock.calls[1]?.[0]).toBe('http://game/pokebench/actions?after=2');
});
 it('does not require journals for older run contracts',async()=>{
  const h=setup({},false);await h.start();await h.recorder.recordNativeActions();expect(h.fetcher).not.toHaveBeenCalled();
 });
 it('fails declared recording when the endpoint is unavailable',async()=>{
  const h=setup({});await h.start();h.fetcher.mockResolvedValue(new Response('',{status:503}));
  await expect(h.recorder.checkMilestones()).rejects.toThrow('503');
 });
});
it('returns the last durably drained cursor without rewinding a destructive journal',async()=>{
 const h=setup({frame:20,last_id:1,entries:[learned]});await h.start();expect(()=>{h.recorder.nativeJournalReceipt();}).toThrow();await h.recorder.recordNativeActions();const receipt=h.recorder.nativeJournalReceipt();expect(receipt).toEqual({frame:20,lastId:1});receipt.frame=999;expect(h.recorder.nativeJournalReceipt().frame).toBe(20);expect(h.fetcher).toHaveBeenCalledTimes(1);
 const old=setup({},false);await old.start();expect(()=>{old.recorder.nativeJournalReceipt();}).toThrow();
 h.fetcher.mockResolvedValue(new Response('',{status:503}));await expect(h.recorder.recordNativeActions()).rejects.toThrow();expect(()=>{h.recorder.nativeJournalReceipt();}).toThrow();
});
it('reports the actual recorder turn without advancing it for a request receipt',async()=>{const h=setup({frame:0,last_id:0,entries:[]});await h.start();expect(h.recorder.currentTurn()).toBe(0);await h.recorder.transformContext([]);expect(h.recorder.currentTurn()).toBe(1);expect(h.recorder.currentTurn()).toBe(1);await h.recorder.transformContext([]);expect(h.recorder.currentTurn()).toBe(2);});
