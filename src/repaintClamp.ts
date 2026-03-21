import { readWavDurationSeconds } from "./audioDuration";

/**
 * Core math: ace-synth uses **seconds** on source audio; DAW may send **beat** positions.
 * Only adjusts when **both** bounds are >= 0 (explicit window). Otherwise leaves values as-is.
 * @returns repainting_start / repainting_end for request JSON (-1 = unset / full auto).
 */
export function clampRepaintingSeconds(
  rsIn: number,
  reIn: number,
  sourceDuration: number,
  bpm: number
): { start: number; end: number } {
  if (!(sourceDuration > 0)) return { start: rsIn, end: reIn };

  const rs = Number.isFinite(rsIn) ? rsIn : -1;
  const re = Number.isFinite(reIn) ? reIn : -1;

  if (rs < 0 || re < 0) return { start: rs, end: re };

  let rsSec = rs;
  let reSec = re;
  const spb = bpm > 0 ? 60 / bpm : 0;
  if (spb > 0 && (rsSec > sourceDuration || reSec > sourceDuration)) {
    rsSec *= spb;
    reSec *= spb;
  }

  rsSec = Math.max(0, Math.min(rsSec, sourceDuration));
  reSec = Math.max(0, Math.min(reSec, sourceDuration));

  if (reSec <= rsSec) return { start: -1, end: -1 };
  return { start: rsSec, end: reSec };
}

/**
 * ace-synth interprets repainting_start/end as **seconds along --src-audio**.
 * Short context WAV + DAW beat coordinates → both clamp to clip end → engine error; we fix here.
 * @returns WAV duration in seconds when readable, else `null`.
 */
export async function clampRepaintingToSourceAudio(
  reqJson: Record<string, unknown>,
  sourceAudioPath: string,
  body: Record<string, unknown>,
  opts?: { taskId?: string }
): Promise<number | null> {
  const duration = await readWavDurationSeconds(sourceAudioPath);
  const taskType = String(body.task_type ?? body.taskType ?? "").toLowerCase() || "?";
  const tag = opts?.taskId ? `[acestep-api] ${opts.taskId}` : "[acestep-api]";

  if (duration == null || !(duration > 0)) {
    console.log(
      `${tag} clampRepaintingBounds task_type=${taskType}: could not read WAV duration (need RIFF/WAV for --src-audio); ` +
        `repainting bounds left unchanged: start=${reqJson.repainting_start} end=${reqJson.repainting_end} path=${sourceAudioPath}`
    );
    return null;
  }

  const rs0 = Number(reqJson.repainting_start);
  const re0 = Number(reqJson.repainting_end);
  const bpm = Number(body.bpm ?? reqJson.bpm ?? 0);

  const { start, end } = clampRepaintingSeconds(rs0, re0, duration, bpm);
  const changed = start !== rs0 || end !== re0;
  console.log(
    `${tag} clampRepaintingBounds task_type=${taskType}: wav_duration_s=${duration.toFixed(4)} bpm=${bpm} ` +
      `before=(${rs0},${re0}) after=(${start},${end}) src=${sourceAudioPath}` +
      (changed ? "" : " (unchanged)")
  );
  reqJson.repainting_start = start;
  reqJson.repainting_end = end;
  return duration;
}

/** Segments shorter than this (after clamp) are treated as bogus UI/coordinate bugs — clear mask and use full duration. */
export const MIN_REPAINT_SEGMENT_SEC = 0.5;

/**
 * If repainting defines a **tiny** window (e.g. 0–0.1s), `applySegmentTargetDuration` would set `duration` to that
 * value and acestep.cpp gets an invalid request. Collapse to **unset** repainting (-1,-1) and restore `duration`
 * from the source WAV or `audio_duration` metadata.
 */
export function collapseDegenerateRepaintWindow(
  reqJson: Record<string, unknown>,
  body: Record<string, unknown>,
  sourceDurationSec: number | null,
  opts?: { taskId?: string }
): void {
  const taskType = String(body.task_type ?? body.taskType ?? "").toLowerCase();
  if (!["lego", "repaint", "cover"].includes(taskType)) return;

  const rs = Number(reqJson.repainting_start);
  const re = Number(reqJson.repainting_end);
  if (!Number.isFinite(rs) || !Number.isFinite(re) || rs < 0 || re <= rs) return;

  const segmentSec = re - rs;
  if (segmentSec >= MIN_REPAINT_SEGMENT_SEC) return;

  const tag = opts?.taskId ? `[acestep-api] ${opts.taskId}` : "[acestep-api]";
  const metaDur = Number(body.audio_duration ?? body.audioDuration ?? body.duration ?? 0);
  const fullDur =
    sourceDurationSec != null && sourceDurationSec > 0
      ? sourceDurationSec
      : Number.isFinite(metaDur) && metaDur > 0
        ? metaDur
        : Number(reqJson.duration ?? 0);

  console.log(
    `${tag} degenerateRepaintWindow task_type=${taskType}: segment=${segmentSec.toFixed(4)}s < ${MIN_REPAINT_SEGMENT_SEC}s ` +
      `→ repainting=(-1,-1), duration=${fullDur > 0 ? fullDur : "unchanged"}`
  );

  reqJson.repainting_start = -1;
  reqJson.repainting_end = -1;
  if (fullDur > 0) {
    reqJson.duration = fullDur;
  }
}

/**
 * acestep.cpp `duration` is **target audio length in seconds** for LM/FSM (see upstream README).
 * The DAW sends `audio_duration` as **full project timeline length** while `repainting_*` marks the
 * active segment `[start, end)`. If we leave `duration` = full project (e.g. 128s) but the mask is
 * only a few seconds (e.g. 0–4s), generation targets the wrong length — set `duration` to the
 * **segment length** `end - start` after bounds are final (post-clamp).
 *
 * Skips when repainting is inactive (`re <= rs` or negative sentinels) or task is not src-audio based.
 */
export function applySegmentTargetDuration(
  reqJson: Record<string, unknown>,
  body: Record<string, unknown>,
  opts?: { taskId?: string }
): void {
  const taskType = String(body.task_type ?? body.taskType ?? "").toLowerCase();
  if (!["lego", "repaint", "cover"].includes(taskType)) return;

  const rs = Number(reqJson.repainting_start);
  const re = Number(reqJson.repainting_end);
  if (!Number.isFinite(rs) || !Number.isFinite(re)) return;
  if (rs < 0 || re <= rs) return;

  const segmentSec = re - rs;
  const metaDur = Number(body.audio_duration ?? body.audioDuration ?? body.duration ?? 0);
  const prev = Number(reqJson.duration ?? 0);

  /** Target generation length for the masked window (acestep `duration` = seconds). */
  reqJson.duration = segmentSec;

  const tag = opts?.taskId ? `[acestep-api] ${opts.taskId}` : "[acestep-api]";
  console.log(
    `${tag} durationOverride task_type=${taskType}: repainting [${rs}, ${re}) segment_s=${segmentSec.toFixed(4)} ` +
      `audio_duration_meta=${Number.isFinite(metaDur) && metaDur > 0 ? metaDur : "n/a"} → duration=${segmentSec} (was ${prev})`
  );
}
