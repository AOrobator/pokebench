import {HumanKeyboard} from './human-input.js';
import {RunView,isRunEvent,type Button} from './model.js';
import {lanesSvg} from './timeline.js';
import {splits} from './panels.js';
import {runSeconds} from './controls.js';
import {hms} from './format.js';
import type {StreamLike} from './app.js';
export interface PlayAudio {readonly muted:boolean;toggle:()=>Promise<void>;mute:()=>void}
export interface HumanPlayDeps {
 audio?:PlayAudio;
 fetchJson:(url:string)=>Promise<unknown>;
 sendJson:(url:string,body:unknown)=>Promise<unknown>;
 openStream:(url:string)=>StreamLike;
 now:()=>number;
 session:()=>string;
}
export class HumanPlay {
 readonly view=new RunView();
 readonly keys:HumanKeyboard;
 private session:string|null=null;
 private seq=0;
 private writes:Promise<void>=Promise.resolve();
 private pending=0;
 private claiming=false;
 private suspended=false;
 private stream:StreamLike|null=null;
 private renderedAt=0;
 private error='';
 private closed=false;
 private readonly listeners=new AbortController();
 private heartbeatAt=0;
 constructor(private readonly doc:Document,readonly runId:string,private readonly deps:HumanPlayDeps) {
  this.keys=new HumanKeyboard(buttons=>{this.input(buttons);});
 }
 private ui(name:string):HTMLElement {
  const el=this.doc.querySelector<HTMLElement>(`[data-play="${name}"]`);if(el===null)throw Error(`missing ${name}`);return el;
 }
 async start():Promise<void> {
  this.ui('inspect').setAttribute('href',`/#run=${encodeURIComponent(this.runId)}`);
  const start:unknown=await this.deps.fetchJson(`/api/runs/${encodeURIComponent(this.runId)}/start`);
  // Validate the identity before enabling controls or connecting a live picture.
  if(!isRunEvent(start)||start.type!=='run_start'||start.run!==this.runId||start.controller?.kind!=='human')throw Error('Select a recorded human run');
  if(this.closed)return;
  this.view.apply(start);
  this.stream=this.deps.openStream(`/api/runs/${encodeURIComponent(this.runId)}/events`);
  this.stream.addEventListener('ev',message=>{
   if(this.closed)return;
   let value:unknown;try{value=JSON.parse(message.data);}catch{this.fail(Error('Invalid recording event'));return;}
   if(!isRunEvent(value)||value.run!==this.runId)return;
   this.view.apply(value);
   if(value.type==='run_end')this.stream?.close();
   if(value.type==='run_end'||(value.type==='operator_control'&&value.action==='pause'))this.suspend();
   this.render();
  });
  this.stream.addEventListener('error',()=>{if(!this.closed&&this.view.end===null)this.fail(Error('Recording connection interrupted; click game to retry'));});
  const surface=this.ui('surface');
  surface.addEventListener('focus',()=>{void this.claim();},{signal:this.listeners.signal});
  surface.addEventListener('click',()=>{surface.focus();void this.claim();this.sound();},{signal:this.listeners.signal});
  surface.addEventListener('blur',()=>{this.suspend();},{signal:this.listeners.signal});
  surface.addEventListener('keydown',event=>{const key=event;if(this.keys.key(key.code,true))key.preventDefault();},{signal:this.listeners.signal});
  surface.addEventListener('keyup',event=>{const key=event;if(this.keys.key(key.code,false))key.preventDefault();},{signal:this.listeners.signal});
  this.doc.addEventListener('visibilitychange',()=>{if(this.doc.hidden)this.suspend();},{signal:this.listeners.signal});
  this.doc.defaultView?.addEventListener('blur',()=>{this.suspend();},{signal:this.listeners.signal});
  this.ui('sound').addEventListener('click',()=>{this.sound();},{signal:this.listeners.signal});
  this.ui('pause').addEventListener('click',()=>{void this.control(this.view.control.state==='paused'?'resume':'pause');},{signal:this.listeners.signal});
  this.ui('finish').addEventListener('click',()=>{void this.control('stop');},{signal:this.listeners.signal});
  this.render();
 }
 private sound():void {if(this.controlsReady()&&this.deps.audio?.muted===true)void this.deps.audio.toggle();}
 private unavailable():boolean {return this.closed||this.suspended;}
 private controlsReady():boolean {return this.view.start!==null&&this.view.end===null&&this.view.control.state==='running';}
 private async claim():Promise<void> {
  if(this.closed||this.claiming||this.session!==null||this.view.start===null||this.view.end!==null||this.view.control.state!=='running')return;
  this.claiming=true;this.suspended=false;const session=this.deps.session();
  try{
   await this.writes;
   if(this.unavailable())return;
   await this.deps.sendJson(`/api/runs/${encodeURIComponent(this.runId)}/human/claim`,{session});
   this.session=session;this.seq=0;
   if(this.unavailable()||!this.controlsReady()||this.doc.activeElement!==this.ui('surface')){this.suspend();return;}
   this.keys.focus(true);this.heartbeatAt=this.deps.now();this.error='';
  }catch(error){this.fail(error);}finally{this.claiming=false;this.render();}
 }
 private input(buttons:readonly Button[]):void {
  const session=this.session;if(session===null)return;
  const seq=++this.seq;
  if(this.pending>=64){this.fail(Error('Input connection is falling behind; controls released'));return;}
  this.pending++;
  this.writes=this.writes.then(async()=>{
   if(this.session!==session)return;
   await this.deps.sendJson(`/api/runs/${encodeURIComponent(this.runId)}/human/input`,{session,seq,buttons});
  }).catch((error:unknown)=>{this.fail(error);}).finally(()=>{this.pending--;});
 }
 suspend():void {
  this.deps.audio?.mute();
  this.suspended=true;const session=this.session;const seq=++this.seq;this.session=null;this.keys.focus(false);
  if(session!==null&&this.view.end===null)this.writes=this.writes.then(async()=>{
   await this.deps.sendJson(`/api/runs/${encodeURIComponent(this.runId)}/human/input`,{session,seq,buttons:[],release:true});
  }).catch((error:unknown)=>{if(this.view.end!==null)return;this.error=error instanceof Error?error.message:'Controls could not be released';this.render();});
  this.render();
 }
 private fail(error:unknown):void {
  if(this.view.end!==null)return;
  this.error=error instanceof Error?error.message:'Input connection failed';
  this.suspend();
 }
 async control(action:'pause'|'resume'|'stop'):Promise<void> {
  if(this.closed||this.view.start===null||this.view.end!==null)return;
  this.suspend();await this.writes;
  try{await this.deps.sendJson(`/api/runs/${encodeURIComponent(this.runId)}/control`,{action});}catch(error){this.fail(error);}
 }
 tick():void {
  if(this.closed)return;
  if(this.session!==null&&this.pending===0&&this.deps.now()-this.heartbeatAt>=100){this.heartbeatAt=this.deps.now();this.input(this.keys.buttons);}
  if(this.view.start!==null&&this.view.end===null&&this.deps.now()-this.renderedAt>=100){
   (this.ui('screen') as HTMLImageElement).src=`/api/runs/${encodeURIComponent(this.runId)}/screen?t=${String(this.deps.now())}`;this.renderedAt=this.deps.now();
  }
  this.render();
 }
 render():void {
  const ended=this.view.end!==null;const ready=this.view.start!==null&&!ended;
  this.ui('time').textContent=hms(runSeconds(this.view,this.deps.now()));
  this.ui('status').textContent=this.error!==''?'Recording/input needs attention':ended?'Recording finished':ready?(this.view.control.state==='paused'?'Recording · paused':'Recording'): 'Connecting';
  this.ui('focus').textContent=this.session===null?'Click game to enable controls':'Controls active';
  this.ui('problem').textContent=this.error;
  if(ended&&this.view.frame!==null)(this.ui('screen') as HTMLImageElement).src=`/api/runs/${encodeURIComponent(this.runId)}/${this.view.frame}`;
  (this.ui('pause') as HTMLButtonElement).disabled=!ready;
  this.ui('pause').textContent=this.view.control.state==='paused'?'Resume':'Pause';
  (this.ui('finish') as HTMLButtonElement).disabled=!ready;
  const now=ended?(this.view.lastMs??this.deps.now()):this.deps.now();
  this.ui('splits').innerHTML=splits(this.view,null,now,null,true).table;
  this.ui('timeline').innerHTML=lanesSvg(this.view,now,['presses','milestones']);
 }
 close():void {this.closed=true;this.suspend();this.listeners.abort();this.stream?.close();}
}
