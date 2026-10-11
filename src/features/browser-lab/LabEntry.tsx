import { Link } from "@tanstack/react-router";
import { ArrowRight, FlaskConical } from "lucide-react";
export function LabEntry() {
  return (
    <Link
      to="/lab"
      className="mx-5 mb-5 flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-4"
      preload="intent"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <FlaskConical className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-sm">Lab — Testy z filmu</strong>
        <span className="mt-1 block text-xs text-muted-foreground">
          Skoki, sprint i 505 · HD / 4K · od 30 FPS
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
    </Link>
  );
}
