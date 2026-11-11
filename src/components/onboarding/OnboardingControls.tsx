import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { ISO_DAY_LABELS } from "@/lib/loadwise/labels";
import "./onboarding.css";

export function StepTitle({
  kicker,
  title,
  sub,
}: {
  kicker?: string;
  title: string;
  sub?: string;
}) {
  return (
    <header>
      {kicker && <div className="ob-kicker">{kicker}</div>}
      <h2 className="ob-title">{title}</h2>
      {sub && <p className="ob-sub">{sub}</p>}
    </header>
  );
}

export function Option({
  title,
  desc,
  icon,
  selected,
  onClick,
  variant = "row",
  disabled,
  index = 0,
}: {
  title: string;
  desc?: string;
  icon?: ReactNode;
  selected: boolean;
  onClick: () => void;
  variant?: "row" | "center" | "tile";
  disabled?: boolean;
  index?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`ob-option${variant === "row" ? "" : ` ob-option--${variant}`}`}
      style={{ ["--i" as string]: index }}
    >
      {icon && <span className="ob-option__icon">{icon}</span>}
      <span className="ob-option__text">
        <span className="ob-option__title">{title}</span>
        {desc && <span className="ob-option__desc">{desc}</span>}
      </span>
      <span className="ob-check" aria-hidden="true">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    </button>
  );
}

/** Single choice list; `onPick` also advances the flow. */
export function ChoiceList<T extends string>({
  options,
  value,
  onPick,
  cols = 1,
  variant,
}: {
  options: Array<{ id: T; title: string; desc?: string; icon?: ReactNode }>;
  value: T | null;
  onPick: (id: T) => void;
  cols?: 1 | 2 | 3;
  variant?: "row" | "center" | "tile";
}) {
  return (
    <div className={`ob-grid ob-stagger${cols > 1 ? ` ob-grid--${cols}` : ""}`} role="group">
      {options.map((option, index) => (
        <Option
          key={option.id}
          index={index}
          title={option.title}
          desc={option.desc}
          icon={option.icon}
          variant={variant ?? (cols > 1 ? "center" : "row")}
          selected={value === option.id}
          onClick={() => onPick(option.id)}
        />
      ))}
    </div>
  );
}

export function DayPicker({
  label,
  value,
  onToggle,
  disabledDays = [],
  tone = "primary",
}: {
  label: string;
  value: number[];
  onToggle: (day: number) => void;
  disabledDays?: number[];
  tone?: "primary" | "off";
}) {
  return (
    <div role="group" aria-label={label}>
      <div className="ob-label">{label}</div>
      <div className="ob-days">
        {ISO_DAY_LABELS.map((day) => (
          <button
            key={day.value}
            type="button"
            aria-label={day.label}
            aria-pressed={value.includes(day.value)}
            disabled={disabledDays.includes(day.value)}
            onClick={() => onToggle(day.value)}
            className={`ob-day${tone === "off" ? " ob-day--off" : ""}`}
          >
            {day.short}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="ob-toggle"
    >
      <span>{label}</span>
      <span className="ob-switch" aria-hidden="true" />
    </button>
  );
}
