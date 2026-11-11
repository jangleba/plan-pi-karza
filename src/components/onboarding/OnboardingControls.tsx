import type { ReactNode } from "react";
import { ISO_DAY_LABELS } from "@/lib/loadwise/labels";
import "./onboarding.css";

export function StepTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="ob-head">
      <h2 className="ob-title">{title}</h2>
      {sub && <p className="ob-sub">{sub}</p>}
    </header>
  );
}

/** Grouped section: small caps header, then its content (a card or controls). */
export function Group({
  label,
  note,
  aside,
  children,
}: {
  label: string;
  note?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ob-group" role="group" aria-label={label}>
      <div className="ob-group__head">
        <span>{label}</span>
        {aside && <span className="ob-group__aside">{aside}</span>}
      </div>
      {children}
      {note && <p className="ob-group__note">{note}</p>}
    </section>
  );
}

/** Pill buttons. Single choice when `value` is a string, several when it is an array. */
export function Chips<T extends string>({
  options,
  value,
  onPick,
  cols,
}: {
  options: Array<{ id: T; title: string }>;
  value: T | null | readonly T[];
  onPick: (id: T) => void;
  cols?: 2 | 3 | 4;
}) {
  const selected = (id: T) => (Array.isArray(value) ? value.includes(id) : value === id);
  return (
    <div className={`ob-chips${cols ? ` ob-chips--${cols}` : ""}`}>
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

/** White inset card holding rows. */
export function Card({ children }: { children: ReactNode }) {
  return <div className="ob-card">{children}</div>;
}

/** Card row: label (and optional detail) on the left, control on the right. */
export function Row({
  label,
  detail,
  children,
  htmlFor,
}: {
  label: string;
  detail?: string;
  children?: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="ob-row">
      <label className="ob-row__label" htmlFor={htmlFor}>
        <span>{label}</span>
        {detail && <small>{detail}</small>}
      </label>
      {children}
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

/** Card row with a switch; the whole row toggles. */
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
