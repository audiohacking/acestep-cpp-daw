import { describe, expect, test } from "bun:test";
import { mergeMetadata, normalizeRepaintingBounds, parseParamObj } from "../src/normalize";

describe("mergeMetadata", () => {
  test("flattens metas into root", () => {
    const b = mergeMetadata({ prompt: "x", metas: { bpm: 100 } });
    expect(b.prompt).toBe("x");
    expect(b.bpm).toBe(100);
  });

  test("does not overwrite existing root keys", () => {
    const b = mergeMetadata({ bpm: 90, metas: { bpm: 100 } });
    expect(b.bpm).toBe(90);
  });
});

describe("normalizeRepaintingBounds", () => {
  test("zeros when end equals start (acestep rejects end <= start)", () => {
    const b = normalizeRepaintingBounds({
      repainting_start: 0.1,
      repainting_end: 0.1,
    });
    expect(b.repainting_start).toBe(0);
    expect(b.repainting_end).toBe(0);
    expect(b.repaintingStart).toBe(0);
    expect(b.repaintingEnd).toBe(0);
  });

  test("zeros when end < start", () => {
    const b = normalizeRepaintingBounds({
      repainting_start: 0.5,
      repainting_end: 0.2,
    });
    expect(b.repainting_start).toBe(0);
    expect(b.repainting_end).toBe(0);
  });

  test("leaves valid range unchanged", () => {
    const b = normalizeRepaintingBounds({
      repainting_start: 0.1,
      repainting_end: 0.5,
    });
    expect(b.repainting_start).toBe(0.1);
    expect(b.repainting_end).toBe(0.5);
  });

  test("ignores when one bound missing", () => {
    const b = normalizeRepaintingBounds({ repainting_start: 0.2 });
    expect(b.repainting_start).toBe(0.2);
    expect(b.repainting_end).toBeUndefined();
  });
});

describe("parseParamObj", () => {
  test("parses JSON string", () => {
    expect(parseParamObj('{"duration": 120}')).toEqual({ duration: 120 });
  });

  test("returns {} on invalid JSON", () => {
    expect(parseParamObj("not json")).toEqual({});
  });
});
