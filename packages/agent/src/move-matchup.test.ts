import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {describe,it,expect} from 'vitest';
import type {AgentMessage} from '@mariozechner/pi-agent-core';
import {ALL_ON,SWITCHABLE_FEATURES,SERVER_FEATURES,playHarnessFeatures} from './features.js';
import {featuresOf} from './features.js';
import {normalizeFeatures} from './play-preset.js';
import type {RunEvent} from './events.js';
import {MoveMatchups,moveMatchupContext,MATCHUP_ID} from './move-matchup.js';
import {multiplier} from './type-gap-team.js';
const events=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/move-matchup-9c88.json.gz',import.meta.url))).toString()) as RunEvent[];
const state=events.find(e=>e.seq===31936);
if(state?.type!=='state'||!('started' in state))throw new Error('missing pre668 state');
const result=events.find(e=>e.seq===31937);
if(result?.type!=='tool_result')throw new Error('missing delivered result');
const gap=state.type_gap,ui=state.active_ui;if(gap==null||ui==null)throw new Error('missing source facts');
const make=()=>{const x=new MoveMatchups();for(const e of events)x.observe(e);return x;};
const messages:AgentMessage[]=[{role:'toolResult',toolCallId:result.id,toolName:result.name,content:[{type:'text',text:result.text}],isError:false,timestamp:0}];
describe('move-learn-type-matchup-v1',()=>{
 it('uses source-backed arithmetic including distinct dual types and immunity',()=>{
  const chart=state.type_gap?.type_chart??[];
  expect(multiplier(chart,10,[5,4])).toBe(.5);expect(multiplier(chart,0,[5,4])).toBe(.5);expect(multiplier(chart,1,[5,4])).toBe(2);
  expect(multiplier(chart,10,[5,5])).toBe(.5);expect(multiplier(chart,11,[5,4])).toBe(4);expect(multiplier(chart,10,[10,16])).toBe(.25);expect(multiplier(chart,13,[4,2])).toBe(0);
 });
 it('covers the real early pre668 page with current learner stats, STAB and historical foes',()=>{
  const text=make().block();expect(text).toContain('COMBUSKEN');expect(text).toContain('Attack 37');expect(text).toContain('Sp. Atk 35');
  expect(text).toContain('DOUBLE KICK (new)');expect(text).toContain('FIGHTING · type ×2 · STAB ×1.5 · type × STAB ×3');
  expect(text).toContain('SCRATCH: NORMAL · type ×0.5 · STAB ×1');expect(text).toContain('EMBER: FIRE · type ×0.5 · STAB ×1.5');
  expect(text).toContain('GROWL: status move; no damage multiplier');expect(text).toContain('BLAZE inactive');expect(text).toContain('2 hits');
  expect(text).toContain('previously observed');expect(text).toContain('GEODUDE');
 });
 it('does not learn from internal states or unsuccessful delivery',()=>{
  const x=new MoveMatchups();for(const e of events.filter(e=>e.type==='state'))x.observe(e);expect(x.block()).toBeNull();
  for(const e of events.filter(e=>e.type==='tool_result'))x.observe({...e,is_error:true});expect(x.block()).toBeNull();
 });
 it('has no foes before delivery and no block on unrelated or stale screens',()=>{
  const x=new MoveMatchups();x.observe(state);x.observe(result);expect(x.block()).not.toContain('GEODUDE');
  const y=make();y.observe({...state,seq:40000,screen:'overworld',active_ui:null});y.observe({...result,seq:40001,state_seq:40000});expect(y.block()).toBeNull();
 });
 it('registers default OFF and server delivery without changing prior features',()=>{
  expect(SWITCHABLE_FEATURES.indexOf(MATCHUP_ID)).toBe(305);expect(SERVER_FEATURES).toContain(MATCHUP_ID);
  const {[MATCHUP_ID]:omitted,...old}=featuresOf([]);expect(omitted).toBe(false);expect(normalizeFeatures(old)[MATCHUP_ID]).toBe(false);expect(featuresOf([])[MATCHUP_ID]).toBe(false);
  expect(playHarnessFeatures({...ALL_ON,[MATCHUP_ID]:false},null)).not.toContain(MATCHUP_ID);
 });
 it('context factory OFF is identical and ON records evidence and sends the production block',async()=>{
  const observers:((e:RunEvent)=>void)[]=[];const notes:{text:string;evidence:readonly number[]}[]=[];
  const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},recordLedgerContext:(b:{text:string;evidence:readonly number[]})=>{notes.push(b);}};
  const base=(m:AgentMessage[])=>Promise.resolve(m);
  expect(moveMatchupContext({...ALL_ON,[MATCHUP_ID]:false},recorder,base)).toBe(base);
  const transform=moveMatchupContext(ALL_ON,recorder,base);for(const e of events)for(const o of observers)o(e);
  const out=await transform(messages);expect(out).toHaveLength(2);expect(out[1]).toMatchObject({role:'user',content:make().block()});expect(notes[0]?.evidence).toContain(31937);
  await transform(messages);expect(notes).toHaveLength(1);
  expect(await transform([...messages,{role:'assistant',content:[],api:'openai-completions',provider:'x',model:'x',usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:0}])).toHaveLength(2);
 });
});

