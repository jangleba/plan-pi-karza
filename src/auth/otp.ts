/** Logowanie kodem z e-maila: walidacja i czytelne komunikaty (czyste funkcje, testowane). */

export const validEmail = (e: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

/** Kod wklejony z e-maila bywa ze spacjami albo myślnikiem („123 456”); zostawiamy same cyfry, najwyżej 10. */
export const normalizeCode = (v: string): string => v.replace(/\D/g, "").slice(0, 10);

/** Komunikaty Supabase Auth → polski, bez technicznych szczegółów. */
export function otpError(message: string, mode: "in" | "up"): string {
  const m = message.toLowerCase();
  if (/rate limit|too many|security purposes|after \d+ seconds/.test(m)) return "Za dużo prób. Odczekaj chwilę i spróbuj ponownie.";
  if (/expired|invalid|token/.test(m)) return "Kod jest nieprawidłowy albo wygasł. Wyślij nowy kod.";
  if (/signups? not allowed|user not found|not allowed for otp/.test(m)) return mode === "in" ? "Nie ma konta z tym adresem. Wybierz „Nie mam konta”, jeśli chcesz je założyć." : "Zakładanie kont jest wyłączone.";
  if (/fetch|network|failed to/.test(m)) return "Brak połączenia z internetem. Spróbuj ponownie, gdy wróci sieć.";
  if (/email/.test(m) && /invalid|valid/.test(m)) return "Sprawdź adres e-mail.";
  return "Nie udało się. Spróbuj ponownie.";
}
