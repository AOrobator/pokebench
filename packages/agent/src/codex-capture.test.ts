import { afterEach, describe, expect, it } from "vitest";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexCapture } from "./codex-capture.js";
import { nativeLine as line, nativeHeader, nativeAnchor, nativeSummary } from "../test-support/codex-native.js";

const owned: string[] = [];
afterEach(() => { for (const path of owned.splice(0)) rmSync(path, { recursive: true, force: true }); });
const key = "a".repeat(32);
function fixture(summary = "detailed") {
  const dir = mkdtempSync(join(tmpdir(), "codex-capture-")); owned.push(dir);
  const source = join(dir, "source.jsonl"); writeFileSync(source, nativeHeader(summary));
  const capture = new CodexCapture({ source, directory: join(dir, "capture"), sessionId: "player-session" });
  return { dir, source, capture };
}

describe("native Codex evidence", () => {
  it("preserves every byte and binds exact summary offsets between explicit tool anchors", () => {
    const { source, capture, dir } = fixture();
    appendFileSync(source, nativeSummary("setup excluded", "setup") + nativeAnchor(key, "begin"));
    const begin = capture.begin(key, "test-model");
    appendFileSync(source, line({ type: "function_call_output", call_id: "begin", output: "observation 🌿" }) + nativeSummary("Use Ember 🌿") + line({ replacement_history: [], message: "compaction retained" }, "compacted") + nativeAnchor(key, "respond"));
    const span = capture.finish(key, "test-model");
    expect(span.begin).toEqual(begin);
    expect(span.summaries.map(s => s.text)).toEqual(["Use Ember 🌿"]);
    expect(span.summaries[0]?.id).toBe("reason-1");
    expect(span.status).toBe("summary_recorded");
    const raw = readFileSync(join(dir, "capture", "native.jsonl"));
    expect(raw).toEqual(readFileSync(source));
    const first = span.summaries[0]; expect(first).toBeDefined();
    if (!first) throw new Error("missing summary source reference");
    expect(raw.subarray(first.start, first.end).toString()).toContain("Use Ember 🌿");
    expect(capture.seal().sha256).toMatch(/^[a-f0-9]{64}$/);
    capture.close();
  });

  it("records empty summaries truthfully and excludes commentary and encrypted content", () => {
    const { source, capture } = fixture();
    appendFileSync(source, nativeAnchor(key, "begin")); capture.begin(key, "test-model");
    appendFileSync(source, line({ type: "function_call_output", call_id: "begin", output: "observation" }) + line({ type: "reasoning", id: "opaque-only", summary: [], encrypted_content: "secret" }) + line({ type: "message", role: "assistant", content: [{ type: "output_text", text: "Do this" }] }) + nativeAnchor(key, "respond"));
    expect(capture.finish(key, "test-model")).toMatchObject({ summaries: [], status: "none_emitted" }); capture.close();
  });

  it.each(["none", "unknown"])("rejects disabled or unknown effective summaries: %s", summary => {
    const { source, capture } = fixture(summary); appendFileSync(source, nativeAnchor(key, "begin"));
    expect(() => capture.begin(key, "test-model")).toThrow(/summary/); capture.close();
  });

  it("rejects source session/model mismatch and ambiguous anchors", () => {
    const { source, capture } = fixture(); appendFileSync(source, nativeAnchor(key, "begin"));
    expect(() => capture.begin(key, "other-model")).toThrow(/model/);
    appendFileSync(source, nativeAnchor(key, "begin", "duplicate"));
    expect(() => capture.begin(key, "test-model")).toThrow(/ambiguous/); capture.close();
    const other = fixture(); writeFileSync(other.source, nativeHeader().replace("player-session", "other-session"));
    expect(() => { other.capture.sync(); }).toThrow(/session/); other.capture.close();
  });

  it("rejects truncation and replacement; never edits the source", () => {
    const { capture, source } = fixture(); capture.sync(); writeFileSync(source, "{}");
    expect(() => { capture.sync(); }).toThrow(/truncated/); expect(readFileSync(source, "utf8")).toBe("{}"); capture.close();
    const other = fixture(); other.capture.sync(); rmSync(other.source); writeFileSync(other.source, nativeHeader());
    expect(() => { other.capture.sync(); }).toThrow(/replaced/); other.capture.close();
  });

  it("archives partial lines without dropping split Unicode, and seals incomplete tails as incomplete", () => {
    const { source, capture, dir } = fixture(); const bytes = Buffer.from(nativeSummary("🌿"));
    const cut = bytes.indexOf(Buffer.from("🌿")) + 1;
    appendFileSync(source, bytes.subarray(0, cut)); capture.sync();
    expect(capture.snapshot().complete).toBe(false);
    appendFileSync(source, bytes.subarray(cut)); capture.sync();
    expect(capture.snapshot().complete).toBe(true);
    expect(readFileSync(join(dir, "capture/native.jsonl"))).toEqual(readFileSync(source)); capture.close();
  });

  it("refuses an existing destination instead of replacing evidence", () => {
    const { capture, dir, source } = fixture();
    expect(() => new CodexCapture({ source, directory: join(dir, "capture"), sessionId: "player-session" })).toThrow(); capture.close();
  });

  it("requires an actual native observation result rather than a timestamp-adjacent summary", () => {
    const { source, capture } = fixture(); appendFileSync(source, nativeAnchor(key, "begin")); capture.begin(key, "test-model");
    appendFileSync(source, nativeSummary("not enough") + nativeAnchor(key, "respond"));
    expect(() => capture.finish(key, "test-model")).toThrow(/observation tool result/); capture.close();
  });

  it("does not qualify spawned player child sessions whose transcripts are not captured", () => {
    const { source, capture } = fixture();
    appendFileSync(source, line({ type: "item_completed", item: { type: "SubAgentActivity", kind: "spawned" } }, "event_msg"));
    expect(() => { capture.sync(); }).toThrow(/child session/); capture.close();
  });

  it("retains raw bytes when a tiny injected parsing bound is exceeded", () => {
    const { dir, source, capture } = fixture(); capture.close();
    const bounded = new CodexCapture({ source, directory: join(dir, "bounded"), sessionId: "player-session", maxLineBytes: 8 });
    expect(() => { bounded.sync(); }).toThrow(/byte bound/);
    expect(readFileSync(join(dir, "bounded/native.jsonl"))).toEqual(readFileSync(source)); bounded.close();
  });

  it("detects earlier in-place changes at final seal and does not claim a verified seal", () => {
    const { source, capture } = fixture(); appendFileSync(source, line({ type: "message", text: "padding ".repeat(20) })); capture.sync();
    writeFileSync(source, readFileSync(source, "utf8").replace("test-model", "fake-model"));
    expect(() => capture.seal()).toThrow(/prefix changed/); capture.close();
  });
});
