/**
 * acestep.cpp rejects repaint when repainting_end <= repainting_start (in resolved seconds).
 * If both bounds are set in the request and end <= start, clear to **-1** (ace-synth “unset” default).
 * DAW beat vs second mismatches on short audio are fixed in `clampRepaintingToSourceAudio` (worker).
 */
export function normalizeRepaintingBounds(body: Record<string, unknown>): Record<string, unknown> {
  const toNum = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const rs = toNum(body.repainting_start ?? body.repaintingStart);
  const re = toNum(body.repainting_end ?? body.repaintingEnd);
  if (rs == null || re == null) return body;
  if (re <= rs) {
    body.repainting_start = -1;
    body.repainting_end = -1;
    body.repaintingStart = -1;
    body.repaintingEnd = -1;
  }
  return body;
}

/** Flatten AceStep API metas / metadata / user_metadata into the root body. */
export function mergeMetadata(body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body };
  const metas = (body.metas ?? body.metadata ?? body.user_metadata) as Record<string, unknown> | undefined;
  if (metas && typeof metas === "object") {
    for (const [k, v] of Object.entries(metas)) {
      if (out[k] === undefined || out[k] === null || out[k] === "") {
        out[k] = v;
      }
    }
  }
  return out;
}

/** Parse param_obj for /format_input (JSON string). */
export function parseParamObj(raw: unknown): Record<string, unknown> {
  if (raw == null || raw === "") return {};
  const s = typeof raw === "string" ? raw : JSON.stringify(raw);
  try {
    const o = JSON.parse(s) as unknown;
    return typeof o === "object" && o != null && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
