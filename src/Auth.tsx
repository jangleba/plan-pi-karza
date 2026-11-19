import { useState } from "react";
import { supabase } from "./lib/supabase";
import { DraftBanner, LegalLinks, LegalSheet } from "./legal/LegalUi";
import { legalReadiness, mayCreateAccounts, type DocKind } from "./legal/config";

/**
 * Logowanie / zakładanie konta. Dokumenty (regulamin, prywatność, zasady bezpieczeństwa i kontakt do operatora) są dostępne PRZED
 * zawarciem umowy. Akceptacja warunków i potwierdzenie zasad bezpieczeństwa są zapisywane po zalogowaniu (osobne oświadczenia).
 * W produkcji konta nie można zakładać, dopóki dane operatora i dokumenty nie są uzupełnione i zatwierdzone (w trybie deweloperskim – tak, z ostrzeżeniem).
 */
export function Auth({ onBack }: { onBack?: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [doc, setDoc] = useState<DocKind | null>(null);
  const field = "w-full rounded-xl bg-canvas px-3 py-2.5 text-sm outline-none";
  const canSignUp = mayCreateAccounts();

  const submit = async () => {
    if (!supabase) return;
    if (mode === "up" && !canSignUp) return;
    setBusy(true);
    setMsg("");
    const { error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMsg(error.message);
    else if (mode === "up") setMsg("Sprawdź skrzynkę i potwierdź adres e-mail. Po zalogowaniu zapytamy o akceptację regulaminu i zasad bezpieczeństwa.");
  };

  return (
    <main className="mx-auto max-w-md px-4 pt-20">
      {onBack && <button onClick={onBack} className="mb-4 text-sm text-accent">‹ Wróć do trybu gościa</button>}
      <h1 className="text-3xl font-semibold tracking-tight">Ballwise</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{mode === "in" ? "Zaloguj się" : "Załóż konto"}</p>
      {mode === "up" && <DraftBanner />}
      {mode === "up" && !canSignUp && (
        <p className="mb-4 rounded-2xl bg-pink px-4 py-3 text-sm text-pink-ink">Zakładanie kont jest chwilowo niedostępne – operator nie uzupełnił jeszcze wymaganych danych i dokumentów ({legalReadiness().missingOperator.length + legalReadiness().unapproved.length} braków). Możesz korzystać z aplikacji bez konta.</p>
      )}
      <section className="rounded-2xl bg-card p-4 border border-hairline">
        <input className={`${field} mb-3`} type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <input className={`${field} mb-3`} type="password" placeholder="Hasło (min. 8 znaków)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} />
        <button disabled={busy || (mode === "up" && !canSignUp)} onClick={submit} className="w-full rounded-xl bw-grad py-2.5 text-sm font-medium disabled:opacity-50">
          {mode === "in" ? "Zaloguj" : "Załóż konto"}
        </button>
      </section>
      {msg && <p className="mt-4 rounded-2xl border border-hairline bg-canvas p-3 text-sm text-muted">{msg}</p>}
      <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 text-sm text-muted underline">
        {mode === "in" ? "Nie mam konta" : "Mam już konto"}
      </button>
      <div className="mt-6"><LegalLinks onOpen={setDoc} /></div>
      <p className="mt-2 text-xs text-muted">Informacja o prywatności nie jest zgodą na przetwarzanie danych. Aplikacja jest dla osób, które ukończyły 16 lat.</p>
      {doc && <LegalSheet kind={doc} onClose={() => setDoc(null)} />}
    </main>
  );
}
