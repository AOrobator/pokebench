import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BASE_MS, Log, START, fullRun } from "../test-support/events.js";
import { RunView } from "./model.js";
import { LANES, WINDOW_MS, lanesSvg } from "./timeline.js";

function view(log: Log): RunView {
  const v = new RunView();
  for (const event of log.events) v.apply(event);
  return v;
}

describe("lanesSvg", () => {
  it("distinguishes requested running from actual native inputs", () => {
    const log = new Log();
    log.add(0, START);
    log.add(100, {type:"button_press",turn:0,tool_call_id:"run",buttons:["UP"],hold_frames:8,release_frames:8,automatic_running:true});
    log.add(400, {type:"button_press",turn:0,tool_call_id:"walk",buttons:["LEFT"],hold_frames:8,release_frames:8,automatic_running:true,walking:true});
    const result = view(log);
    expect(result.presses[0]?.automaticRunning).toBe(true);
    expect(result.presses[1]?.walking).toBe(true);
    const svg = lanesSvg(result, BASE_MS+1000);
    expect(svg).toContain("running requested where permitted; actual keys in native input history");
    expect(svg).toContain("walking requested");
    expect(svg).not.toContain("m-press b-B");
  });
  it("draws the five lanes and a 60 s axis ending at now", () => {
    const svg = lanesSvg(view(fullRun()), BASE_MS + 9000);
    expect(LANES).toEqual(["thinking", "tool calls", "presses", "milestones", "errors"]);
    for (const lane of LANES) expect(svg).toContain(`>${lane}</span>`);
    expect(svg).toContain(">−60s</span>");
    expect(svg).toContain(">now</span>");
    expect(WINDOW_MS).toBe(60_000);
  });

  it("marks thinking spans, tool calls, presses, milestones and errors", () => {
    const svg = lanesSvg(view(fullRun()), BASE_MS + 9000);
    expect(svg.match(/class="m-think"/g)).toHaveLength(2);
    expect(svg.match(/class="m-tool"/g)).toHaveLength(1);
    expect(svg.match(/class="m-press b-A"/g)).toHaveLength(1);
    expect(svg.match(/class="m-press b-UP"/g)).toHaveLength(1);
    expect(svg.match(/class="m-milestone"/g)).toHaveLength(2);
    expect(svg.match(/class="m-error k-retry"/g)).toHaveLength(1);
    expect(svg).toContain("<title>PLAYER_NAME_SET</title>");
    expect(svg).toContain("<title>retry 1/3: invalid tool arguments</title>");
  });

  it("draws an open thinking span up to now", () => {
    const log = new Log();
    log.add(0, START);
    log.add(100, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 1 } });
    const svg = lanesSvg(view(log), BASE_MS + 30_100);
    expect(svg).toContain('class="m-think open"');
  });

  it("leaves out marks older than the window", () => {
    const svg = lanesSvg(view(fullRun()), BASE_MS + 9000 + 120_000);
    expect(svg).not.toContain("m-think");
    expect(svg).not.toContain("m-milestone");
    expect(svg).not.toContain("m-press");
    expect(svg).not.toContain("m-error");
    expect(svg).not.toContain("m-tool");
  });

  it("escapes labels", () => {
    const log = new Log();
    log.add(0, START);
    log.add(5, { type: "milestone", turn: 0, name: "<script>", server_timestamp: 1 });
    expect(lanesSvg(view(log), BASE_MS + 10)).toContain("<title>&lt;script&gt;</title>");
  });
});
it('keeps the shared human timeline compact and simultaneous held buttons aligned',()=>{
 const v=new RunView();v.presses.push({seq:1,ms:BASE_MS+1000,endMs:BASE_MS+5000,startFrame:60,endFrame:300,buttons:['A','UP'],hold:240,release:0,assumed:false});
 const svg=lanesSvg(v,BASE_MS+6000,['presses','milestones']);expect(svg).toContain('viewBox="0 0 1000 80"');
 for(const lane of ['thinking','tool calls','errors'])expect(svg).not.toContain(`>${lane}</span>`);
 const bars=[...svg.matchAll(/class="m-press b-(?:A|UP)"[^>]* x="([^"]+)"[^>]* width="([^"]+)"/g)];expect(bars).toHaveLength(2);expect(bars[0]?.[1]).toEqual(bars[1]?.[1]);expect(bars[0]?.[2]).toEqual(bars[1]?.[2]);
 expect(lanesSvg(v,BASE_MS+120000,['presses','milestones'])).not.toContain('m-press');
});
it('omits hidden agent markers as well as their labels on the shared human timeline',()=>{
 const svg=lanesSvg(view(fullRun()),BASE_MS+9000,['presses','milestones']);
 for(const mark of ['m-think','m-tool','m-error'])expect(svg).not.toContain(mark);
 expect(svg).toContain('m-press');expect(svg).toContain('m-milestone');
});
it('shows repeated native activity on the existing human milestone lane with evidence',()=>{
 const log=new Log();log.add(0,START);
 log.add(1000,{type:'activity',turn:0,kind:'capture',count:1,server_timestamp:1,evidence:[1,2]});
 log.add(2000,{type:'activity',turn:0,kind:'capture',count:2,server_timestamp:2,evidence:[3,4]});
 log.add(3000,{type:'activity',turn:0,kind:'level_up',count:1,server_timestamp:3,evidence:[5,6],pokemon:{identity:'abc',species:'<TORCHIC>',from_level:5,to_level:6}});
 const v=view(log);expect(v.activities).toHaveLength(3);
 const svg=lanesSvg(v,BASE_MS+4000,['presses','milestones']);expect(svg.match(/m-activity/g)).toHaveLength(3);
 expect(svg).toContain('capture ×2 · evidence #3, #4 · first observation (upper bound)');expect(svg).toContain('&lt;TORCHIC&gt; Lv5→6');
 expect(svg).toContain('viewBox="0 0 1000 80"');expect(lanesSvg(v,BASE_MS+100000,['presses','milestones'])).not.toContain('m-activity');
});

