import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { readWavDurationSeconds } from "../src/audioDuration";

/** Minimal mono PCM16 8000 Hz, 80 samples = 0.01 s */
function tinyWavBytes(): Buffer {
  const numChannels = 1;
  const sampleRate = 8000;
  const bitsPerSample = 16;
  const numSamples = 80;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

describe("readWavDurationSeconds", () => {
  test("reads duration from tiny wav", async () => {
    const dir = mkdtempSync(join(tmpdir(), "acestep-wav-"));
    try {
      const p = join(dir, "t.wav");
      writeFileSync(p, tinyWavBytes());
      const d = await readWavDurationSeconds(p);
      expect(d).toBeCloseTo(0.01, 5);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
