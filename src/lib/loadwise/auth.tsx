import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AccountOwnerType } from "./agePolicy";
import { clearLocalSessionData } from "./localPrivacy";
import { clearConsentStatusCache } from "./legalStatus";
import { configuredAuthRedirect, installNativeAuthCallbacks } from "./nativeAuth";
import { nativeRecorder, nativeRunningAvailable } from "@/lib/running/nativeRecorder";
import { forgetOfflineOwner, loadOfflineOwner, rememberOfflineOwner } from "./offlineOwner";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  recoveryMode: boolean;
  callbackError: string | null;
  offlineIdentity: boolean;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    accountOwnerType: AccountOwnerType,
    athleteBirthDate: string,
  ) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  resendSignupConfirmation: (email: string) => Promise<{ error: string | null }>;
  requestAccountEmailChange: (email: string) => Promise<{ error: string | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [offlineIdentity, setOfflineIdentity] = useState(false);
  const authRevision = useRef(0);

  useEffect(() => {
    const ownerId = user?.id;
    return () => {
      if (ownerId && nativeRunningAvailable())
        void nativeRecorder.pauseOwner({ ownerId }).catch(() => undefined);
    };
  }, [user?.id]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void installNativeAuthCallbacks(
      (code) => supabase.auth.exchangeCodeForSession(code),
      (error, recovery) => {
        if (disposed) return;
        setCallbackError(error);
        if (recovery) setRecoveryMode(true);
        window.dispatchEvent(
          new CustomEvent("ballwise:auth-callback", { detail: { error, recovery } }),
        );
      },
    )
      .then((value) => {
        if (disposed) value();
        else cleanup = value;
      })
      .catch((error) => {
        if (!disposed)
          setCallbackError(
            error instanceof Error ? error.message : "Nie skonfigurowano linków logowania.",
          );
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  useClientLayoutEffect(() => {
    let active = true;

    // Listener rejestrujemy przed odczytem. Numer rewizji chroni przed sytuacją,
    // w której wolniejszy getSession nadpisuje nowsze zdarzenie logowania.
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (!active) return;
      authRevision.current += 1;
      setSession(sess);
      const localOwner =
        !sess && event !== "SIGNED_OUT" && navigator.onLine === false ? loadOfflineOwner() : null;
      setOfflineIdentity(!!localOwner);
      if (sess?.user && navigator.onLine !== false) rememberOfflineOwner(sess.user);
      setUser((current) => {
        const next = sess?.user ?? localOwner;
        return current?.id === next?.id && event !== "USER_UPDATED" ? current : next;
      });
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
        window.dispatchEvent(
          new CustomEvent("ballwise:auth-callback", { detail: { recovery: true, error: null } }),
        );
      }
      if (event === "SIGNED_OUT") {
        forgetOfflineOwner();
        clearConsentStatusCache();
        setRecoveryMode(false);
      }
      // A completed sign-in is enough even when the earlier getSession is slow.
      setLoading(false);
    });

    const revisionAtRequest = authRevision.current;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active || authRevision.current !== revisionAtRequest) return;
        setSession(data.session);
        const localOwner = !data.session && navigator.onLine === false ? loadOfflineOwner() : null;
        setOfflineIdentity(!!localOwner);
        setUser(data.session?.user ?? localOwner);
      })
      .catch(() => {
        // Auth listener pozostaje źródłem prawdy; brak sesji obsłuży routing.
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const reconnect = () => {
      if (!offlineIdentity || navigator.onLine === false) return;
      const revisionAtRequest = authRevision.current;
      void supabase.auth
        .getSession()
        .then(({ data }) => {
          if (!active || authRevision.current !== revisionAtRequest) return;
          setSession(data.session);
          setUser(data.session?.user ?? null);
          setOfflineIdentity(false);
          if (!data.session)
            setCallbackError(
              "Połączenie wróciło. Zaloguj się ponownie, aby wysłać zapisane treningi.",
            );
        })
        .catch(() => undefined);
    };
    window.addEventListener("online", reconnect);
    return () => {
      active = false;
      window.removeEventListener("online", reconnect);
    };
  }, [offlineIdentity]);

  async function signUp(
    email: string,
    password: string,
    fullName: string,
    accountOwnerType: AccountOwnerType,
    athleteBirthDate: string,
  ) {
    let redirectUrl: string;
    try {
      redirectUrl = configuredAuthRedirect();
    } catch (error) {
      return { error: (error as Error).message, needsEmailConfirmation: false };
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          account_owner_type: accountOwnerType,
          athlete_birth_date: athleteBirthDate,
        },
      },
    });
    return {
      error: error?.message ?? null,
      needsEmailConfirmation: !error && data.session === null,
    };
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error?.message ?? null };
  }

  async function resendSignupConfirmation(email: string) {
    let emailRedirectTo: string;
    try {
      emailRedirectTo = configuredAuthRedirect();
    } catch (error) {
      return { error: (error as Error).message };
    }
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo },
    });
    return { error: error?.message ?? null };
  }

  async function requestAccountEmailChange(email: string) {
    let emailRedirectTo: string;
    try {
      emailRedirectTo = configuredAuthRedirect();
    } catch (error) {
      return { error: (error as Error).message };
    }
    const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo });
    return { error: error?.message ?? null };
  }

  async function requestPasswordReset(email: string) {
    let redirectTo: string;
    try {
      redirectTo = configuredAuthRedirect();
    } catch (error) {
      return { error: (error as Error).message };
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    return { error: error?.message ?? null };
  }

  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) setRecoveryMode(false);
    return { error: error?.message ?? null };
  }

  async function signOut() {
    authRevision.current += 1;
    const userId = user?.id;
    forgetOfflineOwner(userId);
    setOfflineIdentity(false);
    try {
      if (userId && nativeRunningAvailable())
        await nativeRecorder.pauseOwner({ ownerId: userId }).catch(() => {
          setCallbackError(
            "Nie potwierdzono zatrzymania GPS. Sprawdź wskaźnik lokalizacji w telefonie.",
          );
        });
      await supabase.auth.signOut();
    } finally {
      clearConsentStatusCache();
      if (userId) clearLocalSessionData(userId);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        recoveryMode,
        callbackError,
        offlineIdentity,
        signUp,
        signIn,
        resendSignupConfirmation,
        requestAccountEmailChange,
        requestPasswordReset,
        updatePassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
