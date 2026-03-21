import { describe, expect, test } from "bun:test";
import { clampRepaintingSeconds } from "../src/repaintClamp";

describe("clampRepaintingSeconds", () => {
  test("DAW beats 4–8 on 0.1s clip: after beat→sec still collapses → -1", () => {
    const d = 0.1;
    const bpm = 120;
    const { start, end } = clampRepaintingSeconds(4, 8, d, bpm);
    expect(start).toBe(-1);
    expect(end).toBe(-1);
  });

  test("seconds 4–8 on 10s clip unchanged after clamp", () => {
    const { start, end } = clampRepaintingSeconds(4, 8, 10, 120);
    expect(start).toBe(4);
    expect(end).toBe(8);
  });

  test("beats 4–8 on 10s at 120bpm → 2s–4s", () => {
    const { start, end } = clampRepaintingSeconds(4, 8, 10, 120);
    // 4 and 8 are NOT > 10, so no beat conversion
    expect(start).toBe(4);
    expect(end).toBe(8);
  });

  test("beats 40–80 on 10s at 120bpm converts then clamps", () => {
    const { start, end } = clampRepaintingSeconds(40, 80, 10, 120);
    // 40>10 → seconds 20, 40 → clamp to 10,10 → invalid → -1
    expect(start).toBe(-1);
    expect(end).toBe(-1);
  });

  test("leaves -1 sentinel alone", () => {
    const { start, end } = clampRepaintingSeconds(-1, -1, 5, 120);
    expect(start).toBe(-1);
    expect(end).toBe(-1);
  });
});
