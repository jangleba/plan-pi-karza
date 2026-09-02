import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/loadwise/auth";
import { useLoadwise } from "@/lib/loadwise/store";
import { authErrorMessage } from "@/lib/authMessages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthScreen,
});

function AuthScreen() {
  const { user, loading, signIn, signUp } = useAuth();
  const { hydrated, state } = useLoadwise();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"login" | "register">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  // Redirect signed-in users onward.
  useEffect(() => {
    if (loading || !user || !hydrated) return;
    if (state.profile?.onboardingComplete) {
      navigate({ to: "/start", replace: true });
    } else {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [loading, user, hydrated, state.profile?.onboardingComplete, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "register") {
        if (name.trim().length < 2) {
          toast.error("Podaj imię.");
          return;
        }
        const { error } = await signUp(email.trim(), password, name.trim());
        if (error) {
          toast.error(authErrorMessage(error, "register"));
          return;
        }
        setConfirmationEmail(email.trim());
        toast.success("Konto utworzone. Sprawdź skrzynkę e-mail.");
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

  if (confirmationEmail && !user) {
    return (
      <div className="app-shell flex min-h-screen flex-col justify-center px-6 py-10">
        <div
          className="mx-auto w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center shadow-sm"
          aria-live="polite"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MailCheck className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            Potwierdź swój e-mail
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Wysłaliśmy link aktywacyjny na <strong>{confirmationEmail}</strong>.
            Kliknij go, a potem wróć tutaj i zaloguj się. Jeśli wiadomości nie ma,
            sprawdź folder spam.
          </p>
          <Button
            type="button"
            className="mt-6 w-full"
            size="lg"
            onClick={() => {
              setConfirmationEmail(null);
              setMode("login");
              setPassword("");
            }}
          >
            Przejdź do logowania
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell flex min-h-screen flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="text-center">
          <div className="text-3xl font-semibold tracking-tight text-primary">
            Loadwise
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "register"
              ? "Załóż konto, aby zacząć trenować mądrzej."
              : "Zaloguj się do swojego konta."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {mode === "register" && (
            <div className="space-y-2">
              <Label htmlFor="name">Imię</Label>
              <Input
                id="name"
                value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Twoje imię"
              autoComplete="given-name"
              required
              disabled={busy}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ty@example.com"
              autoComplete="email"
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Hasło</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min. 6 znaków"
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              disabled={busy}
            />
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy
              ? "Chwila…"
              : mode === "register"
                ? "Utwórz konto"
                : "Zaloguj się"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode((currentMode) =>
              currentMode === "register" ? "login" : "register",
            );
            setPassword("");
          }}
          className="mt-5 w-full text-center text-sm text-muted-foreground"
        >
          {mode === "register"
            ? "Masz już konto? Zaloguj się"
            : "Nie masz konta? Zarejestruj się"}
        </button>

        <p className="mt-8 text-center text-xs leading-relaxed text-muted-foreground">
          Rejestrując się akceptujesz{" "}
          <Link to="/terms" className="underline">
            Regulamin
          </Link>{" "}
          oraz{" "}
          <Link to="/privacy-policy" className="underline">
            Politykę prywatności
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
