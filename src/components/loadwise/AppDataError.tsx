export function AppDataError() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold">Nie udało się wczytać konta</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sprawdź połączenie i spróbuj ponownie.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 rounded-2xl bg-primary px-5 py-3 font-medium text-primary-foreground"
        >
          Spróbuj ponownie
        </button>
      </div>
    </main>
  );
}
