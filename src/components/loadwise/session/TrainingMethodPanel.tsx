import { useState } from "react";
import { BookOpen, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { SessionDay } from "@/lib/loadwise/types";
import { useLoadwise } from "@/lib/loadwise/store";
import { TRAINING_METHODS, getTrainingMethod } from "@/lib/loadwise/methods/catalogue";
import { METHOD_RESEARCH_SOURCES } from "@/lib/loadwise/methods/research";
import {
  METHOD_SPECIAL_EQUIPMENT,
  trainingMethodEligibility,
} from "@/lib/loadwise/methods/eligibility";
import {
  createMethodSession,
  createStrengthMicrodose,
  methodMatchesSession,
  sessionMethodDomain,
} from "@/lib/loadwise/methods/planner";
import { getAllEquipmentDefinitions } from "@/lib/loadwise/exerciseLibrary";
import type { MethodSessionConditions, TrainingMethodId } from "@/lib/loadwise/methods/types";
import "./training-methods.css";
const EQUIPMENT = getAllEquipmentDefinitions();
const ROLE = {
  workout: "Metoda pracy",
  support: "Przygotowanie i wsparcie",
  planning: "Organizacja planu",
  coaching: "Nauka i informacja zwrotna",
};
const BEHAVIOR: Partial<Record<TrainingMethodId, string>> = {
  M01: "Zachowujemy przygotowanie ruchowe przed częścią główną.",
  M16: "Niska dawka skoków służy przygotowaniu; nie jest dodatkowym blokiem skoków maksymalnych.",
  M34: "Przed próbą wybierz informację do zauważenia. Po próbie nazwij sygnał i decyzję; powtórz ją w treningu piłkarskim.",
  M35: "Zegar i instrukcja pokazują jedną główną wskazówkę. Kolejny szczegół dodaj dopiero po utrwaleniu pierwszego.",
  M36: "Własne przygotowanie BallWise nie jest pełnym FIFA 11+. Pełny program realizuj według jego protokołu z trenerem.",
  M37: "Ćwiczenia uzupełniające dobieramy do sprzętu i doświadczenia; nie dublujemy tego samego ruchu pod różnymi nazwami.",
  M38: "Zapisuj faktyczne powtórzenia i zapas. Sugestia progresji wymaga porównywalnych zapisów; możesz utrzymać lub zmniejszyć ciężar.",
  M40: "W krótkiej sesji ograniczamy liczbę zadań i serii. Nie skracamy mechanicznie wszystkich przerw ani wymaganej rozgrzewki.",
  M41: "Kalendarz uwzględnia klub i mecz. Wybór metody nie dodaje trzeciej sesji i nie pomija ograniczeń dnia.",
  M42: "Domyślnie dawka wynika z etapu bloku. Wariant falujący może zmieniać układ siły w kolejnych sesjach, jeżeli doświadczenie na to pozwala.",
  M43: "W etapie odciążenia zmniejszamy dawkę, zachowując kontrolę wykonania. Blisko meczu zablokowane są wymagające metody dodatkowe.",
  M44: "Jeżeli masz dwie sesje, w miarę możliwości rozdziel siłę i intensywny bieg o co najmniej kilka godzin. Nie wymuszamy sztywnego podziału 80/20 w piłce nożnej.",
};
export function TrainingMethodPanel({
  session,
  wholeDay,
  slot = 1,
  locked = false,
}: {
  session: SessionDay;
  wholeDay: SessionDay;
  slot?: number;
  locked?: boolean;
}) {
  const { state, applyModification, saveStrengthExperience } = useLoadwise(),
    profile = state.profile;
  const [open, setOpen] = useState(false),
    [library, setLibrary] = useState(false),
    [conditions, setConditions] = useState<MethodSessionConditions>(
      session.trainingMethods?.conditions ?? {},
    );
  const [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null),
    [period, setPeriod] = useState(profile?.trainingMethodPreferences?.periodization ?? "auto");
  if (!profile || !sessionMethodDomain(session)) return null;
  const current = getTrainingMethod(session.trainingMethods?.primary),
    relevant = TRAINING_METHODS.filter((m) => methodMatchesSession(m.id, session));
  async function saveVariant(id: TrainingMethodId, short = false) {
    if (!profile || locked) return;
    setSaving(true);
    setError(null);
    try {
      const next = short
        ? createStrengthMicrodose(session, profile)
        : createMethodSession(session, profile, id, conditions);
      const day =
        slot === 2
          ? { ...wholeDay, secondSession: next }
          : { ...next, secondSession: wholeDay.secondSession };
      await applyModification(
        session.date,
        "swap",
        day,
        wholeDay,
        short ? "Krótsza sesja siłowa: 20 minut." : `Metoda: ${getTrainingMethod(id)?.name}.`,
      );
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie zapisano zmiany. Spróbuj ponownie.");
    } finally {
      setSaving(false);
    }
  }
  async function savePreferences() {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      await saveStrengthExperience({
        ...profile,
        trainingMethodPreferences: {
          ...profile.trainingMethodPreferences,
          periodization: period,
          ...(conditions.spaceLengthM ? { spaceLengthM: conditions.spaceLengthM } : {}),
          declaredEquipment:
            conditions.equipment?.filter((e) =>
              (METHOD_SPECIAL_EQUIPMENT as readonly string[]).includes(e),
            ) ?? profile.trainingMethodPreferences?.declaredEquipment,
        },
      });
      setOpen(false);
    } catch {
      setError("Nie zapisano ustawień. Sprawdź połączenie.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <button
        className="bw-method-trigger"
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        aria-haspopup="dialog"
      >
        <BookOpen size={17} />
        <span>
          Metoda treningu<small>{current?.name ?? "Zobacz możliwości i warunki"}</small>
        </span>
        <ChevronRight size={16} />
      </button>
      <Sheet open={open} onOpenChange={setOpen} initialDetent="large">
        <SheetContent className="bw-method-sheet">
          <SheetTitle>Metoda i warunki</SheetTitle>
          <SheetDescription>
            Wybór ma odpowiadać celowi tej sesji. Każdy wariant zachowuje zasady profilu i
            kalendarza.
          </SheetDescription>
          {current && <p>{session.trainingMethods?.reason}</p>}
          {locked && (
            <p role="status">
              Rozpoczęta lub zakończona sesja zachowuje swój układ. Możesz przeglądać instrukcje.
            </p>
          )}
          <fieldset disabled={saving || locked}>
            <details>
              <summary>Warunki tej sesji</summary>
              <label>
                Wolna długość wraz z wyhamowaniem (m)
                <input
                  type="number"
                  min="10"
                  max="500"
                  value={
                    conditions.spaceLengthM ?? profile.trainingMethodPreferences?.spaceLengthM ?? ""
                  }
                  onChange={(e) =>
                    setConditions((c) => ({
                      ...c,
                      spaceLengthM: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                />
              </label>
              <label>
                Liczba osób
                <input
                  type="number"
                  min="1"
                  max="22"
                  value={conditions.participants ?? 1}
                  onChange={(e) =>
                    setConditions((c) => ({ ...c, participants: Number(e.target.value) }))
                  }
                />
              </label>
              <label>
                Trener prowadzi tę sesję
                <input
                  type="checkbox"
                  checked={!!conditions.coachPresent}
                  onChange={(e) => setConditions((c) => ({ ...c, coachPresent: e.target.checked }))}
                />
              </label>
              <label>
                Sprawdzone urządzenie do prędkości
                <input
                  type="checkbox"
                  checked={!!conditions.validatedVelocityDevice}
                  onChange={(e) =>
                    setConditions((c) => ({
                      ...c,
                      validatedVelocityDevice: e.target.checked,
                      equipment: e.target.checked
                        ? [...new Set([...(c.equipment ?? []), "velocity_device"])]
                        : c.equipment?.filter((x) => x !== "velocity_device"),
                    }))
                  }
                />
              </label>
              {METHOD_SPECIAL_EQUIPMENT.filter(
                (e) => e !== "velocity_device" && e !== "chains",
              ).map((id) => (
                <label key={id}>
                  {EQUIPMENT.find((e) => e.id === id)?.displayName ?? id}
                  <input
                    type="checkbox"
                    checked={(
                      conditions.equipment ??
                      profile.trainingMethodPreferences?.declaredEquipment ??
                      []
                    ).includes(id)}
                    onChange={(e) =>
                      setConditions((c) => ({
                        ...c,
                        equipment: e.target.checked
                          ? [
                              ...new Set([
                                ...(c.equipment ??
                                  profile.trainingMethodPreferences?.declaredEquipment ??
                                  []),
                                id,
                              ]),
                            ]
                          : (
                              c.equipment ??
                              profile.trainingMethodPreferences?.declaredEquipment ??
                              []
                            ).filter((x) => x !== id),
                      }))
                    }
                  />
                </label>
              ))}
              <p>
                Dostęp do siłowni obejmuje typowy sprzęt. Brak konkretnego sprzętu możesz zgłosić
                przy ćwiczeniu. Specjalistycznych urządzeń nie zakładamy automatycznie.
              </p>
            </details>
          </fieldset>
          {relevant.map((m) => {
            const gate = trainingMethodEligibility(m.id, profile, session, conditions);
            return (
              <article className="bw-method-option" key={m.id}>
                <h3>
                  <i className="bw-method-status" data-available={gate.allowed} />
                  {m.name}
                </h3>
                <p>{m.purpose}</p>
                {!gate.allowed && <p>{gate.reasons.join(" ")}</p>}
                <button
                  type="button"
                  disabled={saving || locked || !gate.allowed}
                  onClick={() => void saveVariant(m.id)}
                >
                  Zastosuj w tej sesji
                </button>
                <details>
                  <summary>Jak i dlaczego</summary>
                  <p>{m.requirements}</p>
                  <p>{m.evidenceNote}</p>
                  <p>{m.stopRule}</p>
                </details>
              </article>
            );
          })}
          {!locked && sessionMethodDomain(session) === "strength" && (
            <button
              type="button"
              className="bw-method-save"
              disabled={saving}
              onClick={() => void saveVariant("M02", true)}
            >
              Mam 20 minut — uprość sesję
            </button>
          )}
          <details>
            <summary>Ustawienia kolejnych treningów</summary>
            <label>
              Organizacja siły
              <select
                value={period}
                disabled={saving}
                onChange={(e) => setPeriod(e.target.value as typeof period)}
              >
                <option value="auto">Automatycznie według etapu</option>
                <option value="linear">Stopniowo w bloku</option>
                <option value="undulating">Zmiennie między sesjami</option>
              </select>
            </label>
            <p>
              Zmienia przyszły plan po jego odświeżeniu. Nie zwiększa samodzielnie ciężaru i nie
              zmienia zapisanych treningów. Możesz zapamiętać też długość toru i specjalistyczny
              sprzęt.
            </p>
            <button
              type="button"
              className="bw-method-save"
              disabled={saving}
              onClick={() => void savePreferences()}
            >
              Zapisz ustawienia
            </button>
          </details>
          <button type="button" className="bw-method-trigger" onClick={() => setLibrary((v) => !v)}>
            {library ? "Zwiń bibliotekę" : "Biblioteka 44 metod i zasad"}
            <ChevronRight size={16} />
          </button>
          {library &&
            TRAINING_METHODS.map((m) => (
              <details key={m.id}>
                <summary>{m.name}</summary>
                <p>
                  {ROLE[m.role]} · {m.purpose}
                </p>
                <p>{BEHAVIOR[m.id] ?? m.requirements}</p>
                <p>{m.evidenceNote}</p>
                <div className="bw-method-source-list">
                  {m.sources.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                      {METHOD_RESEARCH_SOURCES.find((s) => s.url === url)?.title ??
                        "Publikacja źródłowa"}
                    </a>
                  ))}
                </div>
              </details>
            ))}
          {error && <p role="alert">{error}</p>}
        </SheetContent>
      </Sheet>
    </>
  );
}
