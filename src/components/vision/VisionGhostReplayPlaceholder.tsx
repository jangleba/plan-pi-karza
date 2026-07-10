import { Ghost } from "lucide-react";

export function VisionGhostReplayPlaceholder() {
  return (
    <div className="soft-card flex items-start gap-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-brand">
        <Ghost className="h-5 w-5" />
      </span>
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Ghost Replay</h3>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            Wkrótce
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Ghost Replay will compare two tests side by side and highlight changes
          in timing, posture and movement quality.
        </p>
      </div>
    </div>
  );
}
