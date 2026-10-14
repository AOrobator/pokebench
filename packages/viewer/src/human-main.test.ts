// @vitest-environment happy-dom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {HumanPlay} from './human-play.js';
import type {HumanPlayDeps} from './human-play.js';
import {AudioFollower} from '../../agent/src/spectator.js';
vi.mock('./human-play.js',()=>({HumanPlay:vi.fn()}));
async function boot(){const module=await import('./human-main.js');await vi.waitFor(()=>{expect(start).toHaveBeenCalled();});await Promise.resolve();await Promise.resolve();return module;}
const start=vi.fn<()=>Promise<void>>();const tick=vi.fn();const close=vi.fn();let deps:HumanPlayDeps;
beforeEach(()=>{
 vi.resetModules();vi.useFakeTimers();document.body.innerHTML='<p data-play="problem"></p>';window.location.hash='#run=human%20run';
 start.mockReset().mockResolvedValue();tick.mockClear();close.mockClear();
 vi.mocked(HumanPlay).mockImplementation(function(_doc,_id,provided){deps=provided;return {start,tick,close} as unknown as HumanPlay;});
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('boots decoded run identity, periodic live tick and close lifecycle',async()=>{
 await boot();await Promise.resolve();expect(HumanPlay).toHaveBeenCalledWith(document,'human run',expect.any(Object));vi.advanceTimersByTime(200);expect(tick).toHaveBeenCalledTimes(2);
 window.dispatchEvent(new Event('pagehide'));expect(close).toHaveBeenCalled();expect(deps.now()).toBe(Date.now());expect(deps.session()).toMatch(/^[0-9a-f-]{36}$/);
 const fetch=vi.fn().mockResolvedValue({ok:true,json:()=>Promise.resolve({ready:true})});vi.stubGlobal('fetch',fetch);expect(await deps.fetchJson('/start')).toEqual({ready:true});expect(await deps.sendJson('/input',{buttons:['A']})).toEqual({ready:true});expect(fetch.mock.calls[1]?.[1]).toMatchObject({method:'POST',body:'{"buttons":["A"]}'});
 const stream={};vi.stubGlobal('EventSource',function(url:string){expect(url).toBe('/events');return stream;});expect(deps.openStream('/events')).toBe(stream);
});
it('reports startup and response failures',async()=>{
 start.mockRejectedValueOnce(Error('no run'));await boot();await Promise.resolve();await Promise.resolve();expect(document.querySelector('[data-play="problem"]')?.textContent).toBe('no run');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:409,json:()=>Promise.resolve({error:'busy'})}));await expect(deps.fetchJson('/start')).rejects.toThrow('busy');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:503,json:()=>Promise.resolve(null)}));await expect(deps.sendJson('/input',{})).rejects.toThrow('HTTP 503');
});
it('handles non-Error failure and missing problem area',async()=>{
 start.mockRejectedValueOnce('unknown');await boot();await Promise.resolve();await Promise.resolve();expect(document.querySelector('[data-play="problem"]')?.textContent).toBe('Cannot start human play');
 vi.resetModules();document.body.innerHTML='';start.mockRejectedValueOnce('unknown');await boot();await Promise.resolve();await Promise.resolve();
});

it('plays interleaved PCM through the shared fixed-speed follower on the isolated run',async()=>{
 const {createHumanAudio}=await boot();const left=new Float32Array(2),right=new Float32Array(2);
 const source={buffer:null,playbackRate:{value:0},connect:vi.fn(),start:vi.fn(),stop:vi.fn(),disconnect:vi.fn()};
 const context={resume:vi.fn().mockResolvedValue(undefined),destination:{},createBuffer:vi.fn(()=>({getChannelData:(channel:number)=>channel===0?left:right})),createBufferSource:()=>source};
 const wav=new ArrayBuffer(52);const pcm=new DataView(wav);pcm.setInt16(44,16384,true);pcm.setInt16(46,-16384,true);pcm.setInt16(48,8192,true);pcm.setInt16(50,-8192,true);
 const fetch=vi.fn().mockResolvedValue(new Response(wav,{headers:{'X-Audio-Next':'2'}}));vi.stubGlobal('fetch',fetch);const status=vi.fn();
 const audio=createHumanAudio(AudioFollower,'human run',status,()=>context as unknown as AudioContext);await audio.toggle();expect(context.resume).toHaveBeenCalledOnce();expect(source.playbackRate.value).toBe(1);expect(left).toEqual(new Float32Array([.5,.25]));expect(right).toEqual(new Float32Array([-.5,-.25]));expect(fetch.mock.calls[0]?.[0]).toBe('/api/runs/human%20run/audio.wav?since=-1&max_frames=12000');audio.mute();expect(source.stop).toHaveBeenCalledOnce();expect(source.disconnect).toHaveBeenCalledOnce();
});
it('loads the shared audio owner and reports unavailable modules without blocking play',async()=>{
 const {connectHumanAudio}=await boot();document.body.innerHTML='<button data-play="sound"></button>';
 const load=vi.fn().mockResolvedValue({AudioFollower});await connectHumanAudio(deps,document,'human run',load);expect(load).toHaveBeenCalledWith('/app/agent-spectator.js');expect(deps.audio?.muted).toBe(true);
 vi.stubGlobal('AudioContext',class {resume():Promise<void>{return Promise.resolve();}});vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new ArrayBuffer(44),{headers:{'X-Audio-Next':'0'}})));await deps.audio?.toggle();expect(document.querySelector('[data-play="sound"]')?.textContent).toBe('Sound on · 1×');
 deps.audio?.mute();expect(document.querySelector('[data-play="sound"]')?.textContent).toBe('Unmute audio');
 for(const module of [null,{}, {AudioFollower:3}]){await connectHumanAudio(deps,document,'human',()=>Promise.resolve(module));expect(document.querySelector('[data-play="sound"]')?.textContent).toBe('Sound unavailable');}
 document.body.innerHTML='';await connectHumanAudio(deps,document,'human',()=>Promise.resolve({AudioFollower}));deps.audio?.mute();await connectHumanAudio(deps,document,'human',()=>Promise.reject(Error('missing')));
});

it('navigates to a new document when opening a replacement run',async()=>{
 const {openHumanRun}=await boot();const navigate=vi.fn<(url:string)=>void>();openHumanRun('replacement-human-run',navigate);expect(navigate).toHaveBeenCalledWith('/play?run=replacement-human-run#run=replacement-human-run');expect(deps.openRun).toBe(openHumanRun);
 const assign=vi.spyOn(window.location,'assign').mockImplementation(()=>{});openHumanRun('default-navigation');expect(assign).toHaveBeenCalledWith('/play?run=default-navigation#run=default-navigation');assign.mockRestore();
});
