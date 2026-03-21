import { describe, expect, test } from "bun:test";
import { apiToRequestJson } from "../src/worker";

describe("apiToRequestJson DAW → acestep.cpp mapping", () => {
  test("empty prompt does not hide caption (multipart / FormData)", () => {
    const req = apiToRequestJson({
      task_type: "lego",
      prompt: "",
      caption: "breakbeat drums from global + track",
      track_name: "drums",
    });
    expect(req.caption).toBe("breakbeat drums from global + track");
  });

  test("lego: ACE-Step-DAW turbo defaults are replaced with acestep.cpp lego.json profile", () => {
    const req = apiToRequestJson({
      task_type: "lego",
      track_name: "drums",
      prompt: "x",
      inference_steps: 8,
      guidance_scale: 7,
      shift: 3,
    });
    expect(req.inference_steps).toBe(50);
    expect(req.guidance_scale).toBe(1.0);
    expect(req.shift).toBe(1.0);
  });

  test("lego: lego_client_diffusion keeps client diffusion params", () => {
    const req = apiToRequestJson({
      task_type: "lego",
      track_name: "drums",
      prompt: "x",
      inference_steps: 12,
      guidance_scale: 2.5,
      shift: 2,
      lego_client_diffusion: true,
    });
    expect(req.inference_steps).toBe(12);
    expect(req.guidance_scale).toBe(2.5);
    expect(req.shift).toBe(2);
  });

  test("text2music keeps client guidance (not lego)", () => {
    const req = apiToRequestJson({
      task_type: "text2music",
      prompt: "x",
      guidance_scale: 7,
      shift: 3,
    });
    expect(req.guidance_scale).toBe(7);
    expect(req.shift).toBe(3);
  });
});
