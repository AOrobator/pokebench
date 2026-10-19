import type {AgentTool,AgentToolResult} from '@mariozechner/pi-agent-core';
import {Type,type Static} from 'typebox';
import {Value} from 'typebox/value';
import type {Clock,PressHooks} from './game-tools.js';
import {parseGameState,type GameStateSnapshot} from './game-state.js';

export const EvolutionArgs=Type.Object({decision:Type.Enum(['evolve','cancel'] as const,{description:'evolve allows the current evolution to complete; cancel stops it.'})},{additionalProperties:false});
const Pending=Type.Object({pending:Type.Union([Type.Null(),Type.Object({token:Type.Integer({minimum:1}),identity:Type.String({minLength:1}),pokemon:Type.Union([Type.String(),Type.Null()]),from_species:Type.String(),to_species:Type.String()})])});
const Accepted=Type.Object({status:Type.Literal('success'),decision:Type.Enum(['evolve','cancel'] as const)});
type Capture=(signal?:AbortSignal,prefix?:string)=>Promise<AgentToolResult<{state:GameStateSnapshot}>>;
export function evolutionTool(url:string,fetchFn:typeof fetch,hooks:PressHooks,clock:Clock,capture:Capture):AgentTool<typeof EvolutionArgs>{
 const request=async(path:string,signal?:AbortSignal,body?:unknown):Promise<unknown>=>{
  const response=await fetchFn(`${url}${path}`,{signal:signal===undefined?AbortSignal.timeout(15_000):AbortSignal.any([signal,AbortSignal.timeout(15_000)]),...(body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})});
  if(!response.ok)throw new Error(`Evolution decision refused (HTTP ${String(response.status)}); observe the current state.`);
  return response.json() as Promise<unknown>;
 };
 return {name:'choose_evolution',label:'Choose evolution',description:'Explicitly choose whether to evolve or cancel the current POKéMON evolution. The game waits for this decision at the native cancellation window. Neither option is recommended. Ordinary buttons cannot resolve this choice. Move-learning prompts afterward use their own controls. Refuses when no eligible evolution is waiting.',parameters:EvolutionArgs,
  execute:async(_id:string,args:Static<typeof EvolutionArgs>,signal?:AbortSignal)=>{
   signal?.throwIfAborted();
   if(!Value.Check(EvolutionArgs,args))throw new Error('Invalid evolution decision');
   const pending=await request('/pokebench/evolution',signal);
   if(!Value.Check(Pending,pending))throw new Error('Malformed native evolution decision state');
   if(pending.pending===null)return capture(signal,'No pending evolution decision; nothing pressed.\n');
   const {token,identity,from_species:from,to_species:to}=pending.pending;
   const accepted=await request('/pokebench/evolution',signal,{token,decision:args.decision});
   if(!Value.Check(Accepted,accepted)||accepted.decision!==args.decision)throw new Error('Malformed evolution decision acceptance');
   // Native frames execute the choice. No press call can race the frozen window.
   // Bounded polling never invents success; every response includes the actual state.
   let outcome='submitted; outcome not yet verified';
   for(let attempt=0;attempt<80;attempt++){
    signal?.throwIfAborted();
    await clock.sleep(100);
    const state=parseGameState(await request("/pokebench/state",signal));
    const ui=state.active_ui;
    const details=ui?.details;
    if(args.decision==='cancel'&&details?.pokemon_identity===identity&&details.evolution_was_stopped===true){outcome='cancellation verified by the game';break;}
    if(args.decision==='evolve'&&details?.pokemon_identity===identity&&details.pokemon_species===to){outcome='evolution verified by the game';break;}
    if(ui?.phase.startsWith('evolution_move')){outcome='move-learning prompt reached; inspect the new state';break;}
    if(state.screen!=='evolution'){outcome='animation ended; inspect the new party state';break;}
   }
   await hooks.afterPress();
   return capture(signal,`Evolution decision: ${args.decision} (${from} → ${to}); ${outcome}.\n`);
  }};
}
