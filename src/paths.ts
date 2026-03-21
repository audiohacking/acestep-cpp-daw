import { existsSync, readdirSync } from "fs";
import { dirname, join, resolve, isAbsolute, sep } from "path";

/**
 * Root used to resolve `acestep-runtime/` and default paths.
 * - Packaged `acestep-api`: directory containing the executable (sibling `acestep-runtime/`).
 * - Dev: project root (parent of `src/`).
 */
export function getResourceRoot(): string {
  if (process.env.ACESTEP_APP_ROOT) {
    return resolve(process.env.ACESTEP_APP_ROOT);
  }
  const exe = process.execPath;
  const base = exe.split(/[/\\]/).pop() ?? "";
  if (base === "acestep-api" || base === "acestep-api.exe") {
    return dirname(exe);
  }
  const here = import.meta.path;
  return resolve(dirname(here), "..");
}

/** Default bundled acestep.cpp binaries (from `scripts/bundle-acestep.ts`). */
export function defaultBundledBinDir(root: string): string {
  return join(root, "acestep-runtime", "bin");
}

export function resolveAcestepBinDir(): string {
  const explicit = process.env.ACESTEP_BIN_DIR?.trim();
  if (explicit) return resolve(explicit);
  const root = getResourceRoot();
  const bundled = defaultBundledBinDir(root);
  const lm = join(bundled, process.platform === "win32" ? "ace-lm.exe" : "ace-lm");
  if (existsSync(lm)) {
    return bundled;
  }
  return resolve(root, "acestep-bin");
}

/**
 * If `ACESTEP_MODELS_DIR` / `MODELS_DIR` is set, bare filenames resolve under it;
 * absolute paths and `./` / `../` stay relative to resource root or cwd semantics below.
 */
export function resolveModelFile(pathOrName: string): string {
  const p = pathOrName.trim();
  if (!p) return p;
  if (isAbsolute(p)) return p;
  if (p.startsWith("./") || p.startsWith("../")) {
    return resolve(getResourceRoot(), p);
  }
  const dir =
    process.env.ACESTEP_MODELS_DIR?.trim() ||
    process.env.ACESTEP_MODEL_PATH?.trim() ||
    process.env.MODELS_DIR?.trim() ||
    "";
  if (!dir) return p;
  return join(resolve(dir), p);
}

export function resolveModelMapPaths(map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    out[k] = resolveModelFile(v);
  }
  return out;
}

/**
 * Resolve reference/source audio path for ace-synth --src-audio.
 * Absolute paths and upload paths (already absolute) stay as-is; relative paths resolve against resource root.
 */
export function resolveReferenceAudioPath(pathOrName: string): string {
  const p = pathOrName.trim();
  if (!p) return p;
  if (isAbsolute(p)) return p;
  return join(resolve(getResourceRoot()), p);
}

/**
 * Returns true when `child` is equal to `parent` or is strictly inside it.
 * Both paths are resolved to absolute form before comparison so relative
 * segments, symlink-safe strings, and double-slashes are all normalized.
 */
export function isPathWithin(child: string, parent: string): boolean {
  const resolvedChild = resolve(child);
  const resolvedParent = resolve(parent);
  return (
    resolvedChild === resolvedParent ||
    resolvedChild.startsWith(resolvedParent + sep)
  );
}

/**
 * Returns basenames of `.gguf` files found in `dir`, sorted alphabetically.
 * Returns `[]` if `dir` is empty, does not exist, or cannot be read.
 */
export function listGgufFiles(dir: string): string[] {
  if (!dir) return [];
  try {
    return readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".gguf"))
      .sort();
  } catch {
    return [];
  }
}
