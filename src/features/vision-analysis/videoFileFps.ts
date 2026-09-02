/**
 * Odczyt nominalnego FPS bezpośrednio z tabeli czasu próbek MP4/MOV (`stts`).
 * Nie uruchamia filmu i nie zależy od autoplay, więc działa również w Safari.
 */

interface Box {
  type: string;
  start: number;
  payload: number;
  end: number;
}

function typeAt(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function boxes(view: DataView, start: number, end: number): Box[] {
  const result: Box[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    const type = typeAt(view, offset + 4);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) break;
      const large = view.getBigUint64(offset + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) break;
      size = Number(large);
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) break;
    result.push({ type, start: offset, payload: offset + header, end: offset + size });
    offset += size;
  }
  return result;
}

function child(view: DataView, parent: Box, type: string): Box | null {
  return boxes(view, parent.payload, parent.end).find((box) => box.type === type) ?? null;
}

function mdhdTimescale(view: DataView, mdhd: Box): number | null {
  if (mdhd.payload + 24 > mdhd.end) return null;
  const version = view.getUint8(mdhd.payload);
  const offset = mdhd.payload + (version === 1 ? 20 : 12);
  if (offset + 4 > mdhd.end) return null;
  const value = view.getUint32(offset);
  return value > 0 ? value : null;
}

function isVideoTrack(view: DataView, mdia: Box): boolean {
  const hdlr = child(view, mdia, "hdlr");
  return !!hdlr && hdlr.payload + 12 <= hdlr.end && typeAt(view, hdlr.payload + 8) === "vide";
}

function sttsFps(view: DataView, stts: Box, timescale: number): number | null {
  if (stts.payload + 8 > stts.end) return null;
  const entryCount = view.getUint32(stts.payload + 4);
  let offset = stts.payload + 8;
  let samples = 0;
  let durationTicks = 0;
  for (let i = 0; i < entryCount; i++) {
    if (offset + 8 > stts.end) return null;
    const count = view.getUint32(offset);
    const delta = view.getUint32(offset + 4);
    if (count === 0 || delta === 0) return null;
    samples += count;
    durationTicks += count * delta;
    offset += 8;
  }
  if (samples < 2 || durationTicks <= 0) return null;
  const fps = (samples * timescale) / durationTicks;
  return Number.isFinite(fps) && fps >= 1 && fps <= 480 ? fps : null;
}

export function readIsoBmffFps(buffer: ArrayBuffer): number | null {
  const view = new DataView(buffer);
  const moov = boxes(view, 0, view.byteLength).find((box) => box.type === "moov");
  if (!moov) return null;
  for (const trak of boxes(view, moov.payload, moov.end).filter((box) => box.type === "trak")) {
    const mdia = child(view, trak, "mdia");
    if (!mdia || !isVideoTrack(view, mdia)) continue;
    const mdhd = child(view, mdia, "mdhd");
    const minf = child(view, mdia, "minf");
    const stbl = minf ? child(view, minf, "stbl") : null;
    const stts = stbl ? child(view, stbl, "stts") : null;
    const timescale = mdhd ? mdhdTimescale(view, mdhd) : null;
    if (!stts || !timescale) continue;
    const fps = sttsFps(view, stts, timescale);
    if (fps) return fps;
  }
  return null;
}

export async function readVideoFileFps(file: Blob): Promise<number | null> {
  try {
    const fps = readIsoBmffFps(await file.arrayBuffer());
    return fps == null ? null : Math.round(fps);
  } catch {
    return null;
  }
}
