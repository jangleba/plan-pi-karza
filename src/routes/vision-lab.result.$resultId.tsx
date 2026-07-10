import { useEffect, useState } from "react";
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { VisionGuard } from "@/components/vision/VisionGuard";
import { VisionResult } from "@/components/vision/VisionResult";
import { getResultById } from "@/lib/vision/visionResultService";
import type { VisionTestResult } from "@/lib/vision/types";

export const Route = createFileRoute("/vision-lab/result/$resultId")({
  component: ResultRoute,
});

function ResultRoute() {
  const { resultId } = useParams({ from: "/vision-lab/result/$resultId" });
  const [result, setResult] = useState<VisionTestResult | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    getResultById(resultId)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setBusy(false));
  }, [resultId]);

  return (
    <VisionGuard withNav>
      {busy ? (
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Ładowanie wyniku…
        </div>
      ) : result ? (
        <VisionResult result={result} />
      ) : (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
          <h1 className="text-lg font-semibold text-foreground">Nie znaleziono wyniku</h1>
          <Link to="/vision-lab" className="mt-4 text-sm font-medium text-primary">
            Wróć do Vision Lab
          </Link>
        </div>
      )}
    </VisionGuard>
  );
}
