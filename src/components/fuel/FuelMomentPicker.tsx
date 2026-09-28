import type { FuelMoment } from "@/lib/fuel/assistant";

const OPTIONS: Array<{ id: FuelMoment; label: string }> = [
  { id: "before", label: "Przed" },
  { id: "after", label: "Po" },
  { id: "ordinary", label: "Zwykły" },
];

export function FuelMomentPicker({
  value,
  onChange,
}: {
  value: FuelMoment;
  onChange: (value: FuelMoment) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-2xl bg-muted/70 p-1" aria-label="Moment posiłku">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          aria-pressed={value === option.id}
          className={`min-h-11 rounded-xl px-2 text-xs font-semibold transition-[background-color,color,box-shadow,transform] duration-200 active:scale-[0.98] ${
            value === option.id
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
