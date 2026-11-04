import {describe,it,expect,vi} from 'vitest';
import {Type} from 'typebox';
import {Value} from 'typebox/value';
import {BattleJournalSchema,type BodyOf} from './events.js';
import {StateWatcher} from './game-state.js';
export const choice={id:1,frame:10,recorded_ms:1000,battle:1,battle_turn:1,action:'move',action_id:0,origin:'selected',actor:{battler:0,position:0,party_slot:0,species_id:25,species:'PIKACHU',identity:'00000001:00000002',level:10,hp:20,max_hp:30},move:{id:55,name:'WATER GUN',slot:0,pp:25},target:{battler:1,position:1,party_slot:0,species_id:74,species:'GEODUDE',identity:'00000003:00000004',level:12,hp:30,max_hp:40},item_id:null,switch_party_slot:null,source:{main_func:0x0803D2E9,communication:[5,5],battle_type:0}} satisfies Omit<BodyOf<'battle_choice'>,'type'|'turn'>;
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
});
