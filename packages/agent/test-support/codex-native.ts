export const nativeLine = (payload: unknown, type = "response_item") => JSON.stringify({ type, timestamp: "2026-10-25T20:00:00Z", payload }) + "\n";
export const nativeHeader = (summary = "detailed") => nativeLine({ id: "player-session" }, "session_meta") + nativeLine({ model: "test-model", effort: "medium", summary }, "turn_context");
export const nativeAnchor = (key: string, phase: "begin" | "respond", id: string = phase) => nativeLine({ type: "custom_tool_call", name: "exec", call_id: id, input: `node codex-capture-cli.js --capture-key=${key} --capture-phase=${phase}` });
export const nativeSummary = (text: string, id = "reason-1") => nativeLine({ type: "reasoning", id, summary: [{ type: "summary_text", text }], encrypted_content: "opaque" });
