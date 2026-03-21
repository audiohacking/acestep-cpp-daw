/** Env-based config. Binaries: https://github.com/audiohacking/acestep.cpp/releases/tag/v0.0.3 */
import { resolveModelFile, resolveModelMapPaths, resolveAcestepBinDir } from "./paths";

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
   * 1. `ACESTEP_MODELS` (comma-separated) — explicit override.
   * 2. Keys of `ACESTEP_MODEL_MAP` — derived automatically when a map is configured.
   * 3. `[defaultModel]` — single-model fallback so the endpoint always returns something.
   */
  get modelsList(): string[] {
    const explicit = process.env.ACESTEP_MODELS?.trim();
    if (explicit) return explicit.split(",").map((s) => s.trim()).filter(Boolean);
    const mapKeys = Object.keys(getModelMapRaw());
    if (mapKeys.length > 0) return mapKeys;
    const def = this.defaultModel;
    return def ? [def] : [];
  },

  /**
   * The default model name (used when no `model` is specified per request).
   *
   * Resolution order:
   * 1. `ACESTEP_DEFAULT_MODEL` — explicit override.
   * 2. First key of `ACESTEP_MODEL_MAP` — when a map is configured.
   * 3. `"acestep-v15-turbo"` — hardcoded fallback label.
   */
  get defaultModel(): string {
    const explicit = process.env.ACESTEP_DEFAULT_MODEL?.trim();
    if (explicit) return explicit;
    const mapKeys = Object.keys(getModelMapRaw());
    if (mapKeys.length > 0) return mapKeys[0] as string;
    return "acestep-v15-turbo";
  },

  avgJobWindow: parseInt(process.env.ACESTEP_AVG_WINDOW ?? "50", 10),
  avgJobSecondsDefault: parseFloat(process.env.ACESTEP_AVG_JOB_SECONDS ?? "5.0"),
};
