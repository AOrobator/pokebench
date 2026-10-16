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
  party,
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
    expect(summary).toBe("2 reached · next intro cutscene complete · vs baseline + best");
    expect(table).toContain("Best historical run: record");
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


it("shows creation before name confirmation with recorded baseline and best deltas", () => {
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

it("links the elevation transitions card to its tracked explainer",()=>{
 expect(FEATURE_EXPLAINERS["elevation-transitions-v1"]).toBe("elevation-transitions.html");
});

it("maps game evidence priority to a tracked explainer, like every other mapped card",()=>{
 expect(FEATURE_EXPLAINERS["game-evidence-priority-v1"]).toBe("game-evidence-priority-v1.html");
 for(const file of Object.values(FEATURE_EXPLAINERS))expect(existsSync(fileURLToPath(new URL(`../../../docs/explainers/${file}`,import.meta.url)))).toBe(true);
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
 expect(brand(view(withExperiment))).toBe(`POKéNAV · ${RUN} · EXPERIMENT factorial-2x2-think-fast · ARM both · TRIAL 5/32`);
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
 expect(exp.out).toEqual(["EXPERIMENT=factorial-2x2-<think>","ARM=both","TRIAL=5 of 8","MODEL · THINKING=think-swarm · medium",`RUN=…${RUN.slice(-4)}`]);
 expect(exp.root.querySelectorAll(".trial-dots i.done")).toHaveLength(4);
 expect(exp.root.querySelectorAll(".trial-dots i.now")).toHaveLength(1);
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
  ["navigation-truth-v1",["it has no script, so facing it and pressing A does not talk to it or use it","RENDER_STATE_SCROLL_START","TryRunCoordEventScript"]],
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
