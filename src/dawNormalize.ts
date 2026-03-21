/**
 * Map ACE-Step-DAW request fields (FormData / JSON) to AceStep API + acestep.cpp request shape.
 * @see https://github.com/ace-step/ACE-Step-DAW — generationPipeline, types/api.ts
 */
export function normalizeDawBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  const tt = String(out.task_type ?? out.taskType ?? "").toLowerCase();

  if (tt === "lego") {
    const tn = out.track_name ?? out.trackName;
    if (tn != null && String(tn).trim() !== "" && !out.lego) {
      out.lego = String(tn)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
    }
    const gc = String(out.global_caption ?? out.globalCaption ?? "").trim();
    const pr = String(out.prompt ?? "").trim();
    const cap = String(out.caption ?? "").trim();
    if (!cap) {
      out.caption = [gc, pr].filter(Boolean).join("\n") || pr || gc;
    }
  }

  if (tt === "repaint") {
    const gc = String(out.global_caption ?? out.globalCaption ?? "").trim();
    const pr = String(out.prompt ?? "").trim();
    const cap = String(out.caption ?? "").trim();
    if (!cap) {
      out.caption = gc || pr;
    }
  }

  if (tt === "cover") {
    const cap = String(out.caption ?? "").trim();
    if (!cap) {
      const gc = String(out.global_caption ?? out.globalCaption ?? "").trim();
      if (gc) out.caption = gc;
    }
  }

  return out;
}
