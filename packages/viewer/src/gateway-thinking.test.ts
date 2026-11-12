import { expect, it } from "vitest";
import { Log, assistant } from "../test-support/events.js";
import { createGatewayThinking } from "./gateway-thinking.js";
import { currentFixture } from "../test-support/current.js";
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
