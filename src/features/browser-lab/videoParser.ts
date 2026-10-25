import {
  createFile,
  DataStream,
  Endianness,
  type MP4BoxBuffer,
  type Sample,
  type Box,
} from "mp4box";
import { buildJumpTimeline, validateEdits, type JumpTimeline } from "./measurement";

export const MAX_VIDEO_BYTES = 128 * 1024 * 1024;

/** MP4 tkhd stores the vertical image axis in matrix[3]. Using matrix[1]
 * reverses portrait iPhone recordings (90° becomes 270°). */
export function displayRotation(matrix?: ArrayLike<number>) {
  if (!matrix) return 0;
  return (Math.round((Math.atan2(matrix[3] || 0, matrix[0] || 0) * 2) / Math.PI) * 90 + 360) % 360;
}

export interface JumpVideo {
  timeline: JumpTimeline;
  config: VideoDecoderConfig;
  rotation: number;
  samples: {
    data: Uint8Array<ArrayBuffer>;
    isSync: boolean;
    timestampUs: number;
    durationUs: number;
  }[];
}

export function parseJumpVideo(buffer: ArrayBuffer): JumpVideo {
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_VIDEO_BYTES)
    throw new Error("Wybierz oryginalny film do 128 MB i 20 sekund, z jedną próbą.");
  const mp4 = createFile(true);
  let parseError: string | null = null;
  mp4.onError = (_module, message) => {
    parseError = message;
  };
  const input = buffer as MP4BoxBuffer;
  input.fileStart = 0;
  try {
    mp4.appendBuffer(input);
    mp4.flush();
  } catch {
    throw new Error(
      "Film jest uszkodzony albo ma nieobsługiwany format. Wybierz oryginalny MP4 lub MOV.",
    );
  }
  if (parseError || !mp4.moov)
    throw new Error("Nie można odczytać filmu. Wybierz oryginalny plik MP4 lub MOV.");
  const info = mp4.getInfo();
  if (info.videoTracks.length !== 1)
    throw new Error(
      "Ten format filmu nie jest obsługiwany. Wybierz zwykły plik MP4 lub MOV z kamery.",
    );
  const track = info.videoTracks[0];
  validateEdits(track.edits);
  if (!track.video || track.video.width <= 0 || track.video.height <= 0)
    throw new Error("Nie można odczytać rozdzielczości filmu. Wybierz oryginalny MP4 lub MOV.");
  if (
    Math.max(track.video.width, track.video.height) > 4096 ||
    track.video.width * track.video.height > 4096 * 2160
  )
    throw new Error("Film przekracza 4K. Wybierz HD lub 4K, najlepiej 60 FPS.");
  if (!/^(avc1|avc3|hvc1|hev1)\./.test(track.codec))
    throw new Error("Wybierz film H.264 lub HEVC nagrany kamerą telefonu.");
  const metadata = mp4.getTrackSamplesInfo(track.id);
  const timeline = buildJumpTimeline(metadata);
  if (
    !metadata[0].is_sync ||
    metadata.some((s) => s.description_index !== metadata[0].description_index)
  )
    throw new Error("Film nie ma stałego formatu klatek. Wybierz oryginalny plik z kamery.");
  const entry = metadata[0].description as Sample["description"] & {
    avcC?: Box;
    hvcC?: Box;
  };
  const descriptionBox = entry.avcC ?? entry.hvcC;
  if (!descriptionBox) throw new Error("Brakuje danych potrzebnych do odczytania klatek filmu.");
  const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
  descriptionBox.write(stream);
  const config: VideoDecoderConfig = {
    codec: track.codec,
    codedWidth: track.video.width,
    codedHeight: track.video.height,
    description: new Uint8Array(stream.buffer, 8),
  };
  const timestamps = new Map(
    timeline.frames.map((frame) => [frame.sampleIndex, frame.timestampUs]),
  );
  const samples = metadata.map((sample, index) => {
    const full = mp4.getTrackSample(track.id, index);
    if (!full?.data || full.data.byteLength !== sample.size)
      throw new Error("Film jest niekompletny. Pobierz oryginał z telefonu i spróbuj ponownie.");
    return {
      data: full.data,
      isSync: sample.is_sync,
      timestampUs: timestamps.get(index)!,
      durationUs: Math.round((sample.duration * 1_000_000) / sample.timescale),
    };
  });
  const rotation = displayRotation(track.matrix);
  return { timeline, config, samples, rotation };
}
