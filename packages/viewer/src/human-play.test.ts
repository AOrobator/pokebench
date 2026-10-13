// @vitest-environment happy-dom
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {beforeEach,expect,it,vi} from 'vitest';
import {BASE_MS,Log,RUN,START,state} from '../test-support/events.js';
import {HumanPlay} from './human-play.js';
import type {StreamLike} from './app.js';
const PAGE=readFileSync(join(import.meta.dirname,'../static/play.html'),'utf8');
const start=()=>new Log().add(0,{...START,controller:{kind:'human',name:'Operator',rom_sha1:'a'.repeat(40),input_policy:'frame-held-v1',sample_ms:100,nominal_fps:59.7275}});
class Stream implements StreamLike {
 closed=false;
 listener:((message:{data:string})=>void)|null=null;
 error:(()=>void)|null=null;
 addEventListener(_type:string,listener:(message:{data:string})=>void):void {if(_type==='ev')this.listener=listener;else this.error=()=>{listener({data:''});};}
 close():void {this.closed=true;}
 send(value:unknown):void {this.listener?.({data:JSON.stringify(value)});}
}
function ui(name:string):HTMLElement {const el=document.querySelector<HTMLElement>(`[data-play="${name}"]`);if(el===null)throw Error(name);return el;}
async function harness(reply:unknown=start()) {
 let now=BASE_MS;let session=0;const stream=new Stream();const send=vi.fn<(url:string,body:unknown)=>Promise<unknown>>().mockResolvedValue({});
 const openRun=vi.fn<(runId:string)=>void>();
 const play=new HumanPlay(document,RUN,{openRun,fetchJson:()=>Promise.resolve(reply),sendJson:send,openStream:()=>stream,now:()=>now,session:()=>`session-${String(++session)}`});
 await play.start();return {play,stream,send,openRun,advance:(ms:number)=>{now+=ms;play.tick();}};
}
const settle=async()=>{for(let i=0;i<600;i++)await Promise.resolve();};
function key(code:string,type='keydown'):KeyboardEvent {const event=new KeyboardEvent(type,{code,bubbles:true,cancelable:true});ui('surface').dispatchEvent(event);return event;}
beforeEach(()=>{document.body.innerHTML=PAGE.slice(PAGE.indexOf('<main'),PAGE.indexOf('<script'));});
it('renders the separate minimal layout and only the shared input/milestone lanes',async()=>{
 const {play,stream,advance}=await harness();expect(ui('inspect').getAttribute('href')).toBe(`/#run=${RUN}`);
 expect(ui('timeline').innerHTML).toContain('presses');expect(ui('timeline').innerHTML).toContain('milestones');
 for(const lane of ['thinking','tool calls','errors'])expect(ui('timeline').innerHTML).not.toContain(`>${lane}<`);
 expect(ui('splits').closest('aside')).not.toBeNull();advance(1000);expect(ui('screen').getAttribute('src')).toContain('/screen?t=');expect(ui('time').textContent).toBe('0:00:01');
 const log=new Log();log.add(0,START);
 stream.send(log.add(1500,state()));expect(play.view.state?.name).toBe('MAY');
 stream.send({v:1,run:'other',seq:99,t:new Date(BASE_MS).toISOString(),type:'run_end'});expect(play.view.end).toBeNull();play.close();expect(stream.closed).toBe(true);
});
it('claims on focus, suppresses repeats, maintains combinations, heartbeats and retires on blur',async()=>{
 const {play,send,advance}=await harness();expect(key('KeyO').defaultPrevented).toBe(false);ui('surface').focus();await settle();
 expect(send).toHaveBeenCalledWith(expect.stringContaining('/claim'),{session:'session-1'});
 expect(key('KeyO').defaultPrevented).toBe(true);key('KeyO');await settle();key('KeyW');await settle();key('KeyO','keyup');await settle();
 expect(send.mock.calls.at(-1)?.[1]).toMatchObject({buttons:['UP']});advance(100);await settle();expect(send.mock.calls.at(-1)?.[1]).toMatchObject({buttons:['UP']});
 ui('surface').blur();await settle();expect(send.mock.calls.at(-1)?.[1]).toMatchObject({buttons:[],release:true});
 expect(ui('focus').textContent).toContain('Click');expect(key('KeyW').defaultPrevented).toBe(false);
 ui('surface').focus();await settle();expect(send.mock.calls.at(-1)?.[1]).toEqual({session:'session-2'});play.close();await settle();expect(send.mock.calls.at(-1)?.[1]).toMatchObject({release:true});
});
it('releases a claim which finishes after focus is lost and removes handlers on close',async()=>{
 const {play,send}=await harness();let finish:()=>void=()=>{};send.mockImplementationOnce(()=>new Promise(resolve=>{finish=()=>{resolve({});};}));
 ui('surface').click();await settle();ui('surface').blur();finish();await settle();expect(send.mock.calls.at(-1)?.[1]).toMatchObject({release:true});
 play.close();const count=send.mock.calls.length;ui('surface').focus();await settle();expect(send).toHaveBeenCalledTimes(count);
});
it('reports claim and input failures and allows focused retry',async()=>{
 const {play,send}=await harness();send.mockRejectedValueOnce(Error('busy'));ui('surface').focus();await settle();expect(ui('problem').textContent).toBe('busy');
 ui('surface').click();await settle();send.mockRejectedValueOnce(Error('offline'));key('KeyO');await settle();expect(ui('problem').textContent).toBe('offline');expect(send.mock.calls.at(-1)?.[1]).toMatchObject({release:true});play.close();
});
it('does not acquire after an ended replay and uses its terminal clock',async()=>{
 const {play,stream,send,advance}=await harness();const log=new Log();log.add(0,START);stream.send(log.add(2000,{type:'run_end',turn:0,reason:'operator_stop',turns:0,wall_ms:2000,furthest_milestone:null,tokens:{input:0,output:0},frames:{saved:0,bytes:0}}));
 expect(stream.closed).toBe(true);stream.error?.();expect(ui('problem').textContent).toBe('');expect(ui('status').textContent).toBe('Recording finished');expect((ui('pause') as HTMLButtonElement).disabled).toBe(true);ui('surface').click();await settle();advance(5000);await play.control('stop');expect(send).not.toHaveBeenCalled();expect(ui('time').textContent).toBe('0:00:02');play.close();
});
it('rejects agent or wrong run identities before connecting',async()=>{
 await expect(harness(new Log().add(0,START))).rejects.toThrow('human run');await expect(harness({...start(),run:'other'})).rejects.toThrow('human run');
});
it('pause and finish retire controls before operator requests; handles malformed stream events',async()=>{
 const {play,stream,send}=await harness();ui('surface').focus();await settle();ui('pause').click();await settle();expect(send.mock.calls.at(-2)?.[1]).toMatchObject({release:true});expect(send.mock.calls.at(-1)?.[1]).toEqual({action:'pause'});
 ui('finish').click();await settle();expect(send.mock.calls.at(-1)?.[1]).toEqual({action:'stop'});stream.listener?.({data:'bad JSON'});expect(ui('problem').textContent).toBe('Invalid recording event');play.close();
});
it('suspends on window blur or hidden page, but ignores visible-page events',async()=>{
 const {play,send}=await harness();ui('surface').focus();await settle();document.dispatchEvent(new Event('visibilitychange'));expect(ui('focus').textContent).toBe('Controls active');
 window.dispatchEvent(new Event('blur'));await settle();expect(send.mock.calls.at(-1)?.[1]).toMatchObject({release:true});ui('surface').click();await settle();
 vi.spyOn(document,'hidden','get').mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));await settle();expect(send.mock.calls.at(-1)?.[1]).toMatchObject({release:true});vi.restoreAllMocks();play.close();
});
it('handles connection loss and a bounded delayed input queue without sticking buttons',async()=>{
 const {play,stream,send}=await harness();ui('surface').focus();await settle();stream.error?.();await settle();expect(ui('problem').textContent).toContain('Recording connection interrupted');
 ui('surface').click();await settle();let release:()=>void=()=>{};send.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>{resolve({});};}));key('KeyO');await settle();
 for(let i=0;i<70;i++)key('KeyW',i%2===0?'keydown':'keyup');expect(ui('problem').textContent).toContain('falling behind');release();await settle();expect(send.mock.calls.at(-1)?.[1]).toMatchObject({release:true});expect(send.mock.calls.filter(([url])=>url.endsWith('/human/input'))).toHaveLength(3);play.close();
});
it('renders recorded human frames, milestones and pause/resume without acquiring during pause',async()=>{
 const {play,stream,send,advance}=await harness();const log=new Log();log.add(0,START);
 stream.send(log.add(100,{type:'human_sample',turn:0,frame:6,paused:false,screenshot:{path:'frames/000001_0.png',sha1:'a'.repeat(40)}}));
 stream.send(log.add(200,{type:'milestone',turn:0,name:'GAME_RUNNING',server_timestamp:1}));expect(ui('splits').textContent).toContain('game running');
 stream.send(log.add(500,{type:'operator_control',turn:0,action:'pause',status:'applied',request:1,emulator_frozen:true}));ui('surface').click();await settle();expect(send).not.toHaveBeenCalled();expect(ui('pause').textContent).toBe('Resume');ui('pause').click();await settle();expect(send.mock.calls.at(-1)?.[1]).toEqual({action:'resume'});
 stream.send(log.add(1500,{type:'operator_control',turn:0,action:'resume',status:'applied',request:2,paused_ms:1000}));advance(2000);expect(ui('time').textContent).toBe('0:00:01');
 stream.send(log.add(3000,{type:'run_end',turn:0,reason:'operator_stop',turns:0,wall_ms:2000,furthest_milestone:null,tokens:{input:0,output:0},frames:{saved:1,bytes:1}}));expect(ui('screen').getAttribute('src')).toContain('/frames/000001_0.png');play.close();
});

