import childProcess from "node:child_process";
import dgram from "node:dgram";
import dns from "node:dns";
import fs from "node:fs";
import http from "node:http";
import http2 from "node:http2";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import tls from "node:tls";
import workerThreads from "node:worker_threads";
import { afterEach, beforeAll, beforeEach } from "vitest";

// Throws on disk, process, DNS, socket, fetch and worker use from repo code, and fails the test even if
// the code swallows the throw. Vitest's own module loading has no repo frame and stays allowed.
const REPO_FRAME = /\/packages\/(agent|viewer|site)\/(?!node_modules\/)/;
const violations: string[] = [];

function repoCaller(): boolean {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 80;
  const stack = new Error().stack ?? "";
  Error.stackTraceLimit = limit;
  const frames = stack.split("\n").slice(1).filter((f) => !f.includes("test-support/no-io.ts"));
  if (frames[0]?.includes("node:internal/modules")) return false;
  return frames.some((f) => REPO_FRAME.test(f));
}

function guard(owner: Record<string, unknown>, name: string, label: string): void {
  const original = owner[name];
  if (typeof original !== "function") return;
  const wrapped = function (this: unknown, ...args: unknown[]): unknown {
    if (repoCaller()) {
      const message = `I/O is forbidden in tests: ${label}`;
      violations.push(message);
      throw new Error(message);
    }
    const target: unknown = new.target;
    return target === undefined
      ? Reflect.apply(original as (...a: unknown[]) => unknown, this, args)
      : Reflect.construct(original as new (...a: unknown[]) => object, args, target as new (...a: unknown[]) => object);
  };
  Object.defineProperties(wrapped, Object.getOwnPropertyDescriptors(original));
  owner[name] = wrapped;
}

function guardAll(owner: object, label: string): void {
  const record = owner as Record<string, unknown>;
  for (const name of Object.keys(record)) {
    const first = name.charAt(0);
    if (first === first.toLowerCase()) guard(record, name, `${label}.${name}`);
  }
}

guardAll(fs, "fs");
guardAll(fs.promises, "fs.promises");
guardAll(childProcess, "child_process");
guardAll(dns, "dns");
guardAll(dns.promises, "dns.promises");
for (const [mod, label] of [[http, "http"], [https, "https"]] as const) {
  for (const name of ["request", "get"]) guard(mod, name, `${label}.${name}`);
}
guard(http2, "connect", "http2.connect");
guard(tls, "connect", "tls.connect");
guard(dgram, "createSocket", "dgram.createSocket");
for (const name of ["connect", "createConnection"]) guard(net, name, `net.${name}`);
guard(net.Server.prototype as unknown as Record<string, unknown>, "listen", "net.Server.listen");
guard(net.Socket.prototype as unknown as Record<string, unknown>, "connect", "net.Socket.connect");
for (const name of ["fetch", "WebSocket", "EventSource"]) guard(globalThis, name, name);
guard(workerThreads, "Worker", "worker_threads.Worker");
syncBuiltinESMExports();

function failOnViolation(): void {
  const caught = violations.splice(0);
  if (caught.length > 0) throw new Error(`I/O is forbidden in tests: ${[...new Set(caught)].join("; ")}`);
}

beforeAll(failOnViolation);
beforeEach(() => { violations.length = 0; });
afterEach(failOnViolation);
