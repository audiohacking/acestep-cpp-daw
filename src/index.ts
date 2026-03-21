import { mkdir } from "fs/promises";
import { join, resolve } from "path";
import { existsSync } from "fs";
import { config, describeModelAutoconfig } from "./config";
import { requireAuth } from "./auth";
import { jsonRes } from "./res";
import { detailRes } from "./detail";
import * as store from "./store";
import * as queue from "./queue";
import { generateTaskId } from "./worker";
import { mergeMetadata, normalizeRepaintingBounds, parseParamObj } from "./normalize";
import { normalizeDawBody } from "./dawNormalize";
import { modelInventoryData, initModelResponse } from "./dawCompat";
import { tryServeDawStatic, dawDistRoot } from "./dawStatic";
import { parseFormBoolean } from "./parseBool";
import { isPathWithin } from "./paths";

const AUDIO_PATH_PREFIX = "/";

/** Run ace-synth with no arguments to confirm the binary is present and executable. */
async function probeAceSynth(): Promise<{ ok: boolean; path: string; hint: string }> {
  const binDir = config.acestepBinDir;
  const bin = join(binDir, process.platform === "win32" ? "ace-synth.exe" : "ace-synth");
  if (!existsSync(bin)) {
    return { ok: false, path: bin, hint: "binary not found" };
  }
  try {
    const proc = Bun.spawn([bin], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr] = await Promise.all([proc.stdout.text(), proc.stderr.text()]);
    await proc.exited;
    // ace-synth prints usage and exits non-zero when run with no arguments — that is expected.
    const out = (stdout + stderr).trim();
    return { ok: true, path: bin, hint: out.slice(0, 300) || "ok" };
  } catch (e) {
    return { ok: false, path: bin, hint: e instanceof Error ? e.message : String(e) };
  }
}

function parsePath(pathParam: string): string {
  const decoded = decodeURIComponent(pathParam);
  if (decoded.startsWith(AUDIO_PATH_PREFIX)) return decoded;
  return AUDIO_PATH_PREFIX + decoded.replace(/^\/+/, "");
}

async function parseBody(req: Request, jobDir?: string): Promise<Record<string, unknown>> {
  const ct = req.headers.get("Content-Type") ?? "";
  if (ct.includes("application/json")) {
    try {
      return (await req.json()) as Record<string, unknown>;
    } catch {
      throw new Error("invalid_json");
    }
  }
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const body: Record<string, unknown> = {};
    const audioExt = (name: string) => {
      const ext = name?.split(".").pop()?.toLowerCase() || "mp3";
      return ["mp3", "wav", "flac", "m4a", "ogg"].includes(ext) ? ext : "mp3";
    };
    for (const [k, v] of form) {
      if (v instanceof File && v.size > 0 && jobDir) {
        const isRef = k === "reference_audio" || k === "ref_audio";
        const isSrc = k === "src_audio" || k === "ctx_audio";
        if (isRef || isSrc) {
          const ext = audioExt(v.name ?? "");
          const name = isRef ? "ref_audio" : "src_audio";
          const path = join(jobDir, `${name}.${ext}`);
          await Bun.write(path, v);
          if (isRef) body.reference_audio_path = path;
          else body.src_audio_path = path;
        } else {
          body[k] = v;
        }
      } else if (v instanceof File && v.size > 0) {
        body[k] = v;
      } else if (typeof v === "string") {
        body[k] = v;
      }
    }
    return body;
  }
  if (ct.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    const body: Record<string, unknown> = {};
    params.forEach((v, k) => {
      body[k] = v;
    });
    return body;
  }
  return {};
}

function hasTextPrompt(b: Record<string, unknown>): boolean {
  const s = (v: unknown) => String(v ?? "").trim();
  return Boolean(
    s(b.prompt) ||
      s(b.caption) ||
      s(b.sample_query) ||
      s(b.sampleQuery) ||
      s(b.description) ||
      s(b.desc)
  );
}

/** True if body has reference or source audio (upload sets path; JSON can send path). */
function hasReferenceOrSourceAudio(b: Record<string, unknown>): boolean {
  const s = (v: unknown) => String(v ?? "").trim();
  return Boolean(s(b.src_audio_path ?? b.srcAudioPath) || s(b.reference_audio_path ?? b.referenceAudioPath));
}

