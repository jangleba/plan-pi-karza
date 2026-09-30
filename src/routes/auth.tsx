import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/loadwise/auth";
import { useLoadwise } from "@/lib/loadwise/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChoiceGroup, Field, StatusMessage } from "@/components/ui/app-ui";
import { Link } from "@tanstack/react-router";
import {
  ageOnDate,
  birthDateForApproximateAge,
  type AccountOwnerType,
} from "@/lib/loadwise/agePolicy";
import { authErrorMessage } from "@/lib/authMessages";
import { AppLaunchScreen } from "@/components/loadwise/AppLaunchScreen";

export const Route = createFileRoute("/auth")({
  component: AuthScreen,
});

function AuthScreen() {
  const { user, loading, recoveryMode, signIn, signUp, requestPasswordReset, updatePassword } =
    useAuth();
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
  const [errorMessage, setErrorMessage] = useState("");

  function showError(message: string) {
    setErrorMessage(message);
    toast.error(message);
  }

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
    setErrorMessage("");
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await requestPasswordReset(email.trim());
        if (error) {
          showError(authErrorMessage(error, "login"));
          return;
        }
        toast.success("Wysłaliśmy link do ustawienia nowego hasła. Sprawdź pocztę.");
        setMode("login");
      } else if (mode === "recovery") {
        if (password.length < 12) {
          showError("Nowe hasło musi mieć co najmniej 12 znaków.");
          return;
        }
        if (password !== passwordConfirmation) {
          showError("Hasła nie są takie same.");
          return;
        }
        const { error } = await updatePassword(password);
        if (error) {
          showError(authErrorMessage(error, "login"));
          return;
        }
        toast.success("Hasło zostało zmienione.");
        navigate({
          to: state.profile?.onboardingComplete ? "/start" : "/onboarding",
          replace: true,
        });
      } else if (mode === "register") {
        if (password.length < 12) {
          showError("Hasło musi mieć co najmniej 12 znaków.");
          return;
        }
        if (name.trim().length < 2) {
          showError("Podaj imię.");
          return;
        }
        const athleteAge = athleteBirthDate ? ageOnDate(athleteBirthDate) : null;
        if (athleteAge == null || athleteAge < 13) {
          showError("Spersonalizowane konto jest dostępne dopiero od 13 lat.");
          return;
        }
        if (accountOwnerType === "athlete" && athleteAge < 16) {
          showError("Dla zawodnika 13–15 konto musi utworzyć rodzic lub opiekun.");
          return;
        }
        if (accountOwnerType === "guardian" && athleteAge >= 16) {
          showError("Nowe konto zawodnika od 16 lat powinno należeć do zawodnika.");
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
          showError(authErrorMessage(error, "register"));
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
          showError(authErrorMessage(error, "login"));
          return;
        }
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading || (user && !hydrated)) {
    return <AppLaunchScreen />;
  }

  const title =
    mode === "register"
      ? "Utwórz konto"
      : mode === "forgot"
        ? "Zmień hasło"
        : mode === "recovery"
          ? "Ustaw nowe hasło"
          : "Zaloguj się";

  function switchMode(nextMode: typeof mode) {
    if (busy) return;
    setErrorMessage("");
    setMode(nextMode);
  }

  return (
    <section className="bw-auth-page bw-page-content bw-stack">
      <header className="space-y-3">
        <p className="text-base font-semibold text-foreground">BallWise</p>
        <h1 className="bw-page-title">{title}</h1>
        {mode === "forgot" && (
          <p className="text-base text-muted-foreground">
            Wyślemy link do zmiany hasła na Twój e-mail.
          </p>
        )}
      </header>

      <form onSubmit={handleSubmit} className="space-y-6" aria-busy={busy}>
        {mode === "register" && (
          <>
            <ChoiceGroup
              selectedClassName="bg-primary/10 text-foreground"
              label="Właściciel konta"
              value={accountOwnerType}
              onChange={setAccountOwnerType}
              options={[
                {
                  value: "athlete",
                  label: "Zawodnik od 16 lat",
                  description: "Konto i e-mail należą do zawodnika.",
                },
                {
                  value: "guardian",
                  label: "Rodzic lub opiekun zawodnika 13–15",
                  description: "Dorosły posiada konto i zarządza profilem dziecka.",
                },
              ]}
            />
            <Field
              label="Data urodzenia zawodnika"
              htmlFor="register-birth-date"
              help="Konto od 13 lat. W wieku 13–15 zakłada je rodzic lub opiekun."
            >
              <Input
                id="register-birth-date"
                type="date"
                required
                min={birthDateForApproximateAge(80)}
                max={birthDateForApproximateAge(13)}
                value={athleteBirthDate}
                onChange={(event) => setAthleteBirthDate(event.target.value)}
                disabled={busy}
              />
            </Field>
            <Field
              label={
                accountOwnerType === "guardian" ? "Imię rodzica lub opiekuna" : "Imię zawodnika"
              }
              htmlFor="name"
            >
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="given-name"
                disabled={busy}
              />
            </Field>
          </>
        )}
        {mode !== "recovery" && (
          <Field label="E-mail" htmlFor="email">
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              disabled={busy}
            />
          </Field>
        )}
        {mode !== "forgot" && (
          <Field
            label={mode === "recovery" ? "Nowe hasło" : "Hasło"}
            htmlFor="password"
            help={mode === "login" ? undefined : "Co najmniej 12 znaków."}
          >
            <Input
              id="password"
              type="password"
              required
              minLength={mode === "login" ? 1 : 12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={
                mode === "register" || mode === "recovery" ? "new-password" : "current-password"
              }
              disabled={busy}
            />
          </Field>
        )}
        {mode === "recovery" && (
          <Field label="Powtórz nowe hasło" htmlFor="password-confirmation">
            <Input
              id="password-confirmation"
              type="password"
              required
              minLength={12}
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              autoComplete="new-password"
              disabled={busy}
            />
          </Field>
        )}
        {errorMessage && <StatusMessage tone="error">{errorMessage}</StatusMessage>}
        <Button type="submit" className="w-full" disabled={busy}>
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

      <div className="space-y-2">
        {mode === "login" && (
          <Button type="button" variant="link" disabled={busy} onClick={() => switchMode("forgot")}>
            Nie pamiętam hasła
          </Button>
        )}
        {mode !== "recovery" && (
          <Button
            type="button"
            variant="ghost"
            className="h-auto w-full justify-start whitespace-normal px-0 text-left font-normal text-muted-foreground"
            disabled={busy}
            onClick={() => switchMode(mode === "register" ? "login" : "register")}
          >
            {mode === "register"
              ? "Masz już konto? Zaloguj się"
              : "Nie masz konta? Zarejestruj się"}
          </Button>
        )}
      </div>

      <footer className="space-y-3 text-sm leading-5 text-muted-foreground">
        {mode === "register" && <p>Regulamin i zgody zatwierdzisz podczas konfiguracji profilu.</p>}
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link to="/terms" className="underline underline-offset-4">
            Regulamin
          </Link>
          <Link to="/privacy-policy" className="underline underline-offset-4">
            Polityka prywatności
          </Link>
        </div>
        <p>
          Poniżej 13 lat?{" "}
          <Link to="/demo" className="font-medium text-primary underline underline-offset-4">
            Demo bez konta i zapisu danych
          </Link>
        </p>
      </footer>
    </section>
  );
}
