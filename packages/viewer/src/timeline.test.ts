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
