import type { RunEvent } from "@pokebench/agent/events";
import type { RunView } from "../src/model.js";
import { TraceBuilder, type TraceStep } from "../src/trace.js";

// The single agent-trace step an event becomes on its own.
export function stepOf(event: RunEvent, view?: RunView): TraceStep {
  const builder = new TraceBuilder(view === undefined ? undefined : (guard) => view.loopLabel(guard));
  builder.add(event);
  const step = builder.turns[0]?.steps()[0];
  if (step === undefined) throw new Error(`${event.type} is not shown in the trace`);
  return step;
}
