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
  it("draws the five lanes and a 60 s axis ending at now", () => {
    const svg = lanesSvg(view(fullRun()), BASE_MS + 9000);
    expect(LANES).toEqual(["thinking", "tool calls", "presses", "milestones", "errors"]);
    for (const lane of LANES) expect(svg).toContain(`>${lane}</text>`);
    expect(svg).toContain(">−60s</text>");
    expect(svg).toContain(">now</text>");
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
 for(const lane of ['thinking','tool calls','errors'])expect(svg).not.toContain(`>${lane}</text>`);
 const bars=[...svg.matchAll(/class="m-press b-(?:A|UP)"[^>]* x="([^"]+)"[^>]* width="([^"]+)"/g)];expect(bars).toHaveLength(2);expect(bars[0]?.[1]).toEqual(bars[1]?.[1]);expect(bars[0]?.[2]).toEqual(bars[1]?.[2]);
 expect(lanesSvg(v,BASE_MS+120000,['presses','milestones'])).not.toContain('m-press');
});
it('omits hidden agent markers as well as their labels on the shared human timeline',()=>{
 const svg=lanesSvg(view(fullRun()),BASE_MS+9000,['presses','milestones']);
 for(const mark of ['m-think','m-tool','m-error'])expect(svg).not.toContain(mark);
 expect(svg).toContain('m-press');expect(svg).toContain('m-milestone');
});
