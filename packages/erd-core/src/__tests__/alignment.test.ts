import { describe, expect, it } from "vitest";
import { alignNodePositions } from "../alignment";

describe("alignNodePositions", () => {
  it("aligns left to min x", () => {
    const positions = { a: { x: 10, y: 0 }, b: { x: 50, y: 0 } };
    const out = alignNodePositions(["a", "b"], positions, "left");
    expect(out.a.x).toBe(10);
    expect(out.b.x).toBe(10);
  });

  it("distributes horizontal gap", () => {
    const positions = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, c: { x: 200, y: 0 } };
    const out = alignNodePositions(["a", "b", "c"], positions, "h-gap");
    expect(out.a.x).toBe(0);
    expect(out.b.x).toBe(100);
    expect(out.c.x).toBe(200);
  });
});
