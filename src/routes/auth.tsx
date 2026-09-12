import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/loadwise/auth";
import { useLoadwise } from "@/lib/loadwise/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@tanstack/react-router";
import {
  ageOnDate,
  birthDateForApproximateAge,
  type AccountOwnerType,
} from "@/lib/loadwise/agePolicy";
import { authErrorMessage } from "@/lib/authMessages";

export const Route = createFileRoute("/auth")({
  component: AuthScreen,
});

function AuthScreen() {
  const {
    user,
    loading,
    recoveryMode,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
  } = useAuth();
  const { hydrated, state } = useLoadwise();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"login" | "register" | "forgot" | "recovery">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [accountOwnerType, setAccountOwnerType] = useState<AccountOwnerType>("athlete");
  const [athleteBirthDate, setAthleteBirthDate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (recoveryMode) setMode("recovery");
  }, [recoveryMode]);

  // Redirect signed-in users onward.
  useEffect(() => {
    if (loading || !user || !hydrated || recoveryMode || mode === "recovery") return;
    if (state.profile?.onboardingComplete) {
      navigate({ to: "/start", replace: true });
    } else {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [loading, user, hydrated, state.profile?.onboardingComplete, recoveryMode, mode, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await requestPasswordReset(email.trim());
        if (error) {
          toast.error(authErrorMessage(error, "login"));
          return;
        }
        toast.success("Wysłaliśmy link do ustawienia nowego hasła. Sprawdź pocztę.");
        setMode("login");
      } else if (mode === "recovery") {
        if (password.length < 8) {
          toast.error("Nowe hasło musi mieć co najmniej 8 znaków.");
          return;
        }
        if (password !== passwordConfirmation) {
          toast.error("Hasła nie są takie same.");
          return;
        }
        const { error } = await updatePassword(password);
        if (error) {
          toast.error(authErrorMessage(error, "login"));
          return;
        }
        toast.success("Hasło zostało zmienione.");
        navigate({ to: state.profile?.onboardingComplete ? "/start" : "/onboarding", replace: true });
      } else if (mode === "register") {
        if (name.trim().length < 2) {
          toast.error("Podaj imię.");
          return;
        }
        const athleteAge = athleteBirthDate ? ageOnDate(athleteBirthDate) : null;
        if (athleteAge == null || athleteAge < 13) {
          toast.error("Spersonalizowane konto jest dostępne dopiero od 13 lat.");
          return;
        }
        if (accountOwnerType === "athlete" && athleteAge < 16) {
          toast.error("Dla zawodnika 13–15 konto musi utworzyć rodzic lub opiekun.");
          return;
        }
        if (accountOwnerType === "guardian" && athleteAge >= 16) {
          toast.error("Nowe konto zawodnika od 16 lat powinno należeć do zawodnika.");
          return;
        }
        const { error, needsEmailConfirmation } = await signUp(
          email.trim(),
          password,
          name.trim(),
          accountOwnerType,
          athleteBirthDate,
        );
        if (error) {
          toast.error(authErrorMessage(error, "register"));
          return;
        }
        toast.success(
          needsEmailConfirmation
            ? "Sprawdź pocztę i potwierdź e-mail. Potem zaloguj się do aplikacji."
            : "Konto utworzone. Przejdźmy do konfiguracji.",
        );
      } else {
        const { error } = await signIn(email.trim(), password);
        if (error) {
          toast.error(authErrorMessage(error, "login"));
          return;
        }
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading || (user && !hydrated)) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Ładowanie…</p>
      </div>
    );
  }

  return (
    <div className="app-shell flex min-h-screen flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="text-center">
          <div className="text-3xl font-semibold tracking-tight text-primary">
            BallWise
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "register"
              ? "Załóż konto, aby zacząć trenować mądrzej."
              : mode === "forgot"
                ? "Podaj e-mail, a wyślemy link do zmiany hasła."
                : mode === "recovery"
                  ? "Ustaw nowe hasło do swojego konta."
                  : "Zaloguj się do swojego konta."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {mode === "register" && (
            <>
              <div className="space-y-2">
                <Label>Kto będzie właścicielem konta?</Label>
                <div className="grid gap-2">
                  <button
                    type="button"
                    aria-pressed={accountOwnerType === "athlete"}
                    onClick={() => setAccountOwnerType("athlete")}
                    className={`rounded-2xl border p-3 text-left text-sm ${
                      accountOwnerType === "athlete"
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card"
                    }`}
                  >
                    <span className="font-semibold">Zawodnik — mam co najmniej 16 lat</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Konto i adres e-mail należą do zawodnika.
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={accountOwnerType === "guardian"}
                    onClick={() => setAccountOwnerType("guardian")}
                    className={`rounded-2xl border p-3 text-left text-sm ${
                      accountOwnerType === "guardian"
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card"
                    }`}
                  >
                    <span className="font-semibold">Rodzic lub opiekun zawodnika 13–15</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Dorosły posiada konto, potwierdza e-mail i zarządza profilem dziecka.
                    </span>
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-birth-date">Data urodzenia zawodnika</Label>
                <Input
                  id="register-birth-date"
                  type="date"
                  required
                  min={birthDateForApproximateAge(80)}
                  max={birthDateForApproximateAge(13)}
                  value={athleteBirthDate}
                  onChange={(event) => setAthleteBirthDate(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Służy do sprawdzenia progów 13, 16 i 18 lat. Osoba poniżej 13 lat może korzystać tylko z demo bez konta.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">
                  {accountOwnerType === "guardian" ? "Imię rodzica lub opiekuna" : "Imię zawodnika"}
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={accountOwnerType === "guardian" ? "Imię opiekuna" : "Twoje imię"}
                  autoComplete="given-name"
                />
              </div>
            </>
          )}
          {mode !== "recovery" && <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ty@example.com"
              autoComplete="email"
            />
          </div>}
          {mode !== "forgot" && <div className="space-y-2">
            <Label htmlFor="password">{mode === "recovery" ? "Nowe hasło" : "Hasło"}</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={mode === "recovery" ? 8 : 6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min. 6 znaków"
              autoComplete={
                mode === "register" || mode === "recovery" ? "new-password" : "current-password"
              }
            />
          </div>}

          {mode === "recovery" && (
            <div className="space-y-2">
              <Label htmlFor="password-confirmation">Powtórz nowe hasło</Label>
              <Input
                id="password-confirmation"
                type="password"
                required
                minLength={8}
                value={passwordConfirmation}
                onChange={(e) => setPasswordConfirmation(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy
              ? "Chwila…"
              : mode === "register"
                ? "Utwórz konto"
                : mode === "forgot"
                  ? "Wyślij link"
                  : mode === "recovery"
                    ? "Ustaw nowe hasło"
                    : "Zaloguj się"}
          </Button>
        </form>

        {mode === "login" && (
          <button
            type="button"
            onClick={() => setMode("forgot")}
            className="mt-4 w-full text-center text-sm text-primary"
          >
            Nie pamiętam hasła
          </button>
        )}

        {mode !== "recovery" && <button
          type="button"
          onClick={() => setMode(mode === "register" ? "login" : "register")}
          className="mt-5 w-full text-center text-sm text-muted-foreground"
        >
          {mode === "register"
            ? "Masz już konto? Zaloguj się"
            : "Nie masz konta? Zarejestruj się"}
        </button>}

        <p className="mt-7 text-center text-xs leading-relaxed text-muted-foreground">
          Regulamin i zgody zatwierdzisz osobno podczas konfiguracji profilu. Zobacz{" "}
          <Link to="/terms" className="underline">
            Regulamin
          </Link>{" "}
          oraz{" "}
          <Link to="/privacy-policy" className="underline">
            Politykę prywatności
          </Link>
          .
        </p>
        <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
          Masz mniej niż 13 lat? Nie twórz konta. Możesz bezpiecznie zobaczyć{" "}
          <Link to="/demo" className="font-medium text-primary underline">
            publiczną wersję demonstracyjną
          </Link>
          , która niczego nie zapisuje.
        </p>
      </div>
    </div>
  );
}
