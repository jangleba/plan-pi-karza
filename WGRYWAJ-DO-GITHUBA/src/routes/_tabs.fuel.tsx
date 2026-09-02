import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { AppHeader } from "@/components/loadwise/ui";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronLeft,
  CalendarClock,
  Utensils,
  Droplets,
  Zap,
  Feather,
  Timer,
  X,
  Sparkles,
} from "lucide-react";
import { evaluateMeal, TIME_BUCKET_MINUTES } from "@/lib/fuel/engine";
import {
  athleteFromProfile,
  findNextSession,
  sessionFromPlan,
} from "@/lib/fuel/planAdapter";
import { parseMeal } from "@/lib/fuel/mealParser";
import type { Portion, TimeBucket } from "@/lib/fuel/types";
import {
  availableFixes,
  BUILD_GROUPS,
  BUILD_OPTIONS,
  fuelSignal,
  indicators,
  plateShares,
  QUICK_PICKS,
  resultTone,
  smallerPortion,
  TONE_LABEL,
  withExtras,
  withoutHeavy,
  type Demand,
  type FixId,
  type Indicator,
  type ResultTone,
} from "@/lib/fuel/uiModel";

export const Route = createFileRoute("/_tabs/fuel")({
  component: FuelWiseScreen,
  head: () => ({
    meta: [
      { title: "FuelWise – posiłek dopasowany do treningu | Loadwise" },
      {
        name: "description",
        content:
          "Zbuduj lub opisz posiłek, a FuelWise pokaże sygnał paliwa, talerz i jedną korektę przed najbliższą jednostką.",
      },
      { property: "og:title", content: "FuelWise – posiłek dopasowany do treningu" },
      {
        property: "og:description",
        content:
          "Interaktywne dopasowanie posiłku do najbliższej jednostki treningowej w Loadwise.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PORTIONS: { id: Portion; label: string }[] = [
  { id: "mala", label: "Mała" },
  { id: "normalna", label: "Normalna" },
  { id: "duza", label: "Duża" },
];

const WINDOWS: { id: TimeBucket; label: string }[] = [
  { id: "30_60", label: "do 60 min" },
  { id: "60_120", label: "1–2 h" },
  { id: "120_240", label: "2–4 h" },
  { id: "gt240", label: "później" },
];

const QUICK_GROUPS = ["najszybciej", "normalny", "bez gotowania"] as const;

const DEMAND_TONE: Record<Demand, string> = {
  lekkie: "bg-muted text-foreground",
  umiarkowane: "bg-primary/15 text-primary",
  wysokie: "bg-primary text-primary-foreground",
};

const TONE_BADGE: Record<ResultTone, string> = {
  fit: "bg-primary text-primary-foreground",
  tweak: "bg-primary/15 text-primary",
  heavy: "bg-muted text-foreground",
  empty: "bg-accent text-accent-foreground",
};

function FuelWiseScreen() {
  const { state, todayIso } = useLoadwise();

  const session = useMemo(
    () => sessionFromPlan(findNextSession(state.plan, todayIso), todayIso),
    [state.plan, todayIso],
  );
  const athlete = useMemo(() => athleteFromProfile(state.profile), [state.profile]);

  const [mode, setMode] = useState<"describe" | "build">("build");
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [portion, setPortion] = useState<Portion>("normalna");
  const [bucket, setBucket] = useState<TimeBucket | null>(null);
  const [extras, setExtras] = useState<string[]>([]);
  const [dropHeavy, setDropHeavy] = useState(false);
  const [open, setOpen] = useState(false);
  const [openWhy, setOpenWhy] = useState<Indicator["key"] | null>(null);
  const [pulse, setPulse] = useState(0);

  const countdown = useCountdown(session.minutesToStart);
  const minutes = countdown ?? (bucket ? TIME_BUCKET_MINUTES[bucket] : null);

  const chips = useMemo(
    () =>
      mode === "build"
        ? picked.map((id) => BUILD_OPTIONS[id]?.label ?? id)
        : [],
    [mode, picked],
  );

  const baseText =
    mode === "build"
      ? picked.map((id) => BUILD_OPTIONS[id]?.text ?? "").join(", ")
      : text;

  const meal = useMemo(() => {
    let m = parseMeal(baseText);
    if (dropHeavy) m = withoutHeavy(m);
    return withExtras(m, extras);
  }, [baseText, dropHeavy, extras]);

  const hasMeal = meal.items.length > 0 || baseText.trim().length > 2;
  const signal = useMemo(() => fuelSignal(session, minutes), [session, minutes]);
  const marks = useMemo(
    () => indicators(meal, portion, session, minutes, signal.demand),
    [meal, portion, session, minutes, signal.demand],
  );
  const plate = useMemo(() => plateShares(minutes, signal.demand), [minutes, signal.demand]);

  const result = useMemo(() => {
    if (!hasMeal || minutes == null || session.kind === "none") return null;
    return evaluateMeal({
      session,
      athlete,
      meal,
      portion,
      timeBucket: bucket,
      onlyThis: false,
    });
  }, [hasMeal, minutes, session, athlete, meal, portion, bucket]);

  useEffect(() => {
    if (result) setPulse((p) => p + 1);
  }, [result]);

  const tone = result ? resultTone(result.verdict, result.ruleId) : null;
  const fixes = availableFixes(meal, portion);

  function applyFix(id: FixId) {
    if (id === "add_banana") setExtras((e) => (e.includes("banan") ? e : [...e, "banan"]));
    if (id === "add_water") setExtras((e) => (e.includes("woda") ? e : [...e, "woda"]));
    if (id === "smaller_portion") setPortion((p) => smallerPortion(p));
    if (id === "drop_heavy") setDropHeavy(true);
  }

  function loadQuick(t: string, p: Portion) {
    setMode("describe");
    setText(t);
    setPortion(p);
    setExtras([]);
    setDropHeavy(false);
    setOpen(true);
  }

  return (
    <div className="pb-[calc(env(safe-area-inset-bottom)+7.5rem)]">
      <AppHeader
        title="FuelWise"
        subtitle="Dopasuj posiłek do najbliższej jednostki"
        right={
          <Link
            to="/start"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-muted-foreground transition-transform active:scale-95"
            aria-label="Wróć"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        }
      />

      <div className="space-y-3 px-5">
        {session.kind === "none" ? (
          <div className="soft-card p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" /> Najbliższa jednostka
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Nie znaleźliśmy zaplanowanej jednostki. Dodaj trening do planu, aby otrzymać
              dopasowaną rekomendację.
            </p>
            <Link
              to="/plan"
              className="mt-3 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Przejdź do planu
            </Link>
          </div>
        ) : (
          <>
            {/* OŚ CZASU */}
            <div className="soft-card p-4">
              <Timeline minutes={minutes} />
              {countdown != null ? (
                <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-primary">
                  <Timer className="h-4 w-4" />
                  Do startu: {formatCountdown(countdown)}
                </div>
              ) : (
                <div className="mt-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Ile zostało do treningu?
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {WINDOWS.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => setBucket(w.id)}
                        className={`rounded-full border px-3 py-2 text-sm font-medium transition-all duration-200 active:scale-95 ${
                          bucket === w.id
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-muted-foreground"
                        }`}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* SYGNAŁ PALIWA */}
            <div className="soft-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">Sygnał paliwa</div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors duration-300 ${DEMAND_TONE[signal.demand]}`}
                >
                  {signal.label}
                </span>
              </div>
              <div className="mt-1.5 text-sm text-muted-foreground">
                {[session.title, signal.sessionLine].filter(Boolean).join(" · ")}
              </div>
              <p className="mt-2 text-sm">{signal.advice}</p>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {marks.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setOpenWhy(openWhy === m.key ? null : m.key)}
                    className={`rounded-2xl border p-2.5 text-left transition-all duration-200 active:scale-95 ${
                      m.state === "ok"
                        ? "border-primary/30 bg-primary/10"
                        : m.state === "high"
                          ? "border-border bg-muted/60"
                          : "border-accent/40 bg-accent/20"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      {m.key === "energia" ? (
                        <Zap className="h-3.5 w-3.5" />
                      ) : m.key === "trawienie" ? (
                        <Feather className="h-3.5 w-3.5" />
                      ) : (
                        <Droplets className="h-3.5 w-3.5" />
                      )}
                      {m.label}
                    </div>
                    <div className="mt-1 text-[13px] font-semibold leading-tight">{m.value}</div>
                  </button>
                ))}
              </div>
              {openWhy && (
                <p className="mt-2 animate-fade-in rounded-2xl bg-muted/60 p-3 text-sm">
                  <span className="font-semibold">Dlaczego? </span>
                  {marks.find((m) => m.key === openWhy)?.why}
                </p>
              )}
            </div>

            {/* TALERZ PALIWA */}
            <div className="soft-card p-4">
              <div className="text-sm font-semibold">Talerz paliwa</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Proporcje zmieniają się z czasem do startu i obciążeniem jednostki.
              </p>
              <Plate plate={plate} />
            </div>

            {/* TRYBY */}
            <div className="soft-card p-4">
              <div className="flex rounded-full bg-muted p-1">
                {(["describe", "build"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`flex-1 rounded-full px-3 py-2 text-sm font-medium transition-all duration-200 ${
                      mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                    }`}
                  >
                    {m === "describe" ? "Opisz posiłek" : "Zbuduj posiłek"}
                  </button>
                ))}
              </div>

              {mode === "describe" ? (
                <Textarea
                  className="mt-3 min-h-24 rounded-2xl"
                  placeholder="Np. dwa tosty z serem i szynką, banan i woda"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setExtras([]);
                    setDropHeavy(false);
                  }}
                />
              ) : (
                <div className="mt-3 space-y-3">
                  {BUILD_GROUPS.map((g) => (
                    <div key={g.id}>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {g.label}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {g.options.map((o) => {
                          const on = picked.includes(o.id);
                          return (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => {
                                setExtras([]);
                                setDropHeavy(false);
                                setPicked((p) =>
                                  on ? p.filter((x) => x !== o.id) : [...p, o.id],
                                );
                              }}
                              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-all duration-200 active:scale-95 ${
                                on
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-card text-muted-foreground"
                              }`}
                            >
                              {o.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(chips.length > 0 || extras.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {chips.concat(extras).map((c, i) => (
                    <span
                      key={`${c}-${i}`}
                      className="animate-scale-in rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-3 flex gap-2">
                {PORTIONS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPortion(p.id)}
                    className={`flex-1 rounded-full border px-3 py-2 text-sm font-medium transition-all duration-200 active:scale-95 ${
                      portion === p.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={!hasMeal || minutes == null}
                onClick={() => setOpen(true)}
                className="mt-3 w-full rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-transform duration-200 active:scale-95 disabled:opacity-50"
              >
                {minutes == null ? "Wybierz czas do treningu" : "Sprawdź posiłek"}
              </button>
            </div>

            {/* SZYBKI WYBÓR */}
            <div className="soft-card p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" /> Szybki wybór
              </div>
              {QUICK_GROUPS.map((g) => (
                <div key={g} className="mt-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {g}
                  </div>
                  <div className="-mx-1 mt-1.5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
                    {QUICK_PICKS.filter((q) => q.group === g).map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => loadQuick(q.text, q.portion)}
                        className="w-40 shrink-0 snap-start rounded-2xl border border-border bg-card p-3 text-left transition-transform duration-200 active:scale-95"
                      >
                        <div className="text-sm font-semibold leading-tight">{q.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{q.text}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="px-1 text-xs leading-relaxed text-muted-foreground">
              Ocena wynika z Twojego planu i jawnych reguł FuelWise. Opis posiłku nie jest
              nigdzie zapisywany.
            </p>
          </>
        )}
      </div>

      {/* WYNIK — wysuwana karta */}
      {result && tone && (
        <>
          <div
            className={`fixed inset-0 z-40 bg-foreground/20 transition-opacity duration-200 ${
              open ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            onClick={() => setOpen(false)}
          />
          <div
            className={`fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] shadow-2xl transition-transform duration-300 ease-out ${
              open ? "translate-y-0" : "translate-y-full"
            }`}
            role="dialog"
            aria-label="Wynik dopasowania posiłku"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
            <div className="flex items-start justify-between gap-3">
              <span
                key={pulse}
                className={`animate-scale-in rounded-full px-3 py-1 text-sm font-semibold transition-colors duration-300 ${TONE_BADGE[tone]}`}
              >
                {TONE_LABEL[tone]}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Zamknij"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground active:scale-95"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-sm">{result.why}</p>

            {result.keep.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Co działa
                </div>
                <p className="mt-1 text-sm">{result.keep.join(", ")}</p>
              </div>
            )}

            {result.change && (
              <div className="mt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Czego brakuje
                </div>
                <p className="mt-1 text-sm">{result.change}</p>
              </div>
            )}

            <div className="mt-3 rounded-2xl bg-muted/60 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Najprostsza poprawka
              </div>
              <p className="mt-1 text-sm">{result.bestVersion}</p>
            </div>

            {fixes.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {fixes.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => applyFix(f.id)}
                    className="rounded-full border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition-transform duration-200 active:scale-95"
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center gap-2">
              <Utensils className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Okno: {result.minutesToStart} min · potrzeba ok. {result.requiredLeadMinutes} min
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Oś czasu ---------- */

function Timeline({ minutes }: { minutes: number | null }) {
  const steps = ["Teraz", "Posiłek", "Trening", "Regeneracja"];
  const active = minutes == null ? 1 : minutes < 60 ? 1 : minutes < 240 ? 1 : 0;
  return (
    <div className="flex items-center">
      {steps.map((s, i) => (
        <div key={s} className="flex flex-1 items-center last:flex-none">
          <div className="flex flex-col items-center">
            <span
              className={`h-3 w-3 rounded-full transition-all duration-300 ${
                i <= active ? "bg-primary" : "bg-border"
              } ${i === active ? "pulse ring-4 ring-primary/20" : ""}`}
            />
            <span
              className={`mt-1.5 text-[11px] font-semibold ${
                i <= active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {s}
            </span>
          </div>
          {i < steps.length - 1 && (
            <span
              className={`mx-1 mb-5 h-0.5 flex-1 rounded-full transition-colors duration-300 ${
                i < active ? "bg-primary" : "bg-border"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- Talerz ---------- */

function Plate({ plate }: { plate: { carb: number; protein: number; fat: number; fluid: number } }) {
  const parts = [
    { key: "carb", label: "Węglowodany", value: plate.carb, color: "var(--color-primary)" },
    { key: "protein", label: "Białko", value: plate.protein, color: "color-mix(in oklab, var(--color-primary) 55%, white)" },
    { key: "fat", label: "Tłuszcz", value: plate.fat, color: "color-mix(in oklab, var(--color-primary) 25%, white)" },
    { key: "fluid", label: "Płyny", value: plate.fluid, color: "color-mix(in oklab, var(--color-primary) 12%, white)" },
  ];
  return (
    <div className="mt-3">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
        {parts.map((p) => (
          <span
            key={p.key}
            className="h-full transition-all duration-300 ease-out"
            style={{ width: `${p.value}%`, background: p.color }}
          />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {parts.map((p) => (
          <div key={p.key} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Odliczanie ---------- */

function useCountdown(startMinutes: number | null): number | null {
  const [left, setLeft] = useState<number | null>(startMinutes);
  useEffect(() => {
    setLeft(startMinutes);
    if (startMinutes == null) return;
    const id = setInterval(() => {
      setLeft((v) => (v == null ? v : Math.max(0, v - 1)));
    }, 60_000);
    return () => clearInterval(id);
  }, [startMinutes]);
  return left;
}

function formatCountdown(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
