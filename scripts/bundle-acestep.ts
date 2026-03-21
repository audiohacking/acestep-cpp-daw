#!/usr/bin/env bun
/**
 * Downloads acestep.cpp v0.0.3 release binaries for the current OS/arch and
 * installs the full archive contents under <repo>/acestep-runtime/bin
 * (ace-lm, ace-synth, ace-server, ace-understand, neural-codec, mp3-codec,
 * quantize, and all shared libraries).
 *
 * @see https://github.com/audiohacking/acestep.cpp/releases/tag/v0.0.3
 * @see https://github.com/audiohacking/acestep.cpp/blob/master/README.md
 */
import { mkdir, readdir, copyFile, chmod, rm } from "fs/promises";
import { join, dirname } from "path";
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

  const all = await walkFiles(extractRoot);
  const wantLm = process.platform === "win32" ? "ace-lm.exe" : "ace-lm";
  const wantSynth = process.platform === "win32" ? "ace-synth.exe" : "ace-synth";
  const lm = all.find((p) => (p.split(/[/\\]/).pop() ?? "") === wantLm);
  const synth = all.find((p) => (p.split(/[/\\]/).pop() ?? "") === wantSynth);
  if (!lm || !synth) {
    throw new Error(`Could not find ${wantLm} / ${wantSynth} under ${extractRoot}`);
  }

  await rm(outBin, { recursive: true, force: true });
  await mkdir(outBin, { recursive: true });

  // Copy every file from the archive root so that shared libraries
  // (libggml*.so / *.dylib / *.dll) and helper binaries are all present.
  const installed: string[] = [];
  for (const srcPath of all) {
    const name = srcPath.split(/[/\\]/).pop() ?? "";
    const destPath = join(outBin, name);
    await copyFile(srcPath, destPath);
    installed.push(destPath);
  }

  if (process.platform !== "win32") {
    // Make all regular files (not static libs) executable so every binary works.
    for (const destPath of installed) {
      if (!destPath.endsWith(".a")) {
        await chmod(destPath, 0o755);
      }
    }
  }

  console.log(`[bundle-acestep] Installed ${installed.length} file(s) to ${outBin}:\n  ${installed.map((p) => p.split(/[/\\]/).pop()).join("\n  ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
