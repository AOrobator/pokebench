import {describe,it,expect,vi} from 'vitest';
import {IN_GAME} from '../test-support/events.js';
import {Value} from 'typebox/value';
import {readFileSync} from 'node:fs';
import {gameTools} from './game-tools.js';
import {ALL_ON as GYM_EVIDENCE_CURRENT_ALL_ON,playHarnessFeatures,SWITCHABLE_FEATURES,stateOnlyProblems} from './features.js';
const ALL_ON={...GYM_EVIDENCE_CURRENT_ALL_ON,"gym-evidence-v1":false};
import {flagFeatures} from './play-preset.js';
import {playTools,toolSwitches,jitTools,playSystemPrompt} from './play-config.js';
import {parseGameState,type GameStateSnapshot} from './game-state.js';
import {EvolutionArgs} from './evolution-decision.js';
import {battleDecisionContext} from './play-wiring.js';
import type {AgentMessage} from '@mariozechner/pi-agent-core';

const ID='evolution-decision-v1';
const OFF={...ALL_ON,[ID]:false};
const ON={...OFF,[ID]:true};
const hooks={beforePress:vi.fn(),afterPress:vi.fn().mockResolvedValue(undefined)};
const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write('IHDR',12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
const state={...IN_GAME,screen:'overworld'};
function host(pending:unknown={token:1,identity:'b7f7c224:c97e7432',pokemon:'TORCHIC',from_species:'TORCHIC',to_species:'COMBUSKEN'}, current:GameStateSnapshot=state){
 const posts:unknown[]=[];
 const fetchFn=vi.fn<typeof fetch>().mockImplementation((input,init)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  if(url.endsWith('/pokebench/evolution')){if(init?.method==='POST'){if(typeof init.body!=='string')throw new Error('Expected JSON text');const body:unknown=JSON.parse(init.body);posts.push(body);return Promise.resolve(Response.json({status:'success',decision:typeof body==='object'&&body!==null&&'decision' in body?body.decision:null}));}return Promise.resolve(Response.json({pending}));}
  if(url.endsWith('/pokebench/state'))return Promise.resolve(Response.json(current));
  if(url.endsWith('/pokebench/observation'))return Promise.resolve(Response.json({state_text:'Screen: evolution',state:current,screenshot_base64:png.toString('base64')}));
  throw new Error(`Unexpected request ${url}`);
 });
 return {posts,fetchFn};
}
const clock={now:()=>0,sleep:()=>Promise.resolve()};
describe('explicit native evolution choice',()=>{
 it('factory advertises both choices only ON, including JIT battle and unknown scenes',()=>{
  const off=gameTools('http://test',hooks,fetch,toolSwitches(OFF),clock);
  const on=gameTools('http://test',hooks,fetch,toolSwitches(ON),clock);
  expect(off.map(t=>t.name)).toEqual(['observe','press']);
  expect(on.map(t=>t.name)).toEqual(['observe','press','choose_evolution']);
  expect(playTools(ON)).toContain('choose_evolution');expect(playTools(OFF)).not.toContain('choose_evolution');
  expect(jitTools(on,'battle').map(t=>t.name)).toContain('choose_evolution');
  expect(jitTools(on,'unknown').map(t=>t.name)).toContain('choose_evolution');
  expect(playSystemPrompt(ON,null)).toBe(playSystemPrompt(OFF,null));
  expect(playSystemPrompt(OFF,null)).not.toContain('choose_evolution');
  expect(stateOnlyProblems({...ON,'state-only-decisions-v1':true})).toContain('state-only-decisions-v1 requires evolution-decision-v1 OFF');
  expect(SWITCHABLE_FEATURES).toContain(ID);expect(playHarnessFeatures(ON,null)).toContain(ID);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
 });
 it('schema requires an explicit valid decision',()=>{
  expect(Value.Check(EvolutionArgs,{decision:'evolve'})).toBe(true);
  expect(Value.Check(EvolutionArgs,{decision:'cancel'})).toBe(true);
  for(const args of [{},{decision:'yes'},{decision:'evolve',token:1}])expect(Value.Check(EvolutionArgs,args)).toBe(false);
 });
 for(const decision of ['evolve','cancel'] as const)it(`submits ${decision} bound to fresh native token and returns observation`,async()=>{
  const h=host();const tool=gameTools('http://test',hooks,h.fetchFn,toolSwitches(ON),clock)[2];if(tool===undefined)throw new Error('Missing evolution tool');
  const result=await tool.execute('evo',{decision});
  expect(h.posts).toEqual([{token:1,decision}]);
  expect(result.content.some(c=>c.type==='text'&&c.text.includes(decision))).toBe(true);
 });
 it('refuses without native pending decision and never sends buttons',async()=>{
  const h=host(null);const tool=gameTools('http://test',hooks,h.fetchFn,toolSwitches(ON),clock)[2];if(tool===undefined)throw new Error('Missing evolution tool');
  const result=await tool.execute('evo',{decision:'cancel'});
  expect(h.posts).toEqual([]);expect(JSON.stringify(result)).toContain('No pending evolution');
 });
 it('ordinary press refuses during the decision window through the production factory',async()=>{
  hooks.beforePress.mockClear();
  const h=host(null,{...state,screen:'evolution',active_ui:{phase:'evolution_decision',selected:null,ready:true,controls:'choose_evolution',diagnostic:null}});
  const press=gameTools('http://test',hooks,h.fetchFn,toolSwitches(ON),clock)[1];
  const result=await press.execute('press',{buttons:['B']});
  expect(h.posts).toEqual([]);expect(hooks.beforePress).not.toHaveBeenCalled();
  expect(JSON.stringify(result.content)).toContain('Nothing pressed');
 });
 it('the intervention is on in both arms (operator decision 2026-10-20)',()=>{
  const bundle=JSON.parse(readFileSync(new URL('../../../experiments/fixed/bundle-v-control.json',import.meta.url),'utf8')) as {switches:string[];base:{features:Record<string,boolean>};onInBoth:string[];offInBoth:string[]};
  expect(bundle.switches).not.toContain(ID);
  expect(bundle.base.features[ID]).toBe(true);
  expect(bundle.onInBoth).toContain(ID);expect(bundle.offInBoth).not.toContain(ID);
 });
});

it.each([false,true])('evolution result snapshot retirement follows its feature switch (ON=%s)',async enabled=>{
 const features={...ON,[ID]:enabled};
 const pending={...state,screen:'evolution',active_ui:{phase:'evolution_decision',selected:null,ready:true,controls:'choose_evolution',diagnostic:null}};
 const h=host(null,pending);const tools=gameTools('http://test',hooks,h.fetchFn,toolSwitches(ON),clock);
 let entering=true;
 const source={read:()=>Promise.resolve(entering?{...state,screen:'battle_transition'}:state)};
 const transform=battleDecisionContext({...features,'battle-decision-ready-v1':true},source,tools,m=>Promise.resolve(m),{recordDecisionSnapshot:vi.fn()});
 expect(await transform([])).toHaveLength(1);entering=false;
 const fresh:AgentMessage={role:'toolResult',toolCallId:'evo-result',toolName:'choose_evolution',isError:false,content:[{type:'image',data:png.toString('base64'),mimeType:'image/png'},{type:'text',text:'fresh evolution result'}],timestamp:3};
 const messages=[fresh];const result=await transform(messages);if(enabled)expect(result).toBe(messages);else expect(result).toHaveLength(2);
});

it('accepts an observation captured at the held native input boundary',()=>{
 expect(parseGameState({...state,settle:{frames:0,reason:'input_hold'}}).settle).toEqual({frames:0,reason:'input_hold'});
});
