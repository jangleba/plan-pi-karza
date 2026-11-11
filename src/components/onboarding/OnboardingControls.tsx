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
  glyph,
  selected,
  onClick,
  variant = "row",
  disabled,
  index = 0,
}: {
  title: string;
  desc?: string;
  icon?: ReactNode;
  /** A drawing shown as is (mini pitch, level bars), without the icon square. */
  glyph?: ReactNode;
  selected: boolean;
  onClick: () => void;
  variant?: "row" | "center" | "tile" | "compact";
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
      {glyph && (
        <span className="ob-option__glyph" aria-hidden="true">
          {glyph}
        </span>
      )}
      {icon && (
        <span className="ob-option__icon" aria-hidden="true">
          {icon}
        </span>
      )}
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
  options: Array<{ id: T; title: string; desc?: string; icon?: ReactNode; glyph?: ReactNode }>;
  value: T | null;
  onPick: (id: T) => void;
  cols?: 1 | 2 | 3;
  variant?: "row" | "center" | "tile" | "compact";
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
          glyph={option.glyph}
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

/** Multi choice list (at most `max`); a third pick replaces the older one. */
export function MultiChoiceList<T extends string>({
  options,
  value,
  onToggle,
  cols = 1,
  variant,
}: {
  options: Array<{ id: T; title: string; desc?: string; icon?: ReactNode }>;
  value: readonly T[];
  onToggle: (id: T) => void;
  cols?: 1 | 2;
  variant?: "row" | "center" | "tile" | "compact";
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
          variant={variant ?? (cols > 1 ? "tile" : "row")}
          selected={value.includes(option.id)}
          onClick={() => onToggle(option.id)}
        />
      ))}
    </div>
  );
}

/** Small pitch seen from above with the position marked. */
export function PositionGlyph({
  position,
}: {
  position: "goalkeeper" | "defender" | "midfielder" | "forward";
}) {
  const y = { goalkeeper: 39, defender: 31, midfielder: 22, forward: 12 }[position];
  return (
    <svg
      width="34"
      height="44"
      viewBox="0 0 34 44"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <rect x="1.5" y="1.5" width="31" height="41" rx="4" opacity="0.55" />
      <line x1="1.5" y1="22" x2="32.5" y2="22" opacity="0.4" />
      <circle cx="17" cy="22" r="5" opacity="0.4" />
      <rect x="10" y="35" width="14" height="7.5" opacity="0.4" />
      <rect x="10" y="1.5" width="14" height="7.5" opacity="0.4" />
      <circle cx="17" cy={y} r="3.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Four bars, `level` of them filled. */
export function LevelBars({ level }: { level: 1 | 2 | 3 | 4 }) {
  return (
    <svg width="26" height="22" viewBox="0 0 26 22" fill="currentColor">
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={i * 7}
          y={16 - i * 5}
          width="4"
          height={6 + i * 5}
          rx="2"
          opacity={i < level ? 1 : 0.18}
        />
      ))}
    </svg>
  );
}

export type ArtKind = "pitch" | "track" | "pulse" | "calendar" | "field";

/** Hairline drawing behind the question, one per section. */
export function OnboardingArt({ kind }: { kind: ArtKind }) {
  const common = {
    viewBox: "0 0 200 200",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1,
    "aria-hidden": true,
  } as const;
  const drawing = (() => {
    switch (kind) {
      case "pitch":
        return (
          <>
            <rect x="20" y="10" width="170" height="180" rx="6" />
            <line x1="20" y1="100" x2="190" y2="100" />
            <circle cx="105" cy="100" r="28" />
            <circle cx="105" cy="100" r="2" fill="currentColor" />
            <rect x="65" y="10" width="80" height="34" />
            <rect x="85" y="10" width="40" height="13" />
            <path d="M83 44a24 24 0 0 0 44 0" />
          </>
        );
      case "track":
        return (
          <>
            {[0, 14, 28, 42].map((d) => (
              <path
                key={d}
                d={`M${10 + d} 196 C ${10 + d} 90, ${100 + d / 2} ${30 + d}, 196 ${20 + d}`}
              />
            ))}
            <path d="M150 34l12-4-4 12" />
          </>
        );
      case "pulse":
        return (
          <>
            {[22, 44, 66, 88].map((r) => (
              <circle key={r} cx="120" cy="80" r={r} opacity={1 - r / 130} />
            ))}
            <path d="M20 150h40l10-22 14 44 12-30 8 8h86" />
          </>
        );
      case "calendar":
        return (
          <>
            <rect x="30" y="26" width="150" height="150" rx="16" />
            <line x1="30" y1="62" x2="180" y2="62" />
            <line x1="66" y1="14" x2="66" y2="36" />
            <line x1="144" y1="14" x2="144" y2="36" />
            {Array.from({ length: 15 }, (_, i) => (
              <circle
                key={i}
                cx={52 + (i % 5) * 26}
                cy={88 + Math.floor(i / 5) * 30}
                r={i === 8 ? 7 : 2}
                fill={i === 8 ? "none" : "currentColor"}
              />
            ))}
          </>
        );
      case "field":
        return (
          <>
            <path d="M10 170 L80 60 L190 60 L190 170 Z" />
            <path d="M45 115 L190 115" />
            {[0, 1, 2, 3].map((i) => (
              <path key={i} d={`M${70 + i * 30} 150 l6 -14 l6 14 z`} />
            ))}
            <circle cx="160" cy="40" r="12" />
          </>
        );
    }
  })();
  return (
    <div className="ob-art" aria-hidden="true">
      <svg {...common}>{drawing}</svg>
    </div>
  );
}
