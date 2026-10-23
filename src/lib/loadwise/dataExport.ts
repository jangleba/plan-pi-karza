import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { exportLocalUserData } from "./localPrivacy";
import { exportTrainingQueue } from "./offlineTrainingQueue";
import { readAllPages } from "./pagination";

export const USER_DATA_SOURCES = [
  "profiles",
  "athlete_profiles",
  "onboarding_answers",
  "readiness_logs",
  "pain_logs",
  "training_plans",
  "training_days",
  "training_sessions",
  "session_exercises",
  "session_logs",
  "exercise_set_logs",
  "session_modifications",
  "weekly_transitions",
  "exercise_replacements",
  "running_activities",
  "user_roles",
  "consent_logs",
  "lab_test_results",
  "billing_entitlements",
  "module_backups",
  "training_write_receipts",
] as const;
const OPTIONAL_SOURCES = new Set([
  "lab_test_results",
  "billing_entitlements",
  "module_backups",
  "training_write_receipts",
]);
export interface DataExportPage {
  data: Record<string, unknown>[] | null;
  error: { code?: string; message?: string } | null;
}
export interface ExportAccount {
  id: string;
  email?: string;
  phone?: string;
  created_at?: string;
  updated_at?: string;
  email_confirmed_at?: string;
  phone_confirmed_at?: string;
  last_sign_in_at?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
  identities?: unknown[];
}
export type ExportPageLoader = (
  source: string,
  userId: string,
  from: number,
  to: number,
) => PromiseLike<DataExportPage>;
type ExportBuilder = PromiseLike<DataExportPage> & {
  eq(column: string, value: string): ExportBuilder;
  order(column: string, options?: { ascending: boolean }): ExportBuilder;
  range(from: number, to: number): ExportBuilder;
};
const defaultPage: ExportPageLoader = (source, userId, from, to) => {
  let query = (
    supabase
      .from(source as keyof Database["public"]["Tables"])
      .select("*") as unknown as ExportBuilder
  ).eq("user_id", userId);
  if (source === "module_backups") query = query.order("module").order("device_id");
  else
    query = query.order(
      source === "billing_entitlements"
        ? "user_id"
        : source === "training_write_receipts"
          ? "operation_id"
          : "id",
      { ascending: true },
    );
  return query.range(from, to) as unknown as PromiseLike<DataExportPage>;
};

async function nativeRunState(userId: string): Promise<unknown> {
  const { nativeRecorder, nativeRunningAvailable } = await import("@/lib/running/nativeRecorder");
  if (!nativeRunningAvailable()) return null;
  return nativeRecorder.getOwnerState({ ownerId: userId });
}

export async function buildUserDataExport(
  account: ExportAccount,
  load: ExportPageLoader = defaultPage,
) {
  const remote: Record<string, unknown[]> = {};
  const unavailable: { source: string; reason: string }[] = [];
  for (const source of USER_DATA_SOURCES) {
    const result = await readAllPages((from, to) => load(source, account.id, from, to));
    if (result.error) {
      // An absent legacy/optional module does not prevent export of existing data.
      if (OPTIONAL_SOURCES.has(source) && ["42P01", "PGRST205"].includes(result.error.code ?? "")) {
        unavailable.push({ source, reason: "Źródło nie jest zainstalowane w tej wersji bazy." });
        continue;
      }
      throw new Error(
        `Nie udało się pobrać źródła ${source}. Eksport nie został oznaczony jako kompletny.`,
      );
    }
    remote[source] = result.data ?? [];
  }
  return {
    format: "ballwise-personal-data",
    format_version: 2,
    account,
    exported_at: new Date().toISOString(),
    remote,
    local: exportLocalUserData(account.id),
    pending_training: await exportTrainingQueue(account.id),
    native_run_checkpoint: await nativeRunState(account.id),
    unavailable_sources: unavailable,
    scope:
      "Dane konta z dostępnych tabel, lokalne historie i niewysłane wyniki z tego urządzenia. Filmy źródłowe pozostają w wybranych przez użytkownika plikach.",
  };
}

export async function buildLocalUserDataExport(account: ExportAccount) {
  return {
    format: "ballwise-personal-data",
    format_version: 2,
    scope: "Kopia danych z tego urządzenia; dane z serwera nie były pobierane.",
    account,
    exported_at: new Date().toISOString(),
    local: exportLocalUserData(account.id),
    pending_training: await exportTrainingQueue(account.id),
    native_run_checkpoint: await nativeRunState(account.id),
  };
}
