import { describe, expect, it } from "vitest";
import { POSE, type FramePose, type Landmark } from "@/features/vision-analysis/types";
import { getLivePoseStatus, isLivePoseReadyForTest } from "./visionLivePose";

function makePose({
  height = 0.5,
  peopleCount = 1,
  includeHead = true,
}: {
  height?: number;
  peopleCount?: number;
  includeHead?: boolean;
} = {}): FramePose {
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0,
  }));
  const top = 0.2;
  const set = (index: number, x: number, y: number) => {
    landmarks[index] = { x, y, z: 0, visibility: 0.95 };
  };
  if (includeHead) set(POSE.NOSE, 0.49, top);
  set(POSE.LEFT_SHOULDER, 0.48, top + height * 0.15);
  set(POSE.LEFT_HIP, 0.5, top + height * 0.43);
  set(POSE.LEFT_KNEE, 0.52, top + height * 0.66);
  set(POSE.LEFT_ANKLE, 0.53, top + height * 0.9);
  set(POSE.LEFT_HEEL, 0.51, top + height * 0.97);
  set(POSE.LEFT_FOOT_INDEX, 0.56, top + height);

  return {
    frameIndex: 0,
    mediaTime: 0,
    presentationTimestamp: 0,
    landmarks,
    peopleCount,
    trackingConfidence: 0.8,
  };
}

describe("getLivePoseStatus", () => {
  it("akceptuje ujęcie boczne z jednym kompletnym łańcuchem ciała", () => {
    const status = getLivePoseStatus(makePose());

    expect(status.singleAthlete).toBe(true);
    expect(status.fullBody).toBe(true);
    expect(status.timingReady).toBe(true);
    expect(status.mechanicsReady).toBe(true);
  });

  it("rozdziela gotowość timingu od biomechaniki dla małej sylwetki", () => {
    const status = getLivePoseStatus(makePose({ height: 0.1 }));

    expect(status.timingReady).toBe(true);
    expect(status.mechanicsReady).toBe(false);
    expect(isLivePoseReadyForTest(status, "sprint_20m")).toBe(true);
    expect(isLivePoseReadyForTest(status, "cmj")).toBe(false);
  });

  it("odrzuca kadr bez widocznej głowy", () => {
    const status = getLivePoseStatus(makePose({ includeHead: false }));

    expect(status.fullBody).toBe(false);
    expect(status.timingReady).toBe(false);
  });

  it("blokuje automatyczny start przy więcej niż jednej osobie", () => {
    const status = getLivePoseStatus(makePose({ peopleCount: 2 }));

    expect(status.detected).toBe(true);
    expect(status.singleAthlete).toBe(false);
    expect(status.timingReady).toBe(false);
    expect(status.mechanicsReady).toBe(false);
  });

  it("zwraca stan pusty, gdy model nie widzi pozy", () => {
    const pose = makePose();
    pose.landmarks = null;
    pose.peopleCount = 0;

    expect(getLivePoseStatus(pose).detected).toBe(false);
  });
});
