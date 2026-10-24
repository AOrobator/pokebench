// harness-trust-v1's story_goal_away and cited-destination-v1's destination_citation: Activity History rows, trace
// steps, raw-event inspection and no timeline mark (closed to new marks, operator decision 2026-10-16).
import { describe, expect, it } from "vitest";
import type { RunEvent } from "@pokebench/agent/events";
import { BASE_MS, Log, START, must } from "../test-support/events.js";
import { RunView } from "./model.js";
import { lanesSvg } from "./timeline.js";
import { eventText, inspector } from "./panels.js";
import { TraceBuilder, type TraceStep } from "./trace.js";
import { DEFAULT_NEXT_RUN } from "./next-run.js";

function view(log: Log): RunView { const v = new RunView(); for (const e of log.events) v.apply(e); return v; }
function build(events: readonly RunEvent[]): TraceBuilder { const b = new TraceBuilder(); for (const e of events) b.add(e); return b; }
const steps = (b: TraceBuilder): TraceStep[] => b.turns.flatMap((turn) => turn.steps());
const NOTE = "SUPERVISOR: Your last two moves took you farther from PROF. BIRCH'S POKéMON LAB (map 1/4), the place in MAY's line above (turn 272): …";
type Body<K extends RunEvent["type"]> = Omit<Extract<RunEvent, { type: K }>, "v" | "run" | "seq" | "t">;
const AWAY: Body<"story_goal_away"> = { type: "story_goal_away", turn: 275, tool: "navigate_to", speaker: "MAY", line_turn: 272, quote: "Well, it's time to head back to the LAB.", targets: [{ name: "PROF. BIRCH'S POKéMON LAB", map_id: [1, 4] }], steps: [{ measure: "tiles", from_map: [0, 18], to_map: [0, 18], from_name: "ROUTE103", to_name: "ROUTE103", from: { x: 9, y: 13 }, to: { x: 9, y: 10 }, before: 8, after: 11, way: "this map's SOUTH edge (to OLDALE TOWN (map 0/10))" }, { measure: "maps", from_map: [0, 10], to_map: [0, 18], from_name: "OLDALE TOWN", to_name: "ROUTE103", from: { x: 10, y: 0 }, to: { x: 10, y: 21 }, before: 3, after: 4, way: null }], text: NOTE };
const CITE: Body<"destination_citation"> = { type: "destination_citation", turn: 276, tool_call_id: "n1", because: "the LAB is in RUSTBORO CITY", verdict: "not_found", found_turn: null, x: 7, y: 16, map_id: [0, 9], text: "Because: \"the LAB is in RUSTBORO CITY\" is not in anything the game has shown you this run (results, readouts and dialogue). navigate_to walked anyway; nothing the game showed you supports this destination as you quoted it." };

describe("harness-trust-v1 and cited-destination-v1 in the viewer", () => {
  it("both treatments start OFF in the next-run defaults", () => {
    expect(DEFAULT_NEXT_RUN.features["harness-trust-v1"]).toBe(false);
    expect(DEFAULT_NEXT_RUN.features["cited-destination-v1"]).toBe(false);
    expect(DEFAULT_NEXT_RUN.features["harness-trust-v2"]).toBe(false);
  });
  it("the walk-away note is a SUPERVISOR step with the tool, the line, both moves and the whole note", () => {
    const log = new Log(); log.add(0, START); log.add(100, AWAY);
    const step = must(steps(build(log.events)).find((s) => s.kind === "story_goal_away"));
    expect(step.category).toBe("sup");
    expect(step.titleHtml).toContain("Story goal walk-away");
    expect(eventText(must(log.events.at(-1)))).toBe(`Story goal walk-away note added to the navigate_to result · MAY, turn 272 · ROUTE103 (9,13) → (9,10): 8 → 11 tiles; OLDALE TOWN → ROUTE103: 3 → 4 maps · ${NOTE.replaceAll("'", "&#39;")}`);
    expect(inspector(must(log.events.at(-1)))).toContain("story_goal_away");
  });
  it("a citation check is an action step: found quotes name their turn, misses carry the line the model saw", () => {
    const log = new Log(); log.add(0, START); log.add(100, CITE); log.add(200, { ...CITE, turn: 277, tool_call_id: "n2", because: "head back to the LAB", verdict: "found", found_turn: 272, text: null });
    const all = steps(build(log.events)).filter((s) => s.kind === "destination_citation");
    expect(all.map((s) => s.category)).toEqual(["act", "act"]);
    expect(must(all[0]).titleHtml).toContain("Destination citation");
    expect(eventText(must(log.events.at(-2)))).toBe(`navigate_to because not found in anything shown · to (7,16) on map 0/9 · “the LAB is in RUSTBORO CITY” · ${(CITE.text ?? "").replaceAll("\"", "&quot;")}`);
    expect(eventText(must(log.events.at(-1)))).toBe("navigate_to because found in the turn 272 result · to (7,16) on map 0/9 · “head back to the LAB”");
  });
  it("neither event adds anything to the timeline", () => {
    const log = new Log(); log.add(0, START); log.add(1000, AWAY); log.add(1100, CITE);
    const without = new Log(); without.add(0, START);
    expect(lanesSvg(view(log), BASE_MS + 2000)).toBe(lanesSvg(view(without), BASE_MS + 2000));
    expect(view(log).errors).toEqual([]);
  });
});

it("structured citation evidence replays through Activity History, trace and raw inspection without verifying rationale",()=>{
 const quote="You can usually find me in my cottage by the sea near PETALBURG WOODS.";
 const rationale="object 1 is Mr. Briney";
 const text="Destination citation: quotation found in observations from turn 314. This checks the quoted words only; speaker identity, rationale and destination are not verified.";
 const log=new Log();log.add(0,{...START,harness_features:["cited-destination-v1","citation-evidence-v1"]});
 log.add(10,{type:"tool_call",turn:389,id:"structured-cite",name:"navigate_to",args:{x:6,y:4,map_id:[17,0],because:{quote,rationale}}});
 log.add(20,{...CITE,turn:389,tool_call_id:"structured-cite",because:quote,verdict:"found",found_turn:314,x:6,y:4,map_id:[17,0],text});
 const event=must(log.events.at(-1)),call=must(log.events.at(-2));
 expect(eventText(event)).toContain("found in the turn 314 result");
 expect(eventText(event)).toContain(quote);expect(eventText(event)).toContain(text);
 expect(inspector(event)).toContain("destination_citation");expect(inspector(event)).toContain("speaker identity, rationale and destination are not verified.");
 expect(inspector(call)).toContain(rationale);expect(eventText(event)).not.toContain(rationale);
 expect(steps(build(log.events)).filter(s=>s.kind==="destination_citation").map(s=>s.category)).toEqual(["act"]);
 const without=new Log();without.add(0,{...START,harness_features:["cited-destination-v1","citation-evidence-v1"]});without.add(10,{type:"tool_call",turn:389,id:"structured-cite",name:"navigate_to",args:{x:6,y:4,map_id:[17,0],because:{quote,rationale}}});
 expect(lanesSvg(view(log),BASE_MS+30)).toBe(lanesSvg(view(without),BASE_MS+30));
 expect(view(log).errors).toEqual([]);
 expect(DEFAULT_NEXT_RUN.features["citation-evidence-v1"]).toBe(false);
});
