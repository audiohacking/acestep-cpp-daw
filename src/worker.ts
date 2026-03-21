import { randomUUID } from "crypto";
import { mkdir, writeFile, rename, unlink, readdir, readFile } from "fs/promises";
import { join, resolve } from "path";
import { config } from "./config";
import * as store from "./store";
import { mergeMetadata } from "./normalize";
import { resolveModelFile, resolveReferenceAudioPath, isPathWithin } from "./paths";

/** API body (snake_case / camelCase) -> acestep.cpp request JSON. */
export function apiToRequestJson(body: Record<string, unknown>): Record<string, unknown> {
  const str = (v: unknown) => (v == null ? "" : String(v));
  const num = (v: unknown, def: number) => (v == null || v === "" ? def : Number(v));
  const prompt = str(body.prompt ?? body.caption ?? "");
  const lyrics = str(body.lyrics ?? "");
  const useFormat = Boolean(body.use_format ?? body.useFormat ?? body.format ?? false);
  /** API default `thinking` is false (ACE-Step 1.5 API.md). */
  const thinking = body.thinking === true;
  const sampleMode = Boolean(body.sample_mode ?? body.sampleMode ?? false);
  const batchSize = Math.min(8, Math.max(1, num(body.batch_size ?? body.batchSize, 2)));
  const seed = num(body.seed, -1);
  const useRandomSeed = body.use_random_seed !== false && body.useRandomSeed !== false;

  let audioCodes = "";
  const ac = body.audio_code_string ?? body.audioCodeString;
  if (Array.isArray(ac)) audioCodes = ac.map(String).join(",");
  else if (ac != null && ac !== "") audioCodes = str(ac);

  const req: Record<string, unknown> = {
    caption: prompt,
    lyrics,
    bpm: num(body.bpm, 0),
    duration: num(body.audio_duration ?? body.duration ?? body.audioDuration ?? body.target_duration, 0),
    keyscale: str(body.key_scale ?? body.keyscale ?? body.keyScale ?? ""),
    timesignature: str(body.time_signature ?? body.timesignature ?? body.timeSignature ?? ""),
    vocal_language: str(body.vocal_language ?? body.vocalLanguage ?? "en"),
    seed: useRandomSeed ? -1 : seed,
    batch_size: batchSize,
    lm_temperature: num(body.lm_temperature ?? body.lmTemperature, 0.85),
    lm_cfg_scale: num(body.lm_cfg_scale ?? body.lmCfgScale, 2.5),
    lm_top_p: num(body.lm_top_p ?? body.lmTopP, 0.9),
    lm_top_k: num(body.lm_top_k ?? body.lmTopK, 0) || 0,
    lm_negative_prompt: str(body.lm_negative_prompt ?? body.lmNegativePrompt ?? "NO USER INPUT"),
    use_cot_caption: body.use_cot_caption !== false && body.useCotCaption !== false,
    use_cot_language: body.use_cot_language !== false && body.useCotLanguage !== false,
    constrained_decoding: body.constrained_decoding !== false && body.constrainedDecoding !== false && body.constrained !== false,
    audio_codes: audioCodes,
    inference_steps: num(body.inference_steps ?? body.inferenceSteps, 8),
    guidance_scale: num(body.guidance_scale ?? body.guidanceScale, 7.0),
    shift: num(body.shift, 3.0),
    audio_cover_strength: num(body.audio_cover_strength ?? body.audioCoverStrength, 0.5),
    repainting_start: num(body.repainting_start ?? body.repaintingStart, -1),
    repainting_end:
      body.repainting_end != null
        ? num(body.repainting_end, -1)
        : body.repaintingEnd != null
          ? num(body.repaintingEnd, -1)
          : -1,
    lego: str(body.lego ?? ""),
  };

  const desc = body.sample_query ?? body.sampleQuery ?? body.description ?? body.desc;
  if (desc) req.caption = str(desc);

  if (sampleMode && !req.caption) {
    req.caption = "Original instrumental music with varied instrumentation and emotional progression";
  }

  const timesteps = body.timesteps;
  if (typeof timesteps === "string" && timesteps.trim()) req.timesteps = timesteps.trim();

  const inferMethod = body.infer_method ?? body.inferMethod;
  if (typeof inferMethod === "string" && inferMethod) req.infer_method = inferMethod;

  const lmRep = body.lm_repetition_penalty ?? body.lmRepetitionPenalty;
  if (lmRep != null && lmRep !== "") req.lm_repetition_penalty = num(lmRep, 1.0);

  if (typeof body.use_adg === "boolean") req.use_adg = body.use_adg;
  const cfgStart = body.cfg_interval_start ?? body.cfgIntervalStart;
  const cfgEnd = body.cfg_interval_end ?? body.cfgIntervalEnd;
  if (cfgStart != null) req.cfg_interval_start = num(cfgStart, 0);
  if (cfgEnd != null) req.cfg_interval_end = num(cfgEnd, 1);

  if (!thinking) {
    req.audio_codes = "";
  }

  void useFormat;
  return req;
}

