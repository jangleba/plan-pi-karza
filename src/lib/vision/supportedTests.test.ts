import { describe, expect, it } from "vitest";
import {
  EXPERIMENTAL_VISION_TESTS,
  SUPPORTED_VISION_TESTS,
  isTestVisibleInUi,
} from "./supportedTests";

describe("Vision Lab supported tests", () => {
  it("shows Sprint 20 m without enabling experimental tests", () => {
    expect(SUPPORTED_VISION_TESTS).toContain("sprint_20m");
    expect(EXPERIMENTAL_VISION_TESTS).not.toContain("sprint_20m");
    expect(isTestVisibleInUi("sprint_20m")).toBe(true);
  });

  it("keeps unfinished sprint protocols outside the stable list", () => {
    expect(SUPPORTED_VISION_TESTS).not.toContain("sprint_30m");
    expect(SUPPORTED_VISION_TESTS).not.toContain("flying_sprint");
  });
});
