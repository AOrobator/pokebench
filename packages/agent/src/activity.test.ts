import {describe,it,expect} from 'vitest';
import {StateActivities} from './activity.js';
import {StateMilestones,qualifiedNativeMilestone} from './milestones.js';
import {parseGameState,type GameStateSnapshot} from './game-state.js';
import {checkEvent} from './events.js';
import {IN_GAME} from '../test-support/events.js';
const stats={pokemon_captures:0,evolved_pokemon:0,used_pokecenter:0,saved_game:0};
const mon={identity:'1234:5678',species:'TORCHIC',level:5,hp:10,max_hp:20};
const base:GameStateSnapshot={...IN_GAME,screen:'overworld',field_controls_locked:false,blackout_active:false,game_stats:stats,party:[mon]};
describe('native activities',()=>{
 it('starts with a baseline, records cumulative deltas once, skips unknown and resets',()=>{
  const a=new StateActivities();expect(a.observe({...base,game_stats:{...stats,pokemon_captures:9}},1).activities).toEqual([]);
  a.observe({...base,game_stats:null},2);
  expect(a.observe({...base,game_stats:{...stats,pokemon_captures:11,evolved_pokemon:1,saved_game:2}},3).activities).toEqual([{kind:'capture',count:2,evidence:[1,3]},{kind:'evolution',count:1,evidence:[1,3]},{kind:'save_attempt',count:2,evidence:[1,3]}]);
  expect(a.observe(base,4).activities).toEqual([]);expect(a.observe(base,5).activities).toEqual([]);
 });
 it('records stable identity level gains despite reordered party, never new slots',()=>{
  const a=new StateActivities();a.observe(base,1);
  const next={...base,party:[{...mon,identity:'new',level:20},{...mon,level:7}]};
  expect(a.observe(next,2).activities).toEqual([{kind:'level_up',count:2,evidence:[1,2],pokemon:{identity:'1234:5678',species:'TORCHIC',from_level:5,to_level:7}}]);
  expect(a.observe(next,3).activities).toEqual([]);
 });
 it('ignores duplicated identities in either sample',()=>{
  const a=new StateActivities();a.observe({...base,party:[mon,{...mon,level:2}]},1);expect(a.observe({...base,party:[{...mon,level:10}]},2).activities).toEqual([]);
  expect(a.observe({...base,party:[{...mon,level:11},{...mon,level:12}]},3).activities).toEqual([]);
 });
 it('requires the native blackout false to true edge; initial active is not an event',()=>{
  const a=new StateActivities();expect(a.observe({...base,blackout_active:true},1).activities).toEqual([]);a.observe(base,2);
  expect(a.observe({...base,blackout_active:true},3).activities).toEqual([{kind:'blackout',count:1,evidence:[2,3]}]);expect(a.observe({...base,blackout_active:true},4).activities).toEqual([]);
 });
 it('records a latched blackout receipt exactly once even when no sampled edge exists',()=>{
  const a=new StateActivities();a.observe(base,1);
  const receipt={frame:27,money_before:3000};
  expect(a.observe({...base,blackout_receipt:receipt},2).activities).toEqual([{kind:'blackout',count:1,evidence:[1,2]}]);
  expect(a.observe({...base,blackout_receipt:receipt},3).activities).toEqual([]);
  expect(a.observe({...base,blackout_receipt:{frame:61,money_before:null},blackout_active:true},4).activities).toEqual([{kind:'blackout',count:1,evidence:[3,4]}]);
 });
 it('does not double count a receipt after the legacy sampled edge recorded that whiteout',()=>{
  const a=new StateActivities();a.observe(base,1);
  expect(a.observe({...base,blackout_active:true},2).activities).toEqual([{kind:'blackout',count:1,evidence:[1,2]}]);
  a.observe(base,3);
  expect(a.observe({...base,blackout_receipt:{frame:27,money_before:3000}},4).activities).toEqual([]);
  expect(a.observe({...base,blackout_receipt:{frame:61,money_before:1500}},5).activities).toEqual([{kind:'blackout',count:1,evidence:[4,5]}]);
 });
 it('waits for completed nurse script and full healed party, retaining first split evidence',()=>{
  const a=new StateActivities();a.observe(base,1);
  const accepted={...base,field_controls_locked:true,game_stats:{...stats,used_pokecenter:1}};
  expect(a.observe(accepted,2).activities).toEqual([]);expect(a.observe({...accepted,party:[{...mon,hp:20}]},3).activities).toEqual([]);
  expect(a.observe({...accepted,field_controls_locked:false,party:[{...mon,hp:20}]},4)).toEqual({activities:[{kind:'heal',count:1,evidence:[2,4]}],firstHealEvidence:[1,2,4]});
  expect(a.observe({...accepted,field_controls_locked:false},5).activities).toEqual([]);
 });
 it('requires current accepted counter for completion and cancels reset',()=>{
  const a=new StateActivities();a.observe(base,1);a.observe({...base,game_stats:{...stats,used_pokecenter:1}},2);
  expect(a.observe({...base,game_stats:null,party:[{...mon,hp:20}]},3).activities).toEqual([]);
  expect(a.observe({...base,party:[{...mon,hp:20}]},4).activities).toEqual([]);
  expect(a.observe({...base,game_stats:{...stats,used_pokecenter:1},party:[{...mon,hp:20}]},5).activities).toEqual([]);
  expect(a.observe({...base,game_stats:{...stats,used_pokecenter:1},party:[{...mon,hp:0,max_hp:0}]},6).activities).toEqual([]);
  expect(a.observe({...base,game_stats:{...stats,used_pokecenter:1},party:[{...mon,hp:20}]},7).activities).toEqual([{kind:'heal',count:1,evidence:[5,7]}]);
 });
 it('never turns a resumed historical heal total into completed activity',()=>{
  const a=new StateActivities();const resumed={...base,game_stats:{...stats,used_pokecenter:10},party:[{...mon,hp:20}]};a.observe(resumed,1);expect(a.observe(resumed,2).activities).toEqual([]);
 });
 it('accepts optional RAM contracts and rejects malformed counters/events',()=>{
  expect(parseGameState(base)).toEqual(base);expect(()=>parseGameState({...base,game_stats:{...stats,saved_game:-1}})).toThrow();
  expect(parseGameState({...base,blackout_receipt:{frame:27,money_before:null}}).blackout_receipt).toEqual({frame:27,money_before:null});
  expect(()=>parseGameState({...base,blackout_receipt:{frame:-1,money_before:3000}})).toThrow();
  expect(()=>checkEvent({v:1,run:'test',seq:2,t:'2026-10-14T00:00:00.000-04:00',type:'activity',turn:0,kind:'capture',count:0,server_timestamp:0,evidence:[0,1]})).toThrow();
 });
});
describe('expanded milestones',()=>{
 it('matches only whole native route labels and avoids transitions',()=>{
  const m=new StateMilestones({read:()=>Promise.resolve(base)});
  expect(m.observe({...base,location:'ROUTE104 MR BRINEYS HOUSE'},1).some(e=>e.name==='ROUTE_104')).toBe(false);
  expect(m.observe({...base,location:'ROUTE104',screen:'field_transition'},2).some(e=>e.name==='ROUTE_104')).toBe(false);
  expect(m.observe({...base,location:'ROUTE104'},3).some(e=>e.name==='ROUTE_104')).toBe(true);
 });
 it('records first catch/evolution as historical at resumed baseline',()=>{
  const m=new StateMilestones({read:()=>Promise.resolve(base)});m.initialize('save_state');
  expect(m.observe({...base,game_stats:{...stats,pokemon_captures:2,evolved_pokemon:1}},1).filter(e=>e.name.startsWith('FIRST_'))).toEqual(expect.arrayContaining([expect.objectContaining({name:'FIRST_POKEMON_CAUGHT',origin:'present_at_start'}),expect.objectContaining({name:'FIRST_EVOLUTION',origin:'present_at_start'})]));
 });
 it('qualifies completed heal only with native accepted counter and later script completion',()=>{
  const env={v:1,run:'test',t:'2026-10-14T00:00:00.000-04:00',turn:0};
  const states=[checkEvent({...env,type:'state',seq:1,...base}),checkEvent({...env,type:'state',seq:2,...base,game_stats:{...stats,used_pokecenter:1},field_controls_locked:true}),checkEvent({...env,type:'state',seq:3,...base,game_stats:{...stats,used_pokecenter:1},party:[{...mon,hp:20}]})];
  const event=checkEvent({...env,type:'milestone',seq:4,name:'FIRST_POKECENTER_HEAL',kind:'story',origin:'observed',server_timestamp:0,evidence:[1,2,3]});if(event.type!=='milestone')throw Error('bad event');expect(qualifiedNativeMilestone(event,states)).toBe(true);expect(qualifiedNativeMilestone(event,[states[1],states[1],states[2]])).toBe(false);
 });
});
