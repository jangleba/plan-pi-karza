import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
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
import { AppLaunchScreen } from "@/components/loadwise/AppLaunchScreen";
import { AppDataError } from "@/components/loadwise/AppDataError";
import { scheduleRouteWarmup } from "@/lib/routeWarmup";

export const Route = createFileRoute("/auth")({
  component: AuthScreen,
});

function AuthScreen() {
  const {
    user,
    loading,
    recoveryMode,
    callbackError,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
  } = useAuth();
  const { hydrated, hydrationError, state } = useLoadwise();
  const navigate = useNavigate();
  const router = useRouter();
  const usablePlan = !!state.profile?.onboardingComplete && state.plan.length > 0;

  const [mode, setMode] = useState<"login" | "register" | "forgot" | "recovery">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [accountOwnerType, setAccountOwnerType] = useState<AccountOwnerType>("athlete");
  const [athleteBirthDate, setAthleteBirthDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // Fetch the destination code while the player enters credentials, not after sign-in.
    return scheduleRouteWarmup(["/start"] as const, (to) => router.preloadRoute({ to }));
  }, [router]);

  function changeMode(next: typeof mode) {
    setMode(next);
    setPassword("");
    setPasswordConfirmation("");
    setShowPassword(false);
  }

  useEffect(() => {
    if (recoveryMode) setMode("recovery");
  }, [recoveryMode]);

  // Redirect signed-in users onward.
  useEffect(() => {
    if (
      loading ||
      !user ||
      !hydrated ||
      (hydrationError && !usablePlan) ||
      recoveryMode ||
      mode === "recovery"
    )
      return;
    if (state.profile?.onboardingComplete) {
      navigate({ to: "/start", replace: true });
    } else {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [
    loading,
    user,
    hydrated,
    state.profile?.onboardingComplete,
    recoveryMode,
    mode,
    hydrationError,
    usablePlan,
    navigate,
  ]);

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
        if (password.length < 12) {
          toast.error("Nowe hasło musi mieć co najmniej 12 znaków.");
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
        navigate({
          to: state.profile?.onboardingComplete ? "/start" : "/onboarding",
          replace: true,
        });
      } else if (mode === "register") {
        if (password.length < 12) {
          toast.error("Hasło musi mieć co najmniej 12 znaków.");
          return;
        }
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
        if (needsEmailConfirmation) changeMode("login");
      } else {
        const { error } = await signIn(email.trim(), password);
        if (error) {
          toast.error(authErrorMessage(error, "login"));
          return;
        }
      }
    } catch (error) {
      toast.error(
        authErrorMessage(
          error instanceof Error ? error.message : String(error),
          mode === "register" ? "register" : "login",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  if (hydrationError && user && !recoveryMode && !usablePlan) return <AppDataError />;

  if (loading || (user && !hydrated && !recoveryMode)) {
    return <AppLaunchScreen />;
  }

  const title =
    mode === "register"
      ? "Zacznij swój plan."
      : mode === "forgot"
        ? "Nie pamiętasz hasła?"
        : mode === "recovery"
          ? "Ustaw nowe hasło."
          : "Wróć do gry.";

  return (
    <main className="app-shell auth-premium bw-auth">
      <div className="bw-auth__content">
        <header className="bw-auth__header">
          <span className="bw-auth__wordmark">
            BallWise<span aria-hidden="true">.</span>
          </span>
          <span className="bw-auth__eyebrow">TWÓJ PLAN. TWOJA GRA.</span>
        </header>

        <section aria-labelledby="auth-title" className="bw-auth__panel">
          {(mode === "login" || mode === "register") && (
            <div className="bw-auth__modes" aria-label="Dostęp do konta">
              <button
                type="button"
                aria-pressed={mode === "login"}
                disabled={busy}
                onClick={() => changeMode("login")}
              >
                Logowanie
              </button>
              <button
                type="button"
                aria-pressed={mode === "register"}
                disabled={busy}
                onClick={() => changeMode("register")}
              >
                Nowe konto
              </button>
            </div>
          )}
          <div className="bw-auth__intro">
            <h1 id="auth-title">{title}</h1>
            <p>
              {mode === "register"
                ? "Kilka danych i zaczynamy."
                : mode === "forgot"
                  ? "Wyślemy Ci link do zmiany hasła."
                  : mode === "recovery"
                    ? "Wybierz hasło mające co najmniej 12 znaków."
                    : "Zaloguj się i przejdź do swojego planu."}
            </p>
          </div>
          {callbackError && (
            <p role="alert" className="bw-auth__error">
              {callbackError}
            </p>
          )}

          <form onSubmit={handleSubmit} className="bw-auth__form" aria-busy={busy}>
            {mode === "register" && (
              <>
                <fieldset className="bw-auth__owner" disabled={busy}>
                  <legend>Dla kogo tworzysz konto?</legend>
                  <div>
                    <label>
                      <input
                        type="radio"
                        name="account-owner"
                        value="athlete"
                        checked={accountOwnerType === "athlete"}
                        onChange={() => setAccountOwnerType("athlete")}
                      />
                      <span>
                        <strong>Dla siebie</strong>
                        <small>Zawodnik, 16+ lat</small>
                      </span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="account-owner"
                        value="guardian"
                        checked={accountOwnerType === "guardian"}
                        onChange={() => setAccountOwnerType("guardian")}
                      />
                      <span>
                        <strong>Dla dziecka</strong>
                        <small>Zawodnik, 13–15 lat</small>
                      </span>
                    </label>
                  </div>
                </fieldset>
                {accountOwnerType === "guardian" && (
                  <p className="bw-auth__hint">
                    Rodzic lub opiekun jest właścicielem konta. Podaj swój e-mail i swoje imię.
                  </p>
                )}
                <div className="bw-auth__field">
                  <Label htmlFor="register-birth-date">Data urodzenia zawodnika</Label>
                  <Input
                    id="register-birth-date"
                    type="date"
                    required
                    min={birthDateForApproximateAge(80)}
                    max={birthDateForApproximateAge(13)}
                    value={athleteBirthDate}
                    disabled={busy}
                    onChange={(event) => setAthleteBirthDate(event.target.value)}
                  />
                </div>
                <div className="bw-auth__field">
                  <Label htmlFor="name">
                    {accountOwnerType === "guardian" ? "Imię opiekuna" : "Twoje imię"}
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    required
                    minLength={2}
                    disabled={busy}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Imię"
                    autoComplete="given-name"
                  />
                </div>
              </>
            )}
            {mode !== "recovery" && (
              <div className="bw-auth__field">
                <Label htmlFor="email">
                  {mode === "register" && accountOwnerType === "guardian"
                    ? "E-mail opiekuna"
                    : "E-mail"}
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  disabled={busy}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="twoj@email.pl"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </div>
            )}
            {mode !== "forgot" && (
              <div className="bw-auth__field">
                <div className="bw-auth__label-row">
                  <Label htmlFor="password">{mode === "recovery" ? "Nowe hasło" : "Hasło"}</Label>
                  {mode === "login" && (
                    <button type="button" disabled={busy} onClick={() => changeMode("forgot")}>
                      Nie pamiętam hasła
                    </button>
                  )}
                </div>
                <div className="bw-auth__password">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    disabled={busy}
                    minLength={mode === "login" ? 1 : 12}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "login" ? "Wpisz hasło" : "Co najmniej 12 znaków"}
                    autoComplete={
                      mode === "register" || mode === "recovery"
                        ? "new-password"
                        : "current-password"
                    }
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Ukryj hasło" : "Pokaż hasło"}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? "Ukryj" : "Pokaż"}
                  </button>
                </div>
              </div>
            )}
            {mode === "recovery" && (
              <div className="bw-auth__field">
                <Label htmlFor="password-confirmation">Powtórz nowe hasło</Label>
                <Input
                  id="password-confirmation"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={12}
                  value={passwordConfirmation}
                  disabled={busy}
                  onChange={(e) => setPasswordConfirmation(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            )}
            <Button type="submit" className="bw-auth__submit w-full" size="lg" disabled={busy}>
              {busy
                ? mode === "login"
                  ? "Logowanie…"
                  : "Zapisujemy…"
                : mode === "register"
                  ? "Utwórz konto"
                  : mode === "forgot"
                    ? "Wyślij link"
                    : mode === "recovery"
                      ? "Zapisz nowe hasło"
                      : "Zaloguj się"}
            </Button>
          </form>
          {mode === "forgot" && (
            <button
              type="button"
              className="bw-auth__back"
              disabled={busy}
              onClick={() => changeMode("login")}
            >
              Wróć do logowania
            </button>
          )}
          {mode === "register" && (
            <p className="bw-auth__hint bw-auth__registration-note">
              Konto od 13 lat. Regulamin i zgody zatwierdzisz podczas konfiguracji profilu.
            </p>
          )}
        </section>
        <footer className="bw-auth__footer">
          <Link to="/demo">Zobacz demo</Link>
          <div>
            <Link to="/terms">Regulamin</Link>
            <span aria-hidden="true">·</span>
            <Link to="/privacy-policy">Prywatność</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
