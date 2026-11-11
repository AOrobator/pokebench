import {FRONTIER_MILESTONES} from "./frontier.js";
import type {CurrentState} from "./current-state.js";
import type {CurrentSummary} from "./current-public.js";
export type CurrentProgressRecord=CurrentSummary["progress"]["recorded"][number];
export const progressRows=(s:CurrentState):CurrentProgressRecord[]=>s.milestones.map(m=>({name:m.name,seq:m.seq,turn:m.turn,at:Date.parse(m.t),elapsedMs:s.milestoneTimes?.[String(m.seq)]??(s.control.pausedMs===0&&s.control.pauseAt===null&&s.warning===null&&s.partial!==true&&s.start!==null?Math.max(0,Date.parse(m.t)-Date.parse(s.start.t)):null),native:m.origin==="observed"&&m.evidence!==undefined}));
const rank=new Map(FRONTIER_MILESTONES.map((m,i)=>[m.id,i]));
// Card facts are bounded independently of the accumulated history. Full records
// remain in the durable checkpoint and the paged progress/history endpoints.
export function cardProgress(rows:readonly CurrentProgressRecord[],boot:boolean):CurrentProgressRecord[]{
 if(rows.length<=2)return [...rows];let furthest:CurrentProgressRecord|undefined,best=-1;
 for(const row of rows){const level=rank.get(row.name)??-1;if((row.native??boot)&&level>best){best=level;furthest=row;}}
 const latest=rows.at(-1);return [furthest,latest].filter((r):r is CurrentProgressRecord=>r!==undefined).filter((r,i,all)=>all.findIndex(x=>x.seq===r.seq)===i).sort((a,b)=>a.seq-b.seq);
}