/** task_type from API (cover, repaint, lego require reference/source audio). */
function getTaskType(b: Record<string, unknown>): string {
  return String(b.task_type ?? b.taskType ?? "text2music").toLowerCase();
}

const SAMPLE_SIMPLE = {
  caption: "Upbeat pop song with guitar accompaniment",
  lyrics: "[Verse 1]\nSunshine on my face...",
  bpm: 120,
  key_scale: "G Major",
  time_signature: "4",
  duration: 180,
  vocal_language: "en",
} as const;

const SAMPLE_CUSTOM = {
  caption: "Cinematic orchestral score with subtle electronic undertones",
  lyrics: "[Intro]\nStrings swell beneath a distant pulse...\n\n[Verse 1]\nShadows move where the light won't reach",
  bpm: 92,
  key_scale: "D minor",
  time_signature: "6",
  duration: 240,
  vocal_language: "en",
} as const;

function progressTextForTask(t: store.Task | undefined): string {
  if (!t) return "";
  if (t.status === 0) return t.queue_position != null ? "Queued…" : "Generating…";
  if (t.status === 1) return "Complete";
  return t.error ?? "Failed";
}

function queryResultRow(taskId: string, t: store.Task | undefined) {
  if (!t) {
    const fail = {
      file: "",
      wave: "",
      status: 2,
      create_time: Math.floor(Date.now() / 1000),
      env: "development",
      prompt: "",
      lyrics: "",
      metas: { genres: "", keyscale: "", timesignature: "" },
      generation_info: "unknown task_id",
      seed_value: "",
      lm_model: "",
      dit_model: "",
    };
    return {
      task_id: taskId,
      status: 2 as const,
      result: JSON.stringify([fail]),
      error: "unknown task_id",
      progress_text: "",
    };
  }
  const row: {
    task_id: string;
    status: number;
    result?: string;
    error?: string;
    progress_text: string;
  } = {
    task_id: t.task_id,
    status: t.status,
    progress_text: progressTextForTask(t),
  };
  if (t.status === 1 || t.status === 2) {
    if (t.result != null) row.result = t.result;
  }
  if (t.status === 2 && t.error) row.error = t.error;
  return row;
}

