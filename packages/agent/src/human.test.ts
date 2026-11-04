import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { humanPlan, humanLease, humanPlayUrl, viewerRunUrl } from './human.js';
import { withRun, type RunHost } from './run.js';
import { FrameStore } from './frames.js';
import { parseEvent } from './events.js';
it('samples idle human play but stops before sampling after a terminal boundary', async()=>{
 const {humanLoop}=await import('./human.js');let samples=0,boundaries=0,waits=0;let stopped=false;
 await humanLoop({stopped:()=>stopped,sample:()=>{samples++;return Promise.resolve();},boundary:()=>{boundaries++;if(boundaries===3)stopped=true;return Promise.resolve();},wait:()=>{waits++;return Promise.resolve();}});
 expect([samples,boundaries,waits]).toEqual([2,3,2]);
 await humanLoop({stopped:()=>true,sample:()=>Promise.reject(Error("unexpected")),boundary:()=>Promise.resolve(),wait:()=>Promise.resolve()});
});

it('binds a restart launch to its assigned fresh human id without sampling a new suffix',async()=>{
 const {humanRunId}=await import('./human.js');let randomCalls=0;const random=()=>{randomCalls++;return 'abcd';};
 expect(humanRunId('human-assigned',new Date('2026-10-13T23:00:00Z'),random)).toBe('human-assigned');expect(randomCalls).toBe(0);
 expect(humanRunId(undefined,new Date('2026-10-13T23:00:00Z'),random)).toMatch(/_human_abcd$/);expect(randomCalls).toBe(1);
 for(const id of ['', '../escape', 'a'.repeat(129)])expect(()=>humanRunId(id,new Date(),random)).toThrow('invalid human run id');
});

it('links human play and probe runs to the viewer on 8790, not the pages server', () => {
  expect(humanPlayUrl('2026-10-22T12-35-14_human_f8d7')).toBe('http://127.0.0.1:8790/play?run=2026-10-22T12-35-14_human_f8d7#run=2026-10-22T12-35-14_human_f8d7');
  expect(viewerRunUrl('probe a&b')).toBe('http://127.0.0.1:8790/#run=probe%20a%26b');
});
