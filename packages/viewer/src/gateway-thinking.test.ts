import { currentFixture } from "../test-support/current.js";
import { expect, it } from "vitest";
import { Log, assistant } from "../test-support/events.js";
import { createGatewayThinking } from "./gateway-thinking.js";
const row = (overrides = {}) => ({ at: "2026-10-11T22:00:03.000-04:00", request: 945, attempt: 1, run_id: new Log().add(0, assistant()).run, mode: "session", model: "m", session_id: "session", outcome: "ok", record: "call-945-1.jsonl", ...overrides });
const transcript = (thinking = "native gateway thinking", reply = "heal first") => JSON.stringify({ type: "assistant", session_id: "session", message: { role: "assistant", content: [{ type: "thinking", thinking }, { type: "text", text: JSON.stringify({ name: "press", arguments: { buttons: ["START"] }, text: reply }) }] } });
function fixture(rows = [row()], text: string | null = transcript()) {
 let reads = 0;
 const reader = createGatewayThinking({ sources: () => Promise.resolve([{ key: "bridge", text: rows.map(r => JSON.stringify(r)).join("\n") }]), transcript: () => { reads++; return Promise.resolve(text); }, now: () => 0 });
 const event = new Log().add(3001, assistant({ thinking: "", text: "heal first", tool_calls: [{ id: "call_945", name: "press", args: { buttons: ["START"] } }] }));
 return { reader, event, reads: () => reads };
}
it("fills empty thinking from the exact session call without changing the recording", async () => {
 const f = fixture();
 expect(await f.reader.event(f.event)).toMatchObject({ thinking: "native gateway thinking" });
 expect(f.event).toMatchObject({ thinking: "" });
 await f.reader.event(f.event); expect(f.reads()).toBe(1);
});
it("keeps native thinking and unrelated events without reading transcripts", async () => {
 const f = fixture(); const native = { ...f.event, thinking: "recorded" };
 expect(await f.reader.event(native)).toBe(native); expect(f.reads()).toBe(0);
});
it.each([
 { run_id: "other" }, { mode: "stateless" }, { outcome: "error" }, { session_id: null }, { record: "../../secret" }, { request: 946 }, { at: "2026-10-11T22:01:03.000-04:00" },
])("refuses a mismatched gateway binding %j", async mismatch => {
 const f = fixture([row(mismatch)]); expect(await f.reader.event(f.event)).toBe(f.event);
});
it("refuses ambiguous calls and missing, malformed, foreign-session or text-only transcripts", async () => {
 for (const text of [null, "broken", transcript(""), transcript("thought", "another reply"), transcript().replaceAll('"session"', '"other"')]) {
  const f = fixture([row()], text); expect(await f.reader.event(f.event)).toBe(f.event);
 }
 const f = fixture([row(), row()]); expect(await f.reader.event(f.event)).toBe(f.event);
});
it("hydrates CURRENT snapshots, update snapshots and history without changing projector checkpoints", async () => {
 const f = fixture(), current = currentFixture();
 current.snapshot.at = Date.parse(row().at) + 1;
 current.snapshot.display.thought = { turn: 1, thinking: "", reply: "heal first", latencyMs: 10 };
 const answer = await f.reader.answer(current.detail);
 expect(answer.kind === "current" && answer.snapshot?.display.thought?.thinking).toBe("native gateway thinking");
 expect(current.snapshot.display.thought.thinking).toBe("");
 const updates = await f.reader.answer({ kind: "updates", version: 1, epoch: "e", cursor: "c", reset: false, more: false, changes: [{ id: current.snapshot.id, removed: false, summary: current.summary, snapshot: current.snapshot }, { id: "gone", removed: true }] });
 expect(updates.kind === "updates" && !updates.changes[0]?.removed && updates.changes[0]?.snapshot?.display.thought?.thinking).toBe("native gateway thinking");
 const history = await f.reader.answer({ kind: "history", version: 1, epoch: "e", generation: "g", state: "ready", events: [f.event], before: null });
 expect(history.kind === "history" && history.events[0]).toMatchObject({ thinking: "native gateway thinking" });
});
it("does not borrow a future or earlier turn's thinking for CURRENT", async () => {
 const f = fixture([row(), row({ at: "2026-10-11T22:00:04.000-04:00", request: 946, record: "call-946-1.jsonl" })]);
 const current = currentFixture(); current.snapshot.display.thought = { turn: 1, thinking: "", reply: "another reply", latencyMs: 10 };
 current.snapshot.at = Date.parse(row().at) - 1;
 expect(await f.reader.answer(current.detail)).toEqual(current.detail);
 current.snapshot.at = Date.parse(row().at) + 1500;
 expect(await f.reader.answer(current.detail)).toEqual(current.detail);
});
it("keeps CURRENT available if gateway discovery or transcript reads fail", async () => {
 const f = fixture();
 for (const ports of [
  { sources: () => Promise.reject(new Error("absent")), transcript: () => Promise.resolve(transcript()), now: () => 0 },
  { sources: () => Promise.resolve([{ key: "bridge", text: JSON.stringify(row()) }]), transcript: () => Promise.reject(new Error("absent")), now: () => 0 },
 ]) expect(await createGatewayThinking(ports).event(f.event)).toBe(f.event);
});
it("retries a late transcript and discovers appended calls after the cache interval", async () => {
 let now=0, rows="broken\n", body:string|null=null, discoveries=0;
 const reader=createGatewayThinking({now:()=>now,sources:()=>{discoveries++;return Promise.resolve([{key:"bridge",text:rows}]);},transcript:()=>Promise.resolve(body)}),event=fixture().event;
 expect(await reader.event(event)).toBe(event);
 rows=JSON.stringify(row());now=5001;
 expect(await reader.event(event)).toBe(event);
 body=transcript();expect(await reader.event(event)).toMatchObject({thinking:"native gateway thinking"});expect(discoveries).toBe(2);
});
