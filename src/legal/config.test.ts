import { describe, expect, it } from "vitest";
import { CURRENT, DOCS, REQUIRED_OPERATOR_FIELDS, legalReadiness, mayCreateAccounts, missingOperatorFields, unapprovedDocs, type LegalSnapshot } from "./config";
import { COMMERCE, missingCommerceFields, purchaseAvailable, type CommerceConfig } from "./commerce";
import { legalText } from "./docs";

const complete = (): LegalSnapshot => ({
  operator: { name: "Przykład sp. z o.o.", legalForm: "sp. z o.o.", address: "ul. Testowa 1, 00-001 Warszawa", registry: "KRS 0000000000", taxId: "0000000000", email: "kontakt@example.test", phone: null },
  docs: { terms: { version: "1.0", status: "approved", approvedBy: "Jan Kowalski", approvedAt: "2026-11-01" }, privacy: { version: "1.0", status: "approved", approvedBy: "Jan Kowalski", approvedAt: "2026-11-01" }, safety: { version: "1.0", status: "approved", approvedBy: "Jan Kowalski", approvedAt: "2026-11-01" } },
});

describe("konfiguracja prawna: braki są jawne, a szkic nie jest zatwierdzony", () => {
  it("domyślnie żadne dane operatora nie są wymyślone, a wszystkie dokumenty to szkice", () => {
    expect(missingOperatorFields()).toEqual(REQUIRED_OPERATOR_FIELDS);
    expect(Object.values(CURRENT.operator).every((v) => v === null)).toBe(true);
    expect(unapprovedDocs().sort()).toEqual(["privacy", "safety", "terms"]);
    expect(Object.values(DOCS).every((d) => d.status === "draft" && d.approvedBy === null && d.approvedAt === null)).toBe(true);
    expect(legalReadiness().ready).toBe(false);
  });
  it("gotowość wymaga kompletnych danych operatora ORAZ zatwierdzonych dokumentów (status + osoba + data)", () => {
    expect(legalReadiness(complete()).ready).toBe(true);
    const noPerson = complete(); noPerson.docs.terms = { ...noPerson.docs.terms, approvedBy: null };
    expect(legalReadiness(noPerson)).toMatchObject({ ready: false, unapproved: ["terms"] });
    const noDate = complete(); noDate.docs.privacy = { ...noDate.docs.privacy, approvedAt: null };
    expect(legalReadiness(noDate).unapproved).toEqual(["privacy"]);
    const draft = complete(); draft.docs.safety = { ...draft.docs.safety, status: "draft" };
    expect(legalReadiness(draft).ready).toBe(false);
    const blank = complete(); blank.operator.email = "   ";
    expect(missingOperatorFields(blank)).toEqual(["email"]);
  });
  it("zakładanie kont: produkcja tylko przy pełnej konfiguracji; tryb deweloperski działa z ostrzeżeniem", () => {
    const notReady = legalReadiness(), ready = legalReadiness(complete());
    expect(mayCreateAccounts(notReady, false)).toBe(false);
    expect(mayCreateAccounts(notReady, true)).toBe(true);
    expect(mayCreateAccounts(ready, false)).toBe(true);
  });
  it("teksty dokumentów nie zawierają zrzeczeń się odpowiedzialności ani „zgody RODO” ani utraty prawa odstąpienia", () => {
    const FORBIDDEN = /na własną odpowiedzialność|wyłączamy (?:całkowicie )?odpowiedzialność|zrzekam się|zrzeka się|utrat\w+ prawa (?:do )?odstąpienia|zgoda na przetwarzanie danych osobowych \(RODO\)|wyrażam zgodę na przetwarzanie moich danych osobowych/i;
    for (const k of ["terms", "privacy", "safety"] as const) {
      const text = JSON.stringify(legalText(k));
      expect(text, k).not.toMatch(FORBIDDEN);
    }
  });
  it("dokumenty nie zawierają wymyślonych danych operatora: braki są widoczne jako „do uzupełnienia”", () => {
    expect(JSON.stringify(legalText("terms"))).toMatch(/do uzupełnienia/);
  });
});

describe("sprzedaż: brak zakupu bez kompletnej konfiguracji (bez fikcyjnego checkoutu)", () => {
  const fullCommerce = (): CommerceConfig => ({
    enabled: true, provider: "dostawca-testowy", plan: "Pro", priceGross: 19.99, currency: "PLN", billingPeriod: "month", autoRenewal: true, renewalNoticeDays: 7,
    cancellation: { how: "w ustawieniach konta", effectiveFrom: "koniec okresu" }, complaints: { contact: "reklamacje@example.test", handlingDays: 14 },
    withdrawal: { informationText: "tekst zatwierdzony prawnie", formUrl: null }, minors: { freeAccess: "allowed", paidRequiresGuardian: true, verificationMethod: "token_link" },
  });
  it("domyślnie: wyłączona, wszystkie pola handlowe puste, zakup niedostępny", () => {
    expect(COMMERCE.enabled).toBe(false);
    expect(COMMERCE.priceGross).toBeNull();
    expect(COMMERCE.minors.paidRequiresGuardian).toBe(true);
    expect(missingCommerceFields().length).toBeGreaterThanOrEqual(8);
    expect(purchaseAvailable().available).toBe(false);
  });
  it("zakup tylko przy włączeniu, kompletnej konfiguracji handlowej i zatwierdzonej konfiguracji prawnej", () => {
    const ready = legalReadiness(complete()), notReady = legalReadiness();
    expect(purchaseAvailable(fullCommerce(), ready).available).toBe(true);
    expect(purchaseAvailable(fullCommerce(), notReady).available).toBe(false);
    expect(purchaseAvailable({ ...fullCommerce(), enabled: false }, ready).available).toBe(false);
    for (const k of ["provider", "plan", "priceGross", "currency", "billingPeriod", "autoRenewal"] as const) {
      expect(purchaseAvailable({ ...fullCommerce(), [k]: null }, ready).available, k).toBe(false);
    }
    expect(purchaseAvailable({ ...fullCommerce(), withdrawal: { informationText: null, formUrl: null } }, ready).available).toBe(false);
    expect(purchaseAvailable({ ...fullCommerce(), complaints: { contact: null, handlingDays: null } }, ready).available).toBe(false);
  });
});
