import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentTool, StreamFn } from "@mariozechner/pi-agent-core";
import {
  createAssistantMessageEventStream,
  type Message,
  type Model,
} from "@mariozechner/pi-ai";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { RUN_START_META } from "../test-support/events.js";
import { assistant, toolCall, userText } from "../test-support/pi.js";
import { parseEvent } from "./events.js";
import { FrameStore } from "./frames.js";
import { attachLoopGuard, Governor, piLoop, play } from "./harness.js";
import { LOOP_POLICY } from "./loop-detection.js";
import { RunRecorder } from "./recorder.js";
import { RunLog } from "./run-log.js";
const MODEL: Model<"openai-completions"> = {
  id: "test",
  name: "test",
  api: "openai-completions",
  provider: "test",
  baseUrl: "http://127.0.0.1:1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1000,
  maxTokens: 100,
};
const unknownState = {
  screen: "unknown",
  started: false,
  name: null,
  location: null,
  map_id: null,
  position: null,
  facing: null,
  in_battle: false,
  party: [],
  money: null,
  badges: [],
  play_time_s: null,
};

describe("loop guard through pinned pi and recorded events", () => {
  it.each(["set_objective", "observe"])(
    "stops persisted planning via %s, exposes correction and cancels a trailing press",
    async (recovery) => {
      const root = mkdtempSync(join(tmpdir(), "pokebench-loop-"));
      try {
        const log = RunLog.create(root, "loop-proof");
        const recorder = new RunRecorder({
          log,
          frames: new FrameStore(root),
          milestones: { poll: () => Promise.resolve([]) },
          gameState: { read: () => Promise.resolve(unknownState) },
        });
        await recorder.start(RUN_START_META);
        const controller = new AbortController();
        const retries: string[] = [];
        const governor = new Governor({
          limits: { maxTurns: 2, maxWallMs: 10000, failureLimit: 3 },
          now: () => 0,
          retry: (r) => retries.push(r),
          abort: () => {
            controller.abort();
          },
        });
        const detector = attachLoopGuard(recorder, governor, {
          ...LOOP_POLICY,
          planning: 2,
          recovery: 2,
        });
        const executed: string[] = [];
        const tools: AgentTool[] = ["set_objective", "observe", "press"].map(
          (name) => ({
            name,
            label: name,
            description: name,
            parameters: Type.Object({
              buttons: Type.Optional(Type.Array(Type.String())),
            }),
            execute: () => {
              executed.push(name);
              return Promise.resolve({
                content: [{ type: "text" as const, text: "ok" }],
                details:
                  name === "observe" ? { state: unknownState } : undefined,
              });
            },
          }),
        );
        const replies = [
          assistant({
            toolCalls: [
              toolCall("p1", "set_objective", {}),
              toolCall("p2", "set_objective", {}),
            ],
            stopReason: "toolUse",
          }),
          assistant({
            toolCalls: [
              toolCall("r1", recovery, {}),
              toolCall("r2", recovery, {}),
              toolCall("must-not-execute", "press", {}),
            ],
            stopReason: "toolUse",
          }),
        ];
        const seen: Message[][] = [];
        const streamFn: StreamFn = (_model, context) => {
          seen.push([...context.messages]);
          const message = replies.shift();
          if (message === undefined)
            throw new Error("Unexpected extra inference request");
          const stream = createAssistantMessageEventStream();
          stream.push({ type: "done", reason: "toolUse", message });
          return stream;
        };
        const loop = piLoop({
          systemPrompt: "play",
          tools,
          base: {
            model: MODEL,
            convertToLlm: (messages) => messages as Message[],
          },
          governor,
          loopDetector: detector,
          transformContext: recorder.transformContext,
          emit: recorder.emit,
          signal: controller.signal,
          streamFn,
        });
        expect(await play(userText("play"), governor, loop)).toBe("stuck");
        recorder.end("stuck");
        expect(executed).toEqual([
          "set_objective",
          "set_objective",
          recovery,
          recovery,
        ]);
        expect(retries).toEqual([]);
        expect(seen).toHaveLength(2);
        expect(seen[1]?.at(-1)?.role).toBe("user");
        expect(seen[1]?.at(-1)?.content).toContain("does not execute buttons");
        const events = readFileSync(log.eventsPath, "utf8")
          .trim()
          .split("\n")
          .map(parseEvent);
        const notices = events.filter((e) => e.type === "loop_guard");
        expect(notices.map((e) => [e.kind, e.phase])).toEqual([
          ["planning", "warning"],
          ["planning", "stop"],
        ]);
        expect(notices[0]?.evidence).toEqual([
          events.find((e) => e.type === "tool_result" && e.id === "p2")?.seq,
        ]);
        expect(events.at(-1)).toMatchObject({
          type: "run_end",
          reason: "stuck",
        });
        expect(controller.signal.aborted).toBe(true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});

it.each(["observation", "ineffective", "cycle", "rejection"] as const)(
  "wires %s detection through real pi state/result ordering",
  async (kind) => {
    const root = mkdtempSync(join(tmpdir(), "pokebench-loop-seam-"));
    try {
      const field = (x = 0) => ({
        ...unknownState,
        screen: "overworld",
        started: true,
        name: "RED",
        location: "TOWN",
        map_id: [0, 0] as [number, number],
        position: { x, y: 0 },
        facing: "RIGHT",
        field_controls_locked: false,
      });
      let current = field();
      const log = RunLog.create(root, "seam-proof");
      const recorder = new RunRecorder({
        log,
        frames: new FrameStore(root),
        milestones: { poll: () => Promise.resolve([]) },
        gameState: { read: () => Promise.resolve(current) },
      });
      await recorder.start(RUN_START_META);
      const controller = new AbortController();
      const governor = new Governor({
        limits: { maxTurns: 2, maxWallMs: 10000, failureLimit: 3 },
        now: () => 0,
        retry: () => {},
        abort: () => {
          controller.abort();
        },
      });
      const detector = attachLoopGuard(recorder, governor, {
        ...LOOP_POLICY,
        observation: 2,
        ineffective: 2,
        cycleRepeats: 2,
        rejection: 2,
        recovery: 2,
      });
      const executed: string[] = [];
      const tools: AgentTool[] = [
        "observe",
        "press",
        "bad",
        "get_objectives",
      ].map((name) => ({
        name,
        label: name,
        description: name,
        parameters: Type.Object({
          buttons: Type.Optional(Type.Array(Type.String())),
        }),
        execute: (id) => {
          executed.push(id);
          if (name === "bad")
            throw new Error(
              "Invalid completion type: started requires boolean, received string",
            );
          if (name === "press") {
            const before = current;
            recorder.buttonPress(
              id,
              ["RIGHT"],
              { hold_frames: 10, release_frames: 8 },
              before,
            );
            if (kind === "cycle")
              current = field(1 - (current.position.x));
          }
          return Promise.resolve({
            content: [{ type: "text" as const, text: "ok" }],
            details:
              name === "press" || name === "observe"
                ? { state: current }
                : undefined,
          });
        },
      }));
      const names =
        kind === "observation"
          ? ["observe", "observe", "observe"]
          : kind === "ineffective"
            ? ["press", "press"]
            : kind === "cycle"
              ? ["press", "press", "press", "press"]
              : ["bad", "get_objectives", "bad"];
      const recovery =
        kind === "rejection"
          ? ["get_objectives", "bad"]
          : kind === "observation"
            ? ["observe", "observe"]
            : ["press", "press"];
      const replies = [
        assistant({
          toolCalls: names.map((name, i) =>
            toolCall(
              `first${String(i)}`,
              name,
              name === "press" ? { buttons: ["RIGHT"] } : {},
            ),
          ),
          stopReason: "toolUse",
        }),
        assistant({
          toolCalls: [
            ...recovery.map((name, i) =>
              toolCall(
                `recover${String(i)}`,
                name,
                name === "press" ? { buttons: ["RIGHT"] } : {},
              ),
            ),
            toolCall("blocked", "press", {}),
          ],
          stopReason: "toolUse",
        }),
      ];
      const seen: Message[][] = [];
      const streamFn: StreamFn = (_m, context) => {
        seen.push([...context.messages]);
        const reply = replies.shift();
        if (reply === undefined) throw new Error("unexpected extra request");
        const stream = createAssistantMessageEventStream();
        stream.push({ type: "done", reason: "toolUse", message: reply });
        return stream;
      };
      const loop = piLoop({
        systemPrompt: "play",
        tools,
        base: {
          model: MODEL,
          convertToLlm: (messages) => messages as Message[],
        },
        governor,
        loopDetector: detector,
        transformContext: recorder.transformContext,
        emit: recorder.emit,
        signal: controller.signal,
        streamFn,
      });
      expect(await play(userText("play"), governor, loop)).toBe("stuck");
      recorder.end("stuck");
      expect(executed).toEqual([
        ...names.map((_n, i) => `first${String(i)}`),
        "recover0",
        "recover1",
      ]);
      expect(seen[1]?.at(-1)?.content).toContain(`LOOP GUARD (${kind})`);
      const events = readFileSync(log.eventsPath, "utf8")
        .trim()
        .split("\n")
        .map(parseEvent);
      expect(
        events
          .filter((e) => e.type === "loop_guard")
          .map((e) => [e.kind, e.phase]),
      ).toEqual([
        [kind, "warning"],
        [kind, "stop"],
      ]);
      if (kind === "ineffective" || kind === "cycle")
        expect(
          events
            .filter((e) => e.type === "button_press")
            .every((e) => e.before_state_seq !== undefined),
        ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
