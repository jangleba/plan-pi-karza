export type AuthAction = "login" | "register";

interface AuthMessageRule {
  patterns: RegExp[];
  message: string;
}

const AUTH_MESSAGE_RULES: AuthMessageRule[] = [
  {
    patterns: [/invalid login credentials/i, /invalid email or password/i],
    message: "Nieprawidłowy e-mail lub hasło.",
  },
  {
    patterns: [/email not confirmed/i],
    message: "Najpierw potwierdź adres e-mail. Sprawdź też folder spam.",
  },
  {
    patterns: [/already registered/i, /already been registered/i, /user already exists/i],
    message: "Konto z tym adresem e-mail już istnieje. Spróbuj się zalogować.",
  },
  {
    patterns: [/weak password/i],
    message: "Hasło jest za słabe. Użyj dłuższego i trudniejszego hasła.",
  },
  {
    patterns: [/unable to validate email/i, /invalid email/i],
    message: "Podaj poprawny adres e-mail.",
  },
  {
    patterns: [/rate limit/i, /too many requests/i, /security purposes.*seconds/i],
    message: "Za dużo prób w krótkim czasie. Odczekaj chwilę i spróbuj ponownie.",
  },
  {
    patterns: [/signup.*disabled/i, /signups not allowed/i],
    message: "Rejestracja jest chwilowo niedostępna. Spróbuj ponownie później.",
  },
  {
    patterns: [/failed to fetch/i, /network/i, /load failed/i],
    message: "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.",
  },
];

export function authErrorMessage(rawError: string | null | undefined, action: AuthAction): string {
  const error = rawError?.trim() ?? "";
  const passwordLength = error.match(/password.*at least\s+(\d+)/i)?.[1];

  if (passwordLength) {
    return `Hasło jest za słabe. Użyj co najmniej ${passwordLength} znaków.`;
  }

  const match = AUTH_MESSAGE_RULES.find((rule) =>
    rule.patterns.some((pattern) => pattern.test(error)),
  );

  if (match) return match.message;

  return action === "login"
    ? "Nie udało się zalogować. Sprawdź dane i spróbuj ponownie."
    : "Nie udało się utworzyć konta. Sprawdź dane i spróbuj ponownie.";
}