it('unlocks sound on the game click and suspends it on blur and end',async()=>{
 const {play,stream}=await harness();const audio={muted:true,toggle:vi.fn<()=>Promise<void>>().mockResolvedValue(undefined),mute:vi.fn()};
 // Mount a second page with explicitly supplied shared audio owner.
 play.close();const deps={audio,fetchJson:()=>Promise.resolve(start()),sendJson:()=>Promise.resolve({}),openStream:()=>stream,now:()=>BASE_MS,session:()=>"sound-session"};const soundPlay=new HumanPlay(document,RUN,deps);await soundPlay.start();ui('surface').click();expect(audio.toggle).toHaveBeenCalledOnce();await settle();ui('surface').blur();expect(audio.mute).toHaveBeenCalled();soundPlay.close();
});

it('preserves all ten key taps in a burst behind a delayed request',async()=>{
 const {play,send}=await harness();ui('surface').focus();await settle();let finish:()=>void=()=>{};send.mockImplementationOnce(()=>new Promise(resolve=>{finish=()=>{resolve({});};}));
 for(const code of ['KeyW','KeyA','KeyS','KeyD','KeyZ','KeyX','KeyO','KeyP','Digit1','Digit2']){key(code);key(code,'keyup');}
 await settle();expect(ui('problem').textContent).toBe('');expect(send.mock.calls).toHaveLength(2);finish();await settle();
 const inputs=send.mock.calls.filter(([url])=>url.endsWith('/human/input'));expect(inputs).toHaveLength(20);
 expect(inputs.map(([,body])=>body)).toEqual(['UP','LEFT','DOWN','RIGHT','SELECT','START','A','B','L','R'].flatMap((button,index)=>[{session:'session-1',seq:index*2+1,buttons:[button]},{session:'session-1',seq:index*2+2,buttons:[]} ]));play.close();await settle();
});

