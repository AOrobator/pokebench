import type { RunEvent } from "@pokebench/agent/events";
import { Type } from "typebox";
import { Value } from "typebox/value";
import type { CurrentAnswer, CurrentSnapshot } from "./current-public.js";
export interface GatewayThinkingPorts {
 sources(): Promise<readonly { key: string; text: string }[]>;
 transcript(key: string, record: string): Promise<string | null>;
 assistant(run: string, turn: number): Promise<RunEvent | null>;
 now(): number;
}
const Call = Type.Object({ request: Type.Integer({ minimum: 1 }), attempt: Type.Integer({ minimum: 1 }), run_id: Type.String(), mode: Type.Literal("session"), session_id: Type.String({ minLength: 1 }), outcome: Type.Literal("ok"), record: Type.String({ pattern: "^call-[0-9]+-[0-9]+\\.jsonl$" }) });
const Message = Type.Object({ type: Type.Literal("assistant"), session_id: Type.String(), parent_tool_use_id: Type.Optional(Type.Null()), message: Type.Object({ role: Type.Literal("assistant"), content: Type.Array(Type.Union([Type.Object({ type: Type.Literal("thinking"), thinking: Type.String() }), Type.Object({ type: Type.Literal("text"), text: Type.String() })])) }) });
const Reply = Type.Object({ name: Type.String(), text: Type.Optional(Type.String()) });
const Result = Type.Object({type: Type.Literal("result"),session_id: Type.String(),is_error: Type.Literal(false),result: Type.String()});
function parse(text: string): unknown { try { return JSON.parse(text); } catch { return null; } }
interface Entry { key: string; record: string; session: string; request: number; attempt: number }
export function createGatewayThinking(ports: GatewayThinkingPorts) {
 let expires = -Infinity, pending: Promise<ReadonlyMap<string, Entry[]>> | undefined;
 const assistants = new Map<string, RunEvent>();
 const transcripts = new Map<string, Promise<{ thinking: string; reply: string } | null>>();
 const index = (): Promise<ReadonlyMap<string, Entry[]>> => {
  if (pending !== undefined && ports.now() < expires) return pending;
  expires = ports.now() + 5000;
  pending = ports.sources().then(sources => {
   const runs = new Map<string, Entry[]>();
   for (const source of sources) for (const line of source.text.split("\n")) {
    const row = parse(line);
    if (!Value.Check(Call, row) || row.record !== `call-${String(row.request)}-${String(row.attempt)}.jsonl`) continue;
    const entries = runs.get(row.run_id) ?? [];
    entries.push({ key: source.key, record: row.record, session: row.session_id, request: row.request, attempt: row.attempt }); runs.set(row.run_id, entries);
   }
   return runs;
  }).catch(() => new Map());
  return pending;
 };
 const read = (entry: Entry) => {
  const key = `${entry.key}\0${entry.record}\0${entry.session}`;
  const known = transcripts.get(key); if (known !== undefined) return known;
  const result = ports.transcript(entry.key, entry.record).then(text => {
   if (text === null) return null;
   const thinking: string[] = [], replies: string[] = [];
   for (const line of text.split("\n")) {
    const message = parse(line);
    if (Value.Check(Result, message) && message.session_id === entry.session) {
     const reply = parse(message.result.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, "$1"));
     if (Value.Check(Reply, reply)) replies.push(reply.text ?? "");
    }
    if (!Value.Check(Message, message) || message.session_id !== entry.session) continue;
    for (const part of message.message.content) {
     if (part.type === "thinking") thinking.push(part.thinking);

    }
   }
   return thinking.join("").trim() !== "" && replies.length === 1 ? { thinking: thinking.join(""), reply: replies[0] ?? "" } : null;
  }).catch(() => null);
  if (transcripts.size >= 128) transcripts.delete(transcripts.keys().next().value ?? "");
  transcripts.set(key, result);
  // An archive may still be arriving after calls.jsonl was flushed.
  void result.then(value => { if (value === null && transcripts.get(key) === result) transcripts.delete(key); });
  return result;
 };
 async function lookup(run: string, reply: string, request: number): Promise<string | null> {
  const entries = ((await index()).get(run) ?? []).filter(e => e.request === request);
  const lastAttempt = Math.max(...entries.map(e => e.attempt));
  const matches = entries.filter(e => e.attempt === lastAttempt);
  if (matches.length !== 1) return null;
  const entry = matches[0]; if (entry === undefined) return null;
  const content = await read(entry);
  return content?.reply === reply ? content.thinking : null;
 }
 async function event(event: RunEvent): Promise<RunEvent> {
  if (event.type !== "assistant" || event.thinking.trim() !== "" || event.tool_calls.length !== 1) return event;
  const id = event.tool_calls[0]?.id ?? "";
  if (!/^call_[1-9][0-9]*$/.test(id)) return event;
  const thinking = await lookup(event.run, event.text, Number(id.slice(5)));
  return thinking === null ? event : { ...event, thinking };
 }
 async function snapshot(snapshot: CurrentSnapshot): Promise<CurrentSnapshot> {
  const thought = snapshot.display.thought;
  if (thought == null || thought.thinking.trim() !== "") return snapshot;
  const key = `${snapshot.id}\0${String(thought.turn)}\0${thought.reply}`;
  const source = assistants.get(key) ?? await ports.assistant(snapshot.id, thought.turn).catch(() => null);
  if (source?.type !== "assistant" || source.run !== snapshot.id || source.turn !== thought.turn || source.text !== thought.reply || Date.parse(source.t) > snapshot.at) return snapshot;
  if (assistants.size >= 128) assistants.delete(assistants.keys().next().value ?? "");
  assistants.set(key, source);
  const recovered = await event(source);
  const thinking = recovered.type === "assistant" && recovered.thinking.trim() !== "" ? recovered.thinking : null;
  return thinking === null ? snapshot : { ...snapshot, display: { ...snapshot.display, thought: { ...thought, thinking } } };
 }
 async function answer(answer: CurrentAnswer): Promise<CurrentAnswer> {
  if (answer.kind === "current" && answer.snapshot !== null) return { ...answer, snapshot: await snapshot(answer.snapshot) };
  if (answer.kind === "history") return { ...answer, events: await Promise.all(answer.events.map(event)) };
  if (answer.kind === "updates") return { ...answer, changes: await Promise.all(answer.changes.map(async change => change.removed || change.snapshot === undefined ? change : { ...change, snapshot: await snapshot(change.snapshot) })) };
  return answer;
 }
 return { event, answer };
}
