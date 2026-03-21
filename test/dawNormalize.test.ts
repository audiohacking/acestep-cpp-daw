import { describe, expect, test } from "bun:test";
import { normalizeDawBody } from "../src/dawNormalize";

describe("normalizeDawBody", () => {
  test("lego maps track_name to lego and builds caption", () => {
    const b = normalizeDawBody({
      task_type: "lego",
      track_name: "Drums 1",
      global_caption: "Keep groove",
      prompt: "add hi-hats",
    });
    expect(b.lego).toBe("drums_1");
    expect(b.caption).toBe("Keep groove\nadd hi-hats");
  });

  test("cover uses global_caption when caption empty", () => {
    const b = normalizeDawBody({
      task_type: "cover",
      global_caption: "Jazz ballad",
    });
    expect(b.caption).toBe("Jazz ballad");
  });
});
