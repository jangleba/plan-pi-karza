import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AccountOwnerType } from "./agePolicy";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  recoveryMode: boolean;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    // Register the listener first, then read the existing session.
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      if (event === "SIGNED_OUT") setRecoveryMode(false);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function signUp(
    email: string,
    password: string,
    fullName: string,
    accountOwnerType: AccountOwnerType,
    athleteBirthDate: string,
  ) {
    const redirectUrl = typeof window !== "undefined" ? window.location.origin : undefined;
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
    const emailRedirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo },
    });
    return { error: error?.message ?? null };
  }

  async function requestAccountEmailChange(email: string) {
    const emailRedirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
    const { error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo },
    );
    return { error: error?.message ?? null };
  }

  async function requestPasswordReset(email: string) {
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth` : undefined;
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
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        recoveryMode,
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