it("shows navigation context delivery on timeline without claiming a game press",()=>{
 const log=new Log();log.add(0,START);log.add(100,{type:"navigation_context",turn:1,text:"NAVIGATION EVIDENCE MEMORY",evidence:[1,2]});
 const svg=lanesSvg(view(log),BASE_MS+1000);expect(svg).toContain("Navigation memory delivered · 2 references");expect(svg).toContain('class="m-tool"');expect(svg).not.toContain('class="m-press b-A"');
});

it("shows instruction ledger delivery on the timeline without claiming a game press",()=>{
 const log=new Log();log.add(0,START);log.add(100,{type:"ledger_context",turn:1,text:"INSTRUCTION LEDGER",evidence:[4]});
 const svg=lanesSvg(view(log),BASE_MS+1000);expect(svg).toContain("Instruction ledger delivered · 1 references");expect(svg).not.toContain('class="m-press b-A"');
});

it("marks each dialogue auto-advance on the timeline with its presses, pages, stop and dropped inputs, inside the window only",()=>{
 const log=new Log();log.add(0,START);
 log.add(100,{type:"dialogue_auto_advance",turn:1,tool_call_id:"c1",tool:"press",requested:["A","A","A"],sent:["A"],dropped:["A","A"],auto_presses:2,pages:[{state_seq:3,map:"LAB",map_id:[1,4],position:{x:6,y:5},speaker:"SCIENTIST_1",speaker_source:"faced_sprite",text:"Hi"}],stop:"field_free",detail:"closed",duration_ms:400});
 log.add(200,{type:"dialogue_auto_advance",turn:1,tool_call_id:"c2",tool:"navigate_to",requested:[],sent:[],dropped:[],auto_presses:1,pages:[],stop:"menu",detail:"menu",duration_ms:400});
 const svg=lanesSvg(view(log),BASE_MS+1000);
 expect(svg).toContain("Dialogue auto-advanced · B ×2 · 1 pages · stopped: field free · 2 inputs not sent");
 expect(svg).toContain("Dialogue auto-advanced · B ×1 · 0 pages · stopped: menu<");
 expect(lanesSvg(view(log),BASE_MS+50)).not.toContain("Dialogue auto-advanced");
});
it('draws loop errors red on the errors lane and gives every presses-lane mark a fill',()=>{
 const log=new Log();log.add(0,START);
 log.add(1000,{type:'loop_guard',turn:1,kind:'milestone_drought',phase:'warning',message:'stalling',calls:9,evidence:[1]});
 log.add(1000,{type:'text_only_supervisor',turn:2,replies:3,note:1,limit:3,text:'no tool'});
 const svg=lanesSvg(view(log),BASE_MS+2000);
 const errors=[...svg.matchAll(/class="m-error k-loop"[^>]* y="([^"]+)" [^>]*height="([^"]+)"/g)];
 expect(errors).toHaveLength(2);
 const lane=150/LANES.length;
 for(const [,y,h] of errors)expect(Number(y)+Number(h)/2).toBeCloseTo(LANES.indexOf('errors')*lane+lane/2,1);
 const css=readFileSync(join(import.meta.dirname,'../static/style.css'),'utf8');
 const fill=(selector:string):string|undefined=>new RegExp(`${selector.replace(/[.]/g,'\\.')}\\s*\\{\\s*fill:\\s*([^;]+);`).exec(css)?.[1];
 expect(fill('.lanes .m-error')).toBe('#ff4d4d');
 expect(fill('.lanes .m-press')).toBeDefined();
 expect(css.indexOf('.lanes .m-press {')).toBeLessThan(css.indexOf('.lanes .b-UP'));
 expect(css.indexOf('.lanes .m-error {')).toBeLessThan(css.indexOf('.lanes .k-compaction'));
});
it('keeps timeline text out of the stretched SVG so it never distorts at wide widths',()=>{
 const html=lanesSvg(view(fullRun()),BASE_MS+9000);
 expect(html.startsWith('<div class="lanes-wrap">')).toBe(true);
 const svg=/<svg[\s\S]*<\/svg>/.exec(html)?.[0]??'';
 expect(svg).toContain('preserveAspectRatio="none"');
 expect(svg).not.toContain('<text');
 for(const cls of ['lab','axis','press-label'])expect(html).toMatch(new RegExp(`<span class="${cls}" style="left:[\\d.]+%;top:[\\d.]+%"`));
 expect(html).toContain('<span class="lab" style="left:0.8%;top:8.8%">thinking</span>');
 const css=readFileSync(join(import.meta.dirname,'../static/style.css'),'utf8');
 expect(css).toMatch(/\.lanes-wrap \{[^}]*position: relative/);
 expect(css).toMatch(/\.lanes-text span \{[^}]*position: absolute/);
 expect(html).toMatch(/<span class="press-label" [^>]*aria-hidden="true">/);
 expect(css.indexOf('@media (max-width: 600px) { .lanes-text')).toBeGreaterThan(css.indexOf('.lanes-text .press-label { color'));
});

