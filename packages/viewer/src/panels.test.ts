import { configuration } from "./run-config.js";
import { runDetails } from "./workbench-view.js";
import { parseWorkbench } from "./workbench-data.js";
import { run as card } from "../test-support/workbench.js";
import { servedEffort, thinkingLabel } from "./served-effort.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
import { describe, expect, it } from "vitest";
import { Window } from "happy-dom";
import { BASE_MS, Log, RUN, START, assistant, fullRun, must, state } from "../test-support/events.js";
import { RunView, foldUntil } from "./model.js";
import { stepOf } from "../test-support/trace.js";
import { FEATURES } from "@pokebench/agent/features";
import {
  FEATURE_EXPLAINERS,
  NO_DATA,
  eventText,
  brand,
  budgets,
  counters,
  fieldContext,
  harnessConfig,
  inspector,
  partyNotice,
  runIdentity,
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

describe("trainerCard before the game starts", () => {
  it("shows the screen instead of a map and no save values", () => {
    const log = bare();
    log.add(10, state({ screen: "naming", started: false, name: null, location: null, map_id: null, position: null, facing: null, party: [], money: null, badges: [], play_time_s: null }));
    const html = trainerCard(view(log), BASE_MS + 1000);
    expect(html).toContain("<dt>MAP</dt><dd>naming (not started)</dd>");
    expect(html).toContain("<dt>MONEY</dt><dd>not started</dd>");
    expect(html).toContain("<dt>PLAY</dt><dd>not started</dd>");
    expect(counters(view(log))).toContain("<dt>LOCATION</dt><dd>naming (not started)</dd>");
  });
});

describe("party sample notice", () => {
  it("labels unread samples and clears the notice after a readable sample or reset", () => {
    const log = bare();
    expect(partyNotice(view(log))).toBe("");
    log.add(1, state({ party: [], play_time_s: null }));
    expect(partyNotice(view(log))).toContain("Party unavailable in this sample");
    const prior = log.add(2, state());
    const unread = log.add(3, state({ party: [], play_time_s: null }));
    expect(view(log).state).toEqual(unread);
    expect(partyNotice(view(log))).toContain(`Last recorded party · state #${String(prior.seq)}`);
    log.add(4, state());
    expect(partyNotice(view(log))).toBe("");
    log.add(5, state({ started: false, screen: "title", party: [], play_time_s: null }));
    expect(partyNotice(view(log))).toBe("");
  });
});

describe("budgets", () => {
  it("draws bars only for budgets that have a cap", () => {
    const html = budgets(view(fullRun()), END);
    expect(html).toContain('<span class="l">CONTEXT</span>');
    expect(html).toContain("700 / 10,000");
    expect(html).toContain('style="width:7%"');
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

  it("labels the context as an estimate until the server has measured a prompt", () => {
    const log = bare();
    log.add(1, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 2_500 } });
    expect(budgets(view(log), BASE_MS + 1)).toContain("~2,500 / 10,000");
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

  it("lists current and missing milestones without inventing comparisons", () => {
    const { summary, table } = splits(view(fullRun()), null, END);
    expect(summary).toBe("2 reached · next intro cutscene complete · no baseline");
    expect(table).toContain('<td class="n">player name set (gameplay start)</td><td class="t">0:00:03</td>');
    expect(table).toContain('<td class="n">clock set</td><td class="t">—</td>');
    expect(table).not.toContain("d-ahead");
  });

  it("shows both real reference times and exact signed deltas after achievement only", () => {
    const best: Baseline = { run: "record", milestones: [{name:"PLAYER_NAME_SET", offsetMs:2000}] };
    const { summary, table } = splits(foldUntil(fullRun().events, BASE_MS + 7000), baseline, BASE_MS + 7000, best);
    expect(table).toContain('0:00:05<br><span class="d-ahead">−0:01</span>');
    expect(table).toContain('0:00:02<br><span class="d-behind">+0:01</span>');
    expect(table).toContain('<tr class="next"><td class="n">intro cutscene complete</td><td class="t">0:00:07…</td>');
    expect(table).toContain('<tr class="todo"><td class="n">route 101</td><td class="t">—</td><td class="d" title="Recorded milestone">0:00:09</td>');
    expect(summary).toBe("2 reached · next intro cutscene complete · vs baseline + frontier");
    expect(table).toContain("Frontier run: record");
    expect(table).toContain("<th>Frontier<br>time / Δ</th>");
    expect(table).not.toContain("Best");
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

  it("streams the thinking and reply text as deltas arrive", () => {
    const log = bare();
    log.add(1000, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 1 } });
    log.add(1500, { type: "assistant_delta", turn: 1, thinking: "Look <at>", text: "" });
    log.add(1800, { type: "assistant_delta", turn: 1, thinking: " the screen.", text: "Go" });
    const dialog = thinkingDialog(view(log), BASE_MS + 2000);
    expect(dialog.head).toBe("AGENT is thinking… 1.0s");
    expect(dialog.body).toBe('Look &lt;at&gt; the screen.<span class="reply">Go</span><span class="cursor"></span>');
  });

  it("starts each turn's stream empty", () => {
    const log = bare();
    log.add(1000, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 1 } });
    log.add(1500, { type: "assistant_delta", turn: 1, thinking: "old", text: "" });
    log.add(1600, { type: "turn_start", turn: 2, context: { messages: 1, images: 0, est_tokens: 1 } });
    expect(thinkingDialog(view(log), BASE_MS + 2000).body).toBe('<span class="cursor"></span>');
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

  it("says the run ended when it ended before any reply", () => {
    const log = bare();
    log.add(100, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 1 } });
    log.add(900, { type: "run_end", turn: 1, reason: "crash", furthest_milestone: null, turns: 1, wall_ms: 900, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
    expect(thinkingDialog(view(log), BASE_MS + 50_000)).toEqual({ head: "RUN ENDED · crash", body: NO_DATA });
  });

  it("waits before the first turn and before the run", () => {
    expect(thinkingDialog(view(bare()), BASE_MS)).toEqual({ head: "AGENT is waiting…", body: NO_DATA });
    expect(thinkingDialog(new RunView(), BASE_MS)).toEqual({ head: "NO RUN", body: NO_DATA });
  });
});

describe("eventText", () => {
  const events = fullRun().events;
  const row = (seq: number): string => eventText(must(events[seq])) ?? "";

  it("labels battle-text-auto-advance-v1 pages with their battle turn and counts the B presses in battle", () => {
    const log = new Log(); log.add(0, START);
    const base = { type: "dialogue_auto_advance" as const, turn: 722, tool_call_id: "c", tool: "press" as const, requested: ["A" as const, "A" as const], sent: ["A" as const], dropped: ["A" as const], auto_presses: 2, stop: "battle_input" as const, detail: "the battle action menu is ready (FIGHT, BAG, POKEMON, RUN); highlighted FIGHT", duration_ms: 900 };
    log.add(100, { ...base, battle_auto_presses: 1, pages: [{ state_seq: 3, map: "ROUTE101", map_id: [0, 16] as [number, number], position: null, speaker: null, speaker_source: null, text: "Wild WURMPLE appeared!", battle_turn: 1, battle_message_id: 1 }, { state_seq: 4, map: "ROUTE101", map_id: [0, 16] as [number, number], position: null, speaker: "PROF. BIRCH", speaker_source: "name_prefix" as const, text: "PROF. BIRCH: Whew…" }] });
    log.add(200, { ...base, pages: [] });
    const [battle, field] = log.events.slice(1).map((event) => eventText(event) ?? "");
    expect(battle).toContain("Dialogue auto-advance (press) · B ×2 (1 in battle) · stopped: battle input · the battle action menu is ready");
    expect(battle).toContain("· 1. battle turn 1: “Wild WURMPLE appeared!” · 2. PROF. BIRCH: “PROF. BIRCH: Whew…”");
    expect(field).toContain("Dialogue auto-advance (press) · B ×2 · stopped:");
  });

  it("formats tool calls, results, presses, milestones, retries and the run end", () => {
    expect(row(5)).toBe("press({&quot;buttons&quot;:[&quot;A&quot;]})");
    expect(row(6)).toContain('<span class="chipb">A</span><span class="chipb">↑UP</span> hold 10f · release 8f');
    expect(row(7)).toContain("★ PLAYER_NAME_SET");
    expect(row(9)).toContain("ok 199ms → pressed A, UP · frames/000009_0.png");
    expect(row(12)).toContain("✗ retry 1/3: invalid tool arguments");
    expect(row(13)).toContain("run ended: budget · furthest PLAYER_NAME_SET · 2 turns");
    expect(row(2)).toContain("frames at 10% of the 500 MB cap");
  });

  it("keeps completed thinking in activity history and full text in the inspector", () => {
    const log = bare();
    const event = log.add(1, assistant({ thinking: "Reason <carefully> " + "detail ".repeat(100), text: "Reply" }));
    expect(eventText(event)).toContain("thinking");
    expect(eventText(event)).toContain("&lt;carefully&gt;");
    expect(inspector(event)).toContain("detail ".repeat(100));
    const reply = log.add(2, assistant({ thinking: "", text: "Response only" }));
    expect(eventText(reply)).toContain("Response only");
  });

  it("leaves turn, state and run_start events to their panels", () => {
    for (const seq of [0, 3, 8]) expect(eventText(must(events[seq]))).toBeNull();
  });

  it("formats an untimed press, a failed tool, a compaction, an eviction and an unfinished run", () => {
    const log = bare();
    log.add(1, { type: "button_press", turn: 0, tool_call_id: "c", buttons: ["START"] });
    log.add(2, { type: "tool_result", turn: 0, id: "c", name: "state", is_error: true, duration_ms: 3, text: "boom", frames: [] });
    log.add(3, { type: "compaction", turn: 0, from_tokens: 9000, to_tokens: 1000 });
    log.add(4, { type: "frames_evicted", turn: 0, from_run: "old", files: 3, bytes: 1500 });
    log.add(4.5, { type: "telemetry_error", turn: 0, source: "milestones", message: "down" });
    log.add(5, { type: "run_end", turn: 0, reason: "crash", furthest_milestone: null, turns: 0, wall_ms: 5, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
    const rows = log.events.slice(1).map((event) => eventText(event) ?? "");
    expect(rows[0]).toContain("START</span> timing not logged (assumed hold 10f · release 8f)");
    expect(rows[1]).toContain("ERROR 3ms → boom");
    expect(stepOf(must(log.events[2])).status).toBe("error");
    expect(rows[2]).toContain("context compacted 9,000 → 1,000 tokens");
    expect(rows[3]).toContain("evicted 3 frames (1.5 KB) from old");
    expect(rows[4]).toContain("✗ milestones read failed: down");
    expect(stepOf(must(log.events[5])).status).toBe("error");
    expect(rows[5]).toContain("run ended: crash · furthest none · 0 turns");
  });
});

describe("inspector and brand", () => {
  it("shows the raw event, escaped", () => {
    const event = must(fullRun().events[7]);
    const document = new Window().document; document.body.innerHTML = inspector(event);
    expect(document.querySelector(".raw-event pre")?.textContent).toBe(JSON.stringify(event, null, 2));
    expect(document.querySelector(".json-key")).not.toBeNull();
    expect(inspector(undefined)).toBe('<p class="nodata">select a trace row to see its complete recorded events</p>');
  });

  it("decodes Markdown and newlines inside structured tool arguments", () => {
    const log = bare(); const event = log.add(1, {type: "tool_call", turn: 1, id: "readable", name: "set_objective", args: {next_decision: "**Observe** first\nThen act"}});
    const document = new Window().document; document.body.innerHTML = inspector(event);
    expect(document.querySelector(".decoded-field strong")?.textContent).toBe("Observe");
    expect(document.querySelector(".decoded-field br")).not.toBeNull();
    expect(document.querySelector(".raw-event pre")?.textContent).toBe(JSON.stringify(event,null,2));
  });

  it("names the run on the PokéNav", () => {
    expect(brand(view(fullRun()))).toBe(`POKéNAV · ${RUN}`);
    expect(brand(new RunView())).toBe("POKéNAV · NO RUN");
  });
});

it("shows the control lock and names manual probes honestly", () => {
  const log = new Log(); log.add(0, { ...START, harness_features: ["probe"] });
  log.add(1, state({ field_controls_locked: true }));
  const v = new RunView(); for (const e of log.events) v.apply(e);
  expect(fieldContext(v)).toContain('<dt>CONTROLS</dt><dd>locked</dd>');
  expect(trainerCard(v, BASE_MS)).not.toContain("CONTROLS");
  expect(thinkingDialog(v, BASE_MS).head).toContain("MANUAL PROBE");
});

it("shows the current naming cursor and escapes entered text", () => {
  const log = bare();
  log.add(0, state({ naming: { text: "<AB>", page: "uppercase", column: 1, row: 0, key: "B", ready: true } }));
  const html = fieldContext(view(log));
  expect(html).toContain("&lt;AB&gt;");
  expect(html).toContain("uppercase: B (1,0)");
});

it("renders field facts without guessing names and escapes dialogue", () => {
  const log=bare();
  log.add(0,state({world_context:{objects:[{local_id:1,map_id:[0,9],graphics_id:6,sprite_kind:"TWIN",x:7,y:2}],triggers:[{x:10,y:1,elevation:3,variable:0x4050,required_value:0,current_value:0,condition_met:true,script_pointer:0x08010000}],dialogue:"<warning>"}}));
  expect(fieldContext(view(log))).toContain("TWIN");
  expect(fieldContext(view(log))).toContain("condition matches");
  expect(fieldContext(view(log))).toContain("&lt;warning&gt;");
  expect(fieldContext(view(bare()))).toContain("no data");
});

it("shows game-owned story values and milestone evidence without inventing old observations", () => {
  const log = new Log();
  log.add(0, START);
  log.add(100, state({story:{name_confirmed:true,intro_stage:6,rival_stage:0,birch_lab_stage:null,petalburg_gym_stage:0,woods_stage:0,clock_set:true,rival_battle_won:false,pokedex_received:false,running_shoes_received:false,starter_tutorial_complete:false,rustboro_gym_complete:false,stone_badge:false,rock_tomb_received:false}}));
  const stateEvent = log.events.at(-1);
  if (stateEvent === undefined) throw new Error("fixture state");
  const mark = log.add(200, {type:"milestone",turn:1,name:"CLOCK_SET",server_timestamp:1,kind:"story",origin:"present_at_start",evidence:[stateEvent.seq]});
  const v = view(log);
  expect(fieldContext(v)).toContain("clock set: yes");
  expect(fieldContext(v)).toContain("rival battle won: no");
  expect(fieldContext(v)).toContain("birch lab stage: unknown");
  expect(eventText(mark)).toContain("already present when run started");
  expect(eventText(mark)).toContain("evidence #1");
  const comparison = splits(v,{run:"reference",milestones:[{name:"CLOCK_SET",offsetMs:1000}]},BASE_MS+300);
  expect(comparison.table).toContain("already<br>present");
  expect(comparison.table).not.toContain("d-ahead");
  expect(comparison.table).not.toContain("d-behind");
});


it("shows creation before name confirmation with recorded baseline and frontier deltas", () => {
  const log = new Log();
  log.add(0, { ...START, harness_features: ["new-game-created-v1"] });
  log.add(1, { type: "milestone", turn: 0, name: "GAME_RUNNING", server_timestamp: 0 });
  const pending = splits(view(log), null, BASE_MS + 12000).table;
  expect(pending).toContain('<td class="n">new game created</td><td class="t">0:00:12…</td>');
  log.add(5000, { type: "milestone", turn: 1, name: "NEW_GAME_CREATED", server_timestamp: 5, kind: "story", origin: "observed", evidence: [1] });
  const baseline: Baseline = { run: "baseline", milestones: [{ name: "NEW_GAME_CREATED", offsetMs: 8000 }] };
  const best: Baseline = { run: "best", milestones: [{ name: "NEW_GAME_CREATED", offsetMs: 3000 }] };
  const html = splits(view(log), baseline, BASE_MS + 12000, best).table;
  expect(html).toContain('<td class="n">new game created</td><td class="t">0:00:05</td>');
  expect(html).toContain('0:00:08<br><span class="d-ahead">−0:03</span>');
  expect(html).toContain('0:00:03<br><span class="d-behind">+0:02</span>');
  expect(html.indexOf('new game created')).toBeLessThan(html.indexOf('player name confirmed'));
  expect(splits(view(bare()), null, BASE_MS + 12000).table).toContain('<td class="n">new game created</td><td class="t">not<br>recorded</td>');
});

it("shows escaped loop evidence in the action log",()=>{
  const log=bare();const event=log.add(100,{type:"loop_guard",turn:1,kind:"cycle",phase:"warning",message:"Reassess <now>",calls:9,evidence:[4,7]});
  const html=eventText(event);expect(html).toContain("Loop cycle warning");expect(html).toContain("Reassess &lt;now&gt;");expect(html).toContain("#4, #7");expect(stepOf(event)).toMatchObject({status:"error",tone:"orange",category:"guard"});
});

it("shows trigger-script loop evidence in the raw action log",()=>{
 const log=bare();const event=log.add(100,{type:"loop_guard",turn:2,kind:"trigger_script",phase:"warning",mode:"enforced",message:"Gym <again>",calls:9,evidence:[20,40]});
 const html=eventText(event);expect(html).toContain("Loop trigger script warning");expect(html).toContain("Gym &lt;again&gt;");expect(html).toContain("#20, #40");
});

it("renders verified confirmation selection and unsupported diagnostic", () => {
  const log = bare();
  log.add(0, state({ active_ui: {phase:"name_confirmation",selected:"NO",ready:true,controls:"B declines",diagnostic:null} }));
  expect(fieldContext(view(log))).toContain("name_confirmation");
  expect(fieldContext(view(log))).toContain("NO");
  log.add(1,state({active_ui:{phase:"unsupported",selected:null,ready:null,controls:"Observe",diagnostic:"<callback>"}}));
  expect(fieldContext(view(log))).toContain("STATE COVERAGE ERROR");
  expect(fieldContext(view(log))).toContain("&lt;callback&gt;");
  expect(fieldContext(view(log))).toContain("unavailable");
  log.add(2,state({active_ui:{phase:"clock_adjustment",selected:null,ready:false,controls:"LEFT/RIGHT",diagnostic:null,value:"10:00 AM"}}));
  expect(fieldContext(view(log))).toContain("10:00 AM");
  expect(fieldContext(view(log))).toContain("not ready");
});

it("renders passive would-stop as a diagnostic rather than execution error",()=>{
 const log=bare();const event=log.add(100,{type:"loop_guard",turn:1,kind:"planning",mode:"diagnostic",phase:"would_stop",message:"No action <yet>",calls:12,evidence:[1]});const html=eventText(event);expect(html).toContain("diagnostic: would stop");expect(stepOf(event).status).toBeNull();expect(html).toContain("No action &lt;yet&gt;");
});


it("shows recorded named topology even when story or field message data is unavailable",()=>{
 const log=new Log(); const v=new RunView();v.apply(log.add(0,state({story:null,world_context:null,topology:{width:20,height:20,connections:[{direction:"NORTH",offset:-3,destination:[0,16],destination_name:"ROUTE 101 <verified>"}]}})));
 expect(fieldContext(v)).toContain("Map bounds: X=0..19, Y=0..19");
 expect(fieldContext(v)).toContain("NORTH → ROUTE 101 &lt;verified&gt;; offset -3");
});

it("shows the three post-clock splits and labels unsupported historical runs",()=>{
 const log=new Log();log.add(0,{...START,harness_features:["post-clock-navigation-milestones-v1"]});
 const names=["PLAYER_HOUSE_EXITED_AFTER_CLOCK","RIVAL_HOUSE_ENTERED","RIVAL_BEDROOM_REACHED"];
 for(const [index,name] of names.entries()){const mark=log.add(1000*(index+1),{type:"milestone",turn:index,name,server_timestamp:index+1,kind:"navigation",origin:"observed",evidence:[1]});expect(eventText(mark)).toContain(`${name} · navigation · evidence #1`);}
 const html=splits(view(log),null,BASE_MS+5000).table;
 for(const [index,name] of names.entries())expect(html).toContain(`<td class="n">${name.toLowerCase().replaceAll("_"," ")}</td><td class="t">0:00:0${String(index+1)}</td>`);
 const old=splits(view(bare()),null,BASE_MS+5000).table;
 expect(old).toContain('<td class="n">rival house entered</td><td class="t">not<br>recorded</td>');
});

it('shows individual Gym trainers as unsupported for old logs and as recorded splits for new runs',()=>{
 const old=splits(view(bare()),null,BASE_MS+1000).table;
 expect(old).toContain('<td class="n">rustboro gym trainer josh defeated</td><td class="t">not<br>recorded</td>');
 const log=new Log();log.add(0,{...START,harness_features:['rustboro-gym-trainer-milestones-v1']});
 log.add(1000,{type:'milestone',turn:0,name:'RUSTBORO_GYM_TRAINER_JOSH_DEFEATED',server_timestamp:1,kind:'story',origin:'observed',evidence:[0]});
 const current=splits(view(log),null,BASE_MS+2000).table;
 expect(current).toContain('<td class="n">rustboro gym trainer josh defeated</td><td class="t">0:00:01</td>');
 expect(current).toContain('rustboro gym trainer tommy defeated');expect(current).toContain('rustboro gym trainer marc defeated');
 expect(current).not.toContain('<td class="n">rustboro gym trainer tommy defeated</td><td class="t">not<br>recorded</td>');
});

it('shows native repeated activity receipts without inventing historical support',()=>{
 const log=new Log();log.add(0,START);
 const activity=log.add(100,{type:'activity',turn:0,kind:'save_attempt',count:2,server_timestamp:1,evidence:[1,2]});
 expect(eventText(activity)).toContain('save attempt ×2 · evidence #1, #2 · first observation (upper bound)');
 const historical=new RunView();log.events.forEach(event=>{historical.apply(event);});
 expect(splits(historical,null,BASE_MS+1000).table).toContain('first pokemon caught</td><td class="t">not<br>recorded');
 const modern=new RunView();const native=new Log();native.add(0,{...START,harness_features:['native-progress-activity-v1']});native.events.forEach(event=>{modern.apply(event);});
 expect(splits(modern,null,BASE_MS+1000).table).not.toContain('first pokemon caught</td><td class="t">not<br>recorded');
});

it('shows a blackout receipt in Activity History',()=>{
 const log=new Log();log.add(0,{...START,harness_features:['native-progress-activity-v1','blackout-readout-v1']});
 const activity=log.add(100,{type:'activity',turn:7,kind:'blackout',count:1,server_timestamp:1,evidence:[4,5]});
 expect(eventText(activity)).toContain('blackout ×1 · evidence #4, #5 · first observation (upper bound)');
 const result=view(log);expect(result.activities).toEqual([activity]);
});

it("shows remaining native splits only for declared or recorded support",()=>{
 const names=["petalburg woods trainer lyle defeated","route 116 trainer joey defeated","route 115","route 116","rusturf tunnel"];
 const historical=splits(view(bare()),null,BASE_MS+1000).table;
 for(const name of names) expect(historical).toContain(`${name}</td><td class="t">not<br>recorded`);
 const log=new Log();log.add(0,{...START,harness_features:["remaining-native-milestones-v1"]});
 const modern=splits(view(log),null,BASE_MS+1000).table;
 for(const name of names) expect(modern).not.toContain(`${name}</td><td class="t">not<br>recorded`);
 log.add(1000,{type:"milestone",turn:0,name:"ROUTE_116_TRAINER_JOEY_DEFEATED",server_timestamp:1,kind:"story",origin:"observed",evidence:[0]});
 expect(splits(view(log),null,BASE_MS+2000).table).toContain('route 116 trainer joey defeated</td><td class="t">0:00:01');
});
it("shows qualified dialogue phase and escaped coverage diagnostics from recorded state",()=>{
 const log=bare();log.add(1,state({world_context:{objects:[],triggers:[],dialogue:"Box",message:{phase:"dismiss_wait",cursor:45,ready:true},message_diagnostic:"owner <unknown>"}}));
 expect(fieldContext(view(log))).toContain("Field-message phase: dismiss_wait; buffer cursor 45; advance input ready");
 expect(fieldContext(view(log))).toContain("STATE COVERAGE ERROR: owner &lt;unknown&gt;");
});

it("shows qualified automatic field activity separately from input-ready messages",()=>{
 const log=bare();log.add(1,state({world_context:{objects:[],triggers:[],dialogue:null,field_activity:{phase:"script_pause",owner:0x08099D95}}}));
 const html=fieldContext(view(log));expect(html).toContain("Field activity: script_pause; not an input-ready field message; owner 0x8099D95");expect(html).not.toContain("advance input ready");expect(html).not.toContain("STATE COVERAGE ERROR");
});

describe("navigation memory delivery",()=>{
 it("retains exact payload for raw inspection and shows delivery in activity history",()=>{
  const log=bare();const event=log.add(100,{type:"navigation_context",turn:1,text:"NAVIGATION EVIDENCE MEMORY <observed> #1",evidence:[1]});
  const result=view(log);expect(eventText(event,result)).toContain("Navigation memory delivered");expect(eventText(event,result)).toContain("1 retained references");expect(eventText(event,result)).toContain("&lt;observed&gt;");
  expect(inspector(event)).toContain("NAVIGATION EVIDENCE MEMORY");
 });
});


describe("read-only harness configuration", () => {
 it("shows exact recorded settings, preserves unknown OFF states and escapes recorded content", () => {
  const log=new Log();log.add(0,{...START,model:{...START.model,id:"<model>"},tools:["press","<tool>"],budgets:{max_turns:1500,max_wall_ms:1800000},harness_features:["navigation-evidence-memory-v1"],evaluation:{preset_id:"memory-on",target:null,failure_limit:3,flags:{loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}}});
  const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log));
  expect(doc.body.textContent).toContain("<model>");expect(doc.body.textContent).toContain("memory-on");expect(doc.body.textContent).toContain("1500");
  expect(doc.body.textContent).toContain("OBJECTIVE TRACKING");expect(doc.body.textContent).toContain("OFF");expect(doc.body.textContent).toContain("navigation-evidence-memory-v1");expect(doc.body.textContent).toContain("not recorded");
  expect(doc.querySelector("model, tool, input, select, textarea, button, form")).toBeNull();
  expect(harnessConfig(new RunView())).toContain("No run configuration recorded");
  const legacy=harnessConfig(view(bare()));expect(legacy).toContain("not recorded");expect(legacy).not.toContain("OBJECTIVE TRACKING</dt><dd>OFF");
 });
});


it("renders feature cards with descriptions, truthful badges and local explainer links",()=>{
 const log=new Log();log.add(0,{...START,harness_features:["navigation-evidence-memory-v1","constructor"],evaluation:{preset_id:"memory-on",target:null,failure_limit:3,flags:{loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}}});
 const registry=[{id:"navigation-evidence-memory-v1",title:"NAVIGATION MEMORY",description:"Keeps observed rooms <only>.",group:"guidance",switchable:true,needs:null},{id:"objective-tracking-v1",title:"OBJECTIVE TRACKING",description:"Requires an objective.",group:"guard",switchable:true,needs:null},{id:"ledge-hops-v1",title:"LEDGE HOPS",description:"Allows one-way hops.",group:"guidance",switchable:true,needs:null}]as const;
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),registry);
 const cards=doc.querySelectorAll(".config-feature");expect(cards.length).toBeGreaterThanOrEqual(4);expect(doc.querySelector('[data-feature="constructor"] a')).toBeNull();
 const memory=must(doc.querySelector('[data-feature="navigation-evidence-memory-v1"]'));expect(memory.textContent).toContain("ON");expect(memory.textContent).toContain("Keeps observed rooms <only>.");expect(memory.querySelector("only")).toBeNull();expect(memory.querySelector("a")?.getAttribute("href")).toBe("/explainers/navigation-evidence-memory-v1.html");
 expect(doc.querySelector('[data-feature="objective-tracking-v1"]')?.textContent).toContain("OFF");expect(doc.querySelector('[data-feature="ledge-hops-v1"]')?.textContent).toContain("NOT RECORDED");expect(doc.querySelector("input,select,button,textarea,form")).toBeNull();
 const floorDoc=new Window().document;floorDoc.body.innerHTML=harnessConfig(view(log),[{id:"walkable-floor-v1",title:"WALKABLE FLOOR",description:"Walks sand.",group:"guidance",switchable:true,needs:null}]);
 const floor=must(floorDoc.querySelector('[data-feature="walkable-floor-v1"]'));expect(floor.textContent).toContain("NOT RECORDED");expect(floor.querySelector("a")?.getAttribute("href")).toBe("/explainers/walkable-floor-v1.html");
});

it("documents only recorded tools with input/output contracts and safe unknown fallback",()=>{
 const log=new Log();log.add(0,{...START,tools:["observe","press","navigate_to","remember_destination","get_objectives","set_objective","update_objective","act","<unknown>","constructor"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log));
 expect(Array.from(doc.querySelectorAll(".config-tool h5")).map(node=>node.textContent)).toEqual(["observe","press","navigate_to","remember_destination","get_objectives","set_objective","update_objective","act","<unknown>","constructor"]);
 const press=must(doc.querySelector('[data-tool="press"]'));expect(press.textContent).toContain("1–8");expect(press.textContent).toContain("walking");expect(press.textContent).toContain("INPUTS");expect(press.textContent).toContain("OUTPUTS");expect(press.textContent).toContain("screenshot");
 expect(doc.querySelector('[data-tool="navigate_to"]')?.textContent).toContain("map_id");expect(doc.querySelector('[data-tool="remember_destination"]')?.textContent).toContain("1–4");expect(doc.querySelector('[data-tool="act"]')?.textContent).toContain("1–2000");
 expect(doc.querySelector('[data-tool="constructor"]')?.textContent).toContain("Documentation unavailable");expect(doc.querySelector("unknown,input,button,select,textarea,form")).toBeNull();expect(doc.body.textContent).toContain("not recorded with historical tool schemas");
 const subset=new Log();subset.add(0,{...START,tools:["observe"]});doc.body.innerHTML=harnessConfig(view(subset));expect(doc.querySelectorAll(".config-tool")).toHaveLength(1);expect(doc.querySelector('[data-tool="press"]')).toBeNull();
});

it("documents harness-owned running only for runs with automatic running enabled",()=>{
 const render=(features:string[])=>{const log=new Log();log.add(0,{...START,tools:["press","navigate_to"],harness_features:features});const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log));return doc;};
 const off=render([]);expect(off.querySelector('[data-tool="press"]')?.textContent).toContain("walking: optional boolean");expect(off.querySelector('[data-tool="navigate_to"]')?.textContent).toContain("walking: optional boolean");
 const on=render(["automatic-running-v1"]);expect(on.querySelector('[data-tool="press"]')?.textContent).toContain("model has no walking override");expect(on.querySelector('[data-tool="navigate_to"]')?.textContent).toContain("model has no walking override");expect(on.querySelector('[data-tool="press"]')?.textContent).not.toContain("walking: optional boolean");expect(on.querySelector('[data-tool="navigate_to"]')?.textContent).not.toContain("walking: optional boolean");
});

