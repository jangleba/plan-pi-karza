import { useNavigate } from "@tanstack/react-router";
import { XCircle, RotateCcw, BookOpen } from "lucide-react";
import { VisionHeader } from "./visionUi";
import { Button } from "@/components/ui/button";
import {
  INVALID_REASON_LABELS,
  type VisionTestResult,
} from "@/lib/vision/types";

export function VisionInvalidResult({ result }: { result: VisionTestResult }) {
  const navigate = useNavigate();
  const reasons = result.validityFlags?.reasons ?? [];

  return (
    <div className="pb-16">
      <VisionHeader title="Wynik nieważny" subtitle={result.testName} backTo="/vision-lab" />

      <div className="space-y-4 px-5">
        <div className="soft-card flex flex-col items-center p-6 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/12 text-destructive">
            <XCircle className="h-8 w-8" />
          </span>
          <h2 className="mt-4 text-lg font-bold text-foreground">
            Test invalid. Repeat the test with better setup.
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Nagranie nie spełniło warunków wiarygodnego pomiaru.
          </p>
        </div>

        {reasons.length > 0 && (
          <div className="soft-card p-4">
            <h3 className="mb-2 text-sm font-semibold text-foreground">Powody</h3>
            <ul className="space-y-1.5">
              {reasons.map((r) => (
                <li key={r} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                  {INVALID_REASON_LABELS[r]}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2.5">
          <Button
            size="lg"
            onClick={() =>
              navigate({
                to: "/vision-lab/test/$testId/setup",
                params: { testId: result.testType },
              })
            }
          >
            <RotateCcw className="mr-1 h-4 w-4" /> Powtórz test
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() =>
              navigate({ to: "/vision-lab/test/$testId", params: { testId: result.testType } })
            }
          >
            <BookOpen className="mr-1 h-4 w-4" /> Wróć do instrukcji setupu
          </Button>
        </div>
      </div>
    </div>
  );
}
