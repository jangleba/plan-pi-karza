import { describe, expect, it } from "vitest";
import {
  accountSetupIsAllowed,
  ageOnDate,
  policyForAge,
} from "./agePolicy";

describe("age policy", () => {
  it("liczy urodziny bez przesunięć strefy czasowej", () => {
    expect(ageOnDate("2010-09-10", "2026-09-09")).toBe(15);
    expect(ageOnDate("2010-09-10", "2026-09-10")).toBe(16);
  });

  it("poniżej 13 lat nie tworzy spersonalizowanego konta", () => {
    expect(policyForAge(12).personalizedAccountAllowed).toBe(false);
  });

  it("dla 13–15 wymaga zweryfikowanego konta opiekuna i jego deklaracji", () => {
    expect(accountSetupIsAllowed({
      age: 15,
      accountOwnerType: "athlete",
      guardianEmailVerified: true,
      guardianDeclarationAccepted: true,
    })).toBe(false);
    expect(accountSetupIsAllowed({
      age: 15,
      accountOwnerType: "guardian",
      guardianEmailVerified: false,
      guardianDeclarationAccepted: true,
    })).toBe(false);
    expect(accountSetupIsAllowed({
      age: 15,
      accountOwnerType: "guardian",
      guardianEmailVerified: true,
      guardianDeclarationAccepted: true,
    })).toBe(true);
  });

  it("od 16 lat zawodnik może być właścicielem konta, a do 18 wymaga dorosłego płatnika", () => {
    expect(policyForAge(16)).toMatchObject({
      athleteMayOwnAccount: true,
      adultPayerRequired: true,
      transferMayBeOffered: true,
    });
    expect(policyForAge(18)).toMatchObject({
      athleteMayOwnAccount: true,
      adultPayerRequired: false,
      transferMayBeOffered: false,
    });
  });

  it("od 18 lat konto musi należeć do zawodnika", () => {
    expect(accountSetupIsAllowed({
      age: 18,
      accountOwnerType: "guardian",
      guardianEmailVerified: true,
      guardianDeclarationAccepted: true,
    })).toBe(false);
    expect(accountSetupIsAllowed({
      age: 18,
      accountOwnerType: "athlete",
      guardianEmailVerified: false,
      guardianDeclarationAccepted: false,
    })).toBe(true);
  });
});
