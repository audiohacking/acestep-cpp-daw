/** Env-based config. Binaries: https://github.com/audiohacking/acestep.cpp/releases/tag/v0.0.3 */
import { join, resolve } from "path";
import { scanModelsDirectory, type ModelScanResult } from "./modelScan";
import { resolveModelFile, resolveModelMapPaths, resolveAcestepBinDir, toAbsolutePath } from "./paths";

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

const modelMapRaw = parseModelMap(process.env.ACESTEP_MODEL_MAP ?? "");

function modelsDirRaw(): string {
  return (
    process.env.ACESTEP_MODELS_DIR?.trim() ||
    process.env.ACESTEP_MODEL_PATH?.trim() ||
    process.env.MODELS_DIR?.trim() ||
    ""
  );
}

let scanCacheKey = "";
let scanCache: ModelScanResult = { allGgufs: [] };

function getScan(): ModelScanResult {
  const raw = modelsDirRaw();
  if (!raw) {
    scanCacheKey = "";
    scanCache = { allGgufs: [] };
    return scanCache;
  }
  const key = resolve(raw);
  if (scanCacheKey === key) return scanCache;
  scanCacheKey = key;
  scanCache = scanModelsDirectory(key);
  return scanCache;
}

function joinIfDir(basename: string | undefined): string {
  if (!basename) return "";
  const dir = modelsDirRaw();
  if (!dir) return basename;
  return join(resolve(dir), basename);
}

