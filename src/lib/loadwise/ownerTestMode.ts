type OwnerTestAccessInput = {
  authenticatedEmail?: string | null;
  configuredEmail?: string | null;
  releaseMode?: string | null;
};

function normalize(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

/**
 * Narzędzia właściciela są wyłącznie pomocą na środowisku testowym.
 * Ten warunek nie jest mechanizmem autoryzacji danych — dostęp do danych nadal
 * egzekwują Supabase Auth i RLS. W produkcji panel jest zawsze wyłączony.
 */
export function hasOwnerTestAccess({
  authenticatedEmail,
  configuredEmail,
  releaseMode,
}: OwnerTestAccessInput) {
  if (normalize(releaseMode) === "production") return false;

  const ownerEmail = normalize(configuredEmail);
  const userEmail = normalize(authenticatedEmail);

  return ownerEmail.length > 0 && userEmail.length > 0 && ownerEmail === userEmail;
}

export function ownerTestAccessForEmail(authenticatedEmail?: string | null) {
  return hasOwnerTestAccess({
    authenticatedEmail,
    configuredEmail: import.meta.env.VITE_OWNER_TEST_EMAIL,
    releaseMode: import.meta.env.VITE_RELEASE_MODE,
  });
}
