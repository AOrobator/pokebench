// Compatibility belongs to presentation. Original recordings still use the strict event validator.
import {checkEvent,eventEnvelope,RunEventSchema,type EventEnvelope,type RunEvent} from "@pokebench/agent/events";
import {Value} from "typebox/value";

export interface UnsupportedDisplayEvent extends Omit<EventEnvelope,"type"> {
  type: "viewer_unsupported";
  originalType: string;
  problem: string;
}
export type DisplayEvent = RunEvent | UnsupportedDisplayEvent;

export function parseDisplayEvent(text: string): DisplayEvent {
  const value: unknown = JSON.parse(text);
  const envelope = eventEnvelope(value);
  if (envelope === null) throw new Error("Invalid display event identity");
  try {
    return checkEvent(value);
  } catch {
    try {
      return checkEvent(Value.Clean(RunEventSchema,structuredClone(value)));
    } catch (error) {
      return {...envelope,type:"viewer_unsupported",originalType:envelope.type,
        problem:(error instanceof Error ? error.message : "Unsupported event body").slice(0,500)};
    }
  }
}
