/** Ekrany po zalogowaniu: nie udało się pobrać danych konta oraz propozycja przeniesienia danych z tego urządzenia. */
export function LoadError({ onRetry, onSkip }: { onRetry: () => void; onSkip: () => void }) {
  return (
    <main className="bw-grad-soft mx-auto flex h-[100dvh] max-w-md flex-col items-center justify-center px-8 text-center text-ink" role="alert">
      <h1 className="text-2xl font-semibold tracking-tight">Nie udało się pobrać danych</h1>
      <p className="mt-2 text-sm text-muted">Sprawdź internet i spróbuj jeszcze raz. Nie zaczynamy od nowa, żeby nie nadpisać Twojego profilu.</p>
      <button onClick={onRetry} className="bw-grad mt-6 w-full rounded-2xl py-4 text-base font-medium shadow-sm">Spróbuj ponownie</button>
      <button onClick={onSkip} className="mt-3 w-full py-2 text-sm text-muted underline">Zacznij od nowa</button>
    </main>
  );
}

export function ImportOffer({ name, onImport, onSkip }: { name?: string; onImport: () => void; onSkip: () => void }) {
  return (
    <main className="bw-grad-soft mx-auto flex h-[100dvh] max-w-md flex-col items-center justify-center px-8 text-center text-ink">
      <h1 className="text-2xl font-semibold tracking-tight">Masz dane na tym telefonie</h1>
      <p className="mt-2 text-sm text-muted">{name ? `Profil „${name}” i historia z tego urządzenia.` : "Profil i historia z tego urządzenia."} Przenieść je na to konto? Nie przejdziesz pytań od nowa.</p>
      <button onClick={onImport} className="bw-grad mt-6 w-full rounded-2xl py-4 text-base font-medium shadow-sm">Przenieś na konto</button>
      <button onClick={onSkip} className="mt-3 w-full py-2 text-sm text-muted underline">Zacznij od nowa</button>
    </main>
  );
}

/** Pasek na górze, gdy przeglądarka nie zapisuje danych: bez tego postęp (onboarding, profil) znika po przeładowaniu i wygląda to jak „cofnięcie do początku”. */
export function StorageNotice() {
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[90] bg-ink px-4 py-2 text-center text-xs leading-snug text-white">
      Ta przeglądarka nie zapamiętuje danych (tryb prywatny lub blokada). Postęp zniknie po przeładowaniu. Otwórz aplikację w zwykłej karcie Safari.
    </div>
  );
}
