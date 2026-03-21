import { existsSync } from "fs";
import { extname, join, normalize, resolve } from "path";
import { getResourceRoot } from "./paths";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".wasm": "application/wasm",
};

/** Vite build output directory for ACE-Step-DAW submodule. */
export function dawDistRoot(): string {
  const env = process.env.ACESTEP_DAW_DIST?.trim();
  if (env) return resolve(env);
  return join(getResourceRoot(), "ACE-Step-DAW", "dist");
}

/**
 * Serve a file from the DAW `dist/` folder, or `index.html` for SPA routes.
 * Returns null if dist is missing or path escapes root.
 */
export async function tryServeDawStatic(pathname: string): Promise<Response | null> {
  const root = normalize(dawDistRoot());
  if (!existsSync(root)) return null;

  let rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (rel.includes("..")) return null;

  const candidate = normalize(join(root, rel));
  if (!candidate.startsWith(root)) return null;

  let filePath = candidate;
  let file = Bun.file(filePath);
  if (!(await file.exists())) {
    filePath = join(root, "index.html");
    file = Bun.file(filePath);
    if (!(await file.exists())) return null;
  }

  const ext = extname(filePath).toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";
  return new Response(file, {
    headers: {
      "Content-Type": type,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    },
  });
}
