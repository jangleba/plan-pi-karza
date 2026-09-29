function supabaseErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const row = error as Record<string, unknown>;
    const parts = [
      typeof row.message === "string" ? row.message : null,
      typeof row.details === "string" ? row.details : null,
      typeof row.hint === "string" ? row.hint : null,
      typeof row.code === "string" ? `code: ${row.code}` : null,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(" | ");
  }
  if (error instanceof Error) return error.message;
  return "Unknown Supabase error";
}

export function assertNoSupabaseError(context: string, error: unknown): void {
  if (!error) return;
  throw new Error(`[${context}] ${supabaseErrorMessage(error)}`);
}
