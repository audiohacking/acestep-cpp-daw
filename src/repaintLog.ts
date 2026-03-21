/** Small snapshot for logs — repainting + timing fields the DAW sends. */
export function repaintSnapshot(body: Record<string, unknown>): Record<string, unknown> {
  return {
    task_type: body.task_type ?? body.taskType,
    repainting_start: body.repainting_start ?? body.repaintingStart,
    repainting_end: body.repainting_end ?? body.repaintingEnd,
    bpm: body.bpm,
    audio_duration: body.audio_duration ?? body.audioDuration ?? body.duration,
    src_audio_path: body.src_audio_path ?? body.srcAudioPath,
    reference_audio_path: body.reference_audio_path ?? body.referenceAudioPath,
  };
}