/** Same-origin DAW uses `fetch('/api/...')`; strip prefix so one server can serve UI + API. */
function stripApiPathPrefix(pathname: string): string {
  if (pathname === "/api") return "/";
  if (pathname.startsWith("/api/")) return pathname.slice(4) || "/";
  return pathname;
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = stripApiPathPrefix(url.pathname);

  if (path === "/health" && req.method === "GET") {
    const authErr = requireAuth(req.headers.get("Authorization"), undefined);
    if (authErr) return authErr;
    const lm = Boolean(config.lmModelPath?.trim());
    const probe = await probeAceSynth();
    return jsonRes({
      status: "ok",
      service: "ACE-Step API",
      version: "1.0",
      models_initialized: true,
      llm_initialized: lm,
      loaded_model: config.defaultModel,
      loaded_lm_model: lm ? config.lmModelPath : null,
      binary: probe.ok ? "ok" : "unavailable",
      binary_path: probe.path,
      binary_hint: probe.hint,
    });
  }

  if (path === "/v1/models" && req.method === "GET") {
    const authErr = requireAuth(req.headers.get("Authorization"), undefined);
    if (authErr) return authErr;
    return jsonRes(modelInventoryData());
  }

  if (path === "/v1/model_inventory" && req.method === "GET") {
    const authErr = requireAuth(req.headers.get("Authorization"), undefined);
    if (authErr) return authErr;
    return jsonRes(modelInventoryData());
  }

  if (path === "/v1/init" && req.method === "POST") {
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return detailRes("Invalid JSON body", 400);
    }
    const authErr2 = requireAuth(req.headers.get("Authorization"), body.ai_token as string);
    if (authErr2) return authErr2;
    return jsonRes(initModelResponse(body));
  }

  if (path === "/v1/stats" && req.method === "GET") {
    const authErr = requireAuth(req.headers.get("Authorization"), undefined);
    if (authErr) return authErr;
    const q = queue.queueSize();
    const counts = store.taskCounts();
    return jsonRes({
      jobs: counts,
      queue_size: q.queued,
      queue_maxsize: config.queueMaxSize,
      avg_job_seconds: store.avgJobSeconds(config.avgJobSecondsDefault),
    });
  }

  if (path === "/v1/audio" && req.method === "GET") {
    const authErr = requireAuth(req.headers.get("Authorization"), undefined);
    if (authErr) return authErr;
    const pathParam = url.searchParams.get("path");
    if (!pathParam) return detailRes("path required", 400);
    const requestedPath = parsePath(pathParam).replace(/^\/+/, "");
    const filePath = resolve(join(config.audioStorageDir, requestedPath));
    if (!isPathWithin(filePath, config.audioStorageDir)) {
      return detailRes("Not Found", 404);
    }
    try {
      const file = Bun.file(filePath);
      if (!(await file.exists())) return detailRes("Not Found", 404);
      const ext = filePath.endsWith(".wav") ? "wav" : filePath.endsWith(".flac") ? "flac" : "mp3";
      const mime =
        ext === "wav" ? "audio/wav" : ext === "flac" ? "audio/flac" : "audio/mpeg";
      return new Response(file, {
        headers: { "Content-Type": mime },
      });
    } catch {
      return detailRes("Not Found", 404);
    }
  }

  if (path === "/release_task" && req.method === "POST") {
    const ct = req.headers.get("Content-Type") ?? "";
    if (
      !ct.includes("application/json") &&
      !ct.includes("multipart/form-data") &&
      !ct.includes("application/x-www-form-urlencoded")
    ) {
      return detailRes("Unsupported Content-Type", 415);
    }

    const taskId = generateTaskId();
    const jobDir = join(config.tmpDir, taskId);
    await mkdir(jobDir, { recursive: true });

    let body: Record<string, unknown>;
    try {
      body = await parseBody(req, jobDir);
    } catch (e) {
      if (e instanceof Error && e.message === "invalid_json") {
        return detailRes("Invalid JSON body", 400);
      }
      throw e;
    }

    body = normalizeRepaintingBounds(normalizeDawBody(mergeMetadata(body)));
    const authErr2 = requireAuth(req.headers.get("Authorization"), body.ai_token as string);
    if (authErr2) return authErr2;

    const taskTypeEarly = getTaskType(body);
    if (taskTypeEarly === "stem_separation") {
      return detailRes(
        "task_type stem_separation is not supported by acestep-cpp-api (requires full ACE-Step Python server)",
        501
      );
    }

    const sampleMode = parseFormBoolean(body.sample_mode ?? body.sampleMode, false);
    if (!hasTextPrompt(body) && !sampleMode) {
      return detailRes("prompt, caption, or sample_query is required (or enable sample_mode)", 400);
    }

    const taskType = getTaskType(body);
    if (["cover", "repaint", "lego"].includes(taskType) && !hasReferenceOrSourceAudio(body)) {
      return detailRes(
        `task_type "${taskType}" requires reference or source audio: upload reference_audio/ref_audio or src_audio/ctx_audio (multipart), or set reference_audio_path/src_audio_path (JSON)`,
        400
      );
    }

    const audioFmt = String(body.audio_format ?? body.audioFormat ?? "mp3").toLowerCase();
    if (audioFmt === "flac") {
      return detailRes("audio_format flac is not supported by acestep.cpp; use mp3 or wav", 415);
    }

    const result = queue.enqueue(taskId, body);
    if (!result.ok) {
      return result.error?.includes("full") ? detailRes("Queue full", 429) : detailRes(result.error ?? "Bad request", 400);
    }
    return jsonRes({
      task_id: taskId,
      status: "queued",
      queue_position: result.position,
    });
  }

  if (path === "/query_result" && req.method === "POST") {
    const ct = req.headers.get("Content-Type") ?? "";
    if (!ct.includes("application/json") && !ct.includes("application/x-www-form-urlencoded")) {
      return detailRes("Unsupported Content-Type", 415);
    }
    let body: Record<string, unknown>;
    try {
      body = await parseBody(req).catch(() => ({}));
    } catch (e) {
      if (e instanceof Error && e.message === "invalid_json") {
        return detailRes("Invalid JSON body", 400);
      }
      throw e;
    }
    const authErr2 = requireAuth(req.headers.get("Authorization"), body.ai_token as string);
    if (authErr2) return authErr2;
    let list = body.task_id_list;
    if (typeof list === "string") {
      try {
        list = JSON.parse(list);
      } catch {
        return detailRes("task_id_list must be a JSON array or array", 400);
      }
    }
    const ids = Array.isArray(list) ? (list as string[]) : [];
    const data = ids.map((id) => queryResultRow(id, store.getTask(id)));
    return jsonRes(data);
  }

  if (path === "/format_input" && req.method === "POST") {
    const ct = req.headers.get("Content-Type") ?? "";
    if (!ct.includes("application/json") && !ct.includes("application/x-www-form-urlencoded")) {
      return detailRes("Unsupported Content-Type", 415);
    }
    let body: Record<string, unknown>;
    try {
      body = await parseBody(req);
    } catch (e) {
      if (e instanceof Error && e.message === "invalid_json") {
        return detailRes("Invalid JSON body", 400);
      }
      throw e;
    }
    const authErr2 = requireAuth(req.headers.get("Authorization"), body.ai_token as string);
    if (authErr2) return authErr2;
    const prompt = String(body.prompt ?? body.caption ?? "").trim();
    const lyrics = String(body.lyrics ?? "").trim();
    const params = parseParamObj(body.param_obj ?? body.paramObj);
    const bpm = typeof params.bpm === "number" ? params.bpm : params.bpm != null ? Number(params.bpm) : 120;
    const duration =
      typeof params.duration === "number" ? params.duration : params.duration != null ? Number(params.duration) : 180;
    const key_scale = String(params.key ?? params.key_scale ?? params.keyScale ?? "C Major");
    const time_signature = String(params.time_signature ?? params.timesignature ?? params.timeSignature ?? "4");
    const vocal_language = String(params.language ?? params.vocal_language ?? params.vocalLanguage ?? "en");
    return jsonRes({
      caption: prompt || "Enhanced music description",
      lyrics: lyrics || "Formatted lyrics...",
      bpm: Number.isFinite(bpm) ? bpm : 120,
      key_scale,
      time_signature,
      duration: Number.isFinite(duration) ? duration : 180,
      vocal_language,
    });
  }

  if (path === "/create_random_sample" && req.method === "POST") {
    const ct = req.headers.get("Content-Type") ?? "";
    if (!ct.includes("application/json") && !ct.includes("application/x-www-form-urlencoded")) {
      return detailRes("Unsupported Content-Type", 415);
    }
    let body: Record<string, unknown>;
    try {
      body = await parseBody(req).catch(() => ({}));
    } catch (e) {
      if (e instanceof Error && e.message === "invalid_json") {
        return detailRes("Invalid JSON body", 400);
      }
      throw e;
    }
    const authErr2 = requireAuth(req.headers.get("Authorization"), body.ai_token as string);
    if (authErr2) return authErr2;
    const sampleType = String(body.sample_type ?? body.sampleType ?? "simple_mode");
    const data = sampleType === "custom_mode" ? { ...SAMPLE_CUSTOM } : { ...SAMPLE_SIMPLE };
    return jsonRes(data);
  }

  if (req.method === "GET") {
    const staticRes = await tryServeDawStatic(path);
    if (staticRes) return staticRes;
  }

  return detailRes("Not Found", 404);
}

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  fetch: handle,
});

console.log(`acestep-cpp-api listening on http://${server.hostname}:${server.port}`);
console.log(`  acestep binaries: ${config.acestepBinDir}`);
for (const line of describeModelAutoconfig()) console.log(line);
if (config.modelsDir) {
  console.log(`  Effective LM path:        ${config.lmModelPath || "(none)"}`);
  console.log(`  Effective embedding path: ${config.embeddingModelPath || "(none)"}`);
  console.log(`  Effective DiT (default):  ${config.ditModelPath || "(none)"}`);
  console.log(`  Effective VAE path:       ${config.vaeModelPath || "(none)"}`);
  console.log(`  Lego DiT (base):          ${config.legoDitPath || "(none)"}`);
  console.log(`  Logical models:           ${config.modelsList.join(", ")}`);
}
console.log(`  ACE-Step-DAW static (if built): ${dawDistRoot()}`);
