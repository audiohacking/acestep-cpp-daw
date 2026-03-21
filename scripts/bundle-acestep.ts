#!/usr/bin/env bun
/**
 * Downloads acestep.cpp v0.0.3 release binaries for the current OS/arch and
 * installs the **full archive** into a **single flat directory**:
 * `<repo>/acestep-runtime/bin/` (every file by basename — ace-lm, ace-synth,
 * ace-server, ace-understand, neural-codec, mp3-codec, quantize, and all
 * shared libraries; no nested lib/ tree).
 *
 * @see https://github.com/audiohacking/acestep.cpp/releases/tag/v0.0.3
 * @see https://github.com/audiohacking/acestep.cpp/blob/master/README.md
 */
import { mkdir, readdir, chmod, rm, copyFile, stat } from "fs/promises";
import { join, dirname, basename } from "path";
import { existsSync } from "fs";

const TAG = "v0.0.3";
const REPO = "audiohacking/acestep.cpp";
const DOWNLOAD_BASE = `https://github.com/${REPO}/releases/download/${TAG}`;

const root = join(dirname(import.meta.path), "..");
const cacheDir = join(root, "bundled", ".cache");
const outBin = join(root, "acestep-runtime", "bin");

type Asset = { name: string };

function pickAsset(): Asset | null {
  if (process.env.SKIP_ACESTEP_BUNDLE === "1") {
    console.log("[bundle-acestep] SKIP_ACESTEP_BUNDLE=1 — skipping download.");
    return null;
  }
  const { platform, arch } = process;
  if (platform === "linux" && arch === "x64") return { name: "acestep-linux-x64.tar.gz" };
  if (platform === "darwin" && arch === "arm64") return { name: "acestep-macos-arm64-metal.tar.gz" };
  if (platform === "darwin" && arch === "x64") {
    console.warn(
      "[bundle-acestep] No official v0.0.3 asset for darwin-x64. Use Apple Silicon build, Docker, or set ACESTEP_BIN_DIR."
    );
    return null;
  }
  if (platform === "win32" && arch === "x64") return { name: "acestep-windows-x64.zip" };
  console.warn(`[bundle-acestep] Unsupported host ${platform}-${arch}. Set ACESTEP_BIN_DIR manually.`);
  return null;
}

async function walkFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await walkFiles(p)));
    else out.push(p);
  }
  return out;
}

async function extractArchive(archivePath: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });
  const lower = archivePath.toLowerCase();
  const args =
    lower.endsWith(".zip") ? ["-xf", archivePath, "-C", destDir] : ["-xzf", archivePath, "-C", destDir];
  const proc = Bun.spawn(["tar", ...args], { stdout: "inherit", stderr: "inherit" });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`tar extract failed with code ${code}`);
  }
}

/** Release archives usually contain a single top-level directory. */
async function resolvePackageRoot(extractRoot: string): Promise<string> {
  const entries = await readdir(extractRoot, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  const files = entries.filter((e) => e.isFile());
  if (dirs.length === 1 && files.length === 0) {
    return join(extractRoot, dirs[0]!.name);
  }
  return extractRoot;
}

/**
 * Copy every file from the extracted tree into `outBin` using **basename only**
 * (flat layout so loaders find libs next to ace-lm / ace-synth).
 */
async function flattenIntoBin(packageRoot: string, outBinDir: string): Promise<number> {
  await mkdir(outBinDir, { recursive: true });
  const sources = await walkFiles(packageRoot);
  const seen = new Map<string, string>();

  for (const src of sources) {
    const name = basename(src);
    const prev = seen.get(name);
    if (prev && prev !== src) {
      throw new Error(
        `[bundle-acestep] Duplicate basename "${name}" in archive:\n  ${prev}\n  ${src}\n` +
          "Cannot flatten to a single directory; report this layout."
      );
    }
    seen.set(name, src);
    await copyFile(src, join(outBinDir, name));
  }
  return sources.length;
}

async function main() {
  const asset = pickAsset();
  if (!asset) return;

  await mkdir(cacheDir, { recursive: true });
  const archivePath = join(cacheDir, asset.name);
  const url = `${DOWNLOAD_BASE}/${asset.name}`;

  if (!existsSync(archivePath)) {
    console.log(`[bundle-acestep] Downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Download failed ${res.status}: ${url}`);
    }
    await Bun.write(archivePath, res);
  } else {
    console.log(`[bundle-acestep] Using cached ${archivePath}`);
  }

  const extractRoot = join(cacheDir, `extract-${TAG}-${asset.name.replace(/[^a-z0-9]+/gi, "-")}`);
  await rm(extractRoot, { recursive: true, force: true });
  await mkdir(extractRoot, { recursive: true });
  console.log(`[bundle-acestep] Extracting to ${extractRoot}`);
  await extractArchive(archivePath, extractRoot);

  const packageRoot = await resolvePackageRoot(extractRoot);
  const all = await walkFiles(packageRoot);
  const wantLm = process.platform === "win32" ? "ace-lm.exe" : "ace-lm";
  const wantSynth = process.platform === "win32" ? "ace-synth.exe" : "ace-synth";
  const lm = all.find((p) => basename(p) === wantLm);
  const synth = all.find((p) => basename(p) === wantSynth);
  if (!lm || !synth) {
    throw new Error(`Could not find ${wantLm} / ${wantSynth} under ${packageRoot}`);
  }

  const runtimeDir = join(root, "acestep-runtime");
  await rm(runtimeDir, { recursive: true, force: true });
  console.log(`[bundle-acestep] Flattening ${packageRoot} → ${outBin}`);
  const n = await flattenIntoBin(packageRoot, outBin);

  if (process.platform !== "win32") {
    for (const name of await readdir(outBin)) {
      if (name.endsWith(".a")) continue;
      const p = join(outBin, name);
      const st = await stat(p).catch(() => null);
      if (st?.isFile()) await chmod(p, 0o755);
    }
  }

  if (!existsSync(join(outBin, wantLm)) || !existsSync(join(outBin, wantSynth))) {
    throw new Error(`After install, missing ${wantLm} or ${wantSynth} under ${outBin}`);
  }

  console.log(
    `[bundle-acestep] Installed ${n} files into ${outBin}\n` +
      `  ${join(outBin, wantLm)}\n` +
      `  ${join(outBin, wantSynth)}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
