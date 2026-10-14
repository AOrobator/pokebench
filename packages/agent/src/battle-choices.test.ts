import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe,it,expect,vi} from 'vitest';
import {Type, type Static} from 'typebox';
import {Value} from 'typebox/value';
import {BattleJournalSchema,parseEvent,type BodyOf} from './events.js';
import {RunLog} from './run-log.js';
import {RunRecorder} from './recorder.js';
import {FrameStore} from './frames.js';
import {StateWatcher} from './game-state.js';
import {humanSampler} from './human.js';
import {RUN_START_META,IN_GAME} from '../test-support/events.js';
export const choice={id:1,frame:10,recorded_ms:1000,battle:1,battle_turn:1,action:'move',action_id:0,origin:'selected',actor:{battler:0,position:0,party_slot:0,species_id:25,species:'PIKACHU',identity:'00000001:00000002',level:10,hp:20,max_hp:30},move:{id:55,name:'WATER GUN',slot:0,pp:25},target:{battler:1,position:1,party_slot:0,species_id:74,species:'GEODUDE',identity:'00000003:00000004',level:12,hp:30,max_hp:40},item_id:null,switch_party_slot:null,source:{main_func:0x0803D2E9,communication:[5,5],battle_type:0}} satisfies Omit<BodyOf<'battle_choice'>,'type'|'turn'>;
type Batch=Static<typeof BattleJournalSchema>;
function setup(batches:Batch[],enabled=true){
 const root=mkdtempSync(join(tmpdir(),'pb-choice-'));const log=RunLog.create(root,'2026-10-14T03-00-00_probe_choices');
 const poll=vi.fn((after:number)=>Promise.resolve(batches.shift()??{frame:10,last_id:after,entries:[]}));
 const recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(IN_GAME),battleChoices:poll}});
 return {recorder,log,poll,start:()=>recorder.start({...RUN_START_META,harness_features:enabled?['battle-choices-v1']:[]},false),events:()=>readFileSync(log.eventsPath,'utf8').trim().split('\n').map(parseEvent)};
}
describe('battle choice transport and recording',()=>{
 it('validates actual endpoint payload and refuses unavailable or malformed journals',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({frame:10,last_id:1,entries:[choice]}));
  expect(await new StateWatcher('http://game',fetcher).battleChoices(0)).toEqual({frame:10,last_id:1,entries:[choice]});
  expect(fetcher.mock.calls[0]?.[0]).toBe('http://game/pokebench/battle/choices?after=0');
  fetcher.mockResolvedValue(Response.json({entries:[]}));await expect(new StateWatcher('http://game',fetcher).battleChoices(0)).rejects.toThrow('Malformed');
  fetcher.mockResolvedValue(new Response('',{status:503}));await expect(new StateWatcher('http://game',fetcher).battleChoices(0)).rejects.toThrow('503');
 });
 it('keeps schema compatibility and rejects invalid raw provenance',()=>{
  expect(Value.Check(BattleJournalSchema,{frame:10,last_id:1,entries:[choice]})).toBe(true);
  expect(Value.Check(BattleJournalSchema,{frame:10,last_id:1,entries:[{...choice,source:{...choice.source,main_func:0}}]})).toBe(false);
  expect(Value.Check(Type.Object({x:BattleJournalSchema}),{x:{frame:10,last_id:1,entries:[{...choice,move:{...choice.move,slot:4}}]}})).toBe(false);
 });
 it('drains every committed same-move turn between agent observations and only acknowledges saved IDs',async()=>{
  const h=setup([{frame:20,last_id:2,entries:[choice,{...choice,id:2,frame:20,battle_turn:2}]},{frame:21,last_id:2,entries:[]}]);await h.start();
  await h.recorder.checkMilestones();await h.recorder.checkMilestones();
  expect(h.events().filter(e=>e.type==='battle_choice').map(e=>e.id)).toEqual([1,2]);
  expect(h.poll.mock.calls.map(c=>c[0])).toEqual([0,2]);
 });
 it('human sampler invokes the same durable journal owner, independent of screenshots',async()=>{
  const h=setup([{frame:10,last_id:1,entries:[choice]}]);await h.start();
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({frame:0,paused:true,failed:false,last_id:0,segments:[],observation:{state:IN_GAME,screenshot_base64:'iVBORw0KGgo='}}));
  const sampler=humanSampler({recordHumanInput:()=>{},recordHumanSample:()=>{},recordBattleChoices:()=>h.recorder.recordBattleChoices()},'http://human','token',fetcher);
  await sampler();expect(h.events().filter(e=>e.type==='battle_choice')).toHaveLength(1);
 });
 it.each([
  {frame:10,last_id:2,entries:[{...choice,id:2}]},
  {frame:9,last_id:1,entries:[choice]},
  {frame:10,last_id:2,entries:[choice]},
  {frame:10,last_id:1,entries:[{...choice,actor:{...choice.actor,hp:40}}]},
  {frame:10,last_id:1,entries:[{...choice,target:{...choice.actor,hp:40}}]},
  {frame:10,last_id:1,entries:[{...choice,move:null}]},
 ])('rejects invalid batches before any partial append, records failure once and stops',async batch=>{
  const h=setup([batch]);await h.start();await expect(h.recorder.recordBattleChoices()).rejects.toThrow();await expect(h.recorder.recordBattleChoices()).rejects.toThrow();
  expect(h.events().filter(e=>e.type==='battle_choice')).toHaveLength(0);expect(h.events().filter(e=>e.type==='telemetry_error')).toHaveLength(1);expect(h.poll).toHaveBeenCalledTimes(1);
 });
 it('ignores journals for older runs',async()=>{const h=setup([],false);await h.start();await h.recorder.recordBattleChoices();expect(h.poll).not.toHaveBeenCalled();});
});
