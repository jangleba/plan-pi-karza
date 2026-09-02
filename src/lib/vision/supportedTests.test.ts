import { describe, expect, it } from "vitest";
import {
  EXPERIMENTAL_VISION_TESTS,
  SUPPORTED_VISION_TESTS,
  isTestVisibleInUi,
} from "./supportedTests";

describe("Vision Lab supported tests", () => {
  it("pokazuje wyłącznie CMJ i Broad Jump w stabilnym produkcie", () => {
    expect(SUPPORTED_VISION_TESTS).toEqual(["cmj", "broad_jump"]);
    expect(isTestVisibleInUi("cmj")).toBe(true);
    expect(isTestVisibleInUi("broad_jump")).toBe(true);
    expect(isTestVisibleInUi("drop_jump")).toBe(false);
    expect(isTestVisibleInUi("pogo_jumps")).toBe(false);
  });

  it("trzyma sprinty poza stabilną listą do następnego etapu", () => {
    expect(EXPERIMENTAL_VISION_TESTS).toContain("sprint_20m");
    expect(SUPPORTED_VISION_TESTS).not.toContain("sprint_20m");
    expect(SUPPORTED_VISION_TESTS).not.toContain("sprint_30m");
    expect(SUPPORTED_VISION_TESTS).not.toContain("flying_sprint");
  });
});
