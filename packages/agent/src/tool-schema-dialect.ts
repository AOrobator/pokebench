// vLLM compiles every tool schema with xgrammar (--tool-strict-level parameter), which rejects the
// array form of "items" that TypeBox Type.Tuple emits. Stub until GREEN.
export function prefixItemsSchema(schema: unknown): unknown {
  return schema;
}

export function vllmToolPayload(payload: unknown): unknown {
  return payload;
}
