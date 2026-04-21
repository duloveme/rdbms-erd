import { describe, expect, it } from "vitest";
import { createLargeDesign, roundTripDesign, serializeDesign } from "../index";

describe("large model (500 tables)", () => {
  it("serializes and round-trips within reasonable time", () => {
    const doc = createLargeDesign(500, "postgres");
    const t0 = performance.now();
    const json = serializeDesign(doc);
    const parsed = roundTripDesign(JSON.parse(json) as typeof doc);
    const ms = performance.now() - t0;
    expect(parsed.model.tables).toHaveLength(500);
    expect(ms).toBeLessThan(8000);
  });
});
