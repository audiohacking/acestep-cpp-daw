import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { resolveModelFile, resolveReferenceAudioPath } from "../src/paths";
import { isAbsolute } from "path";
import path from "path";

describe("resolveModelFile", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.ACESTEP_MODELS_DIR = process.env.ACESTEP_MODELS_DIR;
    saved.ACESTEP_MODEL_PATH = process.env.ACESTEP_MODEL_PATH;
    saved.MODELS_DIR = process.env.MODELS_DIR;
    delete process.env.ACESTEP_MODELS_DIR;
    delete process.env.ACESTEP_MODEL_PATH;
    delete process.env.MODELS_DIR;
  });

  afterEach(() => {
    for (const k of Object.keys(saved)) {
      const v = saved[k as keyof typeof saved];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  test("returns bare path when no models dir", () => {
    expect(resolveModelFile("model.gguf")).toBe("model.gguf");
  });

  test("joins models dir for bare filename (normalized)", () => {
    process.env.ACESTEP_MODELS_DIR = "/data/models";
    const actual = resolveModelFile("dit.gguf");
    if (process.platform === "win32") {
      expect(actual.toLowerCase()).toContain("\\data\\models\\dit.gguf");
    } else {
      const expected = path.join("/data/models", "dit.gguf");
      expect(path.normalize(actual)).toBe(path.normalize(expected));
    }
  });

  test("joins models dir for bare filename", () => {
    process.env.ACESTEP_MODELS_DIR = "/data/models";
    const actual = resolveModelFile("dit.gguf");
    if (process.platform === "win32") {
      expect(actual.toLowerCase()).toContain("\\data\\models\\dit.gguf");
    } else {
      expect(actual).toBe("/data/models/dit.gguf");
    }
  });
});

describe("resolveReferenceAudioPath", () => {
  test("empty string", () => {
    expect(resolveReferenceAudioPath("")).toBe("");
  });

  test("absolute path unchanged", () => {
    const p =
      process.platform === "win32"
        ? "C:\\\\Windows\\\\Temp\\\\ref.wav"
        : "/tmp/reference.wav";
    const out = resolveReferenceAudioPath(p);
    expect(isAbsolute(out)).toBe(true);
    expect(out.replace(/\\/g, "/")).toContain(
      process.platform === "win32" ? "C:/" : "/tmp/"
    );
  });
});
