/**
 * CENTRALNA konfiguracja prawna. Dane operatora i status dokumentów są jedynym źródłem prawdy dla całej aplikacji.
 * Pola `null` = BRAK DANYCH DO UZUPEŁNIENIA przez operatora (nie wymyślamy ich). Dokumenty są SZKICAMI, dopóki ktoś odpowiedzialny
 * nie ustawi status: "approved" wraz z datą i osobą zatwierdzającą – kod nigdy sam nie uznaje szkicu za zatwierdzony.
 */
export const OPERATOR = {
  name: null as string | null, // pełna nazwa operatora
  legalForm: null as string | null,
  address: null as string | null, // adres do doręczeń
  registry: null as string | null, // KRS/CEIDG
  taxId: null as string | null, // NIP
  email: null as string | null, // kontakt, także w sprawie praw osób (RODO)
  phone: null as string | null,
};
export type OperatorField = keyof typeof OPERATOR;

/** Wymagane do publikacji dokumentów i zakładania kont w produkcji. Telefon jest opcjonalny. */
export const REQUIRED_OPERATOR_FIELDS: OperatorField[] = ["name", "legalForm", "address", "registry", "taxId", "email"];

export const OPERATOR_LABEL: Record<OperatorField, string> = {
  name: "Nazwa operatora", legalForm: "Forma prawna", address: "Adres do doręczeń", registry: "Numer rejestru (KRS/CEIDG)", taxId: "NIP", email: "E-mail kontaktowy (w tym w sprawie praw osób)", phone: "Telefon (opcjonalnie)",
};

export type DocKind = "terms" | "privacy" | "safety";

export interface DocMeta { version: string; status: "draft" | "approved"; approvedBy: string | null; approvedAt: string | null }

export const DOCS: Record<DocKind, DocMeta> = {
  terms: { version: "szkic-0.1", status: "draft", approvedBy: null, approvedAt: null },
  privacy: { version: "szkic-0.1", status: "draft", approvedBy: null, approvedAt: null },
  safety: { version: "szkic-0.1", status: "draft", approvedBy: null, approvedAt: null },
};

/** Wersja umowy, której dotyczą akceptacja, potwierdzenie opiekuna i aktywacja płatna. */
export const CONTRACT_VERSION = DOCS.terms.version;
export const SAFETY_VERSION = DOCS.safety.version;
export const CONSENT_VERSION = DOCS.privacy.version; // wersja informacji, na którą powołuje się opis celu zgody

export interface LegalSnapshot { operator: Record<OperatorField, string | null>; docs: Record<DocKind, DocMeta> }
export const CURRENT: LegalSnapshot = { operator: OPERATOR, docs: DOCS };

export const missingOperatorFields = (s: LegalSnapshot = CURRENT): OperatorField[] => REQUIRED_OPERATOR_FIELDS.filter((f) => !s.operator[f]?.trim());
export const unapprovedDocs = (s: LegalSnapshot = CURRENT): DocKind[] =>
  (Object.keys(s.docs) as DocKind[]).filter((k) => s.docs[k].status !== "approved" || !s.docs[k].approvedBy || !s.docs[k].approvedAt);

export interface LegalReadiness { ready: boolean; missingOperator: OperatorField[]; unapproved: DocKind[] }
export function legalReadiness(s: LegalSnapshot = CURRENT): LegalReadiness {
  const missingOperator = missingOperatorFields(s), unapproved = unapprovedDocs(s);
  return { ready: !missingOperator.length && !unapproved.length, missingOperator, unapproved };
}

/** Tryb deweloperski/testowy: zakładanie kont działa mimo braków, ale z widocznym ostrzeżeniem. W produkcji – tylko przy kompletnej, zatwierdzonej konfiguracji. */
export const isDevLegalMode = (): boolean => import.meta.env.DEV === true || import.meta.env.VITE_ALLOW_UNAPPROVED_LEGAL === "true";
export const mayCreateAccounts = (r: LegalReadiness = legalReadiness(), dev: boolean = isDevLegalMode()): boolean => r.ready || dev;
