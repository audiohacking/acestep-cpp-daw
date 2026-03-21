/**
 * Security-focused tests: path traversal prevention and source-path containment.
 */
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { resolve, join, sep } from "path";
import { isPathWithin } from "../src/paths";
import { resolveLmPath, resolveDitPath } from "../src/worker";

// ---------------------------------------------------------------------------
// Helpers: simulate what the /v1/audio handler does after the fix
// ---------------------------------------------------------------------------

/** Mirrors the logic now in index.ts /v1/audio */
function audioFilePath(audioStorageDir: string, pathParam: string): string | null {
  const decoded = decodeURIComponent(pathParam);
  const withPrefix = decoded.startsWith("/") ? decoded : "/" + decoded.replace(/^\/+/, "");
  const requestedPath = withPrefix.replace(/^\/+/, "");
  const filePath = resolve(join(audioStorageDir, requestedPath));
  if (!isPathWithin(filePath, audioStorageDir)) return null;
  return filePath;
}

// ---------------------------------------------------------------------------
// /v1/audio path traversal prevention
// ---------------------------------------------------------------------------

describe("path traversal prevention in /v1/audio", () => {
  // Use path.resolve so the base is always an absolute, platform-native path.
  // On Windows, resolve("/storage/audio") → "C:\storage\audio"; on Unix it stays "/storage/audio".
  const storageDir = resolve("/storage/audio");

  test("valid path inside storage dir is allowed", () => {
    expect(audioFilePath(storageDir, "/abc123.mp3")).toBe(join(storageDir, "abc123.mp3"));
  });

  test("explicit ../ traversal is blocked", () => {
    expect(audioFilePath(storageDir, "../../etc/passwd")).toBeNull();
  });

  test("URL-encoded traversal is blocked", () => {
    expect(audioFilePath(storageDir, "%2e%2e%2fetc%2fpasswd")).toBeNull();
  });

  test("four-dot literal directory name stays within storage dir (not a traversal)", () => {
    // .... is NOT a path traversal — it is a literal directory name with four dots.
    // resolve treats it as such, so the result is still within the storage dir.
    const result = audioFilePath(storageDir, "....//....//etc/passwd");
    expect(result).not.toBeNull();
    expect(result!.startsWith(storageDir + sep)).toBe(true);
  });

  test("absolute path in query param is contained within storage dir", () => {
    // requestedPath strips the leading / so /etc/passwd becomes etc/passwd,
    // which is then joined with storageDir to give storageDir/etc/passwd.
    const result = audioFilePath(storageDir, "/etc/passwd");
    expect(result).not.toBeNull();
    expect(result!.startsWith(storageDir + sep)).toBe(true);
  });

  test("nested valid path is allowed", () => {
    expect(audioFilePath(storageDir, "/sub/file.wav")).toBe(join(storageDir, "sub", "file.wav"));
  });

  test("prefix-only directory name is not confused with parent", () => {
    // /storage/audiovil/file.mp3 must NOT be served from /storage/audio
    expect(audioFilePath(storageDir, "/../../audiovil/file.mp3")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveLmPath: per-request lm_model_path must stay within modelsDir
// ---------------------------------------------------------------------------

describe("resolveLmPath security", () => {
  const envKeys = ["ACESTEP_LM_MODEL", "ACESTEP_LM_MODEL_PATH", "ACESTEP_MODELS_DIR", "ACESTEP_MODEL_PATH", "MODELS_DIR"];
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

  test("lm_model_path within modelsDir is accepted", () => {
    process.env.ACESTEP_MODELS_DIR = "/models";
    expect(() => resolveLmPath({ lm_model_path: "model.gguf" })).not.toThrow();
  });

  test("lm_model_path outside modelsDir is rejected when modelsDir is set", () => {
    process.env.ACESTEP_MODELS_DIR = "/models";
    expect(() => resolveLmPath({ lm_model_path: "/etc/passwd" })).toThrow(
      /not within the configured models directory/
    );
  });

  test("lm_model_path traversal outside modelsDir is rejected", () => {
    process.env.ACESTEP_MODELS_DIR = "/models";
    expect(() => resolveLmPath({ lm_model_path: "../../../etc/shadow" })).toThrow(
      /not within the configured models directory/
    );
  });

  test("lm_model_path is unrestricted when no modelsDir is configured", () => {
    // Without a modelsDir, we cannot constrain — path passes through
    expect(() => resolveLmPath({ lm_model_path: "/arbitrary/path.gguf" })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// resolveDitPath: per-request model must be a known registered model
// ---------------------------------------------------------------------------

describe("resolveDitPath security", () => {
  const envKeys = ["ACESTEP_MODEL_MAP", "ACESTEP_DIT_MODEL", "ACESTEP_CONFIG_PATH", "ACESTEP_MODELS_DIR", "ACESTEP_MODEL_PATH", "MODELS_DIR"];
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

  test("unknown model name throws", () => {
    process.env.ACESTEP_MODEL_MAP = JSON.stringify({ turbo: "turbo.gguf" });
    process.env.ACESTEP_DIT_MODEL = "/models/default.gguf";
    expect(() => resolveDitPath({ model: "../../etc/passwd" })).toThrow(/Unknown model/);
  });

  test("known model map name does not throw", () => {
    process.env.ACESTEP_MODELS_DIR = "/models";
    process.env.ACESTEP_MODEL_MAP = JSON.stringify({ turbo: "turbo.gguf" });
    expect(() => resolveDitPath({ model: "turbo" })).not.toThrow();
  });
});