it("links the elevation transitions card to its tracked explainer",()=>{
 expect(FEATURE_EXPLAINERS["elevation-transitions-v1"]).toBe("elevation-transitions.html");
});

it("links the battle details v2 card to its tracked explainer",()=>{
 expect(FEATURE_EXPLAINERS["battle-details-v2"]).toBe("battle-details-v2.html");
});

it("documents recall_dialogue and links the dialogue log explainer",()=>{
 const log=new Log();log.add(0,{...START,tools:["observe","press","recall_dialogue"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log));
 expect(doc.querySelector('[data-tool="recall_dialogue"]')?.textContent).toContain("1–20");
 expect(FEATURE_EXPLAINERS["dialogue-log-v1"]).toBe("dialogue-log-v1.html");
});

it("links the new rival-push feature cards to their explainers in Harness Config",()=>{
 const log=new Log();log.add(0,{...START,harness_features:["game-evidence-priority-v1","dialogue-log-v1","loop-guard-supervisor-v1"]});
 const registry=(["game-evidence-priority-v1","dialogue-log-v1","loop-guard-supervisor-v1"] as const).map(id=>({id,title:id,description:"d",group:"guidance" as const,switchable:true,needs:null}));
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),registry);
 for(const id of ["game-evidence-priority-v1","dialogue-log-v1","loop-guard-supervisor-v1"])expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
});

