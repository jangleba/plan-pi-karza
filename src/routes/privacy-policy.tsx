import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { PRIVACY_POLICY, PLACEHOLDER_NOTICE } from "@/lib/loadwise/legal";

export const Route = createFileRoute("/privacy-policy")({
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  const router = useRouter();
  return (
    <div className="app-shell min-h-screen px-5 pb-16 pt-6">
      <button
        onClick={() => router.history.back()}
        className="mb-4 inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Wstecz
      </button>
      <h1 className="text-2xl font-semibold tracking-tight">
        Polityka prywatności
      </h1>
      <div className="mt-3 rounded-xl border border-accent bg-accent/30 p-3 text-xs text-muted-foreground">
        {PLACEHOLDER_NOTICE}
      </div>
      <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
        {PRIVACY_POLICY}
      </pre>
    </div>
  );
}