/** Whether to run ace-lm (5Hz LM): skip when user supplied audio_codes or when no LM path. */
export function shouldRunAceLm(body: Record<string, unknown>, reqJson: Record<string, unknown>): boolean {
  const codes = String(reqJson.audio_codes ?? "").trim();
  if (codes.length > 0) return false;
  const thinking = Boolean(body.thinking ?? false);
  const useFormat = Boolean(body.use_format ?? body.useFormat ?? body.format ?? false);
  const sampleMode = Boolean(body.sample_mode ?? body.sampleMode ?? false);
  return thinking || useFormat || sampleMode;
}

export function resolveLmPath(body: Record<string, unknown>): string {
  const p = body.lm_model_path ?? body.lmModelPath;
  if (typeof p === "string" && p.trim()) {
    const resolved = resolveModelFile(p.trim());
    const dir = config.modelsDir;
    if (dir && !isPathWithin(resolved, dir)) {
      throw new Error(
        `lm_model_path is not within the configured models directory`
      );
    }
    return resolved;
  }
  return config.lmModelPath;
}

export function resolveDitPath(body: Record<string, unknown>): string {
  const modelName = typeof body.model === "string" ? body.model.trim() : "";
  if (modelName) {
    if (config.modelMap[modelName]) return config.modelMap[modelName];
    const scanned = config.scannedModelMap;
    if (scanned[modelName]) return scanned[modelName];
    throw new Error(`Unknown model "${modelName}". Use GET /v1/models to list available models.`);
  }
  if (!config.ditModelPath) throw new Error("ACESTEP_DIT_MODEL or ACESTEP_CONFIG_PATH not set");
  return config.ditModelPath;
}

export function resolvedModelName(body: Record<string, unknown>): string {
  const modelName = typeof body.model === "string" ? body.model.trim() : "";
  return modelName || config.defaultModel;
}

async function exec(cwd: string, cmd: string, args: string[]): Promise<void> {
  const proc = Bun.spawn([cmd, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([proc.stdout.text(), proc.stderr.text()]);
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`exit ${code}: ${stderr || stdout}`);
  }
}

/** Sorted paths: request0.json, request1.json, ... (excludes request.json). */
async function listNumberedRequestJsons(jobDir: string): Promise<string[]> {
  const entries = await readdir(jobDir);
  const re = /^request(\d+)\.json$/;
  return entries
    .filter((e) => re.test(e))
    .sort((a, b) => Number(re.exec(a)![1]) - Number(re.exec(b)![1]))
    .map((e) => join(jobDir, e));
}

/** Output files from ace-synth batch: request00.mp3, request10.mp3, ... */
async function listSynthOutputs(jobDir: string, ext: string): Promise<string[]> {
  const entries = await readdir(jobDir);
  const re = new RegExp(`^request\\d+\\.${ext}$`);
  return entries
    .filter((e) => re.test(e))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((e) => join(jobDir, e));
}