describe("instruction ledger delivery",()=>{
 it("retains exact payload for raw inspection, shows delivery and documents note_contradiction",()=>{
  const log=bare();const event=log.add(100,{type:"ledger_context",turn:1,text:"INSTRUCTION LEDGER <quoted> #1",evidence:[1,3]});
  const result=view(log);expect(eventText(event,result)).toContain("Instruction ledger delivered");expect(eventText(event,result)).toContain("2 references");expect(eventText(event,result)).toContain("&lt;quoted&gt;");
  expect(inspector(event)).toContain("INSTRUCTION LEDGER");
  const tools=new Log();tools.add(0,{...START,tools:["observe","note_contradiction"]});
  const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(tools));
  expect(doc.querySelector('[data-tool="note_contradiction"]')?.textContent).toContain("1–4 event numbers");
  expect(FEATURE_EXPLAINERS["instruction-ledger-v1"]).toBe("instruction-ledger-v1.html");
 });
});

it("names the experiment, arm and trial, or the preset, in the run header",()=>{
 const flags={loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false};
 const withExperiment=new Log();withExperiment.add(0,{...START,evaluation:{preset_id:"factorial-both",target:null,failure_limit:3,flags,experiment:{id:"factorial-2x2-think-fast",arm:"both",trial:5,of:32}}});
 expect(brand(view(withExperiment))).toBe(`POKéNAV · ${RUN} · PRESET factorial-both`);
 const presetOnly=new Log();presetOnly.add(0,{...START,evaluation:{preset_id:"checkpoint-clock-set",target:"CLOCK_SET",failure_limit:3,flags}});
 expect(brand(view(presetOnly))).toBe(`POKéNAV · ${RUN} · PRESET checkpoint-clock-set`);
});

