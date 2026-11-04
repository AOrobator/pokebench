// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { BASE_MS, Log, START } from "../test-support/events.js";
import { RunView } from "./model.js";
import { LEAD_MS, LaneMotion, TimelineFeed, WINDOW_MS, lanesSvg, type LaneAnimation } from "./timeline.js";

function view(log: Log): RunView {
  const v = new RunView();
  for (const event of log.events) v.apply(event);
  return v;
}

describe("the clip line and the moving strip",()=>{
 const host=():HTMLElement=>{const root=document.createElement("div");document.body.append(root);return root;};
 const marks=(root:HTMLElement)=>[...root.querySelectorAll<SVGElement>(".lanes-strip .m-think")].map(mark=>Number(mark.getAttribute("x")));
 const spans=(log:Log,...at:readonly number[]):void=>{for(const ms of at){log.add(ms,{type:"turn_start",turn:1,context:{messages:1,images:0,est_tokens:1}});log.add(ms+500,{type:"assistant",turn:1,thinking:"",text:"",tool_calls:[],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:1,stop_reason:"stop"});}};
 it("keeps a mark on the strip until it reaches the line, and clips one crossing it",()=>{
  const log=new Log();log.add(0,START);spans(log,1000);
  const crossing=lanesSvg(view(log),BASE_MS+1200+WINDOW_MS);expect(crossing).toContain('class="m-think"');
  const mark=/class="m-think"[^>]* x="([^"]+)"[^>]* width="([^"]+)"/.exec(crossing);expect(Number(mark?.[1])).toBe(0);
  expect(lanesSvg(view(log),BASE_MS+1600+WINDOW_MS)).not.toContain("m-think");
 });
 it("moves without rebuilding marks until the strip recenters, and only touches a drifting clock",()=>{
  const log=new Log();log.add(0,START);spans(log,1000);const v=view(log),root=host();const calls:string[]=[];
  let time:unknown=null,rate=1;const animation:LaneAnimation={get currentTime(){return time;},set currentTime(value:unknown){calls.push(`at ${String(value)}`);time=value;},get playbackRate(){return rate;},set playbackRate(value:number){calls.push(`rate ${String(value)}`);rate=value;},play(){calls.push("play");},pause(){calls.push("pause");}};
  let frames:Keyframe[]=[];const motion=new LaneMotion(root,(_,keyframes,options)=>{frames=keyframes;expect(options.duration).toBe(LEAD_MS);return animation;});
  motion.render(v,BASE_MS+2000,1);const strip=root.querySelector<HTMLElement>(".lanes-strip"),child=strip?.firstElementChild;expect(strip?.style.width).toBe("150.0%");expect(frames[1]?.transform).toMatch(/^translateX\(-33\.33+\d*%\)$/);expect(calls).toEqual(["at 0","rate 1","play"]);
  calls.length=0;time=100;motion.render(v,BASE_MS+2100,1);expect(calls).toEqual([]);expect(strip?.firstElementChild).toBe(child);
  time=900;motion.render(v,BASE_MS+2100,1);expect(calls).toEqual(["at 100"]);
  calls.length=0;motion.render(v,BASE_MS+2100,0);expect(calls).toEqual(["at 100","pause"]);
  calls.length=0;motion.render(v,BASE_MS+2200,4);expect(calls).toEqual(["at 200","rate 4","play"]);
  calls.length=0;time=LEAD_MS-1;motion.render(v,BASE_MS+2000+LEAD_MS-1,4);expect(calls).toEqual(["at 0"]);expect(strip?.firstElementChild).not.toBe(child);expect(root.querySelector(".lanes-strip")).toBe(strip);
  calls.length=0;time=0;motion.render(v,BASE_MS+1500,4);expect(calls).toEqual(["at 0"]);
  time=null;motion.render(v,BASE_MS+1500,4);expect(time).toBe(0);
 });
 it("positions the strip directly where animation is unavailable, and survives a host with no strip",()=>{
  const log=new Log();log.add(0,START);spans(log,1000);const root=host(),motion=new LaneMotion(root);motion.render(view(log),BASE_MS+2000,1);motion.render(view(log),BASE_MS+2000+6000,1);
  expect(root.querySelector<HTMLElement>(".lanes-strip")?.style.transform).toBe("translateX(-6.7%)");expect(marks(root)).toHaveLength(1);
  const broken={innerHTML:"",querySelector:()=>null} as unknown as HTMLElement;expect(()=>{new LaneMotion(broken).render(view(log),BASE_MS,1);}).not.toThrow();
 });
 it("hides a recovered diamond only when a mid-run first page has no baseline for it",()=>{
  const event=(ms:number,seq:number,type:string)=>({v:1,run:"r",seq,t:new Date(BASE_MS+ms).toISOString(),type,turn:1,name:"ROUTE_101",server_timestamp:1}) as unknown as Parameters<RunView["apply"]>[0];
  const feed=new TimelineFeed(null);feed.view.milestones.push({name:"CLOCK_SET",ms:BASE_MS+1000,seq:41,derived:true},{name:"RIVAL",ms:BASE_MS+2000,seq:42,derived:true});
  feed.add([event(500,40,"milestone"),event(1000,41,"state"),event(2000,42,"state")]);expect(feed.view.milestones.slice(0,2).map(mark=>mark.ms)).toEqual([0,BASE_MS+2000]);expect(feed.view.milestones[2]?.ms).toBe(BASE_MS+500);
  feed.view.milestones.push({name:"LATER",ms:BASE_MS+3000,seq:43,derived:true});feed.add([event(3000,43,"state")]);expect(feed.view.milestones.at(-1)?.ms).toBe(BASE_MS+3000);
  const opening=new TimelineFeed(null);opening.view.milestones.push({name:"CLOCK_SET",ms:BASE_MS,seq:0,derived:true});opening.add([event(0,0,"state")]);expect(opening.view.milestones[0]?.ms).toBe(BASE_MS);
  const quiet=new TimelineFeed(null);quiet.view.milestones.push({name:"KEPT",ms:BASE_MS,seq:9,derived:true});quiet.add([event(0,9,"milestone")]);expect(quiet.view.milestones[0]?.ms).toBe(BASE_MS);
 });
 it("folds each event once and draws the same window after forgetting old history",()=>{
  const log=new Log();log.add(0,START);const at=Array.from({length:60},(_,i)=>i*10_000+1000);spans(log,...at);
  log.add(597_000,{type:"retry",turn:1,attempt:1,limit:3,reason:"late"});
  const whole=view(log),now=BASE_MS+600_000,feed=new TimelineFeed(whole.start);expect(feed.view.startMs).toBe(whole.startMs);
  for(const event of log.events){feed.add([event]);feed.add([event]);}
  expect(feed.view.events.length).toBeLessThan(whole.events.length/2);expect(feed.view.thinkingSpans.length).toBeLessThan(whole.thinkingSpans.length/2);
  expect(lanesSvg(feed.view,now)).toBe(lanesSvg(whole,now));
  const held=new RunView();held.requestSamples.push({seq:1,ms:1} as RunView["requestSamples"][number]);held.latencies.push(1);held.control.pauses.push({startMs:0,endMs:1},{startMs:2,endMs:null});held.activities.push({t:new Date(0).toISOString()} as RunView["activities"][number]);held.battleChoices.push({t:new Date(0).toISOString()} as RunView["battleChoices"][number]);held.forgetBefore(10);
  expect([held.requestSamples.length,held.latencies.length,held.activities.length,held.battleChoices.length,held.control.pauses.length]).toEqual([0,0,0,0,1]);
  const blank=new TimelineFeed(null);blank.add([]);expect(blank.view.startMs).toBeNull();
 });
});
