// @vitest-environment happy-dom
import {describe,expect,it} from "vitest";
import {BASE_MS,Log,START,assistant,fullRun} from "../test-support/events.js";
import {RunView,foldUntil} from "./model.js";
import {METRIC_HISTORY_LIMIT,metricHistory} from "./metric-history.js";
function view(log:Log){const v=new RunView();for(const e of log.events)v.apply(e);return v;}
describe("recorded metric history",()=>{
 it("projects each response by sequence and plots recorded values including zero without a stats slider",()=>{
  const log=new Log();log.add(0,START);log.add(1000,assistant({ttft_ms:0,latency_ms:0,usage:{input:0,output:0,cache_read:0,cache_write:0}}));log.add(2000,assistant({ttft_ms:250,usage:{input:500,output:100,cache_read:200,cache_write:0}}));
  const v=view(log);expect(v.requestSamples.map(s=>[s.seq,s.ttftMs,s.input,s.cacheRead])).toEqual([[1,0,0,0],[2,250,500,200]]);
  document.body.innerHTML=metricHistory(v);
  expect(document.querySelectorAll('svg')).toHaveLength(4);
  expect(document.querySelector('input[type=range]')).toBeNull();
  expect(document.querySelector('[data-metric="ttft"] strong')?.textContent).toBe('250 ms');
  expect(document.querySelector('[data-metric="prompt"] strong')?.textContent).toBe('700 tokens');
  expect(document.body.textContent).toContain('Instruction/history/tool breakdown was not recorded');
  expect(document.querySelectorAll('rect.mh-input')).toHaveLength(2);
  expect(document.querySelectorAll('rect.mh-cache')).toHaveLength(2);
  expect(metricHistory(v)).toBe(metricHistory(v));
 });
 it("includes recorded cache writes in the prompt total and third stack, preserving historical unknowns",()=>{
  const log=new Log();log.add(0,START);
  log.add(1000,assistant({usage:{input:100,output:10,cache_read:200,cache_write:50}}));
  const v=view(log);expect(v.requestSamples[0]).toMatchObject({cacheWrite:50});
  document.body.innerHTML=metricHistory(v);
  expect(document.querySelector('[data-metric="prompt"] strong')?.textContent).toBe('350 tokens');
  expect(document.querySelector('rect.mh-write title')?.textContent).toContain('cache writes 50 tokens');
  expect(Number(document.querySelector('rect.mh-write')?.getAttribute('height'))).toBeGreaterThan(0);
  expect(document.querySelector('[data-metric="prompt"]')?.textContent).toContain('Cache writes');
  log.add(2000,assistant({usage:{input:100,output:10,cache_read:200,cache_write:0}}));
  const zero=view(log);expect(zero.requestSamples[1]).toMatchObject({cacheWrite:0});
  document.body.innerHTML=metricHistory(zero);
  expect(document.querySelectorAll('rect.mh-write')).toHaveLength(2);
  expect(document.querySelector('[data-metric="prompt"] strong')?.textContent).toBe('300 tokens');
  log.add(3000,assistant({usage:{input:100,output:10,cache_read:200}}));
  const historical=view(log);expect(historical.requestSamples[2]).toMatchObject({cacheWrite:null});
  document.body.innerHTML=metricHistory(historical);
  expect(document.querySelector('[data-metric="prompt"] strong')?.textContent).toBe('300 tokens (partial)');
  expect(document.querySelectorAll('rect.mh-write')).toHaveLength(2);
  expect(document.body.textContent).toContain('Missing cache writes remain unknown; prompt totals for those responses are partial.');
 });
 it("breaks missing TTFT and failed-response lines; never counts failed zero as a healthy response",()=>{
  const log=new Log();log.add(0,START);log.add(1000,assistant());log.add(2000,assistant({ttft_ms:null}));log.add(3000,assistant());log.add(4000,assistant({stop_reason:'error',ttft_ms:0}));log.add(5000,assistant());
  document.body.innerHTML=metricHistory(view(log));
  const ttft=document.querySelector('[data-metric="ttft"] [data-series="value"]')?.getAttribute('d');
  expect(ttft?.match(/M/g)).toHaveLength(3);
  expect(document.body.textContent).toContain('5 responses · 1 failed');
  expect(document.querySelector('[data-metric="inference"] [data-series="value"]')?.getAttribute('d')?.match(/M/g)).toHaveLength(2);
 });
 it("bounds rendered responses using an injected small window and retains shared wall timestamps",()=>{
  expect(METRIC_HISTORY_LIMIT).toBe(300);
  const log=new Log();log.add(0,START);
  for(let i=1;i<=3;i++)log.add(i*60000,assistant());
  const v=view(log);document.body.innerHTML=metricHistory(v,2);
  expect(document.querySelector('[data-metric="output"]')?.textContent).not.toContain('Response #1 ·');
  expect(document.querySelectorAll('[data-metric="output"] circle')).toHaveLength(2);
  expect(document.body.textContent).toContain('Showing the latest 2 responses');
  expect(document.body.textContent).toContain('2.0 min');expect(document.body.textContent).toContain('3.0 min');
  expect(metricHistory(v)).not.toContain('Showing the latest 2 responses');
  expect(()=>metricHistory(v,0)).toThrow(RangeError);
 });
 it("shows unavailable, failure, empty and no-run states honestly",()=>{
  expect(metricHistory(new RunView())).toContain('Select a run');
  const log=new Log();log.add(0,START);expect(metricHistory(view(log))).toContain('Waiting for a recorded response');
  log.add(1000,assistant({ttft_ms:null}));expect(metricHistory(view(log))).toContain('unavailable');
  log.add(2000,assistant({stop_reason:'aborted'}));expect(metricHistory(view(log))).toContain('failed response');
 });
 it("follows replay time and run selection, rejects duplicate samples, and refreshes when a response arrives",()=>{
  const log=fullRun(), v=view(log);expect(v.requestSamples).toHaveLength(2);
  const last=log.events.find(e=>e.type==='assistant');if(last===undefined)throw Error('fixture');v.apply(last);expect(v.requestSamples).toHaveLength(2);
  const early=foldUntil(log.events,BASE_MS+3500);expect(early.requestSamples).toHaveLength(1);expect(metricHistory(early)).not.toBe(metricHistory(v));
  expect(metricHistory(foldUntil(log.events,BASE_MS+1000))).toContain('Waiting for a recorded response');
  const empty=new Log();empty.add(0,START);expect(metricHistory(view(empty))).not.toContain('400 tokens');
 });
});