it("labels a supervisor loop event as a message sent to the model, with its full text",()=>{
 const log=bare();const event=log.add(100,{type:"loop_guard",turn:3,kind:"cycle",message:"SUPERVISOR: You are currently looping.",calls:40,evidence:[1,2],mode:"enforced",phase:"supervisor"});
 const row=eventText(event,view(log));
 expect(row).toContain("supervisor message sent to the model");
 expect(row).toContain("SUPERVISOR: You are currently looping.");
});

it("shows milestone hints as messages sent to the model and documents get_next_milestone",()=>{
 const log=bare();const event=log.add(100,{type:"milestone_hint",turn:2,text:"MILESTONE REACHED: You set the clock. Next milestone: Go back downstairs and listen to Mom.",milestone:"CLOCK_SET"});
 expect(eventText(event,view(log))).toContain("Milestone hint sent to the model");
 const tools=new Log();tools.add(0,{...START,tools:["observe","get_next_milestone"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(tools));
 expect(doc.querySelector('[data-tool="get_next_milestone"]')?.textContent).toContain("HINT ARM");
 expect(FEATURE_EXPLAINERS["next-milestone-hint-v1"]).toBe("next-milestone-hint-v1.html");
 expect(FEATURE_EXPLAINERS["double-context-window-v1"]).toBe("double-context-window-v1.html");
});

it("links the fresh retry card to its explainer",()=>{
 expect(FEATURE_EXPLAINERS["fresh-retry-v1"]).toBe("fresh-retry-v1.html");
});

it("links the named warp destinations card to its explainer",()=>{
 expect(FEATURE_EXPLAINERS["named-warp-destinations-v1"]).toBe("named-warp-destinations-v1.html");
 expect(FEATURE_EXPLAINERS["character-presence-v1"]).toBe("character-presence-v1.html");
 expect(FEATURE_EXPLAINERS["dialogue-auto-advance-v1"]).toBe("dialogue-auto-advance-v1.html");
 expect(FEATURE_EXPLAINERS["dialogue-context-kept-v1"]).toBe("dialogue-context-kept-v1.html");
 expect(FEATURE_EXPLAINERS["transition-loop-detection-v1"]).toBe("transition-loop-detection-v1.html");
 expect(FEATURE_EXPLAINERS["pushback-loop-detection-v1"]).toBe("pushback-loop-detection-v1.html");
 expect(FEATURE_EXPLAINERS["pushback-press-result-v1"]).toBe("pushback-press-result-v1.html");
 expect(FEATURE_EXPLAINERS["battle-observation-loop-v1"]).toBe("battle-observation-loop-v1.html");
});

it("links the ineffective loops card to its explainer",()=>{
 expect(FEATURE_EXPLAINERS["ineffective-loops-v1"]).toBe("ineffective-loops-v1.html");
});

it("links the connection edge tiles card to its explainer",()=>{
 expect(FEATURE_EXPLAINERS["connection-edge-tiles-v1"]).toBe("connection-edge-tiles-v1.html");
});

it("links the stall briefing card to its explainer",()=>{
 expect(FEATURE_EXPLAINERS["stall-briefing-v1"]).toBe("stall-briefing-v1.html");
});

it("links the text-only supervisor card to its explainer",()=>{
 expect(FEATURE_EXPLAINERS["text-only-supervisor-v1"]).toBe("text-only-supervisor-v1.html");
});
it("links the milestone stall stop card to its explainer",()=>{
 expect(FEATURE_EXPLAINERS["milestone-stall-stop-v1"]).toBe("milestone-stall-stop-v1.html");
});
it("links the navigation refusal reasons card to its explainer",()=>{
 expect(FEATURE_EXPLAINERS["navigation-refusal-reasons-v1"]).toBe("navigation-refusal-reasons-v1.html");
});

it("shows the shortest model name in the header with the thinking level, and the full id on hover",()=>{
 const log=new Log();log.add(0,{...START,model:{...START.model,id:"deepseek/deepseek-v4.1-flash"}});
 const root=new Window().document.createElement("div");root.innerHTML=runIdentity(view(log));
 const pill=[...root.querySelectorAll(".id-cell")].find(c=>c.querySelector("small")?.textContent==="MODEL · THINKING");
 expect(pill?.querySelector("span")?.textContent).toBe("DeepSeek-v4.1 · thinking on");
 expect(pill?.getAttribute("title")).toBe("deepseek/deepseek-v4.1-flash");
});

it("shows the experiment, arm and trial strip, the preset, or just the model and run",()=>{
 const flags={loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false};
 const cells=(html:string)=>{const w=new Window();const root=w.document.createElement("div");root.innerHTML=html;const out=[...root.querySelectorAll(".id-cell")].map(c=>`${c.querySelector("small")?.textContent??""}=${c.querySelector("span")?.textContent??""}`);void w.happyDOM.abort();return{out,root};};
 const withExperiment=new Log();withExperiment.add(0,{...START,evaluation:{preset_id:"factorial-both",target:null,failure_limit:3,flags,experiment:{id:"factorial-2x2-<think>",arm:"both",trial:5,of:8}}});
 const exp=cells(runIdentity(view(withExperiment)));
 expect(exp.out).toEqual(["PRESET=factorial-both","MODEL · THINKING=think-swarm · thinking on",`RUN=…${RUN.slice(-4)}`]);
 expect(exp.root.querySelectorAll(".trial-dots i.done")).toHaveLength(0);
 expect(exp.root.querySelectorAll(".trial-dots i.now")).toHaveLength(0);
 expect(exp.root.querySelector("think")).toBeNull();
 const presetOnly=new Log();presetOnly.add(0,{...START,evaluation:{preset_id:"checkpoint-clock-set",target:"CLOCK_SET",failure_limit:3,flags}});
 expect(cells(runIdentity(view(presetOnly))).out).toEqual(["PRESET=checkpoint-clock-set","MODEL · THINKING=think-swarm · thinking on",`RUN=…${RUN.slice(-4)}`]);
 expect(cells(runIdentity(view(fullRun()))).out).toEqual(["MODEL · THINKING=think-swarm · thinking on",`RUN=…${RUN.slice(-4)}`]);
 expect(runIdentity(new RunView())).toBe("");
});

it("links the transition press results card to its explainer",()=>{
 expect(FEATURE_EXPLAINERS["transition-press-result-v1"]).toBe("transition-press-result-v1.html");
 expect(FEATURE_EXPLAINERS["blocked-batch-result-v1"]).toBe("blocked-batch-result-v1.html");
 expect(FEATURE_EXPLAINERS["in-game-naming-readout-v1"]).toBe("in-game-naming-readout-v1.html");
 expect(FEATURE_EXPLAINERS["no-nickname-guidance-v1"]).toBe("no-nickname-guidance-v1.html");
 expect(FEATURE_EXPLAINERS["people-ledger-v1"]).toBe("people-ledger-v1.html");
 expect(FEATURE_EXPLAINERS["explorer-guidance-v1"]).toBe("explorer-guidance-v1.html");
});

it("links the battle text auto-advance card to its explainer in Harness Config",()=>{
 expect(FEATURE_EXPLAINERS["battle-text-auto-advance-v1"]).toBe("battle-text-auto-advance-v1.html");
 const log=new Log();log.add(0,{...START,harness_features:["battle-text-auto-advance-v1"]});
 const registry=(["battle-text-auto-advance-v1"] as const).map(id=>({id,title:"BATTLE TEXT AUTO-ADVANCE",description:"d",group:"guidance" as const,switchable:true,needs:"dialogue-auto-advance-v1" as const}));
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),registry);
 expect(doc.querySelector('[data-feature="battle-text-auto-advance-v1"] a')?.getAttribute("href")).toBe("/explainers/battle-text-auto-advance-v1.html");
});

