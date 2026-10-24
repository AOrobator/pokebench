import { describe, expect, it } from "vitest";
import { Window } from "happy-dom";
import { BASE_MS, Log, RUN, START, assistant, fullRun, must, state } from "../test-support/events.js";
import { RunView, foldUntil } from "./model.js";
import { stepOf } from "../test-support/trace.js";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
  expect(trainerCard(v, BASE_MS)).toContain('<dt>CONTROLS</dt><dd>locked</dd>');
  expect(thinkingDialog(v, BASE_MS).head).toContain("MANUAL PROBE");
});

it("shows the current naming cursor and escapes entered text", () => {
  const log = bare();
  log.add(0, state({ naming: { text: "<AB>", page: "uppercase", column: 1, row: 0, key: "B", ready: true } }));
  const html = trainerCard(view(log), BASE_MS);
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
  expect(trainerCard(view(log), BASE_MS)).toContain("name_confirmation");
  expect(trainerCard(view(log), BASE_MS)).toContain("NO");
  log.add(1,state({active_ui:{phase:"unsupported",selected:null,ready:null,controls:"Observe",diagnostic:"<callback>"}}));
  expect(trainerCard(view(log),BASE_MS+1)).toContain("STATE COVERAGE ERROR");
  expect(trainerCard(view(log),BASE_MS+1)).toContain("&lt;callback&gt;");
  expect(trainerCard(view(log),BASE_MS+1)).toContain("unavailable");
  log.add(2,state({active_ui:{phase:"clock_adjustment",selected:null,ready:false,controls:"LEFT/RIGHT",diagnostic:null,value:"10:00 AM"}}));
  expect(trainerCard(view(log),BASE_MS+2)).toContain("10:00 AM");
  expect(trainerCard(view(log),BASE_MS+2)).toContain("not ready");
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

it("links visited terrain navigation to its tracked explainer",()=>{
 const id="visited-terrain-navigation-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain("only cells shown to you this run");
 expect(html).toContain("checkpoint restores the game, not this memory");
});

it("maps game evidence priority to a tracked explainer, like every other mapped card",()=>{
 expect(FEATURE_EXPLAINERS["game-evidence-priority-v1"]).toBe("game-evidence-priority-v1.html");
 for(const file of Object.values(FEATURE_EXPLAINERS))expect(existsSync(fileURLToPath(new URL(`../../../docs/explainers/${file}`,import.meta.url)))).toBe(true);
});

it("links the field move gates card to its tracked explainer",()=>{
 const id="field-move-gates-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain("BREAKABLE_ROCK at (24,4) and (24,5) close every way on foot");
 expect(html).toContain("needs a field move you cannot use yet");
});

it("links save-state task truth to its tracked explainer",()=>{
 expect(FEATURE_EXPLAINERS["save-state-task-truth-v1"]).toBe("save-state-task-truth-v1.html");
 const html=readFileSync(fileURLToPath(new URL("../../../docs/explainers/save-state-task-truth-v1.html",import.meta.url)),"utf8");
 expect(html).toContain("Fresh boot");expect(html).toContain("Verified save state");
});

it("links Petalburg guidance and trigger-loop cards to tracked explainers",()=>{
 expect(FEATURE_EXPLAINERS["scripted-place-guidance-v1"]).toBe("scripted-place-guidance-v1.html");
 expect(FEATURE_EXPLAINERS["trigger-script-loop-v1"]).toBe("trigger-script-loop-v1.html");
 for(const file of ["scripted-place-guidance-v1.html","trigger-script-loop-v1.html"]){
  const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${file}`,import.meta.url)),"utf8");
  expect(html).toContain("OFF");expect(html).toContain("ON");
 }
});

it("links deterministic warp navigation to its tracked explainer",()=>{
 expect(FEATURE_EXPLAINERS["deterministic-warp-navigation-v1"]).toBe("deterministic-warp-navigation-v1.html");
 const html=readFileSync(fileURLToPath(new URL("../../../docs/explainers/deterministic-warp-navigation-v1.html",import.meta.url)),"utf8");
 expect(html).toContain("Exact equivalence gate");expect(html).toContain("one checked direction press");
});

it("links both semantic navigation cards to their tracked explainers",()=>{
 for(const id of ["semantic-navigation-v1","semantic-navigation-v2","deterministic-exploration-v1"]){
  expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
  const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
  expect(html).toContain(id==="semantic-navigation-v1"?"Semantic navigation v1":id==="semantic-navigation-v2"?"Semantic navigation v2":"Deterministic exploration v1");
 }
});

it("renders every mapped explainer's body as a page, not as stylesheet text",()=>{
 for(const file of new Set(Object.values(FEATURE_EXPLAINERS))){
  const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${file}`,import.meta.url)),"utf8");
  const doc=new Window().document;doc.write(html);
  const heading=doc.querySelector("body h1");
  expect(heading?.textContent.trim(),file).toBeTruthy();
  for(const style of doc.querySelectorAll("style"))expect(style.textContent,file).not.toMatch(/<body|<h1/);
 }
});

it("links the battle details v2 card to its tracked explainer",()=>{
 expect(FEATURE_EXPLAINERS["battle-details-v2"]).toBe("battle-details-v2.html");
});

