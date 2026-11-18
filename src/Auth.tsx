import { useState } from "react";
import { supabase } from "./lib/supabase";

export function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const field = "w-full rounded-xl bg-canvas px-3 py-2.5 text-sm outline-none";

  const submit = async () => {
    if (!supabase) return;
    setBusy(true);
    setMsg("");
    const { error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMsg(error.message);
    else if (mode === "up") setMsg("Sprawdź skrzynkę i potwierdź adres e-mail.");
  };

  return (
    <main className="mx-auto max-w-md px-4 pt-24">
      <h1 className="text-3xl font-semibold tracking-tight">Ballwise</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{mode === "in" ? "Zaloguj się" : "Załóż konto"}</p>
      <section className="rounded-2xl bg-card p-4 border border-hairline">
        <input className={`${field} mb-3`} type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={`${field} mb-3`} type="password" placeholder="Hasło (min. 8 znaków)" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button disabled={busy} onClick={submit} className="w-full rounded-xl bg-ink py-2.5 text-sm font-medium text-white disabled:opacity-50">
          {mode === "in" ? "Zaloguj" : "Załóż konto"}
        </button>
      </section>
      {msg && <p className="mt-4 rounded-2xl bg-yellow-soft p-3 text-sm text-yellow-ink">{msg}</p>}
      <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 text-sm text-muted underline">
        {mode === "in" ? "Nie mam konta" : "Mam już konto"}
      </button>
    </main>
  );
}
