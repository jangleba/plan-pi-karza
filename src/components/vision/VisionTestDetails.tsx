import { useNavigate } from "@tanstack/react-router";
import { Camera, Gauge, Repeat, Clock, Target, ListChecks, CheckCircle2 } from "lucide-react";
import { VisionHeader, DIFFICULTY_LABELS } from "./visionUi";
import { Button } from "@/components/ui/button";
import {
  CAMERA_VIEW_LABELS,
  CATEGORY_LABELS,
  type VisionTest,
} from "@/lib/vision/types";

export function VisionTestDetails({ test }: { test: VisionTest }) {
  const navigate = useNavigate();

  return (
    <div className="pb-28">
      <VisionHeader
        title={test.name}
        subtitle={CATEGORY_LABELS[test.category]}
        backTo="/vision-lab"
        right={
          <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground">
            {DIFFICULTY_LABELS[test.difficulty]}
          </span>
        }
      />

      <div className="space-y-4 px-5">
        <div className="grid grid-cols-2 gap-2.5">
          <Stat icon={Camera} label="Ujęcie" value={CAMERA_VIEW_LABELS[test.cameraView]} />
          <Stat icon={Gauge} label="Zalecany FPS" value={`${test.recommendedFps}`} />
          <Stat icon={Repeat} label="Próby" value={`${test.attempts}`} />
          <Stat icon={Clock} label="Przerwa" value={`${test.restSeconds}s`} />
        </div>

        <Section icon={Target} title="Cel">
          <p className="text-sm text-muted-foreground">{test.goal}</p>
        </Section>

        <Section icon={ListChecks} title="Co mierzy">
          <p className="text-sm text-muted-foreground">{test.whatItMeasures}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {test.measuredMetrics.map((m) => (
              <span
                key={m}
                className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground"
              >
                {m}
              </span>
            ))}
          </div>
        </Section>

        <Section icon={Camera} title="Ustawienie">
          <ul className="space-y-1.5">
            {test.setupInstructions.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {s}
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={CheckCircle2} title="Warunki ważności">
          <ul className="space-y-1.5">
            {test.validRules.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                {s}
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 px-5 py-3 backdrop-blur"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
      >
        <div className="mx-auto w-full max-w-[30rem]">
          <Button
            className="w-full"
            size="lg"
            onClick={() =>
              navigate({ to: "/vision-lab/test/$testId/setup", params: { testId: test.id } })
            }
          >
            Rozpocznij test
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Camera;
  label: string;
  value: string;
}) {
  return (
    <div className="soft-card p-3">
      <Icon className="h-4 w-4 text-primary" />
      <div className="mt-1.5 text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Camera;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="soft-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}
