import { legalReadiness, type LegalReadiness } from "./config";

/**
 * Konfiguracja sprzedaży (subskrypcji). WSZYSTKIE pola handlowe są puste, dopóki operator nie ustali modelu i nie wdroży integracji płatniczej.
 * Nie ma tu fikcyjnego checkoutu. Wzór nie zawiera żadnego zrzeczenia się prawa odstąpienia (ani „utraty prawa po zalogowaniu”) –
 * ewentualne wyłączenia muszą wynikać z faktycznej treści umowy i przepisów oraz zostać zatwierdzone prawnie.
 */
export interface CommerceConfig {
  /** Przełącznik operatora; samo `true` nie wystarcza (patrz purchaseAvailable). */
  enabled: boolean;
  provider: string | null; // faktyczny dostawca płatności po integracji
  plan: string | null;
  priceGross: number | null; // cena brutto
  currency: string | null;
  billingPeriod: "month" | "year" | null;
  autoRenewal: boolean | null;
  renewalNoticeDays: number | null; // informacja przed odnowieniem, jeśli wymagana
  cancellation: { how: string | null; effectiveFrom: string | null };
  complaints: { contact: string | null; handlingDays: number | null };
  withdrawal: { informationText: string | null; formUrl: string | null };
  /** Polityka dostępu bezpłatnego dla osób 16–17 lat: konfigurowalna do zatwierdzenia. */
  minors: { freeAccess: "allowed" | "requires_guardian"; paidRequiresGuardian: true; verificationMethod: "token_link" | "adult_purchaser" | "external" };
}

export const COMMERCE: CommerceConfig = {
  enabled: false,
  provider: null, plan: null, priceGross: null, currency: null, billingPeriod: null,
  autoRenewal: null, renewalNoticeDays: null,
  cancellation: { how: null, effectiveFrom: null },
  complaints: { contact: null, handlingDays: null },
  withdrawal: { informationText: null, formUrl: null },
  minors: { freeAccess: "allowed", paidRequiresGuardian: true, verificationMethod: "token_link" },
};

export function missingCommerceFields(c: CommerceConfig = COMMERCE): string[] {
  const m: string[] = [];
  if (!c.provider) m.push("dostawca płatności (integracja)");
  if (!c.plan) m.push("nazwa planu");
  if (c.priceGross === null || c.priceGross <= 0) m.push("cena brutto");
  if (!c.currency) m.push("waluta");
  if (!c.billingPeriod) m.push("okres rozliczeniowy");
  if (c.autoRenewal === null) m.push("zasady odnowienia");
  if (!c.cancellation.how) m.push("sposób rezygnacji");
  if (!c.complaints.contact) m.push("kontakt reklamacyjny");
  if (!c.withdrawal.informationText) m.push("informacja o odstąpieniu od umowy (treść zatwierdzona prawnie)");
  return m;
}

export interface CommerceReadiness { available: boolean; missing: string[]; legal: LegalReadiness }
/** Zakup jest dostępny wyłącznie przy włączonym przełączniku, kompletnej konfiguracji handlowej i zatwierdzonej konfiguracji prawnej. */
export function purchaseAvailable(c: CommerceConfig = COMMERCE, legal: LegalReadiness = legalReadiness()): CommerceReadiness {
  const missing = missingCommerceFields(c);
  return { available: c.enabled && !missing.length && legal.ready, missing, legal };
}
