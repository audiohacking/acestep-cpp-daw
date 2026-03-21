/**
 * Scan a flat directory of .gguf files and infer acestep.cpp roles
 * (see https://github.com/audiohacking/acestep.cpp examples + README).
 */
import { existsSync, readdirSync } from "fs";
import { resolve } from "path";

export type ModelScanResult = {
  /** Basenames only (exist under scanned dir). */
  lm?: string;
  embedding?: string;
  vae?: string;
  ditBase?: string;
  ditTurbo?: string;
  ditTurboShift3?: string;
  allGgufs: string[];
};

function pickLm(files: string[]): string | undefined {
  const by5hzLm = files.find((f) => /5hz.*lm|lm.*5hz/i.test(f));
  if (by5hzLm) return by5hzLm;
  return files.find((f) => /acestep.*lm.*\.gguf$/i.test(f));
}

function pickEmbedding(files: string[]): string | undefined {
  return files.find((f) => /embedding/i.test(f));
}

function pickVae(files: string[]): string | undefined {
  const candidates = files.filter((f) => {
    const l = f.toLowerCase();
    return l.includes("vae") && !l.includes("embedding");
  });
  return candidates.sort((a, b) => a.length - b.length)[0];
}

function pickDitBase(files: string[]): string | undefined {
  return files.find((f) => /v15-base|v15_base/i.test(f));
}

function pickDitTurboShift3(files: string[]): string | undefined {
  return files.find((f) => /v15-turbo/i.test(f) && /shift/i.test(f));
}

function pickDitTurbo(files: string[]): string | undefined {
  return files.find((f) => /v15-turbo/i.test(f) && !/shift/i.test(f));
}

/**
 * List *.gguf in `absDir` (non-recursive) and assign best-effort roles.
 */
export function scanModelsDirectory(absDir: string): ModelScanResult {
  const dir = resolve(absDir);
  if (!existsSync(dir)) {
    return { allGgufs: [] };
  }
  const files = readdirSync(dir).filter((name) => name.endsWith(".gguf"));
  if (!files.length) {
    return { allGgufs: [] };
  }
  const shift3 = pickDitTurboShift3(files);
  const turbo = pickDitTurbo(files);
  const base = pickDitBase(files);
  return {
    allGgufs: files,
    lm: pickLm(files),
    embedding: pickEmbedding(files),
    vae: pickVae(files),
    ditBase: base,
    ditTurbo: turbo,
    ditTurboShift3: shift3,
  };
}
