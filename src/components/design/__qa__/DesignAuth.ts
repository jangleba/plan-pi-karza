/** All authentication operations are deliberately inert in visual QA. */
export const useAuth = () => ({
  user:
    new URLSearchParams(location.search).get("screen") === "auth"
      ? null
      : {
          id: "design37",
          email: "zawodnik@example.com",
          email_confirmed_at: "2026-01-01",
          user_metadata: { full_name: "Jan Kowalski", athlete_birth_date: "2006-01-01" },
        },
  loading: false,
  recoveryMode: false,
  callbackError: null,
  signOut: async () => {},
  requestAccountEmailChange: async () => ({ error: null }),
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  requestPasswordReset: async () => ({ error: null }),
  updatePassword: async () => ({ error: null }),
  resendSignupConfirmation: async () => ({ error: null }),
});
