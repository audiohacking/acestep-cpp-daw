import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("config modelsList / defaultModel", () => {
  const envKeys = [
    "ACESTEP_MODELS",
    "ACESTEP_DEFAULT_MODEL",
    "ACESTEP_MODEL_MAP",
    "ACESTEP_DIT_MODEL",
    "ACESTEP_CONFIG_PATH",
    "ACESTEP_MODELS_DIR",
    "ACESTEP_MODEL_PATH",
    "MODELS_DIR",
  ];

  let savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of envKeys) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  test("ACESTEP_MODELS acts as a filter on ACESTEP_MODEL_MAP keys", async () => {
    process.env.ACESTEP_MODELS = "model-a,model-b";
    const { config } = await import("../src/config");
    expect(config.modelsList).toEqual(["model-a", "model-b"]);
  });

  test("ACESTEP_MODEL_MAP keys are returned when no ACESTEP_MODELS filter", async () => {
    delete process.env.ACESTEP_MODELS;
    process.env.ACESTEP_MODEL_MAP = JSON.stringify({
      turbo: "turbo.gguf",
      "turbo-shift3": "turbo-shift3.gguf",
    });
    const { config } = await import("../src/config");
    expect(config.modelsList).toEqual(["turbo", "turbo-shift3"]);
    delete process.env.ACESTEP_MODEL_MAP;
  });

  test("ACESTEP_MODELS filters ACESTEP_MODEL_MAP keys", async () => {
    process.env.ACESTEP_MODEL_MAP = JSON.stringify({
      "model-a": "a.gguf",
      "model-b": "b.gguf",
      "model-c": "c.gguf",
    });
    process.env.ACESTEP_MODELS = "model-a,model-c";
    const { config } = await import("../src/config");
    expect(config.modelsList).toEqual(["model-a", "model-c"]);
    delete process.env.ACESTEP_MODEL_MAP;
  });

  test("scans ACESTEP_MODELS_DIR for .gguf files when no MODEL_MAP", async () => {
    const dir = join(tmpdir(), `acestep-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "model-a.gguf"), "");
    writeFileSync(join(dir, "model-b.gguf"), "");
    writeFileSync(join(dir, "ignored.txt"), "");
    try {
      delete process.env.ACESTEP_MODEL_MAP;
      delete process.env.ACESTEP_MODELS;
      process.env.ACESTEP_MODELS_DIR = dir;
      const { config } = await import("../src/config");
      expect(config.modelsList).toEqual(["model-a.gguf", "model-b.gguf"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("ACESTEP_MODELS filters scanned .gguf files", async () => {
    const dir = join(tmpdir(), `acestep-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "model-a.gguf"), "");
    writeFileSync(join(dir, "model-b.gguf"), "");
    writeFileSync(join(dir, "model-c.gguf"), "");
    try {
      delete process.env.ACESTEP_MODEL_MAP;
      process.env.ACESTEP_MODELS_DIR = dir;
      process.env.ACESTEP_MODELS = "model-a.gguf,model-c.gguf";
      const { config } = await import("../src/config");
      expect(config.modelsList).toEqual(["model-a.gguf", "model-c.gguf"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("scannedModelMap maps filenames to resolved paths", async () => {
    const dir = join(tmpdir(), `acestep-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "dit.gguf"), "");
    try {
      delete process.env.ACESTEP_MODEL_MAP;
      process.env.ACESTEP_MODELS_DIR = dir;
      const { config } = await import("../src/config");
      const m = config.scannedModelMap;
      expect(Object.keys(m)).toEqual(["dit.gguf"]);
      expect(m["dit.gguf"]).toContain("dit.gguf");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("scannedModelMap is empty when MODEL_MAP is set", async () => {
    process.env.ACESTEP_MODEL_MAP = JSON.stringify({ turbo: "turbo.gguf" });
    const { config } = await import("../src/config");
    expect(config.scannedModelMap).toEqual({});
    delete process.env.ACESTEP_MODEL_MAP;
  });

  test("defaults to logical base+turbo labels when no map, no dir, no ACESTEP_MODELS", async () => {
    delete process.env.ACESTEP_MODELS;
    delete process.env.ACESTEP_MODEL_MAP;
    delete process.env.ACESTEP_DEFAULT_MODEL;
    delete process.env.ACESTEP_MODELS_DIR;
    delete process.env.ACESTEP_MODEL_PATH;
    delete process.env.MODELS_DIR;
    const { config } = await import("../src/config");
    expect(config.modelsList).toEqual(["acestep-v15-base", "acestep-v15-turbo"]);
  });

  test("ACESTEP_DEFAULT_MODEL is used as the default model name", async () => {
    process.env.ACESTEP_DEFAULT_MODEL = "my-custom-model";
    const { config } = await import("../src/config");
    expect(config.defaultModel).toBe("my-custom-model");
  });

  test("first ACESTEP_MODEL_MAP key becomes defaultModel when ACESTEP_DEFAULT_MODEL is absent", async () => {
    delete process.env.ACESTEP_DEFAULT_MODEL;
    process.env.ACESTEP_MODEL_MAP = JSON.stringify({ "first-model": "a.gguf", "second-model": "b.gguf" });
    const { config } = await import("../src/config");
    expect(config.defaultModel).toBe("first-model");
    delete process.env.ACESTEP_MODEL_MAP;
  });

  test("first scanned .gguf file becomes defaultModel when no map and no explicit default", async () => {
    const dir = join(tmpdir(), `acestep-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "alpha.gguf"), "");
    writeFileSync(join(dir, "beta.gguf"), "");
    try {
      delete process.env.ACESTEP_DEFAULT_MODEL;
      delete process.env.ACESTEP_MODEL_MAP;
      process.env.ACESTEP_MODELS_DIR = dir;
      const { config } = await import("../src/config");
      expect(config.defaultModel).toBe("alpha.gguf");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("defaultModel falls back to 'acestep-v15-base' when nothing is configured (lego-safe)", async () => {
    delete process.env.ACESTEP_DEFAULT_MODEL;
    delete process.env.ACESTEP_MODEL_MAP;
    delete process.env.ACESTEP_MODELS_DIR;
    delete process.env.ACESTEP_MODEL_PATH;
    delete process.env.MODELS_DIR;
    const { config } = await import("../src/config");
    expect(config.defaultModel).toBe("acestep-v15-base");
  });
});
