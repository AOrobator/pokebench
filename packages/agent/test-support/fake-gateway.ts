import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface ChatRequest {
  readonly path: string;
  readonly body: Record<string, unknown>;
}

export type Chunk = Record<string, unknown>;

export interface FakeGateway {
  readonly url: string;
  readonly requests: ChatRequest[];
  close(): Promise<void>;
}

export interface FakeGatewayOptions {
  readonly models?: unknown;
  readonly turns?: readonly (readonly Chunk[])[];
  readonly modelsStatus?: number;
}

async function readBody(request: IncomingMessage): Promise<string> {
  const parts: Buffer[] = [];
  for await (const part of request) {
    parts.push(part as Buffer);
  }
  return Buffer.concat(parts).toString("utf8");
}

function sse(response: ServerResponse, chunks: readonly Chunk[]): void {
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  for (const chunk of chunks) {
    response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  response.end("data: [DONE]\n\n");
}

export function delta(value: Record<string, unknown>, finishReason: string | null = null): Chunk {
  return {
    id: "chatcmpl-fake",
    object: "chat.completion.chunk",
    created: 0,
    model: "fake",
    choices: [{ index: 0, delta: value, finish_reason: finishReason }],
  };
}

export function usage(prompt: number, completion: number): Chunk {
  return {
    id: "chatcmpl-fake",
    object: "chat.completion.chunk",
    created: 0,
    model: "fake",
    choices: [],
    usage: { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion },
  };
}

export function toolCallTurn(reasoning: string, id: string, name: string, args: string): Chunk[] {
  return [
    delta({ role: "assistant", reasoning_content: reasoning }),
    delta({ tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: args } }] }),
    delta({}, "tool_calls"),
    usage(10, 5),
  ];
}

export function textTurn(reasoning: string, text: string): Chunk[] {
  return [
    delta({ role: "assistant", reasoning_content: reasoning }),
    delta({ content: text }),
    delta({}, "stop"),
    usage(20, 5),
  ];
}

export async function startFakeGateway(options: FakeGatewayOptions): Promise<FakeGateway> {
  const requests: ChatRequest[] = [];
  let turn = 0;
  const server: Server = createServer((request, response) => {
    void (async () => {
      const path = request.url ?? "";
      if (request.method === "GET" && path === "/v1/models") {
        response.writeHead(options.modelsStatus ?? 200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(options.models ?? { object: "list", data: [] }));
        return;
      }
      if (request.method === "POST" && path === "/v1/chat/completions") {
        requests.push({ path, body: JSON.parse(await readBody(request)) as Record<string, unknown> });
        const chunks = options.turns?.[turn];
        turn += 1;
        if (chunks === undefined) {
          response.writeHead(400, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ error: { message: "no scripted turn" } }));
          return;
        }
        sse(response, chunks);
        return;
      }
      response.writeHead(404);
      response.end();
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}/v1`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
  };
}

export function must<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("expected a value");
  }
  return value;
}

export const GATEWAY_MODELS = {
  object: "list",
  data: [
    {
      id: "think-swarm",
      object: "model",
      owned_by: "local-inference-stack",
      context_window: 65536,
      max_tokens: 16384,
      metadata: { observed: { capabilities: ["completion", "multimodal"] } },
    },
    {
      id: "think-faster",
      object: "model",
      owned_by: "local-inference-stack",
      context_window: 4096,
      max_tokens: 1024,
      metadata: { observed: { capabilities: ["completion"] } },
    },
    { id: "bare-lane", object: "model", context_window: 8192, max_tokens: 2048 },
  ],
};

export const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
