import {mkdtempSync,readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {humanSampler, type HumanRecording} from './human.js';
import {RunRecorder} from './recorder.js';
import {RunLog} from './run-log.js';
import {FrameStore} from './frames.js';
import {parseEvent} from './events.js';
import {RUN_START_META} from '../test-support/events.js';
const state={screen:'title',started:false,name:null,location:null,map_id:null,position:null,facing:null,in_battle:false,party:[],money:null,badges:[],play_time_s:null};
const png='iVBORw0KGgo=';
const segment={id:1,start_frame:0,end_frame:6,buttons:['A','UP'],start_ms:1000,end_ms:1100,request_seq:1,session:'human-test'};
const snapshot=(extra:Record<string,unknown>={})=>({frame:6,paused:false,failed:false,last_id:1,segments:[segment],observation:{state,screenshot_base64:png},...extra});
it('records the applied journal before acknowledging it on a later snapshot, including pause clocks',async()=>{
 const urls:string[]=[];const bodies:unknown[]=[];let n=0;
 const fetcher:typeof fetch=(input,init)=>{urls.push(input instanceof Request?input.url:String(input));expect(init?.headers).toEqual({'x-human-token':'secret'});return Promise.resolve(Response.json(n++===0?snapshot():snapshot({paused:true,segments:[]})));};
 const sample=humanSampler({recordHumanInput:body=>{bodies.push(body);},recordHumanSample:(frame,paused)=>{bodies.push({frame,paused});}},'http://test','secret',fetcher);
 await sample();expect(urls).toEqual(['http://test/pokebench/human/snapshot?after=0']);
 await sample();expect(urls[1]).toContain('after=1');expect(bodies).toEqual([segment,{frame:6,paused:false},{frame:6,paused:true}]);
});
it('does not acknowledge inputs when durable sample recording fails',async()=>{
 const urls:string[]=[];let fail=true;
 const recording:HumanRecording={recordHumanInput:()=>{},recordHumanSample:()=>{if(fail)throw Error('disk full');}};
 const sample=humanSampler(recording,'http://test','secret',(input)=>{urls.push(input instanceof Request?input.url:String(input));return Promise.resolve(Response.json(snapshot()));});
 await expect(sample()).rejects.toThrow('disk full');fail=false;await sample();expect(urls.every(url=>url.endsWith('after=0'))).toBe(true);
});
it.each([
 {segments:[{...segment,buttons:['INVALID']}]},
 {segments:[{...segment,end_frame:0}]},
 {segments:[{...segment,start_ms:1200}]},
 {segments:[{...segment,id:2}]},
 {last_id:2},
 {segments:[{...segment,start_frame:1}]},
 {frame:7},
 {failed:true},
 {observation:{state,screenshot_base64:'bad'}},
 {observation:{state:{},screenshot_base64:png}},
])('fails closed for malformed journal/sample %j',async(extra)=>{
 let recorded=0;const sample=humanSampler({recordHumanInput:()=>{recorded++;},recordHumanSample:()=>{recorded++;}},'http://test','secret',()=>Promise.resolve(Response.json(snapshot(extra))));
 await expect(sample()).rejects.toThrow();expect(recorded).toBe(0);
});
it('rejects a regressing emulator frame without acknowledging it',async()=>{
 let n=0;const sample=humanSampler({recordHumanInput:()=>{},recordHumanSample:()=>{}},'http://test','secret',()=>Promise.resolve(Response.json(snapshot(n++===0?{}:{frame:5,segments:[]}))));
 await sample();await expect(sample()).rejects.toThrow('regressing');
});
it('keeps L/R human-only without expanding model or probe action schemas',async()=>{
 const {Value}=await import('typebox/value');const {pressTool}=await import('./game-tools.js');const {parseProbeCommand}=await import('./probe.js');const {BUTTONS,HUMAN_BUTTONS}=await import('./events.js');
 const tool=pressTool('http://test',{beforePress:()=>{},afterPress:()=>Promise.resolve()});
 expect(BUTTONS).toHaveLength(8);expect(HUMAN_BUTTONS).toHaveLength(10);
 expect(Value.Check(tool.parameters,{buttons:['A','UP']})).toBe(true);
 for(const button of ['L','R']){expect(Value.Check(tool.parameters,{buttons:[button]})).toBe(false);expect(()=>parseProbeCommand(JSON.stringify({action:'press',buttons:[button]}))).toThrow();}
 const sample=humanSampler({recordHumanInput:body=>{expect(body.buttons).toEqual(['L','R']);},recordHumanSample:()=>{}},'http://test','secret',()=>Promise.resolve(Response.json(snapshot({segments:[{...segment,buttons:['L','R']}]}))));
 await sample();
 expect(parseEvent(JSON.stringify({v:1,run:'human-test',seq:1,t:'2026-10-13T14:00:00.000-04:00',turn:0,type:'human_input',...segment,buttons:['L','R']}))).toMatchObject({type:'human_input',buttons:['L','R']});
});