it("leaves people ID cards off the timeline (closed to new marks, operator decision 2026-10-16)",()=>{
 const log=new Log();log.add(0,START);
 log.add(1000,{type:"people_id_card",turn:2,tool:"press",tool_call_id:"c",key:"name:MAY",reason:"first",text:"ID card: MAY"});
 const without=new Log();without.add(0,START);
 expect(lanesSvg(view(log),BASE_MS+2000)).toBe(lanesSvg(view(without),BASE_MS+2000));
 expect(view(log).errors).toEqual([]);
});

it("leaves low-HP trainer warnings off the timeline (closed to new marks, operator decision 2026-10-16)",()=>{
 const log=new Log();log.add(0,START);
 log.add(1000,{type:"low_hp_trainer_warning",turn:2,tool:"press",species:"TORCHIC",hp:3,max_hp:21,rival:"MAY",x:10,y:3,map_id:[0,18],money:3000,items:[],text:"SUPERVISOR: heal first"});
 const without=new Log();without.add(0,START);
 expect(lanesSvg(view(log),BASE_MS+2000)).toBe(lanesSvg(view(without),BASE_MS+2000));
 expect(view(log).errors).toEqual([]);
});

it("leaves story battle warnings off the timeline (closed to new marks, operator decision 2026-10-16)",()=>{
 const log=new Log();log.add(0,START);
 log.add(1000,{type:"story_battle_warning",turn:2,tool:"press",kind:"aqua_grunt",opponent:"TEAM AQUA grunt",x:null,y:null,map_id:[24,11],party:[{species:"TORCHIC",hp:3,max_hp:21}],money:3000,items:[],text:"SUPERVISOR: heal to full"});
 const without=new Log();without.add(0,START);
 expect(lanesSvg(view(log),BASE_MS+2000)).toBe(lanesSvg(view(without),BASE_MS+2000));
 expect(view(log).errors).toEqual([]);
});

it("leaves gym heal warnings off the timeline (closed to new marks, operator decision 2026-10-16)",()=>{
 const log=new Log();log.add(0,START);
 log.add(1000,{type:"gym_heal_warning",turn:2,tool:"press",map_id:[11,3],gym:{name:"RUSTBORO CITY GYM",map_id:[11,3],here:true,x:null,y:null},hurt:[{species:"TORCHIC",hp:25,max_hp:33}],player:"RED",money:6284,wake:null,heal:null,listed_now:false,mom_heals:true,text:"SUPERVISOR: You are in RUSTBORO CITY GYM"});
 const without=new Log();without.add(0,START);
 expect(lanesSvg(view(log),BASE_MS+2000)).toBe(lanesSvg(view(without),BASE_MS+2000));
 expect(view(log).errors).toEqual([]);
});

it("leaves heal-before-trainers warnings off the timeline (closed to new marks, operator decision 2026-10-16)",()=>{
 const log=new Log();log.add(0,START);
 log.add(1000,{type:"heal_before_trainers_warning",turn:2,tool:"press",map_id:[0,19],trainers:[{local_id:3,x:31,y:24,sprite_kind:"LASS"}],weak:[{kind:"lead_below_half",species:"TORCHIC",hp:14,max_hp:38}],heal:null,mom_heals:true,money:5168,text:"SUPERVISOR: heal first"});
 const without=new Log();without.add(0,START);
 expect(lanesSvg(view(log),BASE_MS+2000)).toBe(lanesSvg(view(without),BASE_MS+2000));
 expect(view(log).errors).toEqual([]);
});