it('keeps a terminal recording clean when an in-flight input fails after Finish',async()=>{
 const {play,stream,send}=await harness();ui('surface').focus();await settle();let fail:(error:Error)=>void=()=>{};send.mockImplementationOnce(()=>new Promise((_resolve,reject)=>{fail=reject;}));key('KeyO');await settle();
 const log=new Log();log.add(0,START);stream.send(log.add(2000,{type:'run_end',turn:0,reason:'operator_stop',turns:0,wall_ms:2000,furthest_milestone:null,tokens:{input:0,output:0},frames:{saved:0,bytes:0}}));fail(Error('run ended'));await settle();stream.error?.();play.close();await settle();expect(ui('problem').textContent).toBe('');expect(ui('status').textContent).toBe('Recording finished');expect(send.mock.calls.filter(([url])=>url.endsWith('/human/input'))).toHaveLength(1);
});

it('toggles sound off and on from the focused game for pointer and keyboard focus paths',async()=>{
 const stream=new Stream();let muted=true;const toggles=vi.fn<()=>Promise<void>>(()=>{muted=!muted;return Promise.resolve();});const mute=vi.fn(()=>{muted=true;});const audio={get muted(){return muted;},toggle:toggles,mute};
 const play=new HumanPlay(document,RUN,{audio,fetchJson:()=>Promise.resolve(start()),sendJson:()=>Promise.resolve({}),openStream:()=>stream,now:()=>BASE_MS,session:()=>"audio-session"});await play.start();
 ui('surface').click();await settle();expect(muted).toBe(false);expect(document.activeElement).toBe(ui('surface'));
 // Both pointer clicks and Tab activation focus the sound button before click.
 ui('sound').focus();expect(mute).not.toHaveBeenCalled();ui('sound').click();await settle();expect(muted).toBe(true);expect(toggles).toHaveBeenCalledTimes(2);
 ui('surface').click();await settle();expect(ui('focus').textContent).toBe('Controls active');expect(muted).toBe(true);expect(toggles).toHaveBeenCalledTimes(2);
 ui('sound').focus();ui('sound').click();await settle();expect(muted).toBe(false);expect(toggles).toHaveBeenCalledTimes(3);
 ui('surface').focus();await settle();ui('sound').focus();expect(muted).toBe(false);ui('sound').click();expect(muted).toBe(true);
 play.close();
});
it.each([['crash','Recording failed'],['model_error','Recording failed'],['operator_abort','Recording aborted'],['operator_stop','Recording finished']] as const)('surfaces terminal reason %s',async(reason,label)=>{
 const {play,stream}=await harness();const log=new Log();log.add(0,START);stream.send(log.add(2000,{type:'run_end',turn:0,reason,turns:0,wall_ms:2000,furthest_milestone:null,tokens:{input:0,output:0},frames:{saved:0,bytes:0}}));expect(ui('status').textContent).toBe(label);expect(ui('focus').textContent).toBe('Controls disabled');stream.error?.();expect(ui('status').textContent).toBe(label);expect(ui('problem').textContent).toBe('');play.close();
});

