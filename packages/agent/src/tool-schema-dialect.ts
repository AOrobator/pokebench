import { VLLM_PROVIDER } from "./local-endpoint.js";

// vLLM compiles every tool schema with xgrammar (--tool-strict-level parameter), which rejects the
// array form of "items" that TypeBox Type.Tuple emits ("Invalid grammar specification: 'triggers'").
// The same tuple as prefixItems with items false is the 2020-12 spelling of the same constraint.
// Keywords whose values are data, not schemas, are copied as they are.
const DATA_KEYWORDS = new Set(["const", "enum", "default", "examples"]);

export function prefixItemsSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(prefixItemsSchema);
  if (typeof schema !== "object" || schema === null) return schema;
  const out: Record<string, unknown> = {};
  const tuple = Array.isArray((schema as Record<string, unknown>)["items"]);
  for (const [key, value] of Object.entries(schema)) {
    if (tuple && key === "additionalItems") continue;
    if (tuple && key === "items") {
      out["prefixItems"] = prefixItemsSchema(value);
      out["items"] = false;
      continue;
    }
    out[key] = DATA_KEYWORDS.has(key) ? value : prefixItemsSchema(value);
  }
  return out;
}

// Rewrites tools[].function.parameters of an OpenAI chat request; everything else is passed through.
export function vllmToolPayload(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null || !("tools" in payload) || !Array.isArray(payload.tools)) return payload;
  const tools: unknown[] = payload.tools;
  return {
    ...payload,
    tools: tools.map((tool) => {
      if (typeof tool !== "object" || tool === null || !("function" in tool) || typeof tool.function !== "object" || tool.function === null || !("parameters" in tool.function)) return tool;
      return { ...tool, function: { ...tool.function, parameters: prefixItemsSchema(tool.function.parameters) } };
    }),
  };
}

export function isVllm(provider: string): boolean {
  return provider === VLLM_PROVIDER;
}
