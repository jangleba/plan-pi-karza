import { loadEnv } from "vite";

const env = { ...loadEnv("production", process.cwd(), ""), ...process.env };
const errors = [];
const requireValue = (key) => {
  const value = String(env[key] ?? "").trim();
  if (
    !value ||
    /\[|\]|placeholder|example\.(?:com|invalid)|YOUR_|twojafirma|twoja-firma/i.test(value)
  ) {
    errors.push(`${key}: uzupełnij prawdziwą wartość.`);
  }
  return value;
};
if (env.VITE_RELEASE_MODE !== "production")
  errors.push("VITE_RELEASE_MODE musi mieć wartość production.");
if (env.VITE_BILLING_ENFORCED !== "true")
  errors.push("VITE_BILLING_ENFORCED musi mieć wartość true dla płatnego wydania.");
for (const name of [
  "ADMIN_NAME",
  "BUSINESS_ADDRESS",
  "REGISTRY_DETAILS",
  "CONTACT_EMAIL",
  "ACCOUNT_RETENTION",
  "CONSENT_RETENTION",
  "BACKUP_RETENTION",
  "SUPABASE_REGION",
  "SUBSCRIPTION_PRICE",
  "TRIAL_DESCRIPTION",
])
  requireValue(`VITE_LEGAL_${name}`);
const key = requireValue("VITE_REVENUECAT_IOS_PUBLIC_KEY");
if (key && !key.startsWith("appl_"))
  errors.push("VITE_REVENUECAT_IOS_PUBLIC_KEY musi być publicznym kluczem iOS RevenueCat (appl_).");
requireValue("VITE_REVENUECAT_PRODUCT_ID");
const url = requireValue("VITE_SUPABASE_URL");
try {
  if (new URL(url).protocol !== "https:") errors.push("VITE_SUPABASE_URL musi używać HTTPS.");
} catch {
  errors.push("VITE_SUPABASE_URL: nieprawidłowy URL.");
}
requireValue("VITE_SUPABASE_PUBLISHABLE_KEY");
const bundle = requireValue("BALLWISE_IOS_BUNDLE_ID");
if (bundle && !/^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9-]+){2,}$/.test(bundle))
  errors.push("BALLWISE_IOS_BUNDLE_ID: nieprawidłowy identyfikator.");
const domain = requireValue("BALLWISE_IOS_ASSOCIATED_DOMAIN");
const callback = requireValue("VITE_AUTH_REDIRECT_URL");
try {
  const parsed = new URL(callback);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== domain ||
    parsed.pathname !== "/auth" ||
    parsed.search ||
    parsed.hash
  )
    errors.push(
      "VITE_AUTH_REDIRECT_URL musi być https://<BALLWISE_IOS_ASSOCIATED_DOMAIN>/auth bez parametrów.",
    );
} catch {
  errors.push("VITE_AUTH_REDIRECT_URL: nieprawidłowy URL.");
}
for (const name of Object.keys(env)) {
  if (name.startsWith("VITE_") && /SECRET|SERVICE_ROLE|PRIVATE_KEY|OPENAI_API_KEY/i.test(name))
    errors.push(`${name}: sekret nie może trafić do frontendu.`);
}
if (errors.length) {
  console.error(
    `Konfiguracja płatnego wydania iOS jest niepełna:\n${errors.map((x) => `- ${x}`).join("\n")}\nWartości zmiennych nie są wypisywane. Zobacz docs/INSTALLATION-2026-10.md.`,
  );
  process.exitCode = 1;
} else {
  console.log(
    "Publiczna konfiguracja wydania kompletna. Ten test nie potwierdza konfiguracji Apple/RevenueCat, backendu, podpisania ani testów na iPhonie.",
  );
}
