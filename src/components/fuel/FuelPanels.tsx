import { useState, type Dispatch, type SetStateAction } from "react";
import {
  Ban,
  CalendarPlus,
  ChevronRight,
  Clock3,
  Mic,
  Plus,
  RefreshCw,
  ShoppingBag,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { FOODS, FOOD_BY_ID, type FuelRecipe } from "@/lib/fuel/catalog";
import {
  clockFuelStart,
  type FuelContext,
  type FuelDeviceData,
  type FuelEntry,
  type FuelPreferences,
  type FuelTiming,
  SESSION_LABELS,
} from "@/lib/fuel/experience";
import { completeMeal, packList, FUEL_TIME_PRESETS } from "@/lib/fuel/practical";
import { reminderCalendar, type FuelReminderPreferences } from "@/lib/fuel/reminderPlan";

export type FuelPanelName =
  | "time"
  | "swap"
  | "exclude"
  | "preferences"
  | "own"
  | "pantry"
  | "pack"
  | "history"
  | "reminders"
  | null;
interface Props {
  panel: FuelPanelName;
  setPanel(panel: FuelPanelName): void;
  data: FuelDeviceData;
  setData: Dispatch<SetStateAction<FuelDeviceData>>;
  contexts: FuelContext[];
  context: FuelContext;
  timing: FuelTiming;
  preferences: FuelPreferences;
  hero: FuelRecipe | null;
  packRecipe: FuelRecipe | null;
  recipes: FuelRecipe[];
  text: string;
  setText: Dispatch<SetStateAction<string>>;
  parsed: { ids: string[]; unknown: string[] };
  native: boolean;
  reminders: FuelReminderPreferences;
  reminderBusy: boolean;
  listening: boolean;
  setTiming(timing: FuelTiming): void;
  setRelative(minutes: number): void;
  chooseContext(key: string): void;
  updatePreferences(patch: Partial<FuelPreferences>): void;
  excludeFood(id: string): void;
  openRecipe(recipe: FuelRecipe): void;
  quickSave(recipe: FuelRecipe, status: FuelEntry["status"]): void;
  openOwn(): void;
  toggleVoice(): void;
  recordEntry(entry: FuelEntry, replaceId?: string | null): void;
  editEntry(entry: FuelEntry): void;
  onStore(): void;
  onQuick(): void;
  onNext(): void;
  onPantry(): void;
  persistReminders(prefs: FuelReminderPreferences): void;
  toggleReminders(): void;
  onClose(): void;
}
const titles: Record<Exclude<FuelPanelName, null>, string> = {
  time: "Kiedy trenujesz?",
  swap: "Co zmieniamy?",
  exclude: "Tego nie chcę",
  preferences: "Twoje preferencje",
  own: "Dokończ mój posiłek",
  pantry: "Co masz pod ręką?",
  pack: "Zestaw do zabrania",
  history: "Twoje zapisane jedzenie",
  reminders: "Przypomnienia",
};
export function FuelPanels(p: Props) {
  const [clock, setClock] = useState("");
  const [minutes, setMinutes] = useState("");
  const [search, setSearch] = useState("");
  const addition = completeMeal(
    p.parsed.ids.map((foodId) => ({ foodId, grams: FOOD_BY_ID[foodId].unitGrams })),
    p.preferences,
    p.timing.phase,
  );
  const filteredFoods = FOODS.filter(
    (f) =>
      f.label.toLocaleLowerCase("pl").includes(search.toLocaleLowerCase("pl")) ||
      f.aliases.some((a) => a.includes(search.toLocaleLowerCase("pl"))),
  );
  function removeEntry(entry: FuelEntry) {
    p.setData((d) => ({ ...d, entries: d.entries.filter((e) => e.id !== entry.id) }));
    toast.success("Usunięto wpis.", {
      action: {
        label: "Cofnij",
        onClick: () =>
          p.setData((d) => ({
            ...d,
            entries: [entry, ...d.entries.filter((e) => e.id !== entry.id)],
          })),
      },
    });
  }
  return (
    <Sheet open={p.panel !== null} onOpenChange={(open) => !open && p.onClose()}>
      <SheetContent side="bottom" className="fuel-sheet fuel-v4-panel">
        <div className="fuel-v4-handle" aria-hidden="true" />
        <SheetTitle>{p.panel ? titles[p.panel] : "Fuel"}</SheetTitle>
        <SheetDescription className="sr-only">
          Zmień wybór w Fuel. Ustawienia zapisują się na tym urządzeniu.
        </SheetDescription>
        <div className="fuel-v4-panel-content">
          {p.panel === "time" && (
            <>
              <div className="fuel-v4-panel-presets">
                {FUEL_TIME_PRESETS.map((v) => (
                  <button className="fuel-chip-button" key={v} onClick={() => p.setRelative(v)}>
                    {v < 60 ? `${v} min` : `${v / 60} h`}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const now = Date.now();
                  const t = clockFuelStart(clock, now);
                  if (!t) {
                    toast.info("Wybierz przyszłą godzinę dzisiaj.");
                    return;
                  }
                  const min = Math.ceil((t - now) / 60_000);
                  if (min <= 720) p.setTiming({ phase: "before", startsAt: t, presetMin: min });
                  else toast.info("Wybierz godzinę w najbliższych 12 godzinach.");
                }}
              >
                <label className="fuel-label">
                  Godzina dzisiaj
                  <input
                    className="fuel-input"
                    type="time"
                    value={clock}
                    onChange={(e) => setClock(e.target.value)}
                    required
                  />
                </label>
                <button className="fuel-primary mt-3">Zapisz godzinę</button>
              </form>
              <form
                className="mt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  p.setRelative(Number(minutes));
                }}
              >
                <label className="fuel-label">
                  Za ile minut?
                  <input
                    className="fuel-input"
                    type="number"
                    min="1"
                    max="720"
                    inputMode="numeric"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    placeholder="Np. 45"
                    required
                  />
                </label>
                <button className="fuel-secondary mt-3">Ustaw czas</button>
              </form>
              <div className="fuel-v4-panel-presets mt-4">
                <button
                  className="fuel-chip-button"
                  onClick={() => p.setTiming({ ...p.timing, phase: "after", endedAt: Date.now() })}
                >
                  Już po treningu
                </button>
                <button
                  className="fuel-chip-button"
                  onClick={() => p.setTiming({ startsAt: null, phase: "ordinary" })}
                >
                  Zwykły posiłek
                </button>
                <button
                  className="fuel-chip-button"
                  onClick={() => p.setTiming({ startsAt: null, phase: "before" })}
                >
                  Jeszcze nie wiem
                </button>
              </div>
            </>
          )}
          {p.panel === "swap" && (
            <>
              <div className="fuel-v4-swap-options">
                <button
                  onClick={() => {
                    p.setText("");
                    p.setPanel("pantry");
                  }}
                >
                  <ShoppingBag size={20} />
                  Nie mam składnika
                  <ChevronRight size={17} />
                </button>
                <button onClick={() => p.setPanel("exclude")}>
                  <Ban size={20} />
                  Nie chcę produktu
                  <ChevronRight size={17} />
                </button>
                <button onClick={p.onQuick}>
                  <Clock3 size={20} />
                  Nie mam czasu
                  <ChevronRight size={17} />
                </button>
                <button onClick={p.onNext}>
                  <RefreshCw size={20} />
                  Inny zestaw
                  <ChevronRight size={17} />
                </button>
              </div>
              {p.hero && (
                <>
                  <p className="fuel-label mt-4">Pomiń składnik z tego zestawu</p>
                  <div className="fuel-v4-panel-presets">
                    {p.hero.lines.map((l) => (
                      <button
                        key={l.foodId}
                        className="fuel-chip-button"
                        onClick={() => {
                          p.excludeFood(l.foodId);
                          p.setPanel(null);
                        }}
                      >
                        {FOOD_BY_ID[l.foodId].label}
                        <X size={13} />
                      </button>
                    ))}
                  </div>
                  <button
                    className="fuel-secondary mt-4"
                    onClick={() => p.quickSave(p.hero!, "selected")}
                  >
                    Wybierz zestaw na później
                  </button>
                </>
              )}
            </>
          )}
          {p.panel === "exclude" && (
            <>
              <p className="fuel-note">Wybierz produkty, które pomijać w propozycjach.</p>
              <input
                className="fuel-input"
                aria-label="Szukaj produktu do pominięcia"
                placeholder="Szukaj produktu"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="fuel-v4-food-preferences">
                {filteredFoods.map((f) => (
                  <button
                    className="fuel-chip-button"
                    key={f.id}
                    aria-pressed={p.preferences.excludedFoodIds.includes(f.id)}
                    onClick={() =>
                      p.preferences.excludedFoodIds.includes(f.id)
                        ? p.updatePreferences({
                            excludedFoodIds: p.preferences.excludedFoodIds.filter(
                              (id) => id !== f.id,
                            ),
                          })
                        : p.excludeFood(f.id)
                    }
                  >
                    {f.label}
                    {p.preferences.excludedFoodIds.includes(f.id) && <X size={13} />}
                  </button>
                ))}
              </div>
              <button className="fuel-primary mt-4" onClick={() => p.setPanel(null)}>
                Gotowe
              </button>
            </>
          )}
          {p.panel === "preferences" && (
            <>
              <label className="fuel-label">
                Sesja
                <select
                  className="fuel-input"
                  value={p.context.fromPlan ? p.context.key : p.context.kind}
                  onChange={(e) => p.chooseContext(e.target.value)}
                >
                  {p.contexts.map((c, i) => (
                    <option key={c.key} value={c.key}>
                      {p.contexts.length > 1 ? `${i + 1}. ` : ""}
                      {c.title}
                      {c.completed ? " · wykonana" : ""}
                    </option>
                  ))}
                  {Object.entries(SESSION_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="fuel-label mt-4">
                Sposób jedzenia
                <select
                  className="fuel-input"
                  value={p.preferences.diet}
                  onChange={(e) =>
                    p.updatePreferences({ diet: e.target.value as FuelPreferences["diet"] })
                  }
                >
                  <option value="all">Wszystkie produkty</option>
                  <option value="vegetarian">Wegetariańskie</option>
                  <option value="vegan">Roślinne</option>
                </select>
              </label>
              <div className="fuel-v4-setting-list">
                {(
                  [
                    ["noCook", "Bez gotowania"],
                    ["quick", "Do 5 minut"],
                    ["portable", "Do zabrania"],
                    ["detailed", "Pokaż wartości odżywcze"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={p.preferences[key]}
                      onChange={(e) => p.updatePreferences({ [key]: e.target.checked })}
                    />
                  </label>
                ))}
              </div>
              <h3 className="mt-4">Tego nie chcę</h3>
              <p className="fuel-note">Zaznacz produkty, które pomijać. Nie pytamy o powód.</p>
              <input
                className="fuel-input"
                aria-label="Szukaj produktu do pominięcia"
                placeholder="Szukaj produktu"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="fuel-v4-food-preferences">
                {filteredFoods.map((f) => (
                  <button
                    className="fuel-chip-button"
                    key={f.id}
                    aria-pressed={p.preferences.excludedFoodIds.includes(f.id)}
                    onClick={() =>
                      p.preferences.excludedFoodIds.includes(f.id)
                        ? p.updatePreferences({
                            excludedFoodIds: p.preferences.excludedFoodIds.filter(
                              (id) => id !== f.id,
                            ),
                          })
                        : p.excludeFood(f.id)
                    }
                  >
                    {f.label}
                    {p.preferences.excludedFoodIds.includes(f.id) && <X size={13} />}
                  </button>
                ))}
              </div>
              <h3 className="mt-4">Ulubione</h3>
              {p.preferences.favorites.length ? (
                p.recipes
                  .filter((r) => p.preferences.favorites.includes(r.id))
                  .map((r) => (
                    <button
                      className="fuel-v4-list-item"
                      key={r.id}
                      onClick={() => p.openRecipe(r)}
                    >
                      {r.title}
                      <ChevronRight size={16} />
                    </button>
                  ))
              ) : (
                <p className="fuel-note">Zapisz zestaw serduszkiem na ekranie głównym.</p>
              )}
              <button className="fuel-primary mt-4" onClick={() => p.setPanel(null)}>
                Gotowe
              </button>
            </>
          )}
          {(p.panel === "own" || p.panel === "pantry") && (
            <>
              <div className="fuel-row">
                <label className="fuel-label" htmlFor="fuel-food-text">
                  Produkty, które masz
                </label>
                <button
                  className="fuel-icon-button"
                  aria-label={p.listening ? "Zatrzymaj dyktowanie" : "Powiedz produkty"}
                  onClick={p.toggleVoice}
                >
                  <Mic size={18} />
                </button>
              </div>
              <textarea
                id="fuel-food-text"
                className="fuel-input"
                value={p.text}
                onChange={(e) => p.setText(e.target.value)}
                placeholder="Np. ryż, jajka i pomidor"
              />
              <div className="fuel-v4-panel-presets">
                {p.parsed.ids.map((id) => (
                  <span className="fuel-v4-recognized" key={id}>
                    {FOOD_BY_ID[id].label}
                  </span>
                ))}
              </div>
              {p.parsed.unknown.length > 0 && (
                <p className="fuel-note">
                  Nie rozpoznałem: {p.parsed.unknown.join(", ")}. Wybierz produkt z listy.
                </p>
              )}
              <details className="mt-3">
                <summary className="fuel-text-button">Wybierz produkty z listy</summary>
                <div className="fuel-v4-food-preferences">
                  {FOODS.filter((f) => !p.preferences.excludedFoodIds.includes(f.id)).map((f) => (
                    <button
                      key={f.id}
                      className="fuel-chip-button"
                      onClick={() => p.setText((t) => `${t}${t ? ", " : ""}${f.label}`)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </details>
              {p.panel === "own" && p.parsed.ids.length > 0 && addition && (
                <div className="fuel-v4-addition">
                  <p>{addition.reason}</p>
                  <button
                    className="fuel-chip-button"
                    onClick={() => p.setText((t) => `${t}, ${FOOD_BY_ID[addition.foodId].label}`)}
                  >
                    <Plus size={15} />
                    {FOOD_BY_ID[addition.foodId].label}
                  </button>
                </div>
              )}
              <button
                className="fuel-primary mt-4"
                disabled={!p.parsed.ids.length}
                onClick={p.panel === "own" ? p.openOwn : p.onPantry}
              >
                {p.panel === "own" ? "Sprawdź porcje i zapisz" : "Pokaż zestaw z tych produktów"}
              </button>
              <p className="fuel-note mt-3">
                Głos zależy od urządzenia. Możesz użyć dyktowania klawiatury.
              </p>
            </>
          )}
          {p.panel === "pack" && (
            <>
              {p.packRecipe ? (
                <>
                  <h3>{p.packRecipe.title}</h3>
                  <ul className="fuel-v4-pack-list">
                    {packList(p.packRecipe).map((line) => (
                      <li key={line.label}>
                        <label>
                          <input type="checkbox" />
                          <span>
                            {line.label}
                            <small>{line.portion}</small>
                          </span>
                        </label>
                      </li>
                    ))}
                    <li>
                      <label>
                        <input type="checkbox" />
                        <span>
                          Napój<small>Przygotuj wodę do zabrania</small>
                        </span>
                      </label>
                    </li>
                  </ul>
                  <p className="fuel-note">{p.packRecipe.storage}</p>
                  <button
                    className="fuel-primary mt-4"
                    onClick={() => p.quickSave(p.packRecipe!, "selected")}
                  >
                    Zapisz zestaw na później
                  </button>
                  <button className="fuel-secondary mt-3" onClick={p.onStore}>
                    Sprawdź produkt w sklepie
                  </button>
                </>
              ) : (
                <p>Wybierz zestaw na ekranie głównym.</p>
              )}
            </>
          )}
          {p.panel === "history" && (
            <>
              {p.data.entries.length ? (
                p.data.entries.map((entry) => (
                  <div className="fuel-v4-history-entry" key={entry.id}>
                    <div className="fuel-row">
                      <strong>{entry.title}</strong>
                      <button
                        className="fuel-v4-heart"
                        aria-label={`Usuń wpis ${entry.title}`}
                        onClick={() => removeEntry(entry)}
                      >
                        <X size={17} />
                      </button>
                    </div>
                    <p className="fuel-note">
                      {entry.status === "eaten" ? "Zjedzone" : "Na później"} ·{" "}
                      {new Date(entry.eatenAt ?? entry.createdAt).toLocaleString("pl-PL", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <div className="fuel-v4-panel-presets">
                      {entry.status === "selected" && (
                        <button
                          className="fuel-chip-button"
                          onClick={() =>
                            p.recordEntry(
                              { ...entry, status: "eaten", eatenAt: Date.now() },
                              entry.id,
                            )
                          }
                        >
                          Zjadłem
                        </button>
                      )}
                      {!entry.product && (
                        <button className="fuel-chip-button" onClick={() => p.editEntry(entry)}>
                          Popraw porcję
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="fuel-note">Tutaj pojawią się Twoje zapisane zestawy.</p>
              )}
              <button
                className="fuel-secondary mt-4"
                onClick={() =>
                  downloadFuelFile(
                    "BallWise-Fuel-historia.json",
                    JSON.stringify(
                      { exportedAt: new Date().toISOString(), entries: p.data.entries },
                      null,
                      2,
                    ),
                    "application/json",
                  )
                }
              >
                Eksportuj historię
              </button>
              <button
                className="fuel-text-button mt-4"
                onClick={() => {
                  const previous = p.data.entries;
                  p.setData((d) => ({ ...d, entries: [] }));
                  toast.success("Wyczyszczono historię.", {
                    action: {
                      label: "Cofnij",
                      onClick: () =>
                        p.setData((d) => ({ ...d, entries: [...previous, ...d.entries] })),
                    },
                  });
                }}
              >
                Wyczyść historię
              </button>
            </>
          )}
          {p.panel === "reminders" && (
            <>
              {p.native ? (
                <>
                  <div className="fuel-v4-setting-list">
                    <label>
                      <span>Przypomnienia na telefonie</span>
                      <input
                        type="checkbox"
                        checked={p.reminders.enabled}
                        disabled={p.reminderBusy}
                        onChange={p.toggleReminders}
                      />
                    </label>
                    {(
                      [
                        ["prepare", "Przygotuj jedzenie"],
                        ["pack", "Zabierz jedzenie i napój"],
                        ["after", "Po zakończeniu treningu"],
                        ["matchTomorrow", "Przygotowanie przed jutrzejszym meczem"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key}>
                        <span>{label}</span>
                        <input
                          type="checkbox"
                          checked={p.reminders[key]}
                          onChange={(e) =>
                            p.persistReminders({ ...p.reminders, [key]: e.target.checked })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <div className="fuel-v4-quiet">
                    <label className="fuel-label">
                      Cisza od
                      <input
                        type="time"
                        className="fuel-input"
                        value={p.reminders.quietStart}
                        onChange={(e) =>
                          p.persistReminders({
                            ...p.reminders,
                            quietStart: e.target.value || "22:00",
                          })
                        }
                      />
                    </label>
                    <label className="fuel-label">
                      Cisza do
                      <input
                        type="time"
                        className="fuel-input"
                        value={p.reminders.quietEnd}
                        onChange={(e) =>
                          p.persistReminders({
                            ...p.reminders,
                            quietEnd: e.target.value || "07:00",
                          })
                        }
                      />
                    </label>
                  </div>
                  <p className="fuel-note mt-3">
                    Przed sesją potrzebny jest ustawiony czas. Przypomnienie po sesji wymaga
                    potwierdzonego zakończenia. Brak wpisu nie oznacza, że nie jadłeś.
                  </p>
                </>
              ) : (
                <>
                  <p className="fuel-note">
                    Powiadomienia przy zablokowanym telefonie działają w zaktualizowanej aplikacji
                    iOS. W przeglądarce możesz dodać przypomnienie do kalendarza.
                  </p>
                  <button
                    className="fuel-primary mt-4"
                    disabled={p.timing.startsAt === null}
                    onClick={() => {
                      if (
                        p.timing.startsAt === null ||
                        p.timing.startsAt - 15 * 60_000 <= Date.now()
                      ) {
                        toast.info("Ustaw trening za co najmniej 20 minut.");
                        return;
                      }
                      downloadFuelFile(
                        "BallWise-Fuel.ics",
                        reminderCalendar(p.timing.startsAt),
                        "text/calendar;charset=utf-8",
                      );
                    }}
                  >
                    <CalendarPlus size={18} />
                    Dodaj do kalendarza
                  </button>
                </>
              )}
              <button className="fuel-secondary mt-4" onClick={() => p.setPanel(null)}>
                Gotowe
              </button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
function downloadFuelFile(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
