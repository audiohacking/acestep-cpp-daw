/** Env-based config. Binaries: https://github.com/audiohacking/acestep.cpp/releases/tag/v0.0.3 */
import { resolveModelFile, resolveModelMapPaths, resolveAcestepBinDir, listGgufFiles } from "./paths";

function parseModelMap(raw: string): Record<string, string> {
  if (!raw.trim()) return {};
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string" && v) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Re-parsed on each access so env changes in tests are reflected. */
function getModelMapRaw(): Record<string, string> {
  return parseModelMap(process.env.ACESTEP_MODEL_MAP ?? "");
}

export const config = {
  host: process.env.ACESTEP_API_HOST ?? "127.0.0.1",
  port: parseInt(process.env.ACESTEP_API_PORT ?? "8001", 10),
  apiKey: process.env.ACESTEP_API_KEY ?? "",

  /** Directory with `ace-lm` / `ace-synth` (bundled `acestep-runtime/bin` or `ACESTEP_BIN_DIR`). */
  get acestepBinDir() {
    return resolveAcestepBinDir();
  },

  /** Default LM GGUF (basename OK if `ACESTEP_MODELS_DIR` set). */
  get lmModelPath() {
    return resolveModelFile(process.env.ACESTEP_LM_MODEL ?? process.env.ACESTEP_LM_MODEL_PATH ?? "");
  },

  get embeddingModelPath() {
    return resolveModelFile(process.env.ACESTEP_EMBEDDING_MODEL ?? "");
  },

  get ditModelPath() {
    return resolveModelFile(process.env.ACESTEP_DIT_MODEL ?? process.env.ACESTEP_CONFIG_PATH ?? "");
  },

  get vaeModelPath() {
    return resolveModelFile(process.env.ACESTEP_VAE_MODEL ?? "");
  },

  /** Logical map with paths resolved against `ACESTEP_MODELS_DIR`. */
  get modelMap(): Record<string, string> {
    return resolveModelMapPaths(getModelMapRaw());
  },

  /** Base models directory (informative). */
  get modelsDir() {
    return (
      process.env.ACESTEP_MODELS_DIR?.trim() ||
      process.env.ACESTEP_MODEL_PATH?.trim() ||
      process.env.MODELS_DIR?.trim() ||
      ""
    );
  },

  /** MP3 encoder bitrate for ace-synth (default 128 per acestep.cpp README). */
  mp3Bitrate: parseInt(process.env.ACESTEP_MP3_BITRATE ?? "128", 10),

  /** Optional LoRA for ace-synth (`--lora` / `--lora-scale`). */
  get loraPath() {
    const p = process.env.ACESTEP_LORA?.trim() ?? "";
    return p ? resolveModelFile(p) : "";
  },
  loraScale: parseFloat(process.env.ACESTEP_LORA_SCALE ?? "1.0"),

  /** VAE tiling (`--vae-chunk` / `--vae-overlap`). */
  vaeChunk: process.env.ACESTEP_VAE_CHUNK?.trim() ?? "",
  vaeOverlap: process.env.ACESTEP_VAE_OVERLAP?.trim() ?? "",

  audioStorageDir: process.env.ACESTEP_AUDIO_STORAGE ?? "./storage/audio",
  tmpDir: process.env.ACESTEP_TMPDIR ?? "./storage/tmp",
  queueMaxSize: parseInt(process.env.ACESTEP_QUEUE_MAXSIZE ?? "200", 10),
  queueWorkers: parseInt(process.env.ACESTEP_QUEUE_WORKERS ?? process.env.ACESTEP_API_WORKERS ?? "1", 10),

  /**
   * List of available model names shown by GET /v1/models.
   *
   * Resolution order:
   * 1. `ACESTEP_MODEL_MAP` keys — when an explicit name→path map is configured.
   * 2. `.gguf` files found in `modelsDir` — discovered at runtime.
   * 3. Fallback: `ACESTEP_MODELS` list as-is (no dir to scan), or `[defaultModel]`.
   *
   * `ACESTEP_MODELS` (comma-separated) acts as a **filter/gate** on the discovered list
   * (steps 1 & 2). When set, only names present in that list are returned.
   */
  get modelsList(): string[] {
    const filterRaw = process.env.ACESTEP_MODELS?.trim();
    const allowed = filterRaw ? new Set(filterRaw.split(",").map((s) => s.trim()).filter(Boolean)) : null;

    // 1. Explicit MODEL_MAP: use map keys
    const mapKeys = Object.keys(getModelMapRaw());
    if (mapKeys.length > 0) {
      return allowed ? mapKeys.filter((k) => allowed.has(k)) : mapKeys;
    }

    // 2. Scan models directory for .gguf files
    const dir = this.modelsDir;
    if (dir) {
      const scanned = listGgufFiles(dir);
      if (scanned.length > 0) {
        return allowed ? scanned.filter((n) => allowed.has(n)) : scanned;
      }
    }

    // 3. Fallback: use ACESTEP_MODELS list directly, or [defaultModel]
    if (allowed) return [...allowed];
    const def = this.defaultModel;
    return def ? [def] : [];
  },

  /**
   * Model name → resolved file path map derived from scanning `modelsDir`.
   * Used by `resolveDitPath` so per-request `model` accepts discovered filenames.
   * Only populated when `ACESTEP_MODEL_MAP` is not set.
   */
  get scannedModelMap(): Record<string, string> {
    if (Object.keys(getModelMapRaw()).length > 0) return {};
    const dir = this.modelsDir;
    if (!dir) return {};
    const files = listGgufFiles(dir);
    const out: Record<string, string> = {};
    for (const f of files) {
      out[f] = resolveModelFile(f);
    }
    return out;
  },

  /**
   * The default model name (used when no `model` is specified per request).
   *
   * Resolution order:
   * 1. `ACESTEP_DEFAULT_MODEL` — explicit override.
   * 2. First key of `ACESTEP_MODEL_MAP` — when a map is configured.
   * 3. First `.gguf` file in `modelsDir` — when the directory is scanned.
   * 4. `"acestep-v15-turbo"` — hardcoded fallback label.
   */
  get defaultModel(): string {
    const explicit = process.env.ACESTEP_DEFAULT_MODEL?.trim();
    if (explicit) return explicit;
    const mapKeys = Object.keys(getModelMapRaw());
    if (mapKeys.length > 0) return mapKeys[0];
    const dir = this.modelsDir;
    if (dir) {
      const scanned = listGgufFiles(dir);
      if (scanned.length > 0) return scanned[0];
    }
    return "acestep-v15-turbo";
  },

  avgJobWindow: parseInt(process.env.ACESTEP_AVG_WINDOW ?? "50", 10),
  avgJobSecondsDefault: parseFloat(process.env.ACESTEP_AVG_JOB_SECONDS ?? "5.0"),
};
