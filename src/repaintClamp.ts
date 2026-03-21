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
 */
export async function clampRepaintingToSourceAudio(
  reqJson: Record<string, unknown>,
  sourceAudioPath: string,
  body: Record<string, unknown>
): Promise<void> {
  const duration = await readWavDurationSeconds(sourceAudioPath);
  if (duration == null || !(duration > 0)) return;

  const rs0 = Number(reqJson.repainting_start);
  const re0 = Number(reqJson.repainting_end);
  const bpm = Number(body.bpm ?? reqJson.bpm ?? 0);

  const { start, end } = clampRepaintingSeconds(rs0, re0, duration, bpm);
  reqJson.repainting_start = start;
  reqJson.repainting_end = end;
}
