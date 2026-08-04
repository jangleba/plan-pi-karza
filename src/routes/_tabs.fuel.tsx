import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { AppHeader } from "@/components/loadwise/ui";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, CalendarClock, Utensils, Check, Info } from "lucide-react";
import {
  evaluateMeal,
  preSessionPlan,
  TIME_BUCKET_LABELS,
  TIME_BUCKET_MINUTES,
} from "@/lib/fuel/engine";
import {
  athleteFromProfile,
  findNextSession,
  sessionFromPlan,
} from "@/lib/fuel/planAdapter";
import { parseMeal } from "@/lib/fuel/mealParser";
import type { Portion, TimeBucket, Verdict } from "@/lib/fuel/types";

export const Route = createFileRoute("/_tabs/fuel")({
  component: FuelWiseScreen,
  head: () => ({
    meta: [
      { title: "FuelWise – posiłek dopasowany do treningu | BallWise" },
      {
        name: "description",
        content:
          "Wpisz zwykłym językiem, co chcesz zjeść, a FuelWise oceni, czy pasuje do najbliższej jednostki treningowej.",
      },
      { property: "og:title", content: "FuelWise – posiłek dopasowany do treningu" },
      {
        property: "og:description",
        content:
          "Deterministyczna ocena posiłku względem najbliższego treningu z Twojego planu.",
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

const BUCKETS = Object.keys(TIME_BUCKET_MINUTES) as TimeBucket[];

const VERDICT_LABEL: Record<Verdict, string> = {
  PASUJE: "Pasuje",
  POPRAW: "Popraw",
  ZOSTAW_NA_POZNIEJ: "Zostaw na później",
};

function verdictClasses(v: Verdict): string {
  if (v === "PASUJE") return "bg-primary text-primary-foreground";
  if (v === "POPRAW") return "bg-accent text-accent-foreground";
  return "bg-muted text-foreground";
}

function FuelWiseScreen() {
  const { state, todayIso } = useLoadwise();

  const session = useMemo(
    () => sessionFromPlan(findNextSession(state.plan, todayIso), todayIso),
    [state.plan, todayIso],
  );
  const athlete = useMemo(() => athleteFromProfile(state.profile), [state.profile]);

  const [text, setText] = useState("");
  const [portion, setPortion] = useState<Portion>("normalna");
  const [timeBucket, setTimeBucket] = useState<TimeBucket | null>(null);
  const [onlyThis, setOnlyThis] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const knowsTime = session.minutesToStart != null;
  const needsTimeAnswer = submitted != null && !knowsTime && timeBucket == null;

  const result = useMemo(() => {
    if (submitted == null || session.kind === "none") return null;
    if (!knowsTime && timeBucket == null) return null;
    return evaluateMeal({
      session,
      athlete,
      meal: parseMeal(submitted),
      portion,
      timeBucket,
      onlyThis,
    });
  }, [submitted, session, athlete, portion, timeBucket, onlyThis, knowsTime]);

  const plan = useMemo(
    () => preSessionPlan(session, session.minutesToStart ?? (timeBucket ? TIME_BUCKET_MINUTES[timeBucket] : null)),
    [session, timeBucket],
  );

  return (
    <div>
      <AppHeader
        title="FuelWise"
        subtitle="Sprawdź, czy Twój posiłek pasuje do najbliższej jednostki"
        right={
          <Link
            to="/start"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-muted-foreground"
            aria-label="Wróć"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        }
      />

      <div className="space-y-3 px-5 pb-10">
        {session.kind === "none" ? (
          <div className="soft-card p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" /> Najbliższa jednostka
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Nie znaleźliśmy zaplanowanej jednostki. Dodaj trening do planu, aby
              otrzymać dopasowaną rekomendację.
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
            {/* NAJBLIŻSZA JEDNOSTKA */}
            <div className="soft-card p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" /> Najbliższa jednostka
              </div>
              <div className="mt-1.5 text-base font-semibold">{session.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {[session.dayLabel, session.startClock].filter(Boolean).join(" ")}
              </div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                {[
                  session.intensity ? `${capitalize(session.intensity)} intensywność` : null,
                  session.durationMin ? `${session.durationMin} min` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>

            {/* PLAN PRZED TRENINGIEM */}
            {plan && (
              <div className="soft-card p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Twój plan przed treningiem
                </div>
                <p className="mt-1.5 text-sm">{plan}</p>
              </div>
            )}

            {/* CO CHCESZ ZJEŚĆ */}
            <div className="soft-card p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Utensils className="h-4 w-4 text-primary" /> Co chcesz zjeść?
              </div>
              <Textarea
                className="mt-3 min-h-24 rounded-2xl"
                placeholder="Np. dwa tosty z serem i szynką, banan i energetyk"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setSubmitted(null);
                  setOnlyThis(false);
                }}
              />
              <div className="mt-3 flex gap-2">
                {PORTIONS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPortion(p.id)}
                    className={`flex-1 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
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
                disabled={text.trim().length < 3}
                onClick={() => {
                  setSubmitted(text.trim());
                  setOnlyThis(false);
                }}
                className="mt-3 w-full rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                Sprawdź posiłek
              </button>
            </div>

            {/* PYTANIE O CZAS — tylko gdy aplikacja go nie zna */}
            {needsTimeAnswer && (
              <div className="soft-card p-4">
                <div className="text-sm font-semibold">Ile zostało do treningu?</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {BUCKETS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setTimeBucket(b)}
                      className="rounded-full border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground"
                    >
                      {TIME_BUCKET_LABELS[b]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* WERDYKT */}
            {result && (
              <div className="soft-card p-4">
                <div
                  className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${verdictClasses(result.verdict)}`}
                >
                  {VERDICT_LABEL[result.verdict]}
                </div>
                <p className="mt-3 text-sm">{result.why}</p>

                {result.keep.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Zostaw
                    </div>
                    <p className="mt-1 text-sm">{result.keep.join(", ")}</p>
                  </div>
                )}

                {result.change && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Zmień
                    </div>
                    <p className="mt-1 text-sm">{result.change}</p>
                  </div>
                )}

                <div className="mt-3 rounded-2xl bg-muted/60 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Najlepsza wersja
                  </div>
                  <p className="mt-1 text-sm">{result.bestVersion}</p>
                </div>

                {result.alternative && (
                  <p className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {result.alternative}
                  </p>
                )}

                {!onlyThis && (
                  <button
                    type="button"
                    onClick={() => setOnlyThis(true)}
                    className="mt-4 w-full rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium"
                  >
                    Mam tylko to
                  </button>
                )}

                {result.onlyThis && (
                  <div className="mt-4 space-y-2">
                    <OnlyThisRow label="Zjedz teraz" items={result.onlyThis.eatNow} />
                    <OnlyThisRow label="Zjedz mniej" items={result.onlyThis.eatLess} />
                    <OnlyThisRow label="Zostaw na później" items={result.onlyThis.later} />
                  </div>
                )}
              </div>
            )}

            <p className="px-1 text-xs leading-relaxed text-muted-foreground">
              Ocena wynika z Twojego planu i jawnych reguł FuelWise. Opis posiłku nie
              jest nigdzie zapisywany.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function OnlyThisRow({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex items-start gap-2 rounded-2xl bg-muted/60 p-3">
      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <p className="text-sm">{items.join(", ")}</p>
      </div>
    </div>
  );
}

function capitalize(v: string): string {
  return v.charAt(0).toUpperCase() + v.slice(1);
}
