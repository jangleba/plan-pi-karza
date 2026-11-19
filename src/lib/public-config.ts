/**
 * Publiczna konfiguracja Supabase – alternatywa dla zmiennych VITE_* (np. gdy Lovable nie wczytuje pliku .env).
 * Klucz „publishable” (dawniej „anon”) jest jawny z założenia: dostępu do danych pilnuje RLS w bazie.
 * NIGDY nie wpisuj tu klucza „service_role”, hasła do bazy ani żadnego sekretu.
 * Zmienne VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY, jeśli są ustawione, mają pierwszeństwo.
 */
export const PUBLIC_SUPABASE = {
  url: "",
  publishableKey: "",
};
