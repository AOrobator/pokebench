import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { BoundedFrameSender, SharedFrameHub, type FrameSink } from "./frame-hub.js";

import { FrameDiagnostics } from "./frame-diagnostics.js";

class SlowSink implements FrameSink {
  readyState: number = WebSocket.OPEN;
  bufferedAmount = 0;
  readonly sent: Buffer[] = [];
  readonly callbacks: ((error?: Error) => void)[] = [];
  terminated = 0;
  throws = false;

  send(data: Buffer, _options: { readonly binary: true }, callback: (error?: Error) => void): void {
    if (this.throws) throw new Error("send threw");
    this.sent.push(Buffer.from(data));
    this.callbacks.push(callback);
  }

  terminate(): void { this.terminated += 1; }
}

afterEach(() => { vi.useRealTimers(); });

describe("bounded frame sender", () => {
  it("keeps one current send and only the latest pending frame for a slow client", () => {
    const sink = new SlowSink();
    const sender = new BoundedFrameSender(sink);
    sender.offer(Buffer.from("current"));
    sender.offer(Buffer.from("obsolete"));
    sender.offer(Buffer.from("latest"));
    expect(sink.sent.map(frame => frame.toString())).toEqual(["current"]);
    sink.callbacks.shift()?.();
    expect(sink.sent.map(frame => frame.toString())).toEqual(["current", "latest"]);
    sink.callbacks.shift()?.();
    sender.dispose();
    sender.dispose();
    sender.offer(Buffer.from("after dispose"));
    expect(sink.sent.map(frame => frame.toString())).toEqual(["current", "latest"]);
    expect(sink.terminated).toBe(0);
  });

  it("terminates a client whose send callback fails", () => {
    const sink = new SlowSink();
    const sender = new BoundedFrameSender(sink);
    sender.offer(Buffer.from("frame"));
    sink.callbacks.shift()?.(new Error("socket failed"));
    sender.offer(Buffer.from("ignored"));
    expect(sink.sent).toHaveLength(1);
    expect(sink.terminated).toBe(1);
  });

  it("retains only the latest frame while socket bytes remain buffered", () => {
    vi.useFakeTimers();
    const sink = new SlowSink();
    sink.bufferedAmount = 10;
    const sender = new BoundedFrameSender(sink);
    sender.offer(Buffer.from("obsolete"));
    sender.offer(Buffer.from("latest"));
    vi.advanceTimersByTime(5);
    expect(sink.sent).toHaveLength(0);
    sink.bufferedAmount = 0;
    vi.advanceTimersByTime(5);
    expect(sink.sent.map(frame => frame.toString())).toEqual(["latest"]);
    sender.dispose();
  });

  it("drops work for a closed sink and terminates when send throws", () => {
    const closed = new SlowSink();
    closed.readyState = WebSocket.CLOSED;
    const closedSender = new BoundedFrameSender(closed);
    closedSender.offer(Buffer.from("ignored"));
    expect(closed.sent).toHaveLength(0);

    const throwing = new SlowSink();
    throwing.throws = true;
    const throwingSender = new BoundedFrameSender(throwing);
    throwingSender.offer(Buffer.from("frame"));
    expect(throwing.terminated).toBe(1);
  });

  it("cancels a pending buffered retry when disposed", () => {
    vi.useFakeTimers();
    const sink = new SlowSink();
    sink.bufferedAmount = 1;
    const sender = new BoundedFrameSender(sink);
    sender.offer(Buffer.from("frame"));
    sender.dispose();
    vi.runAllTimers();
    expect(sink.sent).toHaveLength(0);
  });
});

class StubClient extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  readonly bufferedAmount = 0;
  readonly closes: { code: number; reason: string }[] = [];
  terminated = 0;

  send(_data: Buffer, _options: { readonly binary: true }, callback: (error?: Error) => void): void { callback(); }
  close(code: number, reason: string): void { this.closes.push({ code, reason }); }
  terminate(): void { this.terminated += 1; }
}

describe("shared frame hub defensive lifecycle", () => {
  it("rejects attachment after stop and makes repeated stop idempotent", () => {
    let emptied = 0;
    const hub = new SharedFrameHub({
      runId: "run",
      gamePort: 1,
      host: "127.0.0.1",
      maxPayload: 1024,
      decode: () => Buffer.from("frame"),
      onEmpty: () => { emptied += 1; },
    });
    hub.stop();
    hub.stop();
    const client = new StubClient();
    hub.add(client as unknown as WebSocket);
    expect(client.closes).toEqual([{ code: 1012, reason: "game frame source changed" }]);
    expect(emptied).toBe(1);
  });

  it("terminates a connecting subscriber during explicit teardown", () => {
    const hub = new SharedFrameHub({
      runId: "run",
      gamePort: 1,
      host: "127.0.0.1",
      maxPayload: 1024,
      decode: () => Buffer.from("frame"),
      onEmpty: () => undefined,
    });
    const client = new StubClient();
    client.readyState = WebSocket.CONNECTING;
    hub.add(client as unknown as WebSocket);
    hub.stop();
    expect(client.terminated).toBe(1);
  });
});

it("measures real sender offers, overwrites, queue time and completion latency", () => {
  const sink = new SlowSink(), stats = new FrameDiagnostics();
  let now = 0;
  const sender = new BoundedFrameSender(sink,stats,() => now);
  sender.offer(Buffer.from("current"));
  now = 4; sender.offer(Buffer.from("queued"));
  now = 6; sender.offer(Buffer.from("latest"));
  now = 10; sink.callbacks.shift()?.();
  now = 13; sink.callbacks.shift()?.();
  expect(stats.snapshot()).toMatchObject({offered:3,replaced:1,sent:2,sendErrors:0,queueWait:{count:2,meanMs:2,maxMs:4},send:{count:2,meanMs:6.5,maxMs:10}});
  sender.dispose();
});
it("counts real buffered checks and both send failure paths", () => {
  vi.useFakeTimers();
  const sink = new SlowSink(), stats = new FrameDiagnostics();
  sink.bufferedAmount = 1;
  const sender = new BoundedFrameSender(sink,stats);
  sender.offer(Buffer.from("frame"));
  vi.advanceTimersByTime(5);
  expect(stats.bufferedChecks).toBe(2);
  sink.bufferedAmount = 0; vi.advanceTimersByTime(5);
  sink.callbacks.shift()?.(new Error("failed"));
  expect(stats.snapshot()).toMatchObject({sent:0,sendErrors:1,send:{count:1}});
  const throwing = new SlowSink(); throwing.throws = true;
  const second = new BoundedFrameSender(throwing,stats);
  second.offer(Buffer.from("frame"));
  expect(stats.sendErrors).toBe(2);
});