it("keeps the battle details v2 explainer to what the readout does: no escape formula, no reads while off",()=>{
 const html=readFileSync(fileURLToPath(new URL("../../../docs/explainers/battle-details-v2.html",import.meta.url)),"utf8");
 expect(html).not.toMatch(/the formula with/);
 expect(html).not.toMatch(/gathered every battle poll/);
 expect(html).toContain("allowed — guaranteed, or not guaranteed");
 expect(html).toContain("the facts are read only while the switch is on");
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

it("shows the experiment, arm and trial strip, the preset, or just the model and run",()=>{
 const flags={loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false};
 const cells=(html:string)=>{const w=new Window();const root=w.document.createElement("div");root.innerHTML=html;const out=[...root.querySelectorAll(".id-cell")].map(c=>`${c.querySelector("small")?.textContent??""}=${c.querySelector("span")?.textContent??""}`);void w.happyDOM.abort();return{out,root};};
 const withExperiment=new Log();withExperiment.add(0,{...START,evaluation:{preset_id:"factorial-both",target:null,failure_limit:3,flags,experiment:{id:"factorial-2x2-<think>",arm:"both",trial:5,of:8}}});
 const exp=cells(runIdentity(view(withExperiment)));
 expect(exp.out).toEqual(["PRESET=factorial-both","MODEL · THINKING=think-swarm · medium",`RUN=…${RUN.slice(-4)}`]);
 expect(exp.root.querySelectorAll(".trial-dots i.done")).toHaveLength(0);
 expect(exp.root.querySelectorAll(".trial-dots i.now")).toHaveLength(0);
 expect(exp.root.querySelector("think")).toBeNull();
 const presetOnly=new Log();presetOnly.add(0,{...START,evaluation:{preset_id:"checkpoint-clock-set",target:"CLOCK_SET",failure_limit:3,flags}});
 expect(cells(runIdentity(view(presetOnly))).out).toEqual(["PRESET=checkpoint-clock-set","MODEL · THINKING=think-swarm · medium",`RUN=…${RUN.slice(-4)}`]);
 expect(cells(runIdentity(view(fullRun()))).out).toEqual(["MODEL · THINKING=think-swarm · medium",`RUN=…${RUN.slice(-4)}`]);
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

it("links the talk to people card to its tracked explainer, which quotes the exact model text",()=>{
 const log=new Log();log.add(0,{...START,harness_features:["explorer-guidance-v1"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector('[data-feature="explorer-guidance-v1"] a')?.getAttribute("href")).toBe("/explainers/explorer-guidance-v1.html");
 const html=readFileSync(fileURLToPath(new URL("../../../docs/explainers/explorer-guidance-v1.html",import.meta.url)),"utf8");
 expect(html).toContain("explorer-guidance-v1");
 expect(html).toContain("Talk to people: in this game, people tell you where to go next. After each story event, and whenever you are unsure where to go, talk to everyone in the room you are in before you leave, including the families and neighbours of characters you have met. People often say something new once the story has moved on, so talk again to people you spoke to before. A short remark, such as where someone has gone, is a direction to follow, not small talk.");
 expect(html).toContain("Talking is cheap: face the person and press A; the harness reads the conversation until your next decision.");
});

it("links the talk to people v2 card to its tracked explainer, which quotes v1 and the exact v2 model text",()=>{
 expect(FEATURE_EXPLAINERS["explorer-guidance-v2"]).toBe("explorer-guidance-v2.html");
 const log=new Log();log.add(0,{...START,harness_features:["explorer-guidance-v2"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector('[data-feature="explorer-guidance-v2"] a')?.getAttribute("href")).toBe("/explainers/explorer-guidance-v2.html");
 const html=readFileSync(fileURLToPath(new URL("../../../docs/explainers/explorer-guidance-v2.html",import.meta.url)),"utf8");
 expect(html).toContain("explorer-guidance-v2");
 const text=html.replace(/<\/?mark>/g,"");
 expect(html).toContain("Talk to people: talking to people gives you information about the world and can move the story forward. When you are unsure where to go, or after the story has moved on, talking to the people around you is a good way to learn more. What people tell you is evidence; use it to decide where to go.");
 expect(text).toContain("Talk to people: in this game, people tell you where to go next. After each story event, and whenever you are unsure where to go, talk to everyone in the room you are in before you leave, including the families and neighbours of characters you have met. People often say something new once the story has moved on, so talk again to people you spoke to before. A short remark, such as where someone has gone, is a direction to follow, not small talk.");
 expect(html).toContain("Talking is cheap: face the person and press A; the harness reads the conversation until your next decision.");
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

it("links the battle triage guidance card to its tracked explainer, which quotes the exact model text",()=>{
 expect(FEATURE_EXPLAINERS["battle-triage-guidance-v1"]).toBe("battle-triage-guidance-v1.html");
 const html=readFileSync(fileURLToPath(new URL("../../../docs/explainers/battle-triage-guidance-v1.html",import.meta.url)),"utf8");
 expect(html).toContain("battle-triage-guidance-v1");
 expect(html).toContain("Your TORCHIC has 5/20 HP (below half). This is a wild battle: RUN is allowed (bottom-right of the battle menu).");
 expect(html).toContain("Talking to the nurse at a POKéMON CENTER heals your whole party; so does talking to MOM at home.");
 expect(html).toContain("from FIGHT press RIGHT, then DOWN, then A");
});

it("links the briefing exit facts and untaken exits cards to their tracked explainers, which quote the sh02 text",()=>{
 expect(FEATURE_EXPLAINERS["briefing-exits-v1"]).toBe("briefing-exits-v1.html");
 expect(FEATURE_EXPLAINERS["untaken-exits-v1"]).toBe("untaken-exits-v1.html");
 const brief=readFileSync(fileURLToPath(new URL("../../../docs/explainers/briefing-exits-v1.html",import.meta.url)),"utf8");
 expect(brief).toContain("briefing-exits-v1");
 expect(brief).toContain("Warp to PROF. BIRCH'S HOUSE 2F (map 1/3) at 2,2");
 const rooms=readFileSync(fileURLToPath(new URL("../../../docs/explainers/untaken-exits-v1.html",import.meta.url)),"utf8");
 expect(rooms).toContain("untaken-exits-v1");
 expect(rooms).toContain("Exits here you have not taken: (2,2) -&gt; PROF. BIRCH'S HOUSE 2F (map 1/3)");
 const log=new Log();log.add(0,{...START,harness_features:["briefing-exits-v1","untaken-exits-v1"]});
 const registry=(["briefing-exits-v1","untaken-exits-v1"] as const).map(id=>({id,title:id,description:"d",group:"guard" as const,switchable:true,needs:null}));
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),registry);
 expect(doc.querySelector('[data-feature="briefing-exits-v1"] a')?.getAttribute("href")).toBe("/explainers/briefing-exits-v1.html");
 expect(doc.querySelector('[data-feature="untaken-exits-v1"] a')?.getAttribute("href")).toBe("/explainers/untaken-exits-v1.html");
});

it("links the displayed place names card to its tracked explainer, which shows the real-ROM before and after",()=>{
 expect(FEATURE_EXPLAINERS["displayed-place-names-v1"]).toBe("displayed-place-names-v1.html");
 const html=readFileSync(fileURLToPath(new URL("../../../docs/explainers/displayed-place-names-v1.html",import.meta.url)),"utf8");
 expect(html).toContain("displayed-place-names-v1");
 expect(html).toContain("Mays House Sign at (12,8)");
 expect(html).toContain("Sign text \"PROF. BIRCH'S HOUSE\" at (12,8)");
 expect(html).toContain("Warp to PROF. BIRCH'S HOUSE 1F (map 1/2) at (14,8)");
});

it("links the adjacent tiles card to its tracked explainer, which shows the real-ROM line for the showcase ledge pocket",()=>{
 expect(FEATURE_EXPLAINERS["adjacent-tiles-v1"]).toBe("adjacent-tiles-v1.html");
 const log=new Log();log.add(0,{...START,harness_features:["live-map-v1","adjacent-tiles-v1"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector('[data-feature="adjacent-tiles-v1"] a')?.getAttribute("href")).toBe("/explainers/adjacent-tiles-v1.html");
 const html=readFileSync(fileURLToPath(new URL("../../../docs/explainers/adjacent-tiles-v1.html",import.meta.url)),"utf8");
 expect(html).toContain("adjacent-tiles-v1");
 expect(html).toContain("Next tiles: up (8,6) ledge (v), hops down only, cannot be entered from here; down (8,8) clear (.); left (7,7) clear (.); right (9,7) clear (.)");
});
it("links the disproved-beliefs and same-plan cards to their tracked explainers, which show the run's own ledger and note",()=>{
 expect(FEATURE_EXPLAINERS["disproved-beliefs-v1"]).toBe("disproved-beliefs-v1.html");
 expect(FEATURE_EXPLAINERS["same-plan-breaker-v1"]).toBe("same-plan-breaker-v1.html");
 const log=new Log();log.add(0,{...START,harness_features:["disproved-beliefs-v1","deterministic-loop-guard-v1","same-plan-breaker-v1"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector('[data-feature="disproved-beliefs-v1"] a')?.getAttribute("href")).toBe("/explainers/disproved-beliefs-v1.html");
 expect(doc.querySelector('[data-feature="same-plan-breaker-v1"] a')?.getAttribute("href")).toBe("/explainers/same-plan-breaker-v1.html");
 const ledger=readFileSync(fileURLToPath(new URL("../../../docs/explainers/disproved-beliefs-v1.html",import.meta.url)),"utf8");
 expect(ledger).toContain("disproved-beliefs-v1");
 expect(ledger).toContain("Moving UP from (11,1) in LITTLEROOT TOWN (map 0/9): you tried it 3 times, at turns 142, 144, 146 (latest: press UP).");
 const plan=readFileSync(fileURLToPath(new URL("../../../docs/explainers/same-plan-breaker-v1.html",import.meta.url)),"utf8");
 expect(plan).toContain("same-plan-breaker-v1");
 expect(plan).toContain("SUPERVISOR: Your last 3 plans (turns 262, 263, 264) were the same and the game state did not change:");
});
it("links the three navigation-guidance cards to their tracked explainers",()=>{
 const cases:readonly(readonly[string,readonly string[]])[]=[
  ["offscreen-objects-v1",["MAY at 10,3 (out of view; where the map places this character, it may have moved)","546"]],
  ["navigate-first-prompt-v1",["Reminder: to walk two or more tiles, call navigate_to with the destination; it finds the route for you.","# Tools"]],
  ["presence-penalty-v1",["presence_penalty","1.5"]],
  ["navigation-truth-v1",["it is not listed as something you can talk to or use, so navigate_to offers no tile to talk to it from","RENDER_STATE_SCROLL_START","TryRunCoordEventScript"]],
  ["navigation-refusal-reasons-v2",["no route to (6,4) lies inside the 15x15 local map navigate_to plans over","(14,9) on the east edge"]],
 ];
 for(const [id,quotes] of cases){
  expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
  const log=new Log();log.add(0,{...START,harness_features:["live-map-v1","live-object-sprites-v1","bounded-navigation-v1",id]});
  const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
  expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
  const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
  expect(html).toContain(id);
  for(const quote of quotes)expect(html).toContain(quote);
 }
});
it("links the three readout-truth cards to their tracked explainers, which quote the real-ROM lines",()=>{
 const cases:readonly(readonly[string,readonly string[]])[]=[
  ["readout-truth-v1",["Field-message text: none (no message box is open).","Field-message phase: no message is open; a script is running (movement_wait).","Menu: none open","0x080AF661","ON in both arms"]],
  ["birch-speech-pages-v1",["Interface: birch_speech_page; input ready; value Ah, okay!; A or B shows the next page (the value is the page on screen)","0x0803133D"]],
  ["blackout-readout-v1",["Whiting out: your party has no usable Pokémon left; the game is taking you back to the last place you healed.","CB2_WhiteOut","0x08085F59"]],
 ];
 for(const [id,quotes] of cases){
  expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
  const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
  const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
  expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
  const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
  expect(html).toContain(id);
  for(const quote of quotes)expect(html).toContain(quote);
 }
});
it("links the Surf-gated exits card to its tracked explainer, which quotes the 4caa lines before and after",()=>{
 const id="surf-gated-exits-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 for(const quote of [id,"bundle arm only","pending experiment","FLAG_BADGE05_GET","PartyHasMonWithSurf","Exits here you have not taken: none (you have taken every exit you can walk to on this map this run)","Warp destination at (45,6): ALTERING CAVE (not an exit you can use now: across water, needs Surf)"])expect(html).toContain(quote);
 expect(html).not.toContain("both arms");
});
it("links the Exit reachability card to its tracked explainer, which quotes the 0e05 and 4198 lines before and after",()=>{
 const id="exit-reachability-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 for(const quote of [id,"bundle arm only","pending experiment","call navigate_to again to continue to (12,0)","(12,0) cannot be reached on foot from where you stand","walk to (9,6) on its west edge first, then call navigate_to (10,3) again","546 tiles"])expect(html).toContain(quote);
 expect(html).not.toContain("both arms");
});
it("links the Harness trust card to its tracked explainer, which quotes the recorded header, the trust order and the walk-away note",()=>{
 const id="harness-trust-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","dialogue-auto-advance-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 for(const quote of [id,"bundle arm only","pending experiment","Read from game memory, always true:","Story goal: &quot;Well, it&#39;s time to head back to the LAB.&quot; (MAY, turn 272) -&gt; &quot;LAB&quot; = PROF. BIRCH&#39;S POKéMON LAB (map 1/4). Way in: door in LITTLEROOT TOWN (map 0/9) at (7,16).","3. Never your memory of Pokémon games, guides or walkthroughs.","Exits you can walk to from where you stand: SOUTH edge -&gt; OLDALE TOWN (map 0/10).","went from 8 to 11 tiles away, counting tiles across and down"])expect(html).toContain(quote);
 expect(html).not.toContain("both arms");
});
it("links the harness-trust-v2 card to the Harness trust explainer, which has its section",()=>{
 expect(FEATURE_EXPLAINERS["harness-trust-v2"]).toBe("harness-trust-v1.html");
 const html=readFileSync(fileURLToPath(new URL("../../../docs/explainers/harness-trust-v1.html",import.meta.url)),"utf8");
 for(const quote of ["harness-trust-v2","battle_action","never counts as one of the player's own moves"])expect(html).toContain(quote);
});
it("links the Cited destination card to its tracked explainer, which quotes the schema, the found case and the not-found line",()=>{
 const id="cited-destination-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","bounded-navigation-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 for(const quote of [id,"bundle arm only","pending experiment","&quot;required&quot;: [&quot;x&quot;, &quot;y&quot;, &quot;map_id&quot;, &quot;because&quot;]","is not in anything the game has shown you this run (results, readouts and dialogue). navigate_to walked anyway","destination_citation"])expect(html).toContain(quote);
 expect(html).not.toContain("both arms");
});
it("links the No exit here card to its tracked explainer, which quotes the recorded lines and the game grounding",()=>{
 const id="no-exit-here-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","world-destinations-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 for(const quote of [id,"bundle arm only","pending experiment","There is no way off OLDALE TOWN to the east; the ways off this map are: NORTH edge -&gt; ROUTE103 (map 0/18)","There is no way off ROUTE103 to the north;","MapGridGetCollisionAt","PlayerNotOnBikeCollide","GetCollisionAtCoords","MAPGRID_UNDEFINED","InitMapLayoutData"])expect(html).toContain(quote);
 // Review round 2: the step lands in the padded layout's undefined cells, not on the border block.
 expect(html).not.toContain("border block");
 expect(html).not.toContain("both arms");
});
it("links the cross-map goal card to its tracked explainer, which quotes the recorded 4caa result and the new refusal",()=>{
 expect(FEATURE_EXPLAINERS["cross-map-goal-v1"]).toBe("cross-map-goal-v1.html");
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","cross-map-goal-v1"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector('[data-feature="cross-map-goal-v1"] a')?.getAttribute("href")).toBe("/explainers/cross-map-goal-v1.html");
 const html=readFileSync(fileURLToPath(new URL("../../../docs/explainers/cross-map-goal-v1.html",import.meta.url)),"utf8");
 for(const quote of ["cross-map-goal-v1","Navigation: map changed; inspect destination; 0 ordinary button attempts.","(8,0) on map 0/9 is on another map; you are on map 0/16 (ROUTE101) and navigate_to only walks within the current map","bundle arm"])expect(html).toContain(quote);
});
it("links the people ID cards card to its tracked explainer, which quotes the recorded 4caa T211 card and the prompt line",()=>{
 expect(FEATURE_EXPLAINERS["people-id-cards-v1"]).toBe("people-id-cards-v1.html");
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","people-ledger-v1","people-id-cards-v1"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector('[data-feature="people-id-cards-v1"] a')?.getAttribute("href")).toBe("/explainers/people-id-cards-v1.html");
 const html=readFileSync(fileURLToPath(new URL("../../../docs/explainers/people-id-cards-v1.html",import.meta.url)),"utf8");
 for(const quote of ["people-id-cards-v1","ID card: MAY (sprite RIVAL_MAY_NORMAL), map object 2, at 10,3 on ROUTE103 (map 0/18)","- Name: MAY. The game first showed this name on turn 107.","consider who this person is to you and where they fit in the story so far","38 cards"])expect(html).toContain(quote);
});
it("links the coherent transition readouts card to its tracked explainer, which quotes the cook runs' battle-start readouts before and after",()=>{
 expect(FEATURE_EXPLAINERS["transition-coherence-v1"]).toBe("transition-coherence-v1.html");
 const log=new Log();log.add(0,{...START,harness_features:["transition-coherence-v1"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector('[data-feature="transition-coherence-v1"] a')?.getAttribute("href")).toBe("/explainers/transition-coherence-v1.html");
 const html=readFileSync(fileURLToPath(new URL("../../../docs/explainers/transition-coherence-v1.html",import.meta.url)),"utf8");
 expect(html).toContain("transition-coherence-v1");
 expect(html).toContain("Battle details: TRAINER single · turn 3 · finishing (outcome won)");
 expect(html).toContain("STATE COVERAGE ERROR: harness bug: invalid battle positions");
 expect(html).toContain("Battle state: initializing; input False; turn None; outcome None");
 expect(html).toContain("0x080008AC");
});
it("links the readout rules card to its tracked explainer, which shows the real-ROM readout and the prompt section",()=>{
 expect(FEATURE_EXPLAINERS["readout-rules-in-prompt-v1"]).toBe("readout-rules-in-prompt-v1.html");
 const html=readFileSync(fileURLToPath(new URL("../../../docs/explainers/readout-rules-in-prompt-v1.html",import.meta.url)),"utf8");
 expect(html).toContain("readout-rules-in-prompt-v1");
 expect(html).toContain("Map symbols and rules: see the system prompt.");
 expect(html).toContain("Map symbols and rules (the readout&#39;s map and lists use these every turn; the readout does not repeat them):");
 expect(html).toContain("4,040");
 expect(html).toContain("3,196");
});

it("links the Route 103 rival measurement card to its explainer in Harness Config",()=>{
 const log=new Log();log.add(0,{...START,harness_features:["route103-rival-splits-v1"]});
 const registry=(["route103-rival-splits-v1"] as const).map(id=>({id,title:"ROUTE 103 RIVAL",description:"d",group:"measurement" as const,switchable:false,needs:null}));
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),registry);
 expect(doc.querySelector('[data-feature="route103-rival-splits-v1"] a')?.getAttribute("href")).toBe("/explainers/route103-rival-splits-v1.html");
});

it("links the battle message waiting card to its tracked explainer, which quotes the cook run's WINGULL readout before and after",()=>{
 expect(FEATURE_EXPLAINERS["battle-message-waiting-v1"]).toBe("battle-message-waiting-v1.html");
 const log=new Log();log.add(0,{...START,harness_features:["battle-message-waiting-v1"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector('[data-feature="battle-message-waiting-v1"] a')?.getAttribute("href")).toBe("/explainers/battle-message-waiting-v1.html");
 const html=readFileSync(fileURLToPath(new URL("../../../docs/explainers/battle-message-waiting-v1.html",import.meta.url)),"utf8");
 expect(html).toContain("battle-message-waiting-v1");
 expect(html).toContain("Battle details: WILD single · turn 3 · resolving (no input until the game asks)");
 expect(html).toContain("Battle details: WILD single · turn 3 · battle message waiting: &quot;Wild WINGULL fainted!&quot; — press A or B to continue");
});

it("links the level-up stats box card to its tracked explainer, which quotes the T357 readout before and after",()=>{
 expect(FEATURE_EXPLAINERS["levelup-box-v1"]).toBe("levelup-box-v1.html");
 const log=new Log();log.add(0,{...START,harness_features:["levelup-box-v1"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector('[data-feature="levelup-box-v1"] a')?.getAttribute("href")).toBe("/explainers/levelup-box-v1.html");
 const html=readFileSync(fileURLToPath(new URL("../../../docs/explainers/levelup-box-v1.html",import.meta.url)),"utf8");
 expect(html).toContain("levelup-box-v1");
 expect(html).toContain("Battle details: WILD single · turn 6 · resolving (no input until the game asks)");
 expect(html).toContain("Battle details: WILD single · turn 6 · level-up stats box open, page 1 of 2 (stat increases): MAX. HP +2, ATTACK +2, DEFENSE +1, SP. ATK +1, SP. DEF +1, SPEED +1 — waiting for a button: press A or B to continue (the game takes any new button press)");
});

it("links the script line presence card to its tracked explainer, which shows the T259 pages off and on",()=>{
 expect(FEATURE_EXPLAINERS["script-line-presence-v1"]).toBe("script-line-presence-v1.html");
 const log=new Log();log.add(0,{...START,harness_features:["dialogue-auto-advance-v1","script-line-presence-v1"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector('[data-feature="script-line-presence-v1"] a')?.getAttribute("href")).toBe("/explainers/script-line-presence-v1.html");
 const html=readFileSync(fileURLToPath(new URL("../../../docs/explainers/script-line-presence-v1.html",import.meta.url)),"utf8");
 expect(html).toContain("script-line-presence-v1");
 expect(html).toContain("1. turn 259 · ROUTE101 (map 0/16) · at 11,19: \"H-help me!\"");
 expect(html).toContain("(no speaker shown by the game; on screen: PROF. BIRCH (sprite PROF_BIRCH) at 4,13; ZIGZAGOON_1 at 5,13; BIRCHS_BAG at 7,14)");
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

it("links the blocked exit, battle loss recap, briefing battle outcomes and trainer opponent cards to their tracked explainers",()=>{
 const cases:readonly(readonly[string,string,readonly string[]])[]=[
  ["blocked-exit-fact-v1","blocked-exit-fact-v1.html",["Blocked exit: WEST -&gt; ROUTE102 (map 0/17). When you last tried it, at turn 247","0x081E903F"]],
  ["battle-loss-recap-v1","battle-loss-recap-v1.html",["Battle recap: you lost to MAY (trainer 535) on ROUTE103 (map 0/18) at turn 371 and whited out"]],
  ["briefing-battle-outcomes-v1","briefing-battle-outcomes-v1.html",["- Latest battle against a story character: you lost to MAY (trainer 535) on ROUTE103 (map 0/18) at turn 371"]],
  ["trainer-opponent-v1","briefing-battle-outcomes-v1.html",["0x08310030","gTrainerBattleOpponent_A"]],
 ];
 // Each tracked explainer is read once, before the rows (review round 3).
 const pages=new Map([...new Set(cases.map(c=>c[1]))].map(file=>[file,readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${file}`,import.meta.url)),"utf8")]));
 for(const [id,file,quotes] of cases){
  expect(FEATURE_EXPLAINERS[id]).toBe(file);
  const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","coordinate-script-conditions-v1",id]});
  const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
  expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${file}`);
  const html=pages.get(file)??"";
  expect(html).toContain(id);
  for(const quote of quotes)expect(html).toContain(quote);
 }
});

it("links the story destinations card to its tracked explainer, which quotes the recorded T273 block",()=>{
 const id="story-destinations-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","dialogue-auto-advance-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain("- \"LAB\" = PROF. BIRCH'S POKéMON LAB (map 1/4). Way in: door in LITTLEROOT TOWN (map 0/9) at (7,16).");
});

it("links the heal before trainers card to its tracked explainer, which quotes the e046 paragraph",()=>{
 const id="heal-before-trainers-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","low-hp-trainer-warning-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain("SUPERVISOR: A trainer you have not beaten is on this map: object 3, sprite LASS, at (31,24).");
});

it("links the heal before trainers v2 card to its tracked explainer, which quotes the b300 gym paragraph",()=>{
 const id="heal-before-trainers-v2";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","low-hp-trainer-warning-v1","heal-before-trainers-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain("SUPERVISOR: A trainer you have not beaten is on this map: the Gym Leader ROXANNE, object 1, sprite ROXANNE, at (5,2) (not loaded now: the tile the map places it on).");
});

it("links the gym heal warning card to its tracked explainer, which quotes the b300 RUSTBORO CITY paragraph",()=>{
 const id="gym-heal-warning-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","low-hp-trainer-warning-v1","heal-before-trainers-v1","heal-before-trainers-v2",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain("SUPERVISOR: An exit on this map at (27,19) leads to RUSTBORO CITY GYM (map 11/3), and your party is not at full HP: TORCHIC 25/33.");
});

it("links the clock view loop card to its tracked explainer, which quotes the bedroom clock",()=>{
 const id="clock-view-loop-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","deterministic-loop-guard-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain("Clock transition; selection input is not active");
 expect(html).toContain("A or B closes clock");
 expect(html).toContain("2026-10-17T21-38-43_qwen36-gpu1_c18f");
});

it("links the loop guard screen card to its tracked explainer, which quotes the clock controls",()=>{
 const id="loop-guard-screen-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","loop-guard-supervisor-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain("LEFT/RIGHT changes time; A opens confirmation");
 expect(html).toContain("2026-10-18T01-30-48_qwen36-gpu1_cdb1");
});

it("links the faced interaction history card to its tracked explainer, which shows the TV contradiction",()=>{
 const id="faced-interaction-history-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","briefing-exits-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain("2026-10-18T01-30-48_qwen36-gpu1_cdb1");
 expect(html).toContain("faced_target");
 expect(html).toContain("television at (4,1)");
});

it("links the reopened dialogue loop card to its tracked explainer, which quotes the truck box",()=>{
 const id="reopened-dialogue-loop-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","deterministic-loop-guard-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain("<title>Reopened dialogue loop</title>");
 expect(html).toContain("The box is printed with a POKéMON logo.");
 expect(html).toContain("2026-10-18T01-30-48_qwen36-gpu0_e6ce");
});

it("links the dialogue button card to its tracked explainer, which names B as the button for a message",()=>{
 const id="dialog-button-b-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain("<title>Dialogue button B</title>");
 expect(html).toContain("B is the button for a message.");
});

it("links the stale story goal card to its tracked explainer, which quotes the retired line",()=>{
 const id="stale-story-goal-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain("Done: Pokédex received. This is not where to go.");
 expect(html).toContain("is done: Pokédex received. It is not where to go.");
 expect(html).toContain("bundle arm only");
});

it("links the stage-bound story goal card to its tracked explainer, which shows omission instead of none",()=>{
 const id="stale-story-goal-v2";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","stale-story-goal-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain("<title>Stage-bound story goal</title>");
 expect(html).toContain("Story goal: none");
 expect(html).toContain("omitted");
});

it("links the battle menu loop card to its tracked explainer, which quotes the menu sentence",()=>{
 const id="battle-menu-loop-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","deterministic-loop-guard-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain("LEFT from POKéMON does not move");
});

it("links the heal before trainers BAG items card to its tracked explainer, which quotes the e046 sentence",()=>{
 const id="bag-healing-items-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","low-hp-trainer-warning-v1","heal-before-trainers-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain("Your BAG has POTION ×1 (&quot;Restores the HP of a POKéMON by 20 points.&quot;).");
});

it("links the input cuts card to its tracked explainer, which quotes the hidden ledger line",()=>{
 const id="input-cuts-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain("this result's dialogue list");
});

it("links the battle action tool card to its tracked explainer, which quotes the tool's recorded-state result",()=>{
 const id="battle-move-tool-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain("Battle action: chose FIGHT, then EMBER; buttons pressed:\nA, RIGHT, DOWN, A; the battle is running its own text\nor animation.");
});

it.each([
 ["tutorial-party-owner-v1",["LoadWallyZigzagoon","Party (tutorial): ZIGZAGOON Lv7 HP 23/23 · moves TACKLE PP 35 · nickname ZIGZAGOON","malformed /pokebench/observation payload"]],
 ["mid-frame-readout-v1",["WaitForVBlank","Save-backed world state (player, location, party) not read in this snapshot: the game was in the middle of a frame. Observe again to read it."]],
 ["unset-dynamic-warp-v1",["setdynamicwarp MAP_LITTLEROOT_TOWN, 3, 10","Warp destination at (4,1): dynamic destination","PETALBURG CITY (dynamic warp; map 0/0)"]],
 ["status-names-v1",["GetAilmentFromStatus","gText_Psn","STATUS PSN","STATUS 8"]],
 ["surf-gated-exits-v2",["GetInteractedWaterScript","FLAG_BADGE05_GET","PartyHasMonWithSurf","crosses water you cannot cross yet"]],
 ["respawn-readout-v1",["lastHealLocation","setrespawn","DoWhiteOut","If your party faints, you wake up at your house in LITTLEROOT TOWN (9 map changes from here) and lose half your money (₽3222 of ₽6444).","This town has a POKéMON CENTER you have not entered: RUSTBORO CITY POKEMON CENTER 1F at (16,38)."]],
] as const)("links the %s card to its tracked explainer, which quotes the recorded lines and the game source",(id,quotes)=>{
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 for(const quote of [id,"bundle arm only","pending experiment",...quotes])expect(html).toContain(quote);
 expect(html).not.toContain("both arms");
});

it("links the conversation ledger card to its tracked explainer, which quotes the recorded e962 T450 block",()=>{
 const id="instruction-ledger-v2";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","dialogue-auto-advance-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain("- ROUTE103 (map 0/18), here turn 446: last heard turn 444, MAY: &quot;Well, it&#39;s time to head back to the LAB.&quot;");
});

it("links automatic running to its deterministic harness-owned contract",()=>{
 const id="automatic-running-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 for(const text of [id,"running is a harness decision, not a model choice","PlayerNotOnBikeStep","IsRunningDisallowed","experiment remains pending"])expect(html).toContain(text);
});


it("links stable JIT v2's native feature card to its tracked guide and receipt contract",()=>{
 const id="just-in-time-prompt-v2";
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain("projected_guidance");expect(html).toContain("canonical_history_json");
});

it("links the semantic battle refusal switch to its tracked mechanism",()=>{
 const id="battle-refusal-loop-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 for(const text of [id,"no button press","paired native battle","Default OFF"])expect(html).toContain(text);
});

it("links battle decision readiness from its recorded feature card",()=>{
 const id="battle-decision-ready-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
});

it("links every recovery treatment to its tracked explainer",()=>{
 for(const id of ["ineffective-navigation-v2","supervisor-briefing-v2","reachable-story-guidance-v1","text-only-supervisor-v2"]){expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);expect(readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8")).toContain(id);}
});


it("links the safe navigation stride card to its native corridor contract",()=>{
 const id="safe-navigation-strides-v1";
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 for(const text of ["eight tiles","224-frame ceiling","Bundle ON","Control OFF","General default OFF","script coordinate","model chooses"])expect(html).toContain(text);
});

it("links the explicit evolution feature to its tracked explainer",()=>{
 expect(FEATURE_EXPLAINERS["evolution-decision-v1"]).toBe("evolution-decision-v1.html");
 const html=readFileSync(fileURLToPath(new URL("../../../docs/explainers/evolution-decision-v1.html",import.meta.url)),"utf8");
 expect(html).toContain("<h1>Explicit evolution decision</h1>");
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","evolution-decision-v1"]});const rendered=harnessConfig(view(log),FEATURES);
 expect(rendered).toContain('/explainers/evolution-decision-v1.html');
});



it("links the observed instruction memory card to its tracked explainer, which shows omission instead of none",()=>{
 const id="observed-instructions-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","stale-story-goal-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain("<title>Observed instruction memory</title>");
 expect(html).toContain("observed_instruction_episodes:");
 expect(html).toContain("observed_progress:");
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
 const doc=new Window().document;doc.body.innerHTML=trainerCard(current,END)+harnessConfig(current,FEATURES);
 expect(doc.body.textContent).toContain("party_item_message");
 expect(doc.body.textContent).toContain("A/B: CONTINUE");
 expect(Array.from(doc.querySelectorAll("dt")).find(dt=>dt.textContent==="INPUT")?.nextElementSibling.textContent).toBe("ready");
 expect(doc.querySelector('[data-feature="party-item-confirmation-v1"] a')?.getAttribute("href")).toBe("/explainers/party-item-confirmation-v1.html");
});

it("links the YES/NO answer readout from its recorded feature card",()=>{
 const id="yes-no-answer-readout-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const card=doc.querySelector(`[data-feature="${id}"]`);
 expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 expect(card?.textContent).toContain("ON");
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain("To answer YES, press UP, then A. Pressing A now answers NO.");
});

it("links each move-learn switch from its recorded feature card",()=>{
 for(const id of ["move-learn-settle-v1","move-learn-question-v1","move-learn-comparison-v1","effectiveness-heard-v1","game-said-goals-v1"]){
  expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
  const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","battle-text-auto-advance-v1",id]});
  const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
  const card=doc.querySelector(`[data-feature="${id}"]`);
  expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
  expect(card?.textContent).toContain("ON");
  const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
  expect(html).toContain(id);
 }
});

it("links the mart stock readout from its recorded feature card",()=>{
 const id="mart-stock-readout-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const card=doc.querySelector(`[data-feature="${id}"]`);
 expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 expect(card?.textContent).toContain("ON");
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain('3 SUPER POTION ¥700 — "Restores the HP of a POKéMON by 50 points."');
});

it("links the shop interface from its recorded feature card",()=>{
 const id="shop-interface-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const card=doc.querySelector(`[data-feature="${id}"]`);
 expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 expect(card?.textContent).toContain("ON");
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain('Interface: shop_purchase_message; input ready; A or B continues');
});

it("links the birch intro pages from its recorded feature card",()=>{
 const id="birch-intro-pages-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const card=doc.querySelector(`[data-feature="${id}"]`);
 expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 expect(card?.textContent).toContain("ON");
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain("Interface: birch_intro_page; input ready; value Hi! Sorry to keep you waiting!; A or B shows the next page (the value is the page on screen)");
});

it("links each training and catching switch from its recorded feature card",()=>{
 const ids=["exp-next-level-v1","pokedex-own-v1","exp-earned-ledger-v1","leader-attempt-ledger-v1","seen-trainers-ledger-v1","party-coverage-v1","said-type-matches-v1"];
 for(const id of ids){
  expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
  const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
  const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
  const card=doc.querySelector(`[data-feature="${id}"]`);
  expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
  expect(card?.textContent).toContain("ON");
  const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
  expect(html).toContain(`<code>${id}</code>`);
 }
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
 for(const id of ["navigation-tool-use-guard-v1","semantic-current-map-feedback-v1"] as const){
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

it("links the caught Pokédex input to its explainer without changing feature status",()=>{
 const log=new Log();log.add(0,{...START,harness_features:["caught-dex-input-v1"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const card=doc.querySelector('[data-feature="caught-dex-input-v1"]');
 expect(card?.querySelector("a")?.getAttribute("href")).toBe("/explainers/caught-dex-input-v1.html");expect(card?.textContent).toContain("ON");
});

it("links each GLM-run harness bug switch to its tracked explainer without changing feature status",()=>{
 for(const id of ["story-goal-player-name-v1","cut-off-reply-feedback-v1","trainer-sight-check-v2","auto-talk-v2","map-wide-triggers-v1","drought-battle-heal-hold-v1","milestone-drought-suppression-v1"]){
  expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
  expect(existsSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)))).toBe(true);
  const on=new Log();on.add(0,{...START,harness_features:["ram-state-v1",id]});
  const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(on),FEATURES);
  const card=doc.querySelector(`[data-feature="${id}"]`);
  expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
  expect(card?.querySelector(".config-badge")?.textContent).toBe("ON");
  const off=new Log();off.add(0,{...START,harness_features:["ram-state-v1"]});
  doc.body.innerHTML=harnessConfig(view(off),FEATURES);
  const offCard=doc.querySelector(`[data-feature="${id}"]`);
  expect(offCard?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
  expect(offCard?.querySelector(".config-badge")?.textContent).toBe("NOT RECORDED");
 }
});

it("links each interface-ownership switch to its tracked explainer without changing feature status",()=>{
 for(const id of ["move-learn-offer-identity-v1","move-learn-goal-reminder-v1","tool-prompt-docs-v1","field-ownership-feedback-v1","move-learn-loop-fingerprint-v1","stale-plan-fact-v1","post-battle-readout-v1","move-learn-tool-v1","move-learn-early-comparison-v1"]){
  expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
  expect(existsSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)))).toBe(true);
  const on=new Log();on.add(0,{...START,harness_features:["ram-state-v1",id]});
  const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(on),FEATURES);
  const card=doc.querySelector(`[data-feature="${id}"]`);
  expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
  expect(card?.querySelector(".config-badge")?.textContent).toBe("ON");
  const off=new Log();off.add(0,{...START,harness_features:["ram-state-v1"]});
  doc.body.innerHTML=harnessConfig(view(off),FEATURES);
  const offCard=doc.querySelector(`[data-feature="${id}"]`);
  expect(offCard?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
  expect(offCard?.querySelector(".config-badge")?.textContent).toBe("NOT RECORDED");
 }
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

it.each(["gym-evidence-v1","rejected-movement-step-v1","observed-field-dialogue-v1"])("links repair explainer %s",id=>{
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=bare();const html=harnessConfig(view(log),FEATURES);expect(html).toContain(`/explainers/${id}.html`);
 expect(readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8")).toContain(id);
});

it("links the script boundary feature card to its tracked explainer",()=>{
 expect(FEATURE_EXPLAINERS["trigger-navigation-boundary-v1"]).toBe("trigger-navigation-boundary-v1.html");
 expect(readFileSync(fileURLToPath(new URL("../../../docs/explainers/trigger-navigation-boundary-v1.html",import.meta.url)),"utf8")).toContain("Let the game run its scripts");
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

it("links menu and factual healing guidance to the tracked explainers",()=>{
 for(const id of ["menu-item-guidance-v1","factual-healing-guidance-v1"]){
  expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
  const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
  const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
  const card=doc.querySelector(`[data-feature="${id}"]`);
  expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
  expect(card?.textContent).toContain("ON");
  expect(readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8")).toContain(id);
 }
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

it("links the rejected movement prefix switch to its tracked explainer",()=>{
 const id="rejected-movement-prefix-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const card=doc.querySelector(`[data-feature="${id}"]`);
 expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 expect(card?.textContent).toContain("ON");
 expect(readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8")).toContain(id);
});

it("links the coherent battle observation from its recorded feature card",()=>{
 const id="coherent-battle-observation-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const card=doc.querySelector(`[data-feature="${id}"]`);
 expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 expect(card?.textContent).toContain("ON");
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain(id);
 expect(html).toContain("60 emulated frames");
});

it("links the map-cycle recovery switch to its tracked explainer",()=>{
 const id="map-cycle-recovery-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["ram-state-v1","navigation-recovery-v1",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 const card=doc.querySelector(`[data-feature="${id}"]`);
 expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 expect(card?.textContent).toContain("ON");
 expect(readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8")).toContain(id);
});
it("links the campaign reminder card to its qualified-continuation explainer",()=>{
 const id="roxanne-campaign-reminder-v1";
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["probe",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 expect(readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8")).toContain("restored history");
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

it("links the observed trainer Pokémon switch to its explainer",()=>{
 const id="trainer-observed-party-v1";
 const log=new Log();log.add(0,{...START,harness_features:["probe",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 expect(readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8")).toContain("Observed trainer Pokémon");
});

it.each(["leader-loss-immediate-v1","battle-action-history-v1","leader-preparation-comparison-v1"])("links factual battle history card %s to its tracked explainer",id=>{
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const log=new Log();log.add(0,{...START,harness_features:["probe",id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 expect(readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8")).toContain(id);
});

it("links the refusal-ledger card to its factual tracked explainer",()=>{
 const id="refusal-ledger-v1";
 const log=new Log();log.add(0,{...START,harness_features:[id]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
 expect(doc.querySelector(`[data-feature="${id}"] a`)?.getAttribute("href")).toBe(`/explainers/${id}.html`);
 const html=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8");
 expect(html).toContain("Current observations take precedence");
 expect(html).toContain("20519");
});

it("links the nonterminal deterministic guard to its shared supervisor explainer",()=>{
 expect(FEATURE_EXPLAINERS["deterministic-loop-guard-v1"]).toBe("loop-guard-supervisor-v1.html");
 const log=new Log();log.add(0,{...START,harness_features:["deterministic-loop-guard-v1"]});
 const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log));
 expect(doc.querySelector('[data-feature="deterministic-loop-guard-v1"] a')?.getAttribute("href")).toBe("/explainers/loop-guard-supervisor-v1.html");
});

it("links player elevation to its exact tracked explainer without inventing historical activation",()=>{
 const id="player-elevation-readout-v1";
 for(const enabled of [true,false]) {
  const log=new Log();log.add(0,{...START,harness_features:enabled?["probe",id]:["probe"]});
  const doc=new Window().document;doc.body.innerHTML=harnessConfig(view(log),FEATURES);
  const card=doc.querySelector(`[data-feature="${id}"]`);
  expect(card?.querySelector("a")?.getAttribute("href")).toBe(`/explainers/${id}.html`);
  expect(card?.textContent).toContain(enabled?"ON":"NOT RECORDED");
 }
 expect(readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)),"utf8")).toContain("tile that accepts any elevation (15)");
});