it("links the bedroom exit measurement card to its explainer in Harness Config",()=>{
 const log=new Log();log.add(0,{...START,harness_features:["bedroom-exit-v1"]});
 const registry=(["bedroom-exit-v1"] as const).map(id=>({id,title:"LEFT BEDROOM",description:"d",group:"measurement" as const,switchable:false,needs:null}));
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),registry);
 expect(doc.querySelector('[data-feature="bedroom-exit-v1"] a')?.getAttribute("href")).toBe("/explainers/bedroom-exit-v1.html");
});

it("links the Route 103 rival measurement card to its explainer in Harness Config",()=>{
 const log=new Log();log.add(0,{...START,harness_features:["route103-rival-splits-v1"]});
 const registry=(["route103-rival-splits-v1"] as const).map(id=>({id,title:"ROUTE 103 RIVAL",description:"d",group:"measurement" as const,switchable:false,needs:null}));
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),registry);
 expect(doc.querySelector('[data-feature="route103-rival-splits-v1"] a')?.getAttribute("href")).toBe("/explainers/route103-rival-splits-v1.html");
});
it("links the trainer heal guidance and both low-HP trainer warning cards to their tracked explainers",()=>{
 const ids=["trainer-heal-guidance-v1","low-hp-trainer-warning-v1","low-hp-trainer-warning-v2"] as const;
 // One render of just these two cards; the shared mapped-explainer test reads each tracked file.
 const log=new Log();log.add(0,{...START,harness_features:[...ids]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES.filter(f=>(ids as readonly string[]).includes(f.id)));
 for(const id of ids){
  expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
  expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 }
});

it("links battle decision readiness from its recorded feature card",()=>{
 const id="battle-decision-ready-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
});
 it("links starter decision salience from its recorded feature card",()=>{
 const id="starter-decision-salience-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 });
it("links the recorded original-speed policy without inferring historical ON",()=>{
 const id="original-speed-pacing-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const card=doc.querySelector(`[data-feature="${id}"]`);
 expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 expect(card?.textContent).toContain("ON");
 const legacy=new Log();legacy.add(0,{...START,harness_features:["ram-state-v1"]});
 doc.body.innerHTML=harnessConfig(view(legacy),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"]`)?.classList.contains("config-on")).toBe(false);
});

it("keeps party confirmation readiness in the existing replay interface and links its feature card",()=>{
 const log=bare();
 log.add(1000,state({active_ui:{phase:"party_item_message",selected:"A/B: CONTINUE",ready:true,controls:"A or B continues the message",diagnostic:null,value:null,details:{message:"TORCHIC's HP was restored by 20 point(s)."}}}));
 const current=view(log);
 const doc=new Window().document;doc.body.innerHTML=fieldContext(current)+harnessConfig(current,FEATURES);
 expect(doc.body.textContent).toContain("party_item_message");
 expect(doc.body.textContent).toContain("A/B: CONTINUE");
 expect(Array.from(doc.querySelectorAll("dt")).find(dt=>dt.textContent==="INPUT")?.nextElementSibling.textContent).toBe("ready");
 expect(doc.querySelector('[data-feature="party-item-confirmation-v1"] a')?.getAttribute("href")).toBe("/explainers/party-item-confirmation-v1.html");
});

it("links the recorded distinct-exits treatment to its tracked explainer",()=>{
 const id="exit-labels-v3";
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const card=doc.querySelector(`[data-feature="${id}"]`);
 expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 expect(card?.textContent).toContain("ON");
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
});

it("links each new navigation switch card to its exact tracked explainer without changing historical status",()=>{
 const log=new Log();log.add(0,{...START,harness_features:[]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 for(const id of ["navigation-tool-use-guard-v1","semantic-current-map-feedback-v1","moving-npc-target-v1"] as const){
  const card=must(doc.querySelector(`[data-feature="${id}"]`));
  expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
  expect(card.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
  expect(card.textContent).toContain("NOT RECORDED");
 }
});

it("links exploratory waypoint guidance from its exact feature card",()=>{
 const id="navigation-refusal-reasons-v3";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const card=doc.querySelector(`[data-feature="${id}"]`);expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);expect(card?.textContent).toContain("ON");
});

it("links the pending field dialogue feature card to its local explainer",()=>{
 const log=new Log();log.add(0,{...START,harness_features:["pending-field-dialogue-v1"]});
 const html=harnessConfig(view(log),FEATURES);
 expect(html).toContain('/explainers/pending-field-dialogue-v1.html');
 expect(html).toContain('PENDING FIELD DIALOGUE');
});

it("links the recorded menu refusal guard to its explainer without changing feature status",()=>{
 const log=new Log();log.add(0,{...START,harness_features:["menu-refusal-recovery-v1"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const card=doc.querySelector('[data-feature="menu-refusal-recovery-v1"]');
 expect(card?.querySelector("a")?.getAttribute("href")).toBe("/explainers/menu-refusal-recovery-v1.html");expect(card?.textContent).toContain("ON");
});

it("links the recorded Gym door label treatment to its tracked explainer",()=>{
 const id="gym-door-label-v1";
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const card=doc.querySelector(`[data-feature="${id}"]`);
 expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 expect(card?.textContent).toContain("ON");
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
});

describe("tracked explainer links",()=>{
 // One Harness Config render with every listed switch on, indexed once by feature id, serves every row.
 const LINKED=["caught-dex-input-v1","caught-nickname-prompt-v2","cutscene-journal-v1","instruction-goal-advisory-v1","goal-review-repair-feedback-v1","type-gap-team-v1","supplies-v1","untalked-in-gym-v1","scene-followup-prompt-v1","type-gap-team-last-message-v1","instruction-memory-cap-v1","story-checkpoints-whole-game-v1","instruction-memory-yaml-v1"];
 const log=new Log();log.add(0,{...START,harness_features:LINKED});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const cards=new Map([...doc.querySelectorAll("[data-feature]")].map(card=>[card.getAttribute("data-feature"),card]));
 it.each(LINKED)("links %s to its explainer without changing feature status",(id)=>{
  const card=cards.get(id);
  expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);expect(card?.textContent).toContain("ON");
 });
});

it("links the recorded progress-aware cycles treatment to its tracked explainer",()=>{
 const id="progress-aware-cycles-v1";
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const card=doc.querySelector(`[data-feature="${id}"]`);
 expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 expect(card?.textContent).toContain("ON");
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
});

it("shows milestone retention and its complete audit receipt in history and raw inspection",()=>{
 const log=bare();const event=log.add(100,{type:"ledger_context",turn:1,text:"OBSERVED INSTRUCTION MEMORY",evidence:[1],retention:{chapter:{name:"CLOCK_SET",state_event:1,result_event:2},archive_count:2,kept:[{result_event:3,reason:"unknown",rule:null}],retired:[{result_event:4,reason:"completed",rule:"clock-request"}],proofs:[{name:"CLOCK_SET",state_event:1,result_event:2}]}});
 expect(eventText(event,view(log))).toContain("1 kept · 1 archived");expect(inspector(event)).toContain("clock-request");
 expect(FEATURE_EXPLAINERS["milestone-instruction-memory-v1"]).toBe("milestone-instruction-memory-v1.html");
});

it("links each independent poison and berry card to its tracked explainer",()=>{
 const log=new Log();log.add(0,START);
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 for(const id of ["poison-readout-v1","berry-readout-v1"]){
  expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
  expect(doc.querySelector(`a[href="/explainers/${id}.html"]`)?.textContent).toContain("READ EXPLAINER");
 }
});

it("links the recorded navigation recovery guard to its explainer without changing feature status",()=>{
 const log=new Log();log.add(0,{...START,harness_features:["navigation-recovery-v1"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const card=doc.querySelector('[data-feature="navigation-recovery-v1"]');
 expect(card?.querySelector("a")?.getAttribute("href")).toBe("/explainers/navigation-recovery-v1.html");expect(card?.textContent).toContain("ON");
});


it("links the battle move-learning owner card to its tracked explainer",()=>{
 const log=new Log();log.add(0,START);
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const id="battle-move-learn-input-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 expect(doc.querySelector(`a[href="/explainers/${id}.html"]`)?.textContent).toContain("READ EXPLAINER");
});

it("links checked requested strides to its tracked explainer",()=>{
 const log=new Log();log.add(0,{...START,harness_features:["rejected-movement-stride-v1"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector('[data-feature="rejected-movement-stride-v1"] a')?.getAttribute("href")).toBe("/explainers/rejected-movement-stride-v1.html");
});

it("links current boundary facts to its tracked explainer",()=>{
 const log=new Log();log.add(0,{...START,harness_features:["boundary-crossing-facts-v1"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector('[data-feature="boundary-crossing-facts-v1"] a')?.getAttribute("href")).toBe("/explainers/boundary-crossing-facts-v1.html");
});


it("links delivered person and place evidence to its tracked explainer",()=>{
 const log=new Log();log.add(0,START);
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const id="delivered-place-evidence-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 expect(doc.querySelector(`a[href="/explainers/${id}.html"]`)?.textContent).toContain("READ EXPLAINER");
});

it("links section alternatives to its tracked explainer",()=>{
 const log=new Log();log.add(0,{...START,harness_features:["reachable-section-alternatives-v1"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector('[data-feature="reachable-section-alternatives-v1"] a')?.getAttribute("href")).toBe("/explainers/reachable-section-alternatives-v1.html");
});
it.each(["restored-memory-run-v1","blackout-transition-v1","whiteout-outcomes-v2"] as const)("links %s from its recorded ON card",id=>{
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["probe",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const card=doc.querySelector(`[data-feature="${id}"]`);expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);expect(card?.textContent).toContain("ON");
});

it("links the navigation cycle stop from its recorded feature card",()=>{
 const id="navigation-cycle-stop-v1";expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","bounded-navigation-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const card=doc.querySelector(`[data-feature="${id}"]`);expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);expect(card?.textContent).toContain("ON");
});

it("links the party menu message from its feature card",()=>{
 const id="party-menu-message-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
});

it("links the nonterminal deterministic guard to its shared supervisor explainer",()=>{
 expect(FEATURE_EXPLAINERS["deterministic-loop-guard-v1"]).toBe("loop-guard-supervisor-v1.html");
 const log=new Log();log.add(0,{...START,harness_features:["deterministic-loop-guard-v1"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log));
 expect(doc.querySelector('[data-feature="deterministic-loop-guard-v1"] a')?.getAttribute("href")).toBe("/explainers/loop-guard-supervisor-v1.html");
});

it("keeps a recorded goal transaction visible as a ledger event with raw evidence",()=>{
 const log=bare();const e=log.add(100,{type:"ledger_context",turn:1,text:'INSTRUCTION GOALS — "Select POKéNAV"; verification model_interpretation',evidence:[12],instruction_goals:{call_id:"review",review:{reviewed:[{episode:12,interpretation:"Current request"}],updates:[]}}});
 expect(eventText(e)).toContain("Instruction goal review recorded");expect(inspector(e)).toContain("instruction_goals");
});
it.each(["bag-pocket-truth-v1","bag-press-feedback-v1","bag-ineffective-loop-v1"])("links %s to its exact tracked explainer",id=>{
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
});

it("links complete Claude turn delivery to the tracked explanation",()=>{
 const id="gateway-current-turn-v1";expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 for(const enabled of [true,false]){
  const log=new Log();log.add(0,{...START,harness_features:enabled?["probe",id]:["probe"]});
  const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
  const card=doc.querySelector(`[data-feature="${id}"]`);
  expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
  expect(card?.textContent).toContain(enabled?"ON":"NOT RECORDED");
 }
});

it("links both Claude schema corrections to their tracked explanations",()=>{
 for(const id of ["gateway-tool-schemas-v1","gateway-schema-hint-v1"]){
  expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
  for(const enabled of [true,false]){
   const log=new Log();log.add(0,{...START,harness_features:enabled?["probe",id]:["probe"]});
   const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
   const card=doc.querySelector(`[data-feature="${id}"]`);
   expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
   expect(card?.textContent).toContain(enabled?"ON":"NOT RECORDED");
  }
 }
});

it("links destination-first guidance to its tracked explainer",()=>{
 const log=new Log();log.add(0,{...START,harness_features:["destination-first-navigation-v1"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const card=doc.querySelector('[data-feature="destination-first-navigation-v1"]');
 expect(card?.textContent).toContain("ON");
 expect(card?.querySelector("a")?.getAttribute("href")).toBe("/explainers/destination-first-navigation-v1.html");
});

it("shows the exact PokéNav automatic buttons and links its feature explainer",()=>{
 const log=new Log();log.add(0,{...START,harness_features:["pokenav-call-auto-advance-v1"]});
 const event=log.add(100,{type:"dialogue_auto_advance",turn:2,tool_call_id:"nav",tool:"select_menu_option",requested:[],sent:[],dropped:[],auto_presses:3,pokenav_buttons:["A","A","B"],pages:[{state_seq:1,map:"RUSTBORO CITY",map_id:[0,3],position:null,speaker:"MR. STONE",speaker_source:"name_prefix",text:"MR. STONE: Hello!"}],stop:"menu",detail:"PokéNav closed",duration_ms:50});
 expect(eventText(event,view(log))).toContain("PokéNav auto-advance (select_menu_option) · A, A, B");
 expect(inspector(event)).toContain("pokenav_buttons");
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const card=doc.querySelector('[data-feature="pokenav-call-auto-advance-v1"]');
 expect(card?.textContent).toContain("ON");expect(card?.querySelector("a")?.getAttribute("href")).toBe("/explainers/pokenav-call-auto-advance-v1.html");
});

it("marks a PokéNav input with an unknown effect explicitly in history and raw inspection",()=>{
 const log=new Log();log.add(0,START);
 const event=log.add(100,{type:"dialogue_auto_advance",turn:1,tool_call_id:"uncertain",tool:"observe",requested:[],sent:[],dropped:[],auto_presses:0,pokenav_buttons:[],pokenav_pending_button:"A",pages:[],stop:"error",detail:"observation503 after action accepted",duration_ms:1});
 expect(eventText(event,view(log))).toContain("no confirmed inputs · A may have executed; outcome unconfirmed");
 expect(inspector(event)).toContain("pokenav_pending_button");
});

it("links the compact map grid explainer from its config card without inventing recorded status",()=>{
 const id="compact-map-grid-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 for(const enabled of [true,false]){
  const log=new Log();log.add(0,{...START,harness_features:enabled?["probe",id]:["probe"]});
  const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
  const card=doc.querySelector(`[data-feature="${id}"]`);
  expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
  expect(card?.textContent).toContain(enabled?"ON":"NOT RECORDED");
 }
});

it("links the bounded supervisor briefing explainer from its config card without inventing recorded status",()=>{
 const id="supervisor-briefing-bound-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 for(const enabled of [true,false]){
  const log=new Log();log.add(0,{...START,harness_features:enabled?["probe",id]:["probe"]});
  const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
  const card=doc.querySelector(`[data-feature="${id}"]`);
  expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
  expect(card?.textContent).toContain(enabled?"ON":"NOT RECORDED");
 }
});

it("links the bounded refusal history explainer from its config card without inventing recorded status",()=>{
 const id="refusal-ledger-bound-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 expect(FEATURE_EXPLAINERS["disproved-beliefs-bound-v1"]).toBe(`${id}.html`);
 for(const enabled of [true,false]){
  const log=new Log();log.add(0,{...START,harness_features:enabled?["probe",id]:["probe"]});
  const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
  const card=doc.querySelector(`[data-feature="${id}"]`);
  expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
  expect(card?.textContent).toContain(enabled?"ON":"NOT RECORDED");
 }
});

it("links safe scene capture from its actual config card without inventing recorded status",()=>{
 const id="scene-journal-safe-capture-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 for(const enabled of [true,false]){
  const log=new Log();log.add(0,{...START,harness_features:enabled?["probe",id]:["probe"]});
  const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
  const card=doc.querySelector(`[data-feature="${id}"]`);
  expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
  expect(card?.textContent).toContain(enabled?"ON":"NOT RECORDED");
 }
});

it("links the neutral YES/NO card without guessing a historical activation",()=>{
 const id="neutral-yes-no-readout-v1";
 const log=new Log();log.add(0,{...START,harness_features:[]});
 const doc=new Window().document;
 doc.body.innerHTML=harnessConfig(view(log),[{id,title:"NEUTRAL YES/NO CONTROLS",description:"Both choices.",group:"observation",switchable:true,needs:"yes-no-answer-readout-v1"}]);
 const card=must(doc.querySelector(`[data-feature="${id}"]`));
 expect(card.textContent).toContain("NOT RECORDED");
 expect(card.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
});

it("links the instruction junk filter's exact card and preserves recorded status",()=>{
 const id="instruction-memory-junk-filter-v1";expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 for(const enabled of [true,false]){
  const log=new Log();log.add(0,{...START,harness_features:enabled?["probe",id]:["probe"]});
  const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
  const card=doc.querySelector(`[data-feature="${id}"]`);
  expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
  expect(card?.textContent).toContain(enabled?"ON":"NOT RECORDED");
 }
});

it("links the bounded ID-card feature's exact card and preserves recorded status",()=>{
 const id="id-card-bound-v1";expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 for(const enabled of [true,false]){
  const log=new Log();log.add(0,{...START,harness_features:enabled?["probe",id]:["probe"]});
  const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
  const card=doc.querySelector(`[data-feature="${id}"]`);
  expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
  expect(card?.textContent).toContain(enabled?"ON":"NOT RECORDED");
 }
});
it("links current question focus without guessing historical activation",()=>{
 const id="current-question-focus-v1";expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 for(const enabled of [true,false]){
  const log=new Log();log.add(0,{...START,harness_features:enabled?["probe",id]:["probe"]});
  const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
  const card=doc.querySelector(`article[data-feature="${id}"]`);
  expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
  expect(card?.querySelector(".config-badge")?.textContent).toBe(enabled?"ON":"NOT RECORDED");
 }
});

it("links both gym campaign cards with faithful recorded activation",()=>{
 for(const id of ["eight-badge-mission-v1","discovered-gym-checklist-v1"]){
  expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
  for(const enabled of [true,false]){
   const log=new Log();log.add(0,{...START,harness_features:enabled?["probe",id]:["probe"]});
   const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
   const card=doc.querySelector(`article[data-feature="${id}"]`);
   expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
   expect(card?.querySelector(".config-badge")?.textContent).toBe(enabled?"ON":"NOT RECORDED");
  }
 }
});
it("exposes town Center delivery evidence, raw text and its exact Harness Config explainer",()=>{
 const id="town-center-checkpoint-v1",text="Enter OLDALE TOWN’s Pokémon Center now, using the listed entrance warp at (6,16) on map [0, 10]. Entry sets your blackout return point here even when your party is healthy. Heal with the nurse if needed, then resume your current objective.";
 const log=bare(),event=log.add(100,{type:"ledger_context",turn:1,text,evidence:[10,11]});
 expect(eventText(event,view(log))).toContain("2 references");expect(eventText(event,view(log))).toContain("Enter OLDALE TOWN");expect(inspector(event)).toContain("blackout return point");
 const config=new Log();config.add(0,{...START,harness_features:[id]});const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(config));
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);expect(doc.querySelector(`a[href="/explainers/${id}.html"]`)?.textContent).toContain("READ EXPLAINER");
});

it("links player map visibility V2 to its tracked explainer",()=>{expect(FEATURE_EXPLAINERS["player-map-visibility-v2"]).toBe("player-map-visibility-v2.html");});

it("keeps retired visibility V1 recorded ON and OFF cards without enabling the switch",()=>{
 const id="player-map-visibility-v1",evaluation={preset_id:"historical",target:null,failure_limit:3,flags:{loopGuard:false,activeUi:false,interfaceDocs:false,objectives:false}};
 for(const on of [true,false]){
  const log=new Log();log.add(0,{...START,harness_features:on?[id]:[],evaluation:{...evaluation,features:{[id]:on}}});
  const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
  const card=doc.querySelector(`[data-feature="${id}"]`);
  expect(card?.textContent).toContain("RETIRED");
  expect(card?.querySelector(".config-badge")?.textContent).toBe(on?"ON":"OFF");
  expect(card?.querySelector("a")).toBeNull();
 }
});

it("links ROM identity from its card without inferring a historical setting",()=>{
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(bare()),FEATURES);
 const card=must(doc.querySelector('[data-feature="rom-identity-v1"]'));
 expect(card.querySelector("a")?.getAttribute("href")).toBe("/explainers/rom-identity-v1.html");
 expect(card.textContent).toContain("NOT RECORDED");
});


it("links the checkpoint research note card without inferring historical activation",async()=>{
 const {FEATURES:currentFeatures}=await import("../../agent/src/features.js");
 const id="checkpoint-research-note-v1";
 expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(bare()),currentFeatures);
 const card=must(doc.querySelector(`[data-feature="${id}"]`));
 expect(card.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 expect(card.textContent).toContain("NOT RECORDED");
});

it("links the Rusturf entry follow-up card without inferring historical activation",async()=>{
 const {FEATURES:currentFeatures}=await import("../../agent/src/features.js");
 const id="rusturf-entry-followup-v1";
 expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(bare()),currentFeatures);
 const card=must(doc.querySelector(`[data-feature="${id}"]`));
 expect(card.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 expect(card.textContent).toContain("NOT RECORDED");
 const recorded=new Log();recorded.add(0,{...START,harness_features:[id]});
 doc.body.innerHTML=harnessConfig(view(recorded),currentFeatures);
 const enabled=must(doc.querySelector(`[data-feature="${id}"]`));
 expect(enabled.querySelector(".config-badge")?.textContent).toBe("ON");
 expect(enabled.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
});

it("links the moving-NPC frame burst card without inferring historical activation",async()=>{
 const {FEATURES:currentFeatures}=await import("../../agent/src/features.js");
 const id="moving-npc-frame-burst-v1";
 expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(bare()),currentFeatures);
 const card=must(doc.querySelector(`[data-feature="${id}"]`));
 expect(card.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 expect(card.textContent).toContain("NOT RECORDED");
 const recorded=new Log();recorded.add(0,{...START,harness_features:[id]});
 doc.body.innerHTML=harnessConfig(view(recorded),currentFeatures);
 const enabled=must(doc.querySelector(`[data-feature="${id}"]`));
 expect(enabled.querySelector(".config-badge")?.textContent).toBe("ON");
 expect(enabled.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
});

it("links the native Surf navigation card, default off",async()=>{
 const {FEATURES:currentFeatures}=await import("../../agent/src/features.js");
 const id="surf-navigation-v1";
 expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(bare()),currentFeatures);
 expect(must(doc.querySelector(`[data-feature="${id}"]`)).querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
});

it("links the five rotating-gate cards to one explainer, default off",async()=>{
 const {FEATURES:currentFeatures}=await import("../../agent/src/features.js");
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(bare()),currentFeatures);
 for(const id of ["rotating-gate-positions-v1","rotating-gate-rules-v1","rotating-gate-map-v1","map-code-aliases-v1","rotating-gate-navigation-v1"] as const){
  expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
  expect(FEATURE_EXPLAINERS[id]).toBe("rotating-gate-readouts-v1.html");
  expect(must(doc.querySelector(`[data-feature="${id}"]`)).querySelector("a")?.getAttribute("href")).toBe("/explainers/rotating-gate-readouts-v1.html");
 }
});

it("links the warps-by-landing-area card, default off",async()=>{
 const {FEATURES:currentFeatures}=await import("../../agent/src/features.js");
 const id="warp-areas-v1";
 expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(bare()),currentFeatures);
 expect(must(doc.querySelector(`[data-feature="${id}"]`)).querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
});

it("links the moving-NPC path step-in card without inferring historical activation",async()=>{
 const {FEATURES:currentFeatures}=await import("../../agent/src/features.js");
 const id="moving-npc-intercept-v1";
 expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(bare()),currentFeatures);
 const card=must(doc.querySelector(`[data-feature="${id}"]`));
 expect(card.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 expect(card.textContent).toContain("NOT RECORDED");
 const recorded=new Log();recorded.add(0,{...START,harness_features:[id]});
 doc.body.innerHTML=harnessConfig(view(recorded),currentFeatures);
 expect(must(doc.querySelector(`[data-feature="${id}"]`)).querySelector(".config-badge")?.textContent).toBe("ON");
});

it("links all three auto-bike cards to the one explainer without inferring historical activation",async()=>{
 const {FEATURES:currentFeatures}=await import("../../agent/src/features.js");
 for(const id of ["bike-navigation-v1","bike-register-v1","bike-auto-mount-v1"]){
  expect(DEFAULT_NEXT_RUN.features[id as keyof typeof DEFAULT_NEXT_RUN.features]).toBe(false);
  expect(FEATURE_EXPLAINERS[id]).toBe("bike-navigation-v1.html");
  const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(bare()),currentFeatures);
  const card=must(doc.querySelector(`[data-feature="${id}"]`));
  expect(card.querySelector("a")?.getAttribute("href")).toBe("/explainers/bike-navigation-v1.html");
  expect(card.textContent).toContain("NOT RECORDED");
 }
});

it("links the authored Rustboro scene labels card without inferring historical activation",async()=>{
 const {FEATURES:currentFeatures}=await import("../../agent/src/features.js");
 const id="authored-scene-labels-v1";
 expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(bare()),currentFeatures);
 const card=must(doc.querySelector(`[data-feature="${id}"]`));
 expect(card.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 expect(card.textContent).toContain("NOT RECORDED");
 const recorded=new Log();recorded.add(0,{...START,harness_features:[id]});
 doc.body.innerHTML=harnessConfig(view(recorded),currentFeatures);
 const enabled=must(doc.querySelector(`[data-feature="${id}"]`));
 expect(enabled.querySelector(".config-badge")?.textContent).toBe("ON");
 expect(enabled.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
});

it("links the native instruction tasks card without inferring historical activation",async()=>{
 const {FEATURES:currentFeatures}=await import("../../agent/src/features.js");
 const id="native-instruction-tasks-v1";
 expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(bare()),currentFeatures);
 const card=must(doc.querySelector(`[data-feature="${id}"]`));
 expect(card.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 expect(card.textContent).toContain("NOT RECORDED");
 const recorded=new Log();recorded.add(0,{...START,harness_features:[id]});
 doc.body.innerHTML=harnessConfig(view(recorded),currentFeatures);
 const enabled=must(doc.querySelector(`[data-feature="${id}"]`));
 expect(enabled.querySelector(".config-badge")?.textContent).toBe("ON");
 expect(enabled.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
});

it("shows the effort a run sent, and never a level no request carried",()=>{
 expect(thinkingLabel({thinking_level:"medium"})).toBe("thinking on");
 expect(thinkingLabel({thinking_level:"medium",reasoning_effort_sent:null})).toBe("thinking on");
 expect(thinkingLabel({thinking_level:"medium",reasoning_effort_sent:"medium"})).toBe("medium");
 expect(thinkingLabel({thinking_level:"off",reasoning_effort_sent:null})).toBe("off");
});
it("names what each lane ran at when no effort was sent, and how that is known",()=>{
 expect(servedEffort("qwen3.8-27b")).toBe("server ran xhigh (measured)");
 expect(servedEffort("qwen3.8-27b-edit-e1-a")).toBe("server ran xhigh (measured)");
 expect(servedEffort("Qwen3.8-Flash-Next-UD-IQ4_XS")).toBe("server ran xhigh (from its template)");
 expect(servedEffort("/cache/GLM-5.3-Flash-UD-IQ4_XS-00001-of-00005.gguf")).toBe("server ran Max (from its template)");
 expect(servedEffort("think-swarm")).toBe("this lane's template has no effort setting");
 expect(servedEffort("/models/Qwen3.6-35B-A3B-UD-Q4_K_M.gguf")).toBe("this lane's template has no effort setting");
 expect(servedEffort("deepseek/deepseek-v4.1-flash")).toBe("server default, not known");
});
describe("the recorded effort reaches every run surface",()=>{
 const sampling=(extra:object):typeof START=>({...START,model:{...START.model,id:"qwen3.8-27b"},sampling:{...START.sampling,...extra}});
 const shown=(start:typeof START):{details:string;config:string}=>{
  const log=new Log();log.add(0,start);
  return {details:runDetails({...card(),config:configuration({v:1,run:RUN,seq:0,t:"",...start})},null),config:harnessConfig(view(log))};
 };
 it("names a sent level on Run Details and Harness Config",()=>{
  const {details,config}=shown(sampling({thinking_level:"medium",reasoning_effort_sent:"medium"}));
  expect(details).toContain("<dd>medium</dd>");expect(config).toContain("<dt>EFFORT SENT</dt><dd>medium</dd>");
 });
 it("says what the lane ran at when nothing was sent, recorded or not",()=>{
  for(const extra of [{thinking_level:"medium"},{thinking_level:"medium",reasoning_effort_sent:null}]){
   const {details,config}=shown(sampling(extra));
   expect(details).toContain("<dd>thinking on</dd>");expect(details).not.toContain("<dd>medium</dd>");
   expect(config).toContain("<dt>EFFORT SENT</dt><dd>none; server ran xhigh (measured)</dd>");
  }
 });
 it("names no server effort when thinking was off",()=>{
  for(const level of ["off","none"])expect(shown(sampling({thinking_level:level})).config).toContain("<dt>EFFORT SENT</dt><dd>none; thinking off</dd>");
 });
});
it("rejects a malformed sent effort and accepts the valid forms",()=>{
 const payload=(effortSent:unknown)=>({version:1,at:1,milestones:[],problems:[],runs:[{...card(),config:{...card().config,effortSent}}]});
 for(const good of ["medium",null])expect(parseWorkbench(payload(good)).runs).toHaveLength(1);
 expect(()=>parseWorkbench(payload({}))).toThrow();
});

