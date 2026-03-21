import { describe, expect, test, beforeEach, afterEach } from "bun:test";

describe("config modelsList / defaultModel", () => {
  const envKeys = [
    "ACESTEP_MODELS",
    "ACESTEP_DEFAULT_MODEL",
    "ACESTEP_MODEL_MAP",
    "ACESTEP_DIT_MODEL",
    "ACESTEP_CONFIG_PATH",
  ];

  let savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of envKeys) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    // Invalidate module cache so config re-reads env
    // (Bun caches modules, but getters re-read env on each access)
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  test("ACESTEP_MODELS explicit override is honoured", async () => {
    process.env.ACESTEP_MODELS = "model-a,model-b";
    const { config } = await import("../src/config");
    expect(config.modelsList).toEqual(["model-a", "model-b"]);
  });

  test("ACESTEP_MODEL_MAP keys drive the model list when ACESTEP_MODELS is absent", async () => {
    delete process.env.ACESTEP_MODELS;
    process.env.ACESTEP_MODEL_MAP = JSON.stringify({
      "turbo": "turbo.gguf",
      "turbo-shift3": "turbo-shift3.gguf",
    });
    const { config } = await import("../src/config");
    expect(config.modelsList).toEqual(["turbo", "turbo-shift3"]);
    delete process.env.ACESTEP_MODEL_MAP;
  });

  test("defaults to [defaultModel] when neither ACESTEP_MODELS nor ACESTEP_MODEL_MAP is set", async () => {
    delete process.env.ACESTEP_MODELS;
    delete process.env.ACESTEP_MODEL_MAP;
    delete process.env.ACESTEP_DEFAULT_MODEL;
    const { config } = await import("../src/config");
    expect(config.modelsList).toEqual(["acestep-v15-turbo"]);
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

  test("defaultModel falls back to 'acestep-v15-turbo' when nothing is configured", async () => {
    delete process.env.ACESTEP_DEFAULT_MODEL;
    delete process.env.ACESTEP_MODEL_MAP;
    const { config } = await import("../src/config");
    expect(config.defaultModel).toBe("acestep-v15-turbo");
  });
});
