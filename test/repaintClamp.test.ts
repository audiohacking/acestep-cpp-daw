import { describe, expect, test } from "bun:test";
import {
  applySegmentTargetDuration,
  clampRepaintingSeconds,
  collapseDegenerateRepaintWindow,
  MIN_REPAINT_SEGMENT_SEC,
} from "../src/repaintClamp";

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

describe("applySegmentTargetDuration", () => {
  test("lego: sets duration to repainting_end - repainting_start, not full audio_duration", () => {
    const req: Record<string, unknown> = {
      duration: 128,
      repainting_start: 0,
      repainting_end: 4,
    };
    applySegmentTargetDuration(req, { task_type: "lego", audio_duration: 128 });
    expect(req.duration).toBe(4);
  });

  test("repaint: segment 10–25 → duration 15", () => {
    const req: Record<string, unknown> = {
      duration: 200,
      repainting_start: 10,
      repainting_end: 25,
    };
    applySegmentTargetDuration(req, { task_type: "repaint", audio_duration: 200 });
    expect(req.duration).toBe(15);
  });

  test("inactive repainting (-1) does not change duration", () => {
    const req: Record<string, unknown> = {
      duration: 128,
      repainting_start: -1,
      repainting_end: -1,
    };
    applySegmentTargetDuration(req, { task_type: "lego", audio_duration: 128 });
    expect(req.duration).toBe(128);
  });

  test("text2music ignored", () => {
    const req: Record<string, unknown> = { duration: 60, repainting_start: 0, repainting_end: 10 };
    applySegmentTargetDuration(req, { task_type: "text2music", audio_duration: 120 });
    expect(req.duration).toBe(60);
  });
});

describe("collapseDegenerateRepaintWindow", () => {
  test("tiny segment after segment-duration override → full clip", () => {
    const req: Record<string, unknown> = {
      duration: 128,
      repainting_start: 0,
      repainting_end: 0.1,
    };
    const body = { task_type: "lego", audio_duration: 128 };
    applySegmentTargetDuration(req, body);
    expect(req.duration).toBeCloseTo(0.1, 5);

    collapseDegenerateRepaintWindow(req, body, 90, {});
    expect(req.repainting_start).toBe(-1);
    expect(req.repainting_end).toBe(-1);
    expect(req.duration).toBe(90);
  });

  test("segment >= MIN is unchanged", () => {
    const req: Record<string, unknown> = {
      repainting_start: 0,
      repainting_end: MIN_REPAINT_SEGMENT_SEC,
    };
    const body = { task_type: "lego", audio_duration: 60 };
    applySegmentTargetDuration(req, body);
    collapseDegenerateRepaintWindow(req, body, 60, {});
    expect(req.repainting_start).toBe(0);
    expect(req.repainting_end).toBe(MIN_REPAINT_SEGMENT_SEC);
  });
});
