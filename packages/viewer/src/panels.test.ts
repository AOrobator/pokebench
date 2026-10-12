import { describe, expect, it } from "vitest";
import { BASE_MS, Log, RUN, START, assistant, fullRun, must, state } from "../test-support/events.js";
import { RunView, foldUntil } from "./model.js";
import {
  NO_DATA,
  actionRow,
  brand,
  budgets,
  counters,
  inspector,
  party,
  splits,
  thinkingDialog,
  trainerCard,
  type Baseline,
} from "./panels.js";

function view(log: Log): RunView {
  const v = new RunView();
  for (const event of log.events) v.apply(event);
  return v;
}

function bare(): Log {
  const log = new Log();
  log.add(0, START);
  return log;
}

const END = BASE_MS + 9000;

describe("trainerCard", () => {
  it("shows wall time, play time, map, money, turn and badges from the state event", () => {
    const html = trainerCard(view(fullRun()), END + 50_000);
    expect(html).toContain("<dt>TIME</dt><dd>0:00:09</dd>");
    expect(html).toContain("<dt>PLAY</dt><dd>0:12:34</dd>");
    expect(html).toContain("<dt>MAP</dt><dd>LITTLEROOT TOWN</dd>");
    expect(html).toContain("<dt>MONEY</dt><dd>₽3,000</dd>");
    expect(html).toContain("<dt>TURN</dt><dd>2</dd>");
    expect(html.match(/<i class="got"/g)).toHaveLength(1);
    expect(html.match(/<i /g)).toHaveLength(8);
  });

  it("counts wall time to now while the run is live", () => {
    expect(trainerCard(view(bare()), BASE_MS + 65_000)).toContain("<dt>TIME</dt><dd>0:01:05</dd>");
  });

  it("says no data where the log has no state event", () => {
    const html = trainerCard(view(bare()), BASE_MS);
    expect(html).toContain(`<dt>PLAY</dt><dd>${NO_DATA}</dd>`);
    expect(html).toContain(`<dt>MAP</dt><dd>${NO_DATA}</dd>`);
    expect(html).toContain(`<dt>MONEY</dt><dd>${NO_DATA}</dd>`);
    expect(html).toContain(`<div class="badges">${NO_DATA}</div>`);
  });

  it("says no data before the run starts", () => {
    expect(trainerCard(new RunView(), BASE_MS)).toBe(`<p>${NO_DATA}</p>`);
  });
});

describe("party", () => {
  it("draws HP bars coloured by remaining HP", () => {
    const log = bare();
    log.add(1, state({
      party: [
        { species: "TORCHIC", level: 5, hp: 18, max_hp: 20 },
        { species: "POOCHYENA", level: 3, hp: 4, max_hp: 10 },
        { species: "WURMPLE", level: 2, hp: 1, max_hp: 10 },
        { species: "ZIGZAGOON", level: 2, hp: 0, max_hp: 0 },
      ],
    }));
    const html = party(view(log));
    expect(html).toContain("<span>TORCHIC</span><span>Lv5 · 18/20</span>");
    expect(html).toContain('<i class="" style="width:90%">');
    expect(html).toContain('<i class="mid" style="width:40%">');
    expect(html).toContain('<i class="low" style="width:10%">');
    expect(html).toContain('<i class="low" style="width:0%">');
  });

  it("distinguishes an empty party from no data", () => {
    const log = bare();
    log.add(1, state({ party: [] }));
    expect(party(view(log))).toBe('<p class="nodata">no Pokémon yet</p>');
    expect(party(view(bare()))).toBe(`<p>${NO_DATA}</p>`);
  });

  it("escapes species names", () => {
    const log = bare();
    log.add(1, state({ party: [{ species: "<b>", level: 1, hp: 1, max_hp: 1 }] }));
    expect(party(view(log))).toContain("&lt;b&gt;");
  });
});

describe("budgets", () => {
  it("draws bars only for budgets that have a cap", () => {
    const html = budgets(view(fullRun()), END);
    expect(html).toContain('<span class="l">CONTEXT</span>');
    expect(html).toContain("5,000 / 10,000");
    expect(html).toContain('style="width:50%"');
    expect(html).toContain("50.0 MB / 500 MB");
    expect(html).toContain("1 / 3");
    expect(html).toContain('<span class="l">TURNS</span>');
    expect(html).toContain("2 / 10");
    expect(html).toContain('<span class="l">WALL</span>');
    expect(html).toContain("0:00:09 / 0:01:00");
    expect(html).not.toContain('<span class="l">TOKENS</span>');
  });

  it("colours a budget that is nearly spent", () => {
    const log = bare();
    log.add(1, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 9_000 } });
    log.add(2, { type: "turn_start", turn: 2, context: { messages: 1, images: 0, est_tokens: 9_000 } });
    const html = budgets(view(log), BASE_MS + 40_000);
    expect(html).toContain('<i class="low" style="width:90%">');
    expect(html).toContain('<i class="mid" style="width:67%">');
  });

  it("shows a token budget when the run declares one", () => {
    const log = new Log();
    log.add(0, { ...START, budgets: { max_tokens: 1000 } });
    log.add(1, assistant({ usage: { input: 300, output: 200, cache_read: 0 } }));
    const html = budgets(view(log), BASE_MS + 1);
    expect(html).toContain('<span class="l">TOKENS</span>');
    expect(html).toContain("500 / 1,000");
    expect(html).not.toContain('<span class="l">TURNS</span>');
  });

  it("says no data for context and disk before their events, and no retries yet", () => {
    const html = budgets(view(bare()), BASE_MS);
    expect(html).toContain(`<span class="l">CONTEXT</span><span class="v">${NO_DATA}</span>`);
    expect(html).toContain(`<span class="l">DISK</span><span class="v">${NO_DATA}</span>`);
    expect(html).toContain('<span class="l">RETRIES</span><span class="v"><span class="nodata">no retries yet</span></span>');
    expect(budgets(new RunView(), BASE_MS)).toBe(`<p>${NO_DATA}</p>`);
  });
});

