import { describe, expect, test } from "bun:test";
import { shouldRunAceLm, apiToRequestJson } from "../src/worker";

describe("shouldRunAceLm", () => {
  const emptyReq = () => apiToRequestJson({ task_type: "text2music", thinking: false });

  test("text2music without thinking/format/sample is false", () => {
    const body = { task_type: "text2music", thinking: false };
    const req = apiToRequestJson(body);
    expect(shouldRunAceLm(body, req)).toBe(false);
  });

  test("thinking true is true", () => {
    const body = { task_type: "text2music", thinking: true };
    const req = apiToRequestJson(body);
    expect(shouldRunAceLm(body, req)).toBe(true);
  });

  test("lego with thinking false still needs LM when no audio codes", () => {
    const body = {
      task_type: "lego",
      thinking: false,
      prompt: "drums",
      track_name: "drums",
    };
    const req = apiToRequestJson(body);
    expect(shouldRunAceLm(body, req)).toBe(true);
  });

  test("repaint and cover same as lego when codes empty", () => {
    for (const task_type of ["repaint", "cover"] as const) {
      const body = { task_type, thinking: false, prompt: "x" };
      const req = apiToRequestJson(body);
      expect(shouldRunAceLm(body, req)).toBe(true);
    }
  });

  test("skips LM when audio_codes already present on reqJson", () => {
    const body = { task_type: "lego", thinking: false };
    const req = { ...emptyReq(), audio_codes: "1,2,3" };
    expect(shouldRunAceLm(body, req)).toBe(false);
  });
});
