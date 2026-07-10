import { CATEGORY_ICONS } from "./visionUi";
import { CATEGORY_LABELS, type VisionTestCategory } from "@/lib/vision/types";

export function VisionCategoryCard({
  category,
  subtitle,
  active,
  onClick,
}: {
  category: VisionTestCategory;
  subtitle: string;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-all active:scale-[0.98] ${
        active ? "border-primary bg-accent" : "border-border bg-card"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          active ? "bg-primary text-primary-foreground" : "bg-accent text-brand"
        }`}
      >
        <Icon className="h-5 w-5" strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-foreground">
          {CATEGORY_LABELS[category]}
        </div>
        <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
      </div>
    </button>
  );
}
