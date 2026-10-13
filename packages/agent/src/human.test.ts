import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { humanPlan, humanLease } from './human.js';
import { withRun, type RunHost } from './run.js';
import { FrameStore } from './frames.js';
import { parseEvent } from './events.js';
const root = () => mkdtempSync(join(tmpdir(), 'human-'));
it('records explicit human identity and exact measurement policy without model tools', () => {
 const plan = humanPlan(root(), 'human-test', 8040, 'a'.repeat(40));
 expect(plan.controller).toEqual({kind:'human',name:'Operator',rom_sha1:'a'.repeat(40),input_policy:'frame-held-v1',sample_ms:100,nominal_fps:59.7275});
 expect(plan.tools).toEqual([]); expect(plan.model.max_tokens).toBe(0); expect(plan.harnessFeatures).not.toContain('probe');
});
it('takes the shared lease exclusively and cleans up only its own acquisition', () => {
 const r=root(); const release=humanLease(r,'human-test');
 expect(()=>humanLease(r,'other')).toThrow();
 expect(JSON.parse(readFileSync(join(r,'.naming-gameplay.lock','owner.json'),'utf8'))).toMatchObject({run:'human-test'});
 release(); release(); expect(existsSync(join(r,'.naming-gameplay.lock'))).toBe(false);
});
it('preserves a terminal crash receipt when human server launch fails', async () => {
 const r=root(); const plan=humanPlan(r,'human-test',8040,'a'.repeat(40));
 const host:RunHost={ serverHealthy:async()=>false,launchServer:async()=>{throw Error('failed launch');},harness:()=>({commit:'a'.repeat(40),dirty:false}),vendorPin:()=> 'b'.repeat(40),milestones:{poll:async()=>[]},gameState:{read:async()=>{throw Error('not started');}}};
 await expect(withRun(plan,host,new FrameStore(r),async()=> 'operator_stop')).rejects.toThrow('failed launch');
 const events=readFileSync(join(r,'human-test','events.jsonl'),'utf8').trim().split('\n').map(parseEvent);
 expect(events[0]).toMatchObject({type:'run_start',controller:{kind:'human'}});
 expect(events.at(-1)).toMatchObject({type:'run_end',reason:'crash'});
});
