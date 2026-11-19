import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { sameScope, setScope, type Scope } from "./store";

/**
 * Stan sesji → przestrzeń danych. Zmiana sesji (logowanie, wylogowanie, inne konto) zmienia przestrzeń PRZED renderem dzieci,
 * a komponenty nadrzędne montują drzewo od nowa (key), więc stan w pamięci poprzedniego konta nie przechodzi na następne.
 */
export type AuthState = { status: "loading" } | { status: "ready"; scope: Scope; email: string | null };
const GUEST = { status: "ready", scope: { kind: "guest" }, email: null } as const satisfies AuthState;

export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>(() => { if (!supabase) { setScope(GUEST.scope); return GUEST; } return { status: "loading" }; });
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const apply = (user: { id: string; email?: string | null } | null) => {
      const next: Extract<AuthState, { status: "ready" }> = user ? { status: "ready", scope: { kind: "user", id: user.id }, email: user.email ?? null } : GUEST;
      setScope(next.scope); // najpierw przestrzeń, potem stan: dzieci nie zobaczą danych poprzedniego użytkownika
      if (alive) setState((cur) => (cur.status === "ready" && sameScope(cur.scope, next.scope) && cur.email === next.email ? cur : next));
    };
    void supabase.auth.getSession().then(({ data }) => apply(data.session?.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => apply(session?.user ?? null));
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);
  return state;
}
