import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  resolveModelFile,
  resolveReferenceAudioPath,
  toAbsolutePath,
  getResourceRoot,
  isPathWithin,
} from "../src/paths";
import { isAbsolute, resolve } from "path";
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

describe("toAbsolutePath", () => {
  test("relative path becomes absolute under resource root", () => {
    const out = toAbsolutePath("storage/tmp/job/request0.json");
    expect(out).toBe(resolve(getResourceRoot(), "storage/tmp/job/request0.json"));
  });

  test("absolute path stays absolute", () => {
    const p = process.platform === "win32" ? "C:\\\\x\\\\y.json" : "/x/y.json";
    expect(isAbsolute(toAbsolutePath(p))).toBe(true);
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

describe("isPathWithin", () => {
  const base = "/storage/audio";

  test("path equal to parent is within", () => {
    expect(isPathWithin("/storage/audio", base)).toBe(true);
  });

  test("child file is within parent", () => {
    expect(isPathWithin("/storage/audio/abc123.mp3", base)).toBe(true);
  });

  test("nested child is within parent", () => {
    expect(isPathWithin("/storage/audio/sub/file.mp3", base)).toBe(true);
  });

  test("sibling directory is not within parent", () => {
    expect(isPathWithin("/storage/other/file.mp3", base)).toBe(false);
  });

  test("path traversal escape is rejected", () => {
    expect(isPathWithin("/storage/audio/../../../etc/passwd", base)).toBe(false);
  });

  test("prefix-only match is not within (no sep)", () => {
    // /storage/audiovil is NOT within /storage/audio
    expect(isPathWithin("/storage/audiovil/file.mp3", base)).toBe(false);
  });

  test("relative paths are resolved before comparison", () => {
    // resolve("./storage/audio/file.mp3") should land inside resolve("./storage/audio")
    expect(isPathWithin("./storage/audio/file.mp3", "./storage/audio")).toBe(true);
    expect(isPathWithin("./storage/other/file.mp3", "./storage/audio")).toBe(false);
  });
});
