import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { History, Sparkles, ClipboardCheck, Dumbbell, ChevronRight, Crosshair } from "lucide-react";
import { VisionHeader } from "./visionUi";
import { VisionCategoryCard } from "./VisionCategoryCard";
import { VisionTestCard } from "./VisionTestCard";
import { VisionGhostReplayPlaceholder } from "./VisionGhostReplayPlaceholder";
import { VISION_TESTS, GYM_EXERCISE_TEST_ID } from "@/lib/vision/visionTests";
import { isTestVisibleInUi } from "@/lib/vision/supportedTests";
import { isCoach } from "@/lib/vision/visionRepo";
import { useAuth } from "@/lib/loadwise/auth";
import { CATEGORY_LABELS, type VisionTestCategory } from "@/lib/vision/types";

const CATEGORIES: VisionTestCategory[] = ["jump", "sprint", "cod", "technique"];

/** Testy pomiarowe pogrupowane raz — brak przeliczeń w renderze.
 *  Uwzględniamy wyłącznie testy z zakresu stabilnego (SUPPORTED_VISION_TESTS)
 *  oraz ewentualne eksperymentalne odblokowane feature flagą. */
const TESTS_BY_CATEGORY: Record<VisionTestCategory, typeof VISION_TESTS> = {
  jump: [],
  sprint: [],
  cod: [],
  technique: [],
};
for (const t of VISION_TESTS) {
  if (t.id === GYM_EXERCISE_TEST_ID) continue;
  if (!isTestVisibleInUi(t.id)) continue;
  TESTS_BY_CATEGORY[t.category].push(t);
}

/** Podpisy kategorii wyliczone raz przy ładowaniu modułu. */
const CATEGORY_SUBTITLES: Record<VisionTestCategory, string> = {
  jump: "",
  sprint: "",
  cod: "",
  technique: "ćwiczenia z planu",
};
for (const c of CATEGORIES) {
  if (c === "technique") continue;
  const n = TESTS_BY_CATEGORY[c].length;
  CATEGORY_SUBTITLES[c] = n === 1 ? "1 test" : `${n} testy`;
}

export function VisionLabHome() {
  const { user } = useAuth();
  const [active, setActive] = useState<VisionTestCategory>("jump");
  const [coach, setCoach] = useState(false);

  // Testy pomiarowe aktywnej kategorii (bez wpisu gym).
  const tests = useMemo(() => TESTS_BY_CATEGORY[active], [active]);

  const handleSelect = useCallback((c: VisionTestCategory) => setActive(c), []);

  const userId = user?.id;
  useEffect(() => {
    if (userId) isCoach(userId).then(setCoach);
  }, [userId]);

  return (
    <div className="pb-16">
      <VisionHeader
        title="Vision Lab"
        subtitle="Nagraj test, otrzymaj analizę i śledź progres."
        backTo="/start"
        right={
          <Link
            to="/vision-lab/history"
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground active:scale-95"
          >
            <History className="h-4 w-4" /> Historia
          </Link>
        }
      />

      <div className="space-y-5 px-5">
        <div className="hero-card flex items-center gap-3 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/20">
            <Sparkles className="h-6 w-6 text-[oklch(0.78_0.13_256)]" />
          </span>
          <p className="text-sm leading-snug text-graphite-foreground">
            Każdy wynik pokazuje podstawę obliczeń, jakość nagrania i FPS. Metryki bez wymaganej
            kalibracji są pomijane.
          </p>
        </div>

        <Link
          to="/vision-lab/calibration"
          className="soft-card flex items-center gap-3 p-4 transition-transform active:scale-[0.99]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <Crosshair className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">Kalibracja kamery</div>
            <p className="text-xs text-muted-foreground">
              Profil dla urządzenia, obiektywu, orientacji i FPS/zoomu — z walidacją
              reprojectionError.
            </p>
          </div>
          <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>

        {coach && (
          <Link
            to="/vision-lab/coach"
            className="soft-card flex items-center gap-3 p-4 transition-transform active:scale-[0.99]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <ClipboardCheck className="h-6 w-6" />
            </span>
            <div>
              <div className="text-sm font-semibold text-foreground">Coach Review Queue</div>
              <p className="text-xs text-muted-foreground">
                Testy zgłoszone przez zawodników do weryfikacji.
              </p>
            </div>
          </Link>
        )}

        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Kategorie
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            {CATEGORIES.map((c) => (
              <VisionCategoryCard
                key={c}
                category={c}
                subtitle={CATEGORY_SUBTITLES[c]}
                active={active === c}
                onSelect={handleSelect}
              />
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {CATEGORY_LABELS[active]}
          </h2>

          {active === "technique" ? (
            <Link
              to="/vision-lab/gym"
              className="soft-card flex items-center gap-3 p-4 transition-transform active:scale-[0.99]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-brand">
                <Dumbbell className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground">Analyze Gym Exercise</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Analiza techniki ćwiczeń z aktualnego planu siłowego.
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ) : (
            <div className="space-y-2.5">
              {tests.map((t) => (
                <VisionTestCard key={t.id} test={t} />
              ))}
            </div>
          )}
        </div>

        <VisionGhostReplayPlaceholder />
      </div>
    </div>
  );
}
