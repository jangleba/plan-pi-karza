import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { History, Sparkles, ClipboardCheck } from "lucide-react";
import { VisionHeader } from "./visionUi";
import { VisionCategoryCard } from "./VisionCategoryCard";
import { VisionTestCard } from "./VisionTestCard";
import { VisionGhostReplayPlaceholder } from "./VisionGhostReplayPlaceholder";
import { VISION_TESTS } from "@/lib/vision/visionTests";
import { isCoach } from "@/lib/vision/visionRepo";
import { useAuth } from "@/lib/loadwise/auth";
import {
  CATEGORY_LABELS,
  type VisionTestCategory,
} from "@/lib/vision/types";

const CATEGORIES: VisionTestCategory[] = ["jump", "sprint", "cod", "technique"];

export function VisionLabHome() {
  const { user } = useAuth();
  const [active, setActive] = useState<VisionTestCategory>("jump");
  const [coach, setCoach] = useState(false);
  const tests = VISION_TESTS.filter((t) => t.category === active);

  useEffect(() => {
    if (user) isCoach(user.id).then(setCoach);
  }, [user]);

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
            Każdy wynik pokazuje pewność, ważność i FPS. Vision Lab nie udaje
            fałszywej dokładności.
          </p>
        </div>

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
                count={VISION_TESTS.filter((t) => t.category === c).length}
                active={active === c}
                onClick={() => setActive(c)}
              />
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {CATEGORY_LABELS[active]}
          </h2>
          <div className="space-y-2.5">
            {tests.map((t) => (
              <VisionTestCard key={t.id} test={t} />
            ))}
          </div>
        </div>

        <VisionGhostReplayPlaceholder />
      </div>
    </div>
  );
}
