import { readFile } from "fs/promises";

/** Parse a PCM WAV file and return duration in seconds, or null if not a readable WAV. */
export async function readWavDurationSeconds(filePath: string): Promise<number | null> {
  try {
    const buf = await readFile(filePath);
    if (buf.length < 44) return null;
    if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return null;

    let off = 12;
    let sampleRate = 44100;
    let dataSize = 0;
    let bitsPerSample = 16;
    let numChannels = 1;

    while (off + 8 <= buf.length) {
      const id = buf.toString("ascii", off, off + 4);
      const size = buf.readUInt32LE(off + 4);
      const chunkStart = off + 8;
      if (chunkStart + size > buf.length) break;

      if (id === "fmt ") {
        numChannels = buf.readUInt16LE(chunkStart + 2);
        sampleRate = buf.readUInt32LE(chunkStart + 4);
        bitsPerSample = buf.readUInt16LE(chunkStart + 14);
      } else if (id === "data") {
        dataSize = size;
        break;
      }
      off = chunkStart + size + (size % 2);
    }

    const bytesPerFrame = numChannels * (bitsPerSample / 8);
    if (bytesPerFrame <= 0 || sampleRate <= 0 || dataSize <= 0) return null;
    const numSamples = dataSize / bytesPerFrame;
    return numSamples / sampleRate;
  } catch {
    return null;
  }
}