async function readResultMetas(requestJsonPath: string): Promise<{
  caption: string;
  lyrics: string;
  bpm?: number;
  duration?: number;
  keyscale: string;
  timesignature: string;
  seed_value: string;
}> {
  try {
    const raw = await readFile(requestJsonPath, "utf8");
    const j = JSON.parse(raw) as Record<string, unknown>;
    return {
      caption: String(j.caption ?? ""),
      lyrics: String(j.lyrics ?? ""),
      bpm: typeof j.bpm === "number" ? j.bpm : j.bpm != null ? Number(j.bpm) : undefined,
      duration: typeof j.duration === "number" ? j.duration : j.duration != null ? Number(j.duration) : undefined,
      keyscale: String(j.keyscale ?? ""),
      timesignature: String(j.timesignature ?? ""),
      seed_value: String(j.seed ?? "-1"),
    };
  } catch {
    return { caption: "", lyrics: "", keyscale: "", timesignature: "", seed_value: "-1" };
  }
}

export async function runPipeline(taskId: string): Promise<void> {
  const t = store.getTask(taskId);
  if (!t || t.status !== 0) return;

  const rawBody = t._body ?? {};
  const body = mergeMetadata(rawBody);
  const jobDir = join(config.tmpDir, taskId);
  const requestPath = join(jobDir, "request.json");
  const started = Date.now();

  try {
    await mkdir(jobDir, { recursive: true });
    const reqJson = apiToRequestJson(body);
    await writeFile(requestPath, JSON.stringify(reqJson, null, 0));

    /** ace-lm: `--request <json> --lm <gguf>` per acestep.cpp README */
    const binDir = config.acestepBinDir;
    const aceLm = join(binDir, process.platform === "win32" ? "ace-lm.exe" : "ace-lm");
    /** ace-synth: default MP3 128 kbps; `--wav` for WAV (stereo 48 kHz). */
    const aceSynth = join(binDir, process.platform === "win32" ? "ace-synth.exe" : "ace-synth");

    const lmPath = resolveLmPath(body);
    const runLm = Boolean(lmPath && shouldRunAceLm(body, reqJson));

    if (shouldRunAceLm(body, reqJson) && !lmPath) {
      throw new Error("ACESTEP_LM_MODEL (or lm_model_path) required when thinking, use_format, or sample_mode is enabled");
    }

    if (runLm) {
      await exec(jobDir, aceLm, ["--request", requestPath, "--lm", lmPath]);
    }

    const numbered = await listNumberedRequestJsons(jobDir);
    if (!numbered.length) {
      const request0Path = join(jobDir, "request0.json");
      await writeFile(request0Path, JSON.stringify(reqJson, null, 0));
      numbered.push(request0Path);
    }

    const embedding = config.embeddingModelPath;
    const vae = config.vaeModelPath;
    if (!embedding || !vae) {
      throw new Error("ACESTEP_EMBEDDING_MODEL and ACESTEP_VAE_MODEL required");
    }

    const ditPath = resolveDitPath(body);
    const modelLabel = resolvedModelName(body);

    const audioFmt = String(body.audio_format ?? body.audioFormat ?? "mp3").toLowerCase();
    const wantWav = audioFmt === "wav";

    const synthArgs: string[] = [];
    const rawSrc = String(body.src_audio_path ?? body.reference_audio_path ?? "").trim();
    if (rawSrc) {
      const resolvedSrc = resolveReferenceAudioPath(rawSrc);
      if (
        !isPathWithin(resolvedSrc, resolve(config.tmpDir)) &&
        !isPathWithin(resolvedSrc, resolve(config.audioStorageDir))
      ) {
        throw new Error(
          "Source audio path must be within the configured storage directories"
        );
      }
      synthArgs.push("--src-audio", resolvedSrc);
    }
    synthArgs.push("--request", ...numbered);
    synthArgs.push("--embedding", embedding, "--dit", ditPath, "--vae", vae);

    const lora = config.loraPath;
    if (lora) {
      synthArgs.push("--lora", lora, "--lora-scale", String(config.loraScale));
    }
    const vc = config.vaeChunk;
    const vo = config.vaeOverlap;
    if (vc) synthArgs.push("--vae-chunk", vc);
    if (vo) synthArgs.push("--vae-overlap", vo);

    if (wantWav) {
      synthArgs.push("--wav");
    } else {
      synthArgs.push("--mp3-bitrate", String(config.mp3Bitrate));
    }

    await exec(jobDir, aceSynth, synthArgs);

    const ext = wantWav ? "wav" : "mp3";
    let outs = await listSynthOutputs(jobDir, ext);
    if (!outs.length && ext === "mp3") {
      outs = await listSynthOutputs(jobDir, "wav");
    }
    if (!outs.length) throw new Error("ace-synth did not produce output");

    await mkdir(config.audioStorageDir, { recursive: true });

    const metas0 = await readResultMetas(numbered[0]!);
    const lmLabel = lmPath ? String(body.lm_model_path ?? "acestep-5Hz-lm") : "";

    const items: Array<{
      file: string;
      wave: string;
      status: number;
      create_time: number;
      env: string;
      prompt: string;
      lyrics: string;
      metas: { bpm?: number; duration?: number; genres?: string; keyscale?: string; timesignature?: string };
      generation_info: string;
      seed_value: string;
      lm_model: string;
      dit_model: string;
    }> = [];

    for (let i = 0; i < outs.length; i++) {
      const outFile = outs[i]!;
      const outExt = outFile.endsWith(".wav") ? "wav" : "mp3";
      const storedName = outs.length === 1 ? `${taskId}.${outExt}` : `${taskId}_${i}.${outExt}`;
      const storedPath = join(config.audioStorageDir, storedName);
      await rename(outFile, storedPath);

      const audioUrl = `/v1/audio?path=${encodeURIComponent("/" + storedName)}`;
      const metaSource = i === 0 ? metas0 : await readResultMetas(numbered[Math.min(i, numbered.length - 1)]!);

      items.push({
        file: audioUrl,
        wave: "",
        status: 1,
        create_time: Math.floor(t.created_at / 1000),
        env: "development",
        prompt: metaSource.caption || String(reqJson.caption ?? ""),
        lyrics: metaSource.lyrics || String(reqJson.lyrics ?? ""),
        metas: {
          bpm: metaSource.bpm,
          duration: metaSource.duration,
          genres: "",
          keyscale: metaSource.keyscale || String(reqJson.keyscale ?? ""),
          timesignature: metaSource.timesignature || String(reqJson.timesignature ?? ""),
        },
        generation_info: "acestep.cpp",
        seed_value: metaSource.seed_value,
        lm_model: typeof body.lm_model_path === "string" ? body.lm_model_path : lmLabel || "",
        dit_model: modelLabel,
      });
    }

    store.setTaskResult(taskId, JSON.stringify(items));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const reqSnapshot = apiToRequestJson(body);
    const failItem = {
      file: "",
      wave: "",
      status: 2,
      create_time: Math.floor(t.created_at / 1000),
      env: "development",
      prompt: String(reqSnapshot.caption ?? ""),
      lyrics: String(reqSnapshot.lyrics ?? ""),
      metas: {
        bpm: undefined as number | undefined,
        duration: undefined as number | undefined,
        genres: "",
        keyscale: "",
        timesignature: "",
      },
      generation_info: msg,
      seed_value: "",
      lm_model: "",
      dit_model: resolvedModelName(body),
    };
    store.setTaskFailed(taskId, msg, JSON.stringify([failItem]));
  } finally {
    store.recordJobDuration(Date.now() - started);
    try {
      const entries = await readdir(jobDir).catch(() => []);
      for (const e of entries) {
        await unlink(join(jobDir, e)).catch(() => {});
      }
    } catch {
      // ignore
    }
  }
}

export function generateTaskId(): string {
  return randomUUID();
}
