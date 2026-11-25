import { describe, expect, it } from "vitest";
import { normalizeCode, otpError, validEmail } from "./otp";

describe("logowanie kodem z e-maila", () => {
  it("kod wklejony ze spacjami lub myślnikiem działa", () => {
    expect(normalizeCode("123 456")).toBe("123456");
    expect(normalizeCode(" 12-34-56 ")).toBe("123456");
    expect(normalizeCode("abc")).toBe("");
  });
  it("adres e-mail: proste sprawdzenie przed wysłaniem", () => {
    expect(validEmail("kuba@klub.pl")).toBe(true);
    expect(validEmail("kuba@klub")).toBe(false);
    expect(validEmail(" kuba@klub.pl ")).toBe(true);
  });
  it("komunikaty błędów są po polsku i bez szczegółów technicznych", () => {
    expect(otpError("Token has expired or is invalid", "in")).toMatch(/wygasł/);
    expect(otpError("For security purposes, you can only request this after 42 seconds.", "in")).toMatch(/Za dużo prób/);
    expect(otpError("Signups not allowed for otp", "in")).toMatch(/Nie ma konta/);
    expect(otpError("TypeError: Failed to fetch", "in")).toMatch(/Brak połączenia/);
  });
});
