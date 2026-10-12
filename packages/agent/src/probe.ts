// Manual probes use the same tools, recorder, frame store and state owner as
// model runs. They are marked in run_start and excluded by the summary owner.
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import { ButtonSchema, type RunEndReason } from "./events.js";
import { observeTool, pressTool } from "./game-tools.js";
import type { RunRecorder } from "./recorder.js";

const Command = Type.Union([
  Type.Object({ action: Type.Literal("observe") }, { additionalProperties: false }),
  Type.Object({ action: Type.Literal("press"), buttons: Type.Array(ButtonSchema, { minItems: 1, maxItems: 8 }) }, { additionalProperties: false }),
  Type.Object({ action: Type.Literal("end") }, { additionalProperties: false }),
]);
export type ProbeCommand = Static<typeof Command>;

export function parseProbeCommand(line: string): ProbeCommand {
  const value: unknown = JSON.parse(line);
  if (!Value.Check(Command, value)) throw new Error("probe command must be observe, press with buttons, or end");
  return value;
}

export async function driveProbe(
  recorder: RunRecorder,
  url: string,
  commands: AsyncIterable<ProbeCommand>,
  fetchFn: typeof fetch = fetch,
): Promise<RunEndReason> {
  const observe = observeTool(url, fetchFn);
  const press = pressTool(url, {
    beforePress: (id, buttons, timing) => { recorder.buttonPress(id, buttons, timing); },
    afterPress: () => recorder.afterPress(),
  }, fetchFn);
  let count = 0;
  async function execute(command: Exclude<ProbeCommand, { action: "end" }>): Promise<void> {
    await recorder.transformContext([]);
    const tool = command.action === "observe" ? observe : press;
    const args = command.action === "press" ? { buttons: command.buttons } : {};
    const id = `probe-${String(++count)}`;
    await recorder.emit({ type: "tool_execution_start", toolCallId: id, toolName: tool.name, args });
    try {
      const result = command.action === "press"
        ? await press.execute(id, { buttons: command.buttons })
        : await observe.execute(id, {});
      await recorder.emit({ type: "tool_execution_end", toolCallId: id, toolName: tool.name, result, isError: false });
      // An observe also records the authoritative state, not just the frame.
      if (command.action === "observe") await recorder.afterPress();
    } catch (error) {
      await recorder.emit({ type: "tool_execution_end", toolCallId: id, toolName: tool.name, result: { content: [{ type: "text", text: String(error) }] }, isError: true });
      throw error;
    }
  }
  await execute({ action: "observe" });
  for await (const command of commands) {
    if (command.action === "end") return "completed";
    await execute(command);
  }
  return "operator_abort";
}
