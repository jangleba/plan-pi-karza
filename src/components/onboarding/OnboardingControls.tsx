import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { SurfaceSketch, type SketchKind } from "@/components/design/SurfaceSketch";
import { ISO_DAY_LABELS } from "@/lib/loadwise/labels";
import "./onboarding.css";

/** Screen heading in the app's page-header style, with its quiet line sketch. */
export function StepTitle({
  eyebrow,
  title,
  sub,
  sketch,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  sketch?: SketchKind;
}) {
  return (
    <header className="ob-head bw-sketch-surface">
      {sketch && <SurfaceSketch kind={sketch} />}
      <div>
        {eyebrow && <p className="ob-eyebrow">{eyebrow}</p>}
        <h2 className="ob-title">{title}</h2>
        {sub && <p className="ob-sub">{sub}</p>}
      </div>
    </header>
  );
}

/** Section card like Profil/Start: icon + caps label inside a white card. */
export function Group({
  icon: Icon,
  label,
  note,
  aside,
  children,
}: {
  icon?: LucideIcon;
  label: string;
  note?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ob-group" role="group" aria-label={label}>
      <div className="ob-group__head">
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
        <span className="min-w-0 flex-1">{label}</span>
        {aside && <span className="ob-group__aside">{aside}</span>}
      </div>
      <div className="ob-group__body">{children}</div>
      {note && <p className="ob-group__note">{note}</p>}
    </section>
  );
}

/** Small caps sub-label inside a section card. */
export function SubLabel({ children }: { children: ReactNode }) {
  return <p className="ob-sublabel">{children}</p>;
}

/** Pill buttons. Single choice when `value` is a string, several when it is an array. */
export function Chips<T extends string>({
  options,
  value,
  onPick,
  cols,
  label,
}: {
  options: Array<{ id: T; title: string }>;
  value: T | null | readonly T[];
  onPick: (id: T) => void;
  cols?: 2 | 3 | 4;
  label?: string;
}) {
  const selected = (id: T) => (Array.isArray(value) ? value.includes(id) : value === id);
  return (
    <div className={`ob-chips${cols ? ` ob-chips--${cols}` : ""}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="ob-chip"
          aria-pressed={selected(option.id)}
          onClick={() => onPick(option.id)}
        >
          {option.title}
        </button>
      ))}
    </div>
  );
}

/** iOS segmented control. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: Array<{ id: T; title: string }>;
  value: T | null;
  onPick: (id: T) => void;
}) {
  const index = options.findIndex((option) => option.id === value);
  return (
    <div
      className="ob-seg"
      role="radiogroup"
      aria-label={label}
      style={{ ["--n" as string]: options.length, ["--k" as string]: Math.max(index, 0) }}
      data-empty={index === -1}
    >
      <span className="ob-seg__thumb" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === value}
          className="ob-seg__item"
          onClick={() => onPick(option.id)}
        >
          {option.title}
        </button>
      ))}
    </div>
  );
}

/** Divided rows inside a section card. */
export function Rows({ children }: { children: ReactNode }) {
  return <div className="ob-rows">{children}</div>;
}

/** Labelled form field with a grey filled control, as on the sign-in screen. */
export function Field({
  label,
  htmlFor,
  detail,
  children,
}: {
  label: string;
  htmlFor: string;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <div className="ob-field">
      <label htmlFor={htmlFor} className="ob-field__label">
        <span>{label}</span>
        {detail && <small>{detail}</small>}
      </label>
      {children}
    </div>
  );
}

/** Row with an icon tile, title and grey subtitle (like the Plan list). */
export function InfoRow({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="ob-info">
      <span className="ob-info__icon">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="ob-info__title">{title}</span>
        <span className="ob-info__detail">{detail}</span>
      </span>
    </div>
  );
}

export function Switch({
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
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="ob-switch"
    />
  );
}

/** Row with a switch on the right. */
export function SwitchRow({
  label,
  detail,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="ob-row" data-disabled={disabled || undefined}>
      <span className="ob-row__label">
        <span>{label}</span>
        {detail && <small>{detail}</small>}
      </span>
      <Switch label={label} checked={checked} onChange={onChange} disabled={disabled} />
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
    <div className="ob-days" role="group" aria-label={label}>
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
  );
}
