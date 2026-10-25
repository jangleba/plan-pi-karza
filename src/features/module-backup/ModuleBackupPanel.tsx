import { useCallback, useEffect, useRef, useState } from "react";
import { deliverExportFile } from "@/lib/loadwise/deliverExportFile";
import { useLoadwise } from "@/lib/loadwise/store";
import { Link } from "@tanstack/react-router";
import {
  listModuleBackups,
  moduleBackupDeviceId,
  saveModuleBackup,
  fetchModuleBackup,
  summarizeBackup,
  type ModuleBackupRow,
  type ModuleBackupSummary,
} from "./client";
import {
  MODULES,
  MODULE_LABELS,
  applyModuleRestore,
  createModuleSnapshot,
  moduleKeys,
  previewModuleRestore,
  rememberModuleSnapshot,
  validateModuleSnapshot,
  type BackupModule,
  type RestorePreview,
} from "./model";

export function ModuleBackupPanel({ userId }: { userId: string }) {
  const { state } = useLoadwise();
  const healthConsent = state.profile?.healthPersonalizationEnabled === true;
  const [module, setModule] = useState<BackupModule>("iq");
  const [rows, setRows] = useState<ModuleBackupSummary[]>([]);
  const [loadedOwner, setLoadedOwner] = useState("");
  const [loading, setLoading] = useState(false);
  const [consent, setConsent] = useState(false);
  const [includeText, setIncludeText] = useState(false);
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<{ plan: RestorePreview; row: ModuleBackupRow } | null>(
    null,
  );
  const active = useRef({ owner: userId, module, health: healthConsent });
  const localChanges = useRef(0);
  active.current = { owner: userId, module, health: healthConsent };
  useEffect(() => {
    if (!healthConsent) setIncludeText(false);
  }, [healthConsent]);
  const reload = useCallback(async () => {
    const owner = userId,
      selected = module;
    setLoading(true);
    try {
      const result = await listModuleBackups(owner, selected);
      if (active.current.owner !== owner || active.current.module !== selected) return;
      setRows(result);
      setLoadedOwner(owner);
    } catch (error) {
      if (active.current.owner === owner && active.current.module === selected)
        setNotice(message(error));
    } finally {
      if (active.current.owner === owner && active.current.module === selected) setLoading(false);
    }
  }, [userId, module]);
  useEffect(() => {
    setRows([]);
    setLoadedOwner("");
    setPreview(null);
    setConsent(false);
    setIncludeText(false);
    setNotice("");
    setDirty(false);
    void reload();
  }, [reload]);
  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; module?: string }>).detail;
      if (detail?.userId === userId && detail.module === module) {
        localChanges.current++;
        setDirty(true);
        setPreview(null);
      }
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key && Object.values(moduleKeys(module, userId)).includes(event.key)) {
        localChanges.current++;
        setDirty(true);
        setPreview(null);
      }
    };
    window.addEventListener("ballwise:module-data-changed", changed);
    window.addEventListener("storage", storageChanged);
    return () => {
      window.removeEventListener("ballwise:module-data-changed", changed);
      window.removeEventListener("storage", storageChanged);
    };
  }, [module, userId]);
  const save = async () => {
    if (!consent || loading) return;
    const owner = userId,
      selected = module;
    const version = localChanges.current;
    setLoading(true);
    setPreview(null);
    try {
      const snapshot = createModuleSnapshot(
        selected,
        owner,
        localStorage,
        includeText && healthConsent,
      );
      const device = moduleBackupDeviceId(owner);
      const previous = rows.find((row) => row.device_id === device && row.module === selected);
      const canonical = await saveModuleBackup(owner, device, previous?.revision ?? 0, snapshot);
      if (active.current.owner !== owner || active.current.module !== selected) return;
      setRows((current) => [
        ...current.filter((row) => row.device_id !== device),
        summarizeBackup(canonical),
      ]);
      setLoadedOwner(owner);
      setDirty(localChanges.current !== version);
      setNotice(
        `Kopia zapisana na Twoim koncie.${snapshot.omitted ? ` Pominięto ${snapshot.omitted} wpisów lub własnych zestawów bez zgody na własne teksty.` : ""}`,
      );
      try {
        rememberModuleSnapshot(owner, snapshot);
      } catch {
        setNotice(
          "Kopia zapisana w chmurze. Nie udało się zapamiętać lokalnego stanu kopii; sprawdź wolne miejsce.",
        );
      }
    } catch (error) {
      if (active.current.owner !== owner || active.current.module !== selected) return;
      setNotice(
        (error as { code?: string })?.code === "40001"
          ? "Kopia została zmieniona w innym oknie. Twoje dane lokalne zachowano. Odśwież listę i ponownie zdecyduj o zapisie."
          : message(error),
      );
    } finally {
      if (active.current.owner === owner && active.current.module === selected) setLoading(false);
    }
  };
  const exportRow = async (summary: ModuleBackupSummary) => {
    const owner = userId,
      selected = module;
    if (
      summary.user_id !== owner ||
      summary.module !== selected ||
      active.current.owner !== owner ||
      active.current.module !== selected
    )
      return;
    try {
      const row = await fetchModuleBackup(owner, selected, summary.device_id);
      if (active.current.owner !== owner || active.current.module !== selected) return;
      if (
        row.payload &&
        typeof row.payload === "object" &&
        !Array.isArray(row.payload) &&
        row.payload.includesUserText === true &&
        !active.current.health
      )
        throw new Error("Pobranie notatek wymaga aktywnej zgody na dane zdrowotne.");
      const result = await deliverExportFile(
        `BallWise-${row.module}-kopia.json`,
        JSON.stringify(row.payload, null, 2),
        "application/json",
        owner,
      );
      if (active.current.owner !== owner || active.current.module !== selected) return;
      setNotice(
        result === "cancelled"
          ? "Udostępnianie anulowane. Kopia w chmurze pozostaje dostępna."
          : "Kopię przekazano do zapisania lub udostępnienia. Sprawdź wybrane miejsce zapisu.",
      );
    } catch (error) {
      if (active.current.owner === owner && active.current.module === selected)
        setNotice(message(error));
    }
  };
  return (
    <section className="space-y-3 rounded-2xl border p-4" aria-label="Kopie modułów">
      <h3 className="font-semibold">Kopie Fuel, IQ, Lab i Reakcji</h3>
      <p className="text-sm text-muted-foreground">
        Zapisujesz wybrany moduł na swoim koncie dopiero po naciśnięciu przycisku. Każde urządzenie
        ma osobną kopię. To kopie wykonywane ręcznie; nie synchronizują zmian w tle. Filmów i tras
        GPS nie przesyłamy.
      </p>
      <label className="block text-sm">
        Moduł{" "}
        <select
          className="ml-2 rounded border p-2"
          value={module}
          onChange={(event) => setModule(event.target.value as BackupModule)}
        >
          {MODULES.map((item) => (
            <option key={item} value={item}>
              {MODULE_LABELS[item]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />
        Chcę zapisać wyniki, posiłki i ustawienia tego modułu na moim koncie.
      </label>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeText && healthConsent}
          disabled={!healthConsent}
          onChange={(event) => setIncludeText(event.target.checked)}
        />
        Dołącz moje notatki, nazwy produktów i własne zestawy. Zgadzam się przesłać także wpisane
        tam informacje o zdrowiu.
      </label>
      {!healthConsent && (
        <p className="text-xs text-muted-foreground">
          Dołączenie własnych tekstów wymaga aktywnej zgody na dane zdrowotne.{" "}
          <Link to="/data-rights" className="underline">
            Zarządzaj zgodami
          </Link>
        </p>
      )}
      {!includeText && (
        <p className="text-xs text-muted-foreground">
          Bez tej zgody pomijamy notatki i nazwy nagrań Labu, ręcznie opisane produkty Fuel oraz
          własne zestawy Reakcji.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border px-3 py-2"
          disabled={!consent || loading}
          onClick={() => void save()}
        >
          Zapisz kopię tego urządzenia
        </button>
        <button
          type="button"
          className="rounded border px-3 py-2"
          disabled={loading}
          onClick={() => void reload()}
        >
          Odśwież kopie
        </button>
      </div>
      <label className="block text-sm">
        Przygotuj przywracanie z pliku kopii modułu
        <input
          type="file"
          accept="application/json,.json"
          disabled={loading}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            const owner = userId,
              selected = module;
            void (async () => {
              try {
                if (file.size > 1_000_000) throw new Error("Kopia przekracza 1 MB.");
                const raw: unknown = JSON.parse(await file.text());
                if (active.current.owner !== owner || active.current.module !== selected) return;
                const snapshot = validateModuleSnapshot(raw, selected, owner);
                if (snapshot.includesUserText && !active.current.health)
                  throw new Error("Przywrócenie notatek wymaga aktywnej zgody na dane zdrowotne.");
                const row: ModuleBackupRow = {
                  user_id: owner,
                  module: selected,
                  device_id: "plik",
                  revision: 0,
                  operation_id: "plik",
                  updated_at: snapshot.createdAt,
                  payload: snapshot as unknown as ModuleBackupRow["payload"],
                };
                setPreview({ plan: previewModuleRestore(snapshot, owner), row });
                setNotice("Plik sprawdzony. Przejrzyj wynik łączenia przed zapisem.");
              } catch (error) {
                if (active.current.owner === owner && active.current.module === selected)
                  setNotice(message(error));
              }
            })();
          }}
        />
      </label>
      {dirty && (
        <p className="text-sm">
          Dane lokalne zmieniły się. Nową kopię zapiszesz przyciskiem powyżej.
        </p>
      )}
      {loading && <p role="status">Odczytuję lub zapisuję kopię…</p>}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {loadedOwner === userId && !loading && !rows.length && (
        <p className="text-sm">Brak zapisanej kopii tego modułu.</p>
      )}
      {loadedOwner === userId &&
        rows
          .filter((row) => row.module === module)
          .map((row) => (
            <div key={row.device_id} className="rounded border p-3 text-sm">
              <p>
                Urządzenie {row.device_id.slice(0, 8)} ·{" "}
                {new Date(row.updated_at).toLocaleString("pl-PL")} · wersja {row.revision}
              </p>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => void exportRow(row)}>
                  Pobierz kopię
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    const owner = userId,
                      selected = module;
                    setLoading(true);
                    void (async () => {
                      try {
                        const full = await fetchModuleBackup(owner, selected, row.device_id);
                        if (active.current.owner !== owner || active.current.module !== selected)
                          return;
                        const snapshot = validateModuleSnapshot(full.payload, selected, owner);
                        if (snapshot.includesUserText && !active.current.health)
                          throw new Error(
                            "Przywrócenie notatek wymaga aktywnej zgody na dane zdrowotne.",
                          );
                        setPreview({ plan: previewModuleRestore(snapshot, owner), row: full });
                        setNotice("");
                      } catch (error) {
                        if (active.current.owner === owner && active.current.module === selected)
                          setNotice(message(error));
                      } finally {
                        if (active.current.owner === owner && active.current.module === selected)
                          setLoading(false);
                      }
                    })();
                  }}
                >
                  Przygotuj przywracanie
                </button>
              </div>
            </div>
          ))}
      {preview && preview.row.user_id === userId && preview.row.module === module && (
        <div className="space-y-2 rounded border p-3 text-sm">
          <p>
            Nowe wpisy: {preview.plan.added}. Konflikty: {preview.plan.conflicts.length}. Pominięte
            usunięte wpisy: {preview.plan.skippedDeleted}.
          </p>
          <p>
            Połączymy historię, zachowując lokalne wersje konfliktów. Drugie wersje pozostaną w
            kopii chmurowej; możesz je pobrać przed przywróceniem. Przywracanie nie usuwa lokalnych
            wyników. Kopia sprzed usunięcia może ponownie dodać starsze próby, jeśli urządzenie nie
            zna ich usunięcia.
          </p>
          <button
            type="button"
            className="rounded border px-3 py-2"
            disabled={loading}
            onClick={() => {
              try {
                if (
                  active.current.owner !== preview.row.user_id ||
                  active.current.module !== preview.row.module
                )
                  throw new Error("Konto lub moduł zmieniły się. Przygotuj przywracanie ponownie.");
                if (
                  preview.row.payload &&
                  typeof preview.row.payload === "object" &&
                  !Array.isArray(preview.row.payload) &&
                  preview.row.payload.includesUserText === true &&
                  !healthConsent
                )
                  throw new Error("Przywrócenie notatek wymaga aktywnej zgody na dane zdrowotne.");
                applyModuleRestore(preview.plan, userId);
                setPreview(null);
                setDirty(true);
                setNotice(
                  "Kopia połączona z zapisem lokalnym. Konfliktujące wersje lokalne zachowano.",
                );
              } catch (error) {
                setNotice(message(error));
              }
            }}
          >
            Połącz, zachowując lokalne wersje
          </button>
          <button type="button" className="ml-3" onClick={() => setPreview(null)}>
            Anuluj
          </button>
        </div>
      )}
    </section>
  );
}
function message(error: unknown) {
  const text = (error as { message?: string })?.message;
  return text
    ? `Nie udało się wykonać operacji: ${text}`
    : "Nie udało się wykonać operacji. Dane lokalne zachowano. Sprawdź połączenie i wdrożenie migracji kopii.";
}
