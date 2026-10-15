import { describe, expect, it } from "vitest";
import { BALL_REST_HEIGHT, PASS_WINDUP_SECONDS, shortestAngle } from "./animation";
import { aerialCalibrations, validateAerialCalibration } from "./aerialClips";
import type { AerialCalibration } from "./aerialClips";
import type { RunningModel } from "./mixamo";
import { createAerialSequence, sampleAerialSequence } from "./aerialSequence";
import { aerialRehearsals, buildAerialRehearsal } from "./aerialRehearsals";
import { journeyBank } from "./journeyBank";

// Synthetic timing/geometry fixture; this is not a calibrated Mixamo export.
const header: AerialCalibration = {
  sha256: "a".repeat(64),
  fps: 30,
  durationSeconds: 1.6,
  contactFrame: 24,
  takeoffFrame: 10,
  landingFrame: 40,
  contact: { lateral: 0, forward: 0.8, height: 8.1 },
};
const kick: AerialCalibration = {
  sha256: "b".repeat(64),
  fps: 30,
  durationSeconds: 2,
  contactFrame: 26,
  contact: { lateral: -0.2, forward: 2.8, height: 0.8 },
};
const assets: Pick<RunningModel, "aerial" | "aerialStatus"> = {
  aerial: { header },
  aerialStatus: { header: "ready", "long-kick": "missing" },
};
const fixture = () => buildAerialRehearsal("aerial-ready-nine-right", assets);

describe("prepared real-clip aerial playback", () => {
  it("does not advertise pending layouts as playable scenarios or enable absent exports", () => {
    expect(aerialCalibrations).toEqual({});
    expect(journeyBank).toHaveLength(480);
    expect(aerialRehearsals).toHaveLength(16);
    expect(new Set(aerialRehearsals.map((r) => r.role)).size).toBe(8);
    expect(() =>
      buildAerialRehearsal(aerialRehearsals[0].id, {
        aerial: {},
        aerialStatus: { header: "missing", "long-kick": "missing" },
      }),
    ).toThrow("Mixamo");
    expect(() =>
      buildAerialRehearsal(aerialRehearsals[0].id, {
        ...assets,
        aerialStatus: { ...assets.aerialStatus, header: "invalid" },
      }),
    ).toThrow("Mixamo");
  });
  it("rejects changed files, duration drift, invalid offsets and impossible jump markers", () => {
    expect(() =>
      validateAerialCalibration("header", header, { sha256: "c".repeat(64), durationSeconds: 1.6 }),
    ).toThrow("wersji");
    expect(() =>
      validateAerialCalibration("header", header, { sha256: header.sha256, durationSeconds: 2 }),
    ).toThrow("wersji");
    for (const value of [
      { ...header, contactFrame: 0 },
      { ...header, takeoffFrame: 25 },
      { ...header, landingFrame: 20 },
      { ...header, landingFrame: 60 },
      { ...header, contact: { ...header.contact, height: NaN } },
      { ...header, contact: { ...header.contact, height: 1 } },
      { ...header, durationSeconds: Infinity },
    ])
      expect(() => validateAerialCalibration("header", value)).toThrow();
  });
  it("uses the old kick until a verified long-kick clip is available", () => {
    expect(fixture().events.release).toBe(PASS_WINDUP_SECONDS);
    const long = buildAerialRehearsal("aerial-ready-nine-right", {
      aerial: { header, "long-kick": kick },
      aerialStatus: { header: "ready", "long-kick": "ready" },
    });
    expect(long.events.release).toBeCloseTo(26 / 30);
    const contact = sampleAerialSequence(long, long.events.release);
    expect(contact.motions.get("passer")!.clip).toBe("long-kick");
    expect(contact.motions.get("passer")!.phase).toBeCloseTo(26 / 60);
    expect(contact.ballVisual).toEqual(long.kickPoint);
    expect(contact.ballHeight).toBeCloseTo(0.8);
  });
  it("meets the calibrated head contact with continuous incoming and outgoing flight", () => {
    for (const layout of aerialRehearsals) {
      const s = buildAerialRehearsal(layout.id, assets);
      expect(s.events.takeoff).toBeLessThan(s.events.contact);
      expect(s.events.landing).toBeGreaterThan(s.events.contact);
      const hit = sampleAerialSequence(s, s.events.contact);
      expect(hit.ballVisual).toEqual(s.headerPoint);
      expect(hit.ballHeight).toBeCloseTo(header.contact.height);
      expect(hit.motions.get("header")!.phase).toBeCloseTo(
        header.contactFrame / 30 / header.durationSeconds,
      );
      expect(hit.motions.get("header")!.weight).toBe(1);
      expect(hit.motions.get("header")!.moving).toBe(false);
      expect(shortestAngle(hit.motions.get("header")!.heading, s.headerHeading)).toBeCloseTo(0);
      expect(hit.positions.get("header")).toEqual(s.options.headerAt);
      for (const event of [s.events.release, s.events.contact, s.events.receive]) {
        const a = sampleAerialSequence(s, event - 1e-7),
          b = sampleAerialSequence(s, event + 1e-7);
        expect(
          Math.hypot(a.ballVisual.x - b.ballVisual.x, a.ballVisual.y - b.ballVisual.y),
        ).toBeLessThan(0.0001);
        expect(Math.abs(a.ballHeight - b.ballHeight)).toBeLessThan(0.0001);
      }
      const end = sampleAerialSequence(s, s.duration);
      expect(end.ballCarrierId).toBe("receiver");
      expect(end.ballHeight).toBe(BALL_REST_HEIGHT);
      expect(end.ballInFlight).toBe(false);
      expect(end.motions.get("header")!.clip).toBeUndefined();
    }
  });
  it("reproduces every pose and ball position on reverse seeks and repeated redraws", () => {
    const s = fixture();
    const expected = Array.from({ length: 121 }, (_, i) =>
      sampleAerialSequence(s, (s.duration * i) / 120),
    );
    for (let i = 120; i >= 0; i--)
      expect(sampleAerialSequence(s, (s.duration * i) / 120)).toEqual(expected[i]);
    for (let i = 0; i < 60; i++)
      expect(sampleAerialSequence(s, s.events.contact)).toEqual(
        sampleAerialSequence(s, s.events.contact),
      );
    expect(sampleAerialSequence(s, -1)).toEqual(sampleAerialSequence(s, 0));
    expect(sampleAerialSequence(s, 999)).toEqual(sampleAerialSequence(s, s.duration));
    expect(() => sampleAerialSequence(s, NaN)).toThrow();
  });
  it("does not mutate playback inputs or accept invalid players and geometry", () => {
    const s = fixture(),
      before = JSON.stringify(s);
    sampleAerialSequence(s, s.events.contact);
    expect(JSON.stringify(s)).toBe(before);
    expect(() =>
      createAerialSequence(s.players, { ...s.options, headerId: "missing" }, assets),
    ).toThrow("ustawienie");
    expect(() =>
      createAerialSequence(s.players, { ...s.options, headerAt: { x: NaN, y: 30 } }, assets),
    ).toThrow("ustawienie");
    expect(() =>
      createAerialSequence(s.players, { ...s.options, receiverId: s.options.headerId }, assets),
    ).toThrow("ustawienie");
  });
});
