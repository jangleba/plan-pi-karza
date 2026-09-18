import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { TERMS, PLACEHOLDER_NOTICE } from "@/lib/loadwise/legal";
import { useInstantBack } from "@/lib/loadwise/uiHooks";

export const Route = createFileRoute("/terms")({
  component: Terms,
});

function Terms() {
  const goBack = useInstantBack("/");
  return (
    <div className="app-shell premium-flow min-h-screen px-5 pb-16 pt-6">
      <button
        type="button"
        onClick={goBack}
        className="mb-4 inline-flex min-h-11 items-center gap-1 rounded-full border border-border px-3 text-sm text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Wstecz
      </button>
      <h1 className="text-[24px] font-medium tracking-[-0.03em]">Regulamin</h1>
      {PLACEHOLDER_NOTICE && (
        <div className="mt-3 rounded-xl border border-accent bg-accent/30 p-3 text-xs text-muted-foreground">
          {PLACEHOLDER_NOTICE}
        </div>
      )}
      <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
        {TERMS}
      </pre>
    </div>
  );
}