describe('move matchup delivery boundaries',()=>{
 it('production contextTools factory delivers the same block and OFF preserves the request',async()=>{
  const {contextTools}=await import('./play-wiring.js');
  const wire=(on:boolean)=>{
   const observers:((e:RunEvent)=>void)[]=[];
   const noop=()=>{};
   const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},recordLedgerContext:noop,recordNavigationContext:noop,recordMilestoneHint:noop,recordBeliefLedger:noop,recordLoopBreaker:noop};
   const wired=contextTools({...featuresOf([]),[MATCHUP_ID]:on},recorder,m=>Promise.resolve(m));
   for(const e of events)for(const o of observers)o(e);
   return wired;
  };
  expect(await wire(false).transformContext(messages)).toEqual(messages);
  expect((await wire(true).transformContext(messages)).at(-1)).toMatchObject({content:make().block()});
 });
 it('does not accept a name without its delivered types, a hidden foe or an ambiguous slot',()=>{
  const x=new MoveMatchups();
  const prior=events[0];if(prior?.type!=='state'||!('started' in prior))throw new Error('state');
  x.observe(prior);x.observe({...result,state_seq:prior.seq,text:'Foe GEODUDE Lv12 · HP 20/20'});
  x.observe(state);x.observe({...result,text:result.text.replace(/^Foe .+$/gm,'')});expect(x.block()).toBeNull();
 });
 it('unknown chart and learner ownership fail closed',()=>{
  const deliver=(change:Partial<typeof state>)=>{const x=make();x.observe({...state,...change,seq:40000});x.observe({...result,state_seq:40000,seq:40001});return x.block();};
  expect(deliver({type_gap:{...gap,diagnostic:'unavailable'}})).toBeNull();
  expect(deliver({active_ui:{...ui,details:{pokemon_party_index:5,new_move:'DOUBLE KICK'}}})).toBeNull();
  expect(deliver({active_ui:{...ui,details:{pokemon_party_index:0,new_move:'PECK'}}})).toBeNull();
 });
 it('summary and confirmation screens retain the correct offered move',()=>{
  for(const phase of ['summary_move_forget','evolution_move_confirmation']){
   const x=make();x.observe({...state,seq:40000,active_ui:{...ui,phase}});x.observe({...result,seq:40001,state_seq:40000});expect(x.block()).toContain('DOUBLE KICK (new)');
  }
 });
 it('known pinch ability activation follows actual current HP',()=>{
  const x=make();x.observe({...state,seq:40000,party:state.party.map(m=>({...m,hp:15}))});x.observe({...result,seq:40001,state_seq:40000});expect(x.block()).toContain('BLAZE active (move power ×1.5)');
 });
 it('newer successful observations retire the transient block',()=>{
  const x=make();x.observe({...result,state_seq:999999,seq:40000});expect(x.block()).toBeNull();
 });
 it('decision-input snapshots have the same delivered-only boundary',()=>{
  const x=make();x.observe({v:1,run:state.run,seq:40000,t:state.t,type:'decision_input',turn:668,decision_turn:668,state_seq:state.seq,text:result.text,frames:[]});expect(x.block()).toContain('DOUBLE KICK');
 });
});

it('uses active battler stats when the real pre695 snapshot has no party slots',()=>{
 const rows=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/move-matchup-9c88-battle.json.gz',import.meta.url))).toString()) as RunEvent[];
 const s=rows.find(e=>e.seq===33008);if(s?.type!=='state'||!('started' in s))throw new Error('battle source');
 expect(s.party).toHaveLength(0);
 const x=new MoveMatchups();for(const e of rows)x.observe(e.type==='state'&&'started' in e&&e.seq===33008?{...e,type_gap:gap}:e);
 const block=x.block();expect(block).toContain('COMBUSKEN');expect(block).not.toContain('current target type profile');expect(block).toContain('SCRATCH');expect(block).toContain('battle stats before stages');
});

it.each(['FUTURE SIGHT','DOOM DESIRE','BEAT UP'])('does not invent type effectiveness or STAB for typeless %s damage',name=>{
 const x=make();
 const text=result.text.replace('New move: DOUBLE KICK FIGHTING physical pow 30',`New move: ${name} ${name==='BEAT UP'?'DARK physical pow 10':name==='DOOM DESIRE'?'STEEL physical pow 120':'PSYCHIC special pow 80'}`);
 x.observe({...state,seq:40000,active_ui:{...ui,details:{...ui.details,new_move:name}}});x.observe({...result,seq:40001,state_seq:40000,text});
 expect(x.block()).toContain(`${name} (new): special type/damage rules; partial multiplier unavailable`);
});

it.each(['NIGHT SHADE','ENDEAVOR','HIDDEN POWER'])('keeps offered variable-power %s out of the status category',name=>{
 const x=make();const text=result.text.replace('New move: DOUBLE KICK FIGHTING physical pow 30',`New move: ${name} NORMAL physical pow varies`);
 x.observe({...state,seq:40000,active_ui:{...ui,details:{...ui.details,new_move:name}}});x.observe({...result,seq:40001,state_seq:40000,text});
 const block=x.block();expect(block).toContain(`${name} (new): special type/damage rules; partial multiplier unavailable`);expect(block).not.toContain(`${name} (new): status move`);
});
