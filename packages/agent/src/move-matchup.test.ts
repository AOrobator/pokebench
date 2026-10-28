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
  expect(text).toContain('previously observed');expect(text).not.toContain('MACHOP');
 });
 it('does not learn from internal states or unsuccessful delivery',()=>{
  const x=new MoveMatchups();for(const e of events.filter(e=>e.type==='state'))x.observe(e);expect(x.block()).toBeNull();
  for(const e of events.filter(e=>e.type==='tool_result'))x.observe({...e,is_error:true});expect(x.block()).toBeNull();
 });
 it('has no foes before delivery and no block on unrelated or stale screens',()=>{
  const x=new MoveMatchups();x.observe(state);x.observe(result);expect(x.block()).toBeNull();
  const y=make();y.observe({...state,seq:40000,screen:'overworld',active_ui:undefined});y.observe({...result,seq:40001,state_seq:40000});expect(y.block()).toBeNull();
 });
 it('registers default OFF and server delivery without changing prior features',()=>{
  expect(SWITCHABLE_FEATURES.at(-1)).toBe(MATCHUP_ID);expect(SERVER_FEATURES).toContain(MATCHUP_ID);
  expect(normalizeFeatures({})[MATCHUP_ID]).toBe(false);expect(featuresOf([])[MATCHUP_ID]).toBe(false);
  expect(playHarnessFeatures({...ALL_ON,[MATCHUP_ID]:false},null)).not.toContain(MATCHUP_ID);
 });
 it('context factory OFF is identical and ON records evidence and sends the production block',async()=>{
  const observers:((e:RunEvent)=>void)[]=[];const notes:{text:string;evidence:readonly number[]}[]=[];
  const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},recordLedgerContext:(b:{text:string;evidence:readonly number[]})=>{notes.push(b);}};
  const base=async(m:AgentMessage[])=>m;
  expect(moveMatchupContext({...ALL_ON,[MATCHUP_ID]:false},recorder,base)).toBe(base);
  const transform=moveMatchupContext(ALL_ON,recorder,base);for(const e of events)for(const o of observers)o(e);
  const out=await transform(messages);expect(out).toHaveLength(2);expect(out[1]).toMatchObject({role:'user',content:make().block()});expect(notes[0]?.evidence).toContain(31937);
  await transform(messages);expect(notes).toHaveLength(1);
  expect(await transform([...messages,{role:'assistant',content:[],api:'openai-completions',provider:'x',model:'x',usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:0}])).toHaveLength(2);
 });
});
