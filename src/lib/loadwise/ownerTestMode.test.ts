import { describe, expect, it } from "vitest";
import { hasOwnerTestAccess } from "./ownerTestMode";

describe("owner test mode", () => {
  it("allows only the configured signed-in email outside production", () => {
    expect(
      hasOwnerTestAccess({
        authenticatedEmail: "owner@example.com",
        configuredEmail: " OWNER@example.com ",
        releaseMode: "preview",
      }),
    ).toBe(true);
  });

  it("stays disabled when no owner email is configured", () => {
    expect(
      hasOwnerTestAccess({
        authenticatedEmail: "owner@example.com",
        configuredEmail: "",
        releaseMode: "preview",
      }),
    ).toBe(false);
  });

  it("rejects another authenticated account", () => {
    expect(
      hasOwnerTestAccess({
        authenticatedEmail: "athlete@example.com",
        configuredEmail: "owner@example.com",
        releaseMode: "preview",
      }),
    ).toBe(false);
  });

  it("is always disabled in production", () => {
    expect(
      hasOwnerTestAccess({
        authenticatedEmail: "owner@example.com",
        configuredEmail: "owner@example.com",
        releaseMode: "production",
      }),
    ).toBe(false);
  });
});
