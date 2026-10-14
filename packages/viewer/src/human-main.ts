import {HumanPlay,type HumanPlayDeps} from './human-play.js';
import type {AudioFollower} from '@pokebench/agent/spectator';
export function createHumanAudio(Owner:typeof AudioFollower,runId:string,status:(text:string)=>void,createContext:()=>AudioContext=()=>new AudioContext()):AudioFollower {
 let context:AudioContext|undefined;
 return new Owner({
  unlock:async()=>{context??=createContext();await context.resume();},
  fetch:(url,options)=>fetch(`/api/runs/${encodeURIComponent(runId)}${url}`,options),
  status,
  play:(pcm,rate)=>{
   if(context===undefined)throw Error('Sound is not unlocked');
   const buffer=context.createBuffer(2,pcm.length/2,48000);
   for(let channel=0;channel<2;channel++){
    const samples=buffer.getChannelData(channel);
    for(let frame=0;frame<samples.length;frame++)samples[frame]=(pcm[frame*2+channel]??0)/32768;
   }
   const source=context.createBufferSource();source.buffer=buffer;source.playbackRate.value=rate;source.connect(context.destination);source.start();
   return ()=>{source.stop();source.disconnect();};
  },
 },1);
}
const id=decodeURIComponent(location.hash.replace(/^#run=/,''));
async function json(url:string,body?:unknown):Promise<unknown> {
 const response=await fetch(url,{...(body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),signal:AbortSignal.timeout(url.endsWith('/human/restart')?30000:3000)});
 const result:unknown=await response.json();if(!response.ok)throw Error(typeof result==='object'&&result!==null&&'error' in result?String(result.error):`HTTP ${String(response.status)}`);return result;
}
export function openHumanRun(runId:string,navigate:(url:string)=>void=url=>{location.assign(url);}):void {
 const id=encodeURIComponent(runId);navigate(`/play?run=${id}#run=${id}`);
}
const deps:HumanPlayDeps={openRun:openHumanRun,fetchJson:url=>json(url),sendJson:(url,body)=>json(url,body),openStream:url=>new EventSource(url),now:()=>Date.now(),session:()=>crypto.randomUUID()};
const play=new HumanPlay(document,id,deps);
export async function connectHumanAudio(deps:HumanPlayDeps,doc:Document,runId:string,load:(url:string)=>Promise<unknown>):Promise<void> {
 try {
  const module=await load('/app/agent-spectator.js');
  if(typeof module!=='object'||module===null||!('AudioFollower' in module)||typeof module.AudioFollower!=='function')throw Error('Sound module unavailable');
  deps.audio=createHumanAudio(module.AudioFollower as typeof AudioFollower,runId,text=>{
   const button=doc.querySelector('[data-play="sound"]');if(button!==null)button.textContent=text==='Mute audio'?'Sound on · 1×':text;
  });
 } catch {
  const button=doc.querySelector('[data-play="sound"]');if(button!==null)button.textContent='Sound unavailable';
 }
}
const audioReady=connectHumanAudio(deps,document,id,url=>import(url));
let timer:ReturnType<typeof setInterval>|undefined;
let disposed=false;
void audioReady.then(()=>play.start()).then(()=>{if(disposed)return;timer=setInterval(()=>{play.tick();},100);}).catch((error:unknown)=>{const el=document.querySelector('[data-play="problem"]');if(el!==null)el.textContent=error instanceof Error?error.message:'Cannot start human play';});
window.addEventListener('pagehide',()=>{disposed=true;clearInterval(timer);play.close();});
