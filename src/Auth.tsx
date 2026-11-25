import { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase";
import { DraftBanner, LegalLinks, LegalSheet } from "./legal/LegalUi";
import { legalReadiness, mayCreateAccounts, type DocKind } from "./legal/config";
import { otpError, normalizeCode, validEmail } from "./auth/otp";

/**
 * Logowanie / zakładanie konta.
 * Domyślnie: kod z e-maila wpisywany TUTAJ (w aplikacji z ikony). Link z e-maila na iPhonie otwierałby Safari, które ma
 * osobną sesję niż aplikacja z ekranu początkowego – kod tego problemu nie ma. Hasło zostaje jako druga możliwość.
 * Sesja jest zapamiętywana na urządzeniu i odświeżana automatycznie (Supabase), więc kolejne wejścia z ikony są od razu zalogowane.
 *
 * Dokumenty (regulamin, prywatność, zasady bezpieczeństwa i kontakt do operatora) są dostępne PRZED zawarciem umowy.
 * W produkcji konta nie można zakładać, dopóki dane operatora i dokumenty nie są uzupełnione i zatwierdzone.
 */
const RESEND_S = 60;
/** Długość kodu ustawiona w Supabase (Auth → Email OTP length, domyślnie 6). */
const OTP_LEN = Math.min(10, Math.max(6, Number(import.meta.env.VITE_OTP_LENGTH ?? 6) || 6));

export function Auth({ onBack }: { onBack?: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [method, setMethod] = useState<"code" | "password">("code");
  const [step, setStep] = useState<"email" | "code">("email");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [doc, setDoc] = useState<DocKind | null>(null);
  const codeRef = useRef<HTMLInputElement | null>(null);
  const field = "w-full rounded-2xl bg-canvas px-4 py-3.5 text-[17px] outline-none focus:ring-2 focus:ring-sel-border";
  const canSignUp = mayCreateAccounts();

  useEffect(() => { if (wait <= 0) return; const id = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(id); }, [wait]);
  useEffect(() => { if (step === "code") codeRef.current?.focus(); }, [step]);

  const sendCode = async () => {
    if (!supabase || !validEmail(email)) { setMsg("Wpisz poprawny adres e-mail."); return; }
    setBusy(true); setMsg("");
    // nowe konto tylko, gdy zakładanie kont jest dozwolone; w trybie logowania nie tworzymy konta przez pomyłkę w adresie
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: mode === "up" && canSignUp } });
    setBusy(false);
    if (error) { setMsg(otpError(error.message, mode)); return; }
    setStep("code"); setWait(RESEND_S); setCode("");
  };

  const verify = async (value = code) => {
    const token = normalizeCode(value);
    if (!supabase || token.length < OTP_LEN) return;
    setBusy(true); setMsg("");
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: "email" });
    setBusy(false);
    if (error) setMsg(otpError(error.message, mode));
    // sukces: onAuthStateChange przełącza aplikację na konto (session.ts)
  };

  const submitPassword = async () => {
    if (!supabase) return;
    if (mode === "up" && !canSignUp) return;
    setBusy(true); setMsg("");
    const { error } = mode === "in" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMsg(error.message);
    else if (mode === "up") setMsg("Sprawdź skrzynkę i potwierdź adres e-mail. Po zalogowaniu zapytamy o akceptację regulaminu i zasad bezpieczeństwa.");
  };

  return (
    <main className="mx-auto max-w-md px-5 pb-16 pt-[max(4rem,env(safe-area-inset-top))]">
      {onBack && <button onClick={onBack} className="mb-4 text-sm text-accent">‹ Wróć do trybu gościa</button>}
      <h1 className="text-[34px] font-semibold tracking-tight">BallWise</h1>
      <p className="mb-6 mt-1 text-[15px] text-muted">{mode === "in" ? "Zaloguj się" : "Załóż konto"}</p>
      {mode === "up" && <DraftBanner />}
      {mode === "up" && !canSignUp && (
        <p className="mb-4 rounded-2xl bg-pink px-4 py-3 text-sm text-pink-ink">Zakładanie kont jest chwilowo niedostępne – operator nie uzupełnił jeszcze wymaganych danych i dokumentów ({legalReadiness().missingOperator.length + legalReadiness().unapproved.length} braków). Możesz korzystać z aplikacji bez konta.</p>
      )}

      <section className="rounded-3xl border border-hairline bg-card p-4">
        {method === "code" && step === "email" && (
          <form onSubmit={(e) => { e.preventDefault(); void sendCode(); }}>
            <label htmlFor="bw-email" className="mb-2 block text-sm text-muted">Adres e-mail</label>
            <input id="bw-email" className={`${field} mb-3`} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="ty@przyklad.pl" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button type="submit" disabled={busy || (mode === "up" && !canSignUp)} className="h-14 w-full rounded-2xl bw-grad text-base font-semibold disabled:opacity-50">{busy ? "Wysyłanie…" : "Wyślij kod"}</button>
            <p className="mt-3 text-xs text-muted">Wyślemy {OTP_LEN}-cyfrowy kod. Wpiszesz go tutaj – bez przechodzenia do innej aplikacji.</p>
          </form>
        )}
        {method === "code" && step === "code" && (
          <form onSubmit={(e) => { e.preventDefault(); void verify(); }}>
            <p className="mb-3 text-[15px]">Kod wysłaliśmy na <b className="break-all">{email.trim()}</b>.</p>
            <label htmlFor="bw-code" className="mb-2 block text-sm text-muted">Kod z e-maila</label>
            <input id="bw-code" ref={codeRef} className={`${field} mb-3 text-center text-[28px] font-semibold tracking-[0.4em] tabular-nums`} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={12} placeholder={"•".repeat(OTP_LEN)} value={code}
              onChange={(e) => { const v = e.target.value; setCode(v); if (normalizeCode(v).length === OTP_LEN) void verify(v); }} />
            <button type="submit" disabled={busy || normalizeCode(code).length < OTP_LEN} className="h-14 w-full rounded-2xl bw-grad text-base font-semibold disabled:opacity-50">{busy ? "Sprawdzanie…" : "Zaloguj"}</button>
            <div className="mt-3 flex items-center justify-between text-sm">
              <button type="button" onClick={() => { setStep("email"); setMsg(""); }} className="text-muted">Zmień adres</button>
              <button type="button" disabled={wait > 0 || busy} onClick={() => void sendCode()} className="text-accent disabled:text-muted">{wait > 0 ? `Wyślij ponownie (${wait} s)` : "Wyślij ponownie"}</button>
            </div>
            <p className="mt-3 text-xs text-muted">Nie widzisz e-maila? Sprawdź folder Spam lub Oferty. Kod jest ważny przez ograniczony czas.</p>
          </form>
        )}
        {method === "password" && (
          <form onSubmit={(e) => { e.preventDefault(); void submitPassword(); }}>
            <input className={`${field} mb-3`} type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" />
            <input className={`${field} mb-3`} type="password" placeholder="Hasło (min. 8 znaków)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} />
            <button type="submit" disabled={busy || (mode === "up" && !canSignUp)} className="h-14 w-full rounded-2xl bw-grad text-base font-semibold disabled:opacity-50">{mode === "in" ? "Zaloguj" : "Załóż konto"}</button>
          </form>
        )}
      </section>

      {msg && <p className="mt-4 rounded-2xl border border-hairline bg-canvas p-3 text-sm text-muted" role="alert">{msg}</p>}
      <div className="mt-4 flex flex-col items-start gap-3 text-sm">
        <button onClick={() => { setMethod(method === "code" ? "password" : "code"); setStep("email"); setMsg(""); }} className="text-accent">
          {method === "code" ? "Zaloguj hasłem" : "Zaloguj kodem z e-maila"}
        </button>
        <button onClick={() => { setMode(mode === "in" ? "up" : "in"); setStep("email"); setMsg(""); }} className="text-muted underline">
          {mode === "in" ? "Nie mam konta" : "Mam już konto"}
        </button>
      </div>
      <div className="mt-6"><LegalLinks onOpen={setDoc} /></div>
      <p className="mt-2 text-xs text-muted">Informacja o prywatności nie jest zgodą na przetwarzanie danych. Aplikacja jest dla osób, które ukończyły 16 lat.</p>
      {doc && <LegalSheet kind={doc} onClose={() => setDoc(null)} />}
    </main>
  );
}