describe("counters", () => {
  it("lists the run's counters as plain numbers", () => {
    const html = counters(view(fullRun()));
    expect(html).toContain("<dt>MODEL</dt><dd>think-swarm</dd>");
    expect(html).toContain("<dt>TOKENS</dt><dd>1,600</dd>");
    expect(html).toContain("<dt>TOK/S</dt><dd>75.0</dd>");
    expect(html).toContain("<dt>LATENCY</dt><dd>4.0s · avg 3.0s</dd>");
    expect(html).toContain("<dt>LOCATION</dt><dd>LITTLEROOT TOWN</dd>");
    expect(html).toContain("<dt>INVALID CALLS</dt><dd>1</dd>");
    expect(html).toContain("<dt>TOOL ERRORS</dt><dd>0</dd>");
    expect(html).toContain("<dt>COMPACTIONS</dt><dd>0</dd>");
    expect(html).toContain("<dt>MODEL ERRORS</dt><dd>0</dd>");
    expect(html).toContain("<dt>STUCK</dt><dd>0 · max 0</dd>");
  });

  it("warns on stuck and errors, and says no data where it has none", () => {
    const log = bare();
    for (let i = 1; i <= 4; i += 1) log.add(i, state());
    log.add(5, assistant({ stop_reason: "error", error: "HTTP 500", tool_calls: [], latency_ms: 0, usage: { input: 0, output: 0, cache_read: 0 } }));
    const html = counters(view(log));
    expect(html).toContain('<dt>STUCK</dt><dd class="warn">3 · max 3</dd>');
    expect(html).toContain('<dt>MODEL ERRORS</dt><dd class="warn">1</dd>');
    expect(html).toContain(`<dt>TOK/S</dt><dd>${NO_DATA}</dd>`);
    const empty = counters(view(bare()));
    expect(empty).toContain(`<dt>LATENCY</dt><dd>${NO_DATA}</dd>`);
    expect(empty).toContain(`<dt>LOCATION</dt><dd>${NO_DATA}</dd>`);
    expect(empty).toContain(`<dt>STUCK</dt><dd>${NO_DATA}</dd>`);
    expect(counters(new RunView())).toBe(`<p>${NO_DATA}</p>`);
  });
});

describe("splits", () => {
  const baseline: Baseline = {
    run: "best-run",
    milestones: [
      { name: "GAME_RUNNING", offsetMs: 50 },
      { name: "PLAYER_NAME_SET", offsetMs: 5000 },
      { name: "LITTLEROOT_TOWN", offsetMs: 6000 },
      { name: "ROUTE_101", offsetMs: 9000 },
    ],
  };

  it("lists this run's milestones with times when there is no baseline", () => {
    const { summary, table } = splits(view(fullRun()), null, END);
    expect(summary).toBe("2 reached · no baseline");
    expect(table).toContain('<tr class="done"><td class="n">game running</td><td class="d"></td><td class="t">0:00:00</td></tr>');
    expect(table).toContain('<td class="n">player name set</td><td class="d"></td><td class="t">0:00:03</td>');
  });

  it("compares against a baseline: ahead, behind, next and to-do", () => {
    const { summary, table } = splits(foldUntil(fullRun().events, BASE_MS + 7000), baseline, BASE_MS + 7000);
    expect(table).toContain('<td class="d"><span class="d-ahead">−0:01</span></td>');
    expect(table).toContain('<tr class="next"><td class="n">littleroot town</td><td class="d"><span class="d-behind">+0:01</span></td><td class="t">0:00:07</td></tr>');
    expect(table).toContain('<tr class="todo"><td class="n">route 101</td><td class="d"></td><td class="t">0:00:09</td></tr>');
    expect(summary).toBe('next littleroot town <span class="d-behind">+0:01</span> vs best-run');
  });

  it("has no delta on the next split before the baseline reached it, and reports a finished baseline", () => {
    expect(splits(foldUntil(fullRun().events, BASE_MS + 5500), baseline, BASE_MS + 5500).summary).toBe("next littleroot town vs best-run");
    const done: Baseline = { run: "b", milestones: [{ name: "GAME_RUNNING", offsetMs: 0 }] };
    expect(splits(view(fullRun()), done, END).summary).toBe("all 1 baseline splits reached");
  });

  it("marks a reached milestone slower than the baseline as behind, and keeps extra ones", () => {
    const slow: Baseline = { run: "b", milestones: [{ name: "PLAYER_NAME_SET", offsetMs: 1000 }] };
    const { table } = splits(view(fullRun()), slow, END);
    expect(table).toContain('<span class="d-behind">+0:02</span>');
    expect(table).toContain("game running");
  });

  it("says no data before the run starts", () => {
    expect(splits(new RunView(), null, BASE_MS)).toEqual({ summary: "no data", table: `<p>${NO_DATA}</p>` });
  });
});

