import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { PRIVACY_POLICY, PLACEHOLDER_NOTICE } from "@/lib/loadwise/legal";
import { useInstantBack } from "@/lib/loadwise/uiHooks";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/privacy-policy")({
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  const goBack = useInstantBack("/");
  return (
    <section className="bw-reading-page bw-page-content bw-stack">
      <Button type="button" variant="ghost" onClick={goBack} className="justify-self-start">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Wstecz
      </Button>
      <h1 className="bw-page-title">{PRIVACY_POLICY.split("\n")[0]}</h1>
      {PLACEHOLDER_NOTICE && (
        <p className="rounded-lg bg-accent/30 p-3 text-sm text-muted-foreground">
          {PLACEHOLDER_NOTICE}
        </p>
      )}
      <article className="whitespace-pre-wrap text-base leading-6 text-foreground">
        {PRIVACY_POLICY.slice(PRIVACY_POLICY.indexOf("\n") + 1).trimStart()}
      </article>
    </section>
  );
}