it('starts over only after releasing current controls and deduplicates clicks',async()=>{
 const {play,send,stream,openRun}=await harness();ui('surface').focus();await settle();let release:()=>void=()=>{};send.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>{resolve({});};}));send.mockResolvedValueOnce({run_id:'new-human-run'});
 ui('restart').click();ui('restart').click();await settle();expect(ui('status').textContent).toBe('Starting new game');expect((ui('restart') as HTMLButtonElement).disabled).toBe(true);expect((ui('pause') as HTMLButtonElement).disabled).toBe(true);expect(key('KeyO').defaultPrevented).toBe(false);expect(send.mock.calls.at(-1)?.[1]).toMatchObject({release:true});expect(send.mock.calls.some(([url])=>url.endsWith('/human/restart'))).toBe(false);
 release();await settle();expect(send.mock.calls.at(-1)).toEqual([`/api/runs/${RUN}/human/restart`,{}]);expect(send.mock.calls.filter(([url])=>url.endsWith('/human/restart'))).toHaveLength(1);expect(openRun).toHaveBeenCalledWith('new-human-run');expect(stream.closed).toBe(true);const count=send.mock.calls.length;ui('surface').click();await settle();expect(send).toHaveBeenCalledTimes(count);play.close();
});
it('offers Start over from a finished run and surfaces errors with retry',async()=>{
 const {play,send,stream,openRun}=await harness();const log=new Log();log.add(0,START);stream.send(log.add(2000,{type:'run_end',turn:0,reason:'operator_stop',turns:0,wall_ms:2000,furthest_milestone:null,tokens:{input:0,output:0},frames:{saved:0,bytes:0}}));expect((ui('restart') as HTMLButtonElement).disabled).toBe(false);send.mockRejectedValueOnce(Error('server busy'));ui('restart').click();await settle();expect(ui('problem').textContent).toBe('server busy');expect((ui('restart') as HTMLButtonElement).disabled).toBe(false);expect(openRun).not.toHaveBeenCalled();send.mockResolvedValueOnce({run_id:'retry-human-run'});ui('restart').click();await settle();expect(openRun).toHaveBeenCalledWith('retry-human-run');play.close();
});
it.each([{},null,{run_id:RUN},{run_id:'../wrong'},{run_id:'safe',extra:true},{run_id:3}])('rejects malformed replacement identity %j',async(reply)=>{
 const {play,send,openRun}=await harness();send.mockResolvedValueOnce(reply);ui('restart').click();await settle();expect(openRun).not.toHaveBeenCalled();expect(ui('problem').textContent).toBe('Invalid new run identity');expect((ui('restart') as HTMLButtonElement).disabled).toBe(false);play.close();
});

it('starts over from pause and waits for an in-flight claim to release before restart',async()=>{
 const {play,stream,send,openRun}=await harness();let claimed:()=>void=()=>{};send.mockImplementationOnce(()=>new Promise(resolve=>{claimed=()=>{resolve({});};}));ui('surface').focus();await settle();send.mockResolvedValueOnce({});send.mockResolvedValueOnce({run_id:'claimed-replacement'});ui('restart').click();await settle();expect(send).toHaveBeenCalledTimes(1);claimed();await settle();expect(send.mock.calls[1]?.[1]).toMatchObject({release:true});expect(send.mock.calls[2]).toEqual([`/api/runs/${RUN}/human/restart`,{}]);expect(openRun).toHaveBeenCalledWith('claimed-replacement');play.close();
 const paused=await harness();const log=new Log();log.add(0,START);paused.stream.send(log.add(100,{type:'operator_control',turn:0,action:'pause',status:'applied',request:1,emulator_frozen:true}));paused.send.mockResolvedValueOnce({run_id:'paused-replacement'});ui('restart').click();await settle();expect(paused.openRun).toHaveBeenCalledWith('paused-replacement');expect(paused.send.mock.calls).toEqual([[`/api/runs/${RUN}/human/restart`,{}]]);paused.play.close();expect(stream.closed).toBe(true);
});
