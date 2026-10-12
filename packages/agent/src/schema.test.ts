import { describe, expect, it } from "vitest";
import { renderEventsJsonSchema } from "./events.js";
import { writeSchema } from "./schema.js";

describe("writeSchema", () => {
  it("writes the rendered JSON Schema", () => {
    const chunks: string[] = [];
    writeSchema((text) => chunks.push(text));
    expect(chunks).toEqual([renderEventsJsonSchema()]);
  });
});
