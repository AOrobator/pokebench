import type {RequestSample,RunView} from "./model.js";
import {esc,num} from "./format.js";

export const METRIC_HISTORY_LIMIT=300;
const cache = new WeakMap<RunView,{count:number;limit:number;html:string}>();
const W=640,H=114,L=62,R=12,T=12,B=24;
type Value=(sample:RequestSample)=>number|null;
const successful=(value:Value):Value=>sample=>sample.failed?null:value(sample);
const coordinate=(n:number)=>n.toFixed(2);
const axisFormat=new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:1});

// Every strip uses the response timestamp and the same wall-clock domain. No resampling or interpolation across missing data.
function plot(samples:readonly RequestSample[],start:number,horizon:number,value:Value,composition=false,offset=0):string {
 const x=(s:RequestSample)=>L+Math.max(0,s.ms-start)/horizon*(W-L-R);
 const max=samples.reduce((max,s)=>Math.max(max,value(s)??0),1);
 const y=(v:number)=>T+(1-v/max)*(H-T-B);
 let path='',open=false,areas='',points='';
 for(const s of samples){const v=value(s);if(v===null){open=false;continue;}path+=`${open?'L':'M'}${coordinate(x(s))},${coordinate(y(v))}`;open=true;points+=`<circle cx="${coordinate(x(s))}" cy="${coordinate(y(v))}" r="2" class="mh-point"><title>${esc(`Response #${String(s.seq)} · ${String(v)}`)}</title></circle>`;}
 if(composition){
  // Per-response stacked columns are the server's reported uncached input, cache reads and known cache writes, not guessed prompt sections.
  const width=Math.max(.7,Math.min(8,(W-L-R)/Math.max(1,samples.length)*.6));
  for(const s of samples){if(s.failed)continue;const subtotal=s.input+s.cacheRead,total=subtotal+(s.cacheWrite??0);
   areas+=`<rect x="${coordinate(x(s)-width/2)}" y="${coordinate(y(s.input))}" width="${coordinate(width)}" height="${coordinate(y(0)-y(s.input))}" class="mh-input"><title>${esc(`Response #${String(s.seq)} · uncached input ${num(s.input)} tokens`)}</title></rect><rect x="${coordinate(x(s)-width/2)}" y="${coordinate(y(subtotal))}" width="${coordinate(width)}" height="${coordinate(y(s.input)-y(subtotal))}" class="mh-cache"><title>${esc(`Response #${String(s.seq)} · cache reads ${num(s.cacheRead)} tokens`)}</title></rect>`;
   if(s.cacheWrite!==null)areas+=`<rect x="${coordinate(x(s)-width/2)}" y="${coordinate(y(total))}" width="${coordinate(width)}" height="${coordinate(y(subtotal)-y(total))}" class="mh-write"><title>${esc(`Response #${String(s.seq)} · cache writes ${num(s.cacheWrite)} tokens`)}</title></rect>`;
  }
 }
 const grid=[0,.5,1].map(f=>{const yy=T+f*(H-T-B);return `<line class="mh-grid" x1="${String(L)}" x2="${String(W-R)}" y1="${String(yy)}" y2="${String(yy)}"/><text x="${String(L-6)}" y="${String(yy+3)}" text-anchor="end">${esc(axisFormat.format(max*(1-f)))}</text>`;}).join('');
 const axis=[0,.5,1].map(f=>`<text x="${String(L+f*(W-L-R))}" y="${String(H-5)}" text-anchor="${f===0?'start':f===1?'end':'middle'}">${((offset+horizon*f)/60000).toFixed(1)} min</text>`).join('');
 const last=samples.at(-1);
 const cursor=last===undefined?'':`<line class="mh-cursor" x1="${coordinate(x(last))}" x2="${coordinate(x(last))}" y1="${String(T)}" y2="${String(H-B)}"/>`;
 return grid+areas+`<path data-series="${composition?'total':'value'}" class="mh-line" d="${path}"/>`+points+axis+cursor;
}

export function metricHistory(view:RunView,limit=METRIC_HISTORY_LIMIT):string {
 if(!Number.isSafeInteger(limit)||limit<1)throw new RangeError('Metric history limit must be a positive integer');
 if(view.start===null)return '<section class="metric-history"><h3>METRIC HISTORY</h3><p class="nodata">Select a run to see recorded request metrics.</p></section>';
 const samples=view.requestSamples,prior=cache.get(view);
 if(prior?.count===samples.length&&prior.limit===limit)return prior.html;
 const displayed=samples.slice(-limit),last=samples.at(-1),runStart=view.startMs??0;
 const offset=samples.length>limit?Math.max(0,Math.floor(((displayed[0]?.ms??runStart)-runStart)/60000)*60000):0;
 const start=runStart+offset;
 const horizon=Math.max(60000,Math.ceil(((last?.ms??start)-start)/60000)*60000);
 const failed=samples.filter(s=>s.failed).length;
 const rows:[string,string,string,Value][]=[
  ['ttft','TTFT','ms',s=>s.ttftMs],['inference','INFERENCE / REQUEST','s',s=>s.inferenceMs/1000],
  ['output','OUTPUT / REQUEST','tokens',s=>s.output],['prompt','PROMPT COMPOSITION','tokens',s=>s.input+s.cacheRead+(s.cacheWrite??0)],
 ];
 const strips=rows.map(([id,title,unit,get])=>{
  const value=last===undefined?null:successful(get)(last);
  const reading=last?.failed===true?'failed response':value===null?'unavailable':`${unit==='s'?value.toFixed(2):num(value)} ${unit}${id==='prompt'&&last?.cacheWrite===null?' (partial)':''}`;
  const legend=id==='prompt'?'<span class="mh-key"><i class="mh-input"></i>Uncached input <i class="mh-cache"></i>Cache reads <i class="mh-write"></i>Cache writes</span>':'Recorded response';
  const direction=id==='ttft'||id==='inference'?'Lower is better':'Lower is better for token cost';
  return `<div class="mh-row" data-metric="${id}"><div class="mh-label"><h3>${title}</h3><strong>${reading}</strong><small class="mh-direction">↓ ${direction}</small><small>${legend}</small></div><svg viewBox="0 0 ${String(W)} ${String(H)}" role="img" aria-label="${title} · ${esc(reading)} · ${direction} · elapsed wall minutes">${plot(displayed,start,horizon,successful(get),id==='prompt',offset)}</svg></div>`;
 }).join('');
 const html=`<section class="metric-history" aria-label="Recorded request metric history"><h3>METRIC HISTORY</h3><p class="mh-summary">${last===undefined?'Waiting for a recorded response.':`${num(samples.length)} responses · ${num(failed)} failed · latest response #${String(last.seq)}`}</p><div class="mh-strips">${strips}</div><p class="mh-note">${samples.length>limit?`Showing the latest ${num(limit)} responses. `:""}Shared elapsed wall time from this run’s start. Values update when a response is recorded. Missing TTFT and failed responses break the lines. Instruction/history/tool breakdown was not recorded. Missing cache writes remain unknown; prompt totals for those responses are partial. Token counts measure usage, not gameplay quality.</p></section>`;
 cache.set(view,{count:samples.length,limit,html});return html;
}
