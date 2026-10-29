import { describe, expect, it } from "vitest";
import { activityDraftFromGpx, parseGpxTrack } from "./gpx";
import { haversineDistanceM } from "./metrics";

const point = (lat: string, lon: string, time: string) =>
  `<trkpt ${lat} ${lon}><time>2026-10-18T10:${time}Z</time></trkpt>`;
const valid = (lat: number, time: string) => point(`lat="${lat}"`, 'lon="21"', time);

describe("GPX input integrity", () => {
  it("rejects missing or blank coordinates instead of inventing zero coordinates", () => {
    for (const coordinate of ["", 'lat=""']) {
      const xml = `<gpx>${point(coordinate, 'lon="21"', "00:00")}${valid(0.001, "00:20")}</gpx>`;
      expect(() => parseGpxTrack(xml)).toThrow(/co najmniej 2/);
    }
    expect(parseGpxTrack(`<gpx>${valid(0, "00:00")}${valid(0.001, "00:20")}</gpx>`)[0].lat).toBe(0);
  });

  it("does not add the unrecorded gap between GPX track segments to distance", () => {
    const xml = `<gpx><trk><trkseg>${valid(52, "00:00")}${valid(52.001, "00:20")}</trkseg><trkseg>${valid(52.002, "00:40")}${valid(52.003, "01:00")}</trkseg></trk></gpx>`;
    const draft = activityDraftFromGpx({ xml, date: "2026-10-18", sessionId: "run" });
    const measured = haversineDistanceM({ lat: 52, lng: 21 }, { lat: 52.001, lng: 21 }) * 2;
    expect(draft.distanceM).toBeCloseTo(measured, 0);
    expect(draft.route.map((item) => item.segment)).toEqual([0, 0, 1, 1]);
  });

  it("rejects a backwards timeline rather than computing duration from the wrong final point", () => {
    expect(() =>
      parseGpxTrack(`<gpx>${valid(52, "00:20")}${valid(52.001, "00:00")}</gpx>`),
    ).toThrow(/kolejności czasu/);
  });

  it("reads namespace-prefixed GPX points and times", () => {
    const xml = `<g:gpx><g:trkpt lat="52" lon="21"><g:time>2026-10-18T10:00:00Z</g:time></g:trkpt><g:trkpt lat="52.001" lon="21"><g:time>2026-10-18T10:00:20Z</g:time></g:trkpt></g:gpx>`;
    expect(parseGpxTrack(xml)).toHaveLength(2);
  });
});