export const config = {
  host: process.env.ACESTEP_API_HOST ?? "127.0.0.1",
  port: parseInt(process.env.ACESTEP_API_PORT ?? "8001", 10),
  apiKey: process.env.ACESTEP_API_KEY ?? "",

  /** Directory with `ace-lm` / `ace-synth` (bundled `acestep-runtime/bin` or `ACESTEP_BIN_DIR`). */
  get acestepBinDir() {
    return resolveAcestepBinDir();
  },

  /** LM GGUF: env, else best match in `ACESTEP_MODELS_DIR` (e.g. *5Hz*lm*.gguf). */
  get lmModelPath() {
    const e = process.env.ACESTEP_LM_MODEL ?? process.env.ACESTEP_LM_MODEL_PATH ?? "";
    if (e.trim()) return resolveModelFile(e);
    return joinIfDir(getScan().lm);
  },

  get embeddingModelPath() {
    const e = process.env.ACESTEP_EMBEDDING_MODEL ?? "";
    if (e.trim()) return resolveModelFile(e);
    return joinIfDir(getScan().embedding);
  },

  /**
   * Default DiT when no `model` name: **base** first (lego-safe; see examples/lego.sh).
   * Override with ACESTEP_DIT_MODEL.
   */
  get ditModelPath() {
    const e = process.env.ACESTEP_DIT_MODEL ?? process.env.ACESTEP_CONFIG_PATH ?? "";
    if (e.trim()) return resolveModelFile(e);
    const s = getScan();
    if (s.ditBase) return joinIfDir(s.ditBase);
    if (s.ditTurbo) return joinIfDir(s.ditTurbo);
    return "";
  },

  get vaeModelPath() {
    const e = process.env.ACESTEP_VAE_MODEL ?? "";
    if (e.trim()) return resolveModelFile(e);
    return joinIfDir(getScan().vae);
  },

  /**
   * Env `ACESTEP_MODEL_MAP` wins; then autofill `acestep-v15-base` / `acestep-v15-turbo` / `acestep-v15-turbo-shift3`
   * from scanned basenames.
   */
  get modelMap(): Record<string, string> {
    const envMap = resolveModelMapPaths(modelMapRaw);
    const dir = modelsDirRaw();
    if (!dir) return envMap;
    const abs = resolve(dir);
    const s = getScan();
    const out: Record<string, string> = { ...envMap };
    const add = (logical: string, basename: string | undefined) => {
      if (!basename || out[logical]) return;
      out[logical] = join(abs, basename);
    };
    add("acestep-v15-base", s.ditBase);
    add("acestep-v15-turbo", s.ditTurbo);
    add("acestep-v15-turbo-shift3", s.ditTurboShift3);
    return out;
  },

  get modelsDir() {
    return modelsDirRaw();
  },

  mp3Bitrate: parseInt(process.env.ACESTEP_MP3_BITRATE ?? "128", 10),

  get loraPath() {
    const p = process.env.ACESTEP_LORA?.trim() ?? "";
    return p ? resolveModelFile(p) : "";
  },
  loraScale: parseFloat(process.env.ACESTEP_LORA_SCALE ?? "1.0"),

  vaeChunk: process.env.ACESTEP_VAE_CHUNK?.trim() ?? "",
  vaeOverlap: process.env.ACESTEP_VAE_OVERLAP?.trim() ?? "",

  /** Always absolute — ace-synth is spawned with `cwd` = job dir; relative JSON paths must not depend on cwd. */
  get audioStorageDir() {
    return toAbsolutePath(process.env.ACESTEP_AUDIO_STORAGE ?? "./storage/audio");
  },
  get tmpDir() {
    return toAbsolutePath(process.env.ACESTEP_TMPDIR ?? "./storage/tmp");
  },
  queueMaxSize: parseInt(process.env.ACESTEP_QUEUE_MAXSIZE ?? "200", 10),
  queueWorkers: parseInt(process.env.ACESTEP_QUEUE_WORKERS ?? process.env.ACESTEP_API_WORKERS ?? "1", 10),

  /** Logical names present in modelMap (env + scan). */
  get modelsList() {
    const env = process.env.ACESTEP_MODELS?.trim();
    if (env) {
      return env
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const mm = config.modelMap;
    const order = ["acestep-v15-base", "acestep-v15-turbo", "acestep-v15-turbo-shift3"] as const;
    const found = order.filter((k) => Boolean(mm[k]?.trim()));
    if (found.length) return [...found];
    return ["acestep-v15-base", "acestep-v15-turbo"];
  },

  /** Default DiT logical name: **base** for lego compatibility (acestep.cpp examples/lego.sh). */
  get defaultModel() {
    return process.env.ACESTEP_DEFAULT_MODEL?.trim() || "acestep-v15-base";
  },

  /** Resolved path for lego DiT (base only; turbo does not support lego per acestep.cpp examples). */
  get legoDitPath() {
    const m = config.modelMap["acestep-v15-base"];
    if (m?.trim()) return m;
    return joinIfDir(getScan().ditBase);
  },

  avgJobWindow: parseInt(process.env.ACESTEP_AVG_WINDOW ?? "50", 10),
  avgJobSecondsDefault: parseFloat(process.env.ACESTEP_AVG_JOB_SECONDS ?? "5.0"),
};

/** Lines to print at startup (model autodetect + effective paths). */
export function describeModelAutoconfig(): string[] {
  const raw = modelsDirRaw();
  if (!raw) {
    return ["  Model autoconfig: ACESTEP_MODELS_DIR not set (set it to enable scanning)"];
  }
  const abs = resolve(raw);
  const s = getScan();
  const lines: string[] = [`  Model scan directory: ${abs}`];
  lines.push(`    LM (5Hz):           ${s.lm ?? "— (set ACESTEP_LM_MODEL if missing)"}`);
  lines.push(`    Embedding:          ${s.embedding ?? "—"}`);
  lines.push(`    VAE:                ${s.vae ?? "—"}`);
  lines.push(`    DiT base (lego):    ${s.ditBase ?? "— (required for lego; see acestep.cpp examples/lego.sh)"}`);
  lines.push(`    DiT turbo:          ${s.ditTurbo ?? "—"}`);
  lines.push(`    DiT turbo + shift:  ${s.ditTurboShift3 ?? "—"}`);
  lines.push(`    Default logical model: ${config.defaultModel} (override: ACESTEP_DEFAULT_MODEL)`);
  return lines;
}
