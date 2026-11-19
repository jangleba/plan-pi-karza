/**
 * Usuwanie konta: orkiestracja niezależna od środowiska (testowalna). Identyfikator użytkownika pochodzi WYŁĄCZNIE ze zweryfikowanego
 * tokenu sesji – nigdy z treści żądania – więc nie da się usunąć danych innej osoby. Operacje są idempotentne, a wynik opisuje
 * rzeczywisty stan (które kroki się udały), żeby klient mógł pokazać prawdę i dokończyć.
 */
export interface DeleteDeps {
  verifyUser(jwt: string): Promise<{ id: string } | null>;
  /** Usuwa dane ze wszystkich tabel użytkownika (SQL: erase_user_data) i zwraca identyfikator wpisu w dzienniku. */
  eraseData(userId: string): Promise<{ logId: string; deleted: Record<string, number> }>;
  deleteAuthUser(userId: string): Promise<void>;
  finish(logId: string, ok: boolean): Promise<void>;
}

export interface StepResult { name: "erase_data" | "delete_auth_user"; ok: boolean; error?: string; detail?: Record<string, number> }
export interface DeleteOutcome { status: 200 | 401 | 500; body: { complete: boolean; steps: StepResult[]; error?: string } }

export async function deleteAccount(deps: DeleteDeps, jwt: string | null): Promise<DeleteOutcome> {
  if (!jwt) return { status: 401, body: { complete: false, steps: [], error: "brak sesji" } };
  let user: { id: string } | null = null;
  try { user = await deps.verifyUser(jwt); } catch { user = null; }
  if (!user) return { status: 401, body: { complete: false, steps: [], error: "nieprawidłowa sesja" } };

  const steps: StepResult[] = [];
  let logId: string | null = null;
  try {
    const r = await deps.eraseData(user.id);
    logId = r.logId;
    steps.push({ name: "erase_data", ok: true, detail: r.deleted });
  } catch (e) {
    steps.push({ name: "erase_data", ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "błąd" });
    return { status: 500, body: { complete: false, steps, error: "Nie udało się usunąć danych. Konto nie zostało usunięte – spróbuj ponownie." } };
  }
  try {
    await deps.deleteAuthUser(user.id);
    steps.push({ name: "delete_auth_user", ok: true });
    await deps.finish(logId, true).catch(() => {});
    return { status: 200, body: { complete: true, steps } };
  } catch (e) {
    steps.push({ name: "delete_auth_user", ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "błąd" });
    await deps.finish(logId, false).catch(() => {});
    return { status: 500, body: { complete: false, steps, error: "Dane zostały usunięte, ale nie udało się zamknąć konta logowania. Spróbuj ponownie." } };
  }
}