describe("thinkingDialog", () => {
  it("times the thinking in progress", () => {
    const log = bare();
    log.add(1000, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 1 } });
    const dialog = thinkingDialog(view(log), BASE_MS + 4200);
    expect(dialog.head).toBe("AGENT is thinking… 3.2s");
    expect(dialog.body).toBe('<span class="cursor"></span>');
  });

  it("shows the last full thinking block once the reply lands", () => {
    const dialog = thinkingDialog(view(fullRun()), END);
    expect(dialog.head).toBe("AGENT thought for 4.0s · turn 2");
    expect(dialog.body).toBe("Again.");
  });

  it("shows the reply when there was no thinking", () => {
    const log = bare();
    log.add(1, assistant({ thinking: "", text: "DONE <x>" }));
    expect(thinkingDialog(view(log), BASE_MS).body).toBe('<span class="nodata">no thinking recorded</span> DONE &lt;x&gt;');
  });

  it("waits before the first turn and before the run", () => {
    expect(thinkingDialog(view(bare()), BASE_MS)).toEqual({ head: "AGENT is waiting…", body: NO_DATA });
    expect(thinkingDialog(new RunView(), BASE_MS)).toEqual({ head: "NO RUN", body: NO_DATA });
  });
});

describe("actionRow", () => {
  const events = fullRun().events;
  const row = (seq: number): string => actionRow(must(events[seq])) ?? "";

  it("formats tool calls, results, presses, milestones, retries and the run end", () => {
    expect(row(5)).toBe(
      '<div class="ev ev-tool_call" data-seq="5"><span class="seq">#5</span><span class="tag">tool_call</span><span class="body">press({&quot;buttons&quot;:[&quot;A&quot;]})</span></div>',
    );
    expect(row(6)).toContain('<span class="chipb">A</span><span class="chipb">↑UP</span> hold 10f · release 8f');
    expect(row(7)).toContain("★ PLAYER_NAME_SET");
    expect(row(9)).toContain("ok 199ms → pressed A, UP · frames/000009_0.png");
    expect(row(12)).toContain("✗ retry 1/3: invalid tool arguments");
    expect(row(13)).toContain("run ended: budget · furthest PLAYER_NAME_SET · 2 turns");
    expect(row(2)).toContain("frames at 10% of the 500 MB cap");
  });

  it("leaves turn, assistant, state and run_start events to their panels", () => {
    for (const seq of [0, 3, 4, 8]) expect(actionRow(must(events[seq]))).toBeNull();
  });

  it("formats an untimed press, a failed tool, a compaction, an eviction and an unfinished run", () => {
    const log = bare();
    log.add(1, { type: "button_press", turn: 0, tool_call_id: "c", buttons: ["START"] });
    log.add(2, { type: "tool_result", turn: 0, id: "c", name: "state", is_error: true, duration_ms: 3, text: "boom", frames: [] });
    log.add(3, { type: "compaction", turn: 0, from_tokens: 9000, to_tokens: 1000 });
    log.add(4, { type: "frames_evicted", turn: 0, from_run: "old", files: 3, bytes: 1500 });
    log.add(5, { type: "run_end", turn: 0, reason: "crash", furthest_milestone: null, turns: 0, wall_ms: 5, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
    const rows = log.events.slice(1).map((event) => actionRow(event) ?? "");
    expect(rows[0]).toContain("START</span> timing not logged (assumed hold 10f · release 8f)");
    expect(rows[1]).toContain("ERROR 3ms → boom");
    expect(rows[1]).toContain("ev-error");
    expect(rows[2]).toContain("context compacted 9,000 → 1,000 tokens");
    expect(rows[3]).toContain("evicted 3 frames (1.5 KB) from old");
    expect(rows[4]).toContain("run ended: crash · furthest none · 0 turns");
  });
});

describe("inspector and brand", () => {
  it("shows the raw event, escaped", () => {
    const event = must(fullRun().events[7]);
    expect(inspector(event)).toBe(`<pre>${JSON.stringify(event, null, 2).replace(/"/g, "&quot;")}</pre>`);
    expect(inspector(undefined)).toBe('<p class="nodata">click a log row to see its raw event</p>');
  });

  it("names the run on the PokéNav", () => {
    expect(brand(view(fullRun()))).toBe(`POKéNAV · ${RUN}`);
    expect(brand(new RunView())).toBe("POKéNAV · NO RUN");
  });
});
