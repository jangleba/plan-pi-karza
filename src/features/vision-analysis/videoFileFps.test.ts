import { describe, expect, it } from "vitest";
import { readIsoBmffFps } from "./videoFileFps";

function box(type: string, ...payloads: Uint8Array[]): Uint8Array {
  const payloadLength = payloads.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(8 + payloadLength);
  new DataView(out.buffer).setUint32(0, out.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  let offset = 8;
  for (const payload of payloads) {
    out.set(payload, offset);
    offset += payload.length;
  }
  return out;
}

function fullBoxData(size: number): Uint8Array {
  return new Uint8Array(size);
}

function sampleMovie(timescale: number, sampleCount: number, sampleDelta: number): ArrayBuffer {
  const mdhdData = fullBoxData(24);
  new DataView(mdhdData.buffer).setUint32(12, timescale);
  const hdlrData = fullBoxData(12);
  hdlrData.set([118, 105, 100, 101], 8); // vide
  const sttsData = fullBoxData(16);
  const sttsView = new DataView(sttsData.buffer);
  sttsView.setUint32(4, 1);
  sttsView.setUint32(8, sampleCount);
  sttsView.setUint32(12, sampleDelta);
  const mdia = box(
    "mdia",
    box("mdhd", mdhdData),
    box("hdlr", hdlrData),
    box("minf", box("stbl", box("stts", sttsData))),
  );
  return box("moov", box("trak", mdia)).buffer as ArrayBuffer;
}

describe("readIsoBmffFps", () => {
  it("reads 120 FPS from the video sample timing table", () => {
    expect(readIsoBmffFps(sampleMovie(120_000, 600, 1_000))).toBe(120);
  });

  it("ignores data that is not an MP4/MOV movie", () => {
    expect(readIsoBmffFps(new Uint8Array([1, 2, 3, 4]).buffer)).toBeNull();
  });
});
