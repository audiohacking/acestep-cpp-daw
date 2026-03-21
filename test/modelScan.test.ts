import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { scanModelsDirectory } from "../src/modelScan";

describe("scanModelsDirectory", () => {
  test("classifies acestep.cpp-style filenames", () => {
    const dir = mkdtempSync(join(tmpdir(), "acestep-models-"));
    try {
      writeFileSync(join(dir, "acestep-5Hz-lm-4B-Q8_0.gguf"), "");
      writeFileSync(join(dir, "Qwen3-Embedding-0.6B-Q8_0.gguf"), "");
      writeFileSync(join(dir, "vae-BF16.gguf"), "");
      writeFileSync(join(dir, "acestep-v15-base-Q8_0.gguf"), "");
      writeFileSync(join(dir, "acestep-v15-turbo-Q8_0.gguf"), "");
      writeFileSync(join(dir, "acestep-v15-turbo-shift3-Q8_0.gguf"), "");

      const s = scanModelsDirectory(dir);
      expect(s.lm).toBe("acestep-5Hz-lm-4B-Q8_0.gguf");
      expect(s.embedding).toBe("Qwen3-Embedding-0.6B-Q8_0.gguf");
      expect(s.vae).toBe("vae-BF16.gguf");
      expect(s.ditBase).toBe("acestep-v15-base-Q8_0.gguf");
      expect(s.ditTurbo).toBe("acestep-v15-turbo-Q8_0.gguf");
      expect(s.ditTurboShift3).toBe("acestep-v15-turbo-shift3-Q8_0.gguf");
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("missing directory returns empty", () => {
    expect(scanModelsDirectory(join(tmpdir(), "nonexistent-acestep-xyz")).allGgufs).toEqual([]);
  });
});
