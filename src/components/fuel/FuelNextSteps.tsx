import { useState, type ReactNode } from "react";
import {
  Backpack,
  Bell,
  ChevronRight,
  GlassWater,
  History,
  PackageCheck,
  ShoppingBag,
  Utensils,
} from "lucide-react";
import { fuelDayGuide } from "@/lib/fuel/guidance";
import type { FuelContext, FuelDeviceData, FuelTiming } from "@/lib/fuel/experience";

/** One quiet list under the meal card: every secondary tool in the same row style. */
export function FuelNextSteps({
  context,
  timing,
  now,
  data,
  nextSession,
  laterTitle,
  tomorrowMatch,
  savedToday,
  native,
  remindersOn,
  reminderBusy,
  onOwn,
  onStore,
  onPack,
  onTomorrow,
  onHistory,
  onReminders,
  onToggleReminders,
  onDrink,
}: {
  context: FuelContext;
  timing: FuelTiming;
  now: number;
  data: FuelDeviceData;
  nextSession?: FuelContext | null;
  /** Title of a set saved for later, if any. */
  laterTitle?: string | null;
  tomorrowMatch?: boolean;
  savedToday?: boolean;
  native?: boolean;
  remindersOn?: boolean;
  reminderBusy?: boolean;
  onOwn(): void;
  onStore?(): void;
  onPack(): void;
  onTomorrow?(): void;
  onHistory(): void;
  onReminders?(): void;
  onToggleReminders?(): void;
  onDrink(ml: number, kind: "water" | "sports"): void;
}) {
  const [ml, setMl] = useState("250");
  const [kind, setKind] = useState<"water" | "sports">("water");
  const guide = fuelDayGuide(context, timing, now, data, nextSession);
  const valid =
    ml.trim() !== "" && Number.isFinite(Number(ml)) && Number(ml) >= 1 && Number(ml) <= 2000;
  return (
    <section className="fuel-next-steps fuel-v4-list" aria-label="Więcej w Fuel">
      {laterTitle ? (
        <Row
          icon={<PackageCheck size={18} />}
          label="Na później"
          value={laterTitle}
          onClick={onPack}
        />
      ) : (
        <Row icon={<Backpack size={18} />} label="Do zabrania" onClick={onPack} />
      )}
      {tomorrowMatch && onTomorrow && (
        <Row
          icon={<PackageCheck size={18} />}
          label="Jutro mecz"
          value="Spakuj zestaw"
          onClick={onTomorrow}
        />
      )}
      {onStore && <Row icon={<ShoppingBag size={18} />} label="W sklepie" onClick={onStore} />}
      <Row
        icon={<Utensils size={18} />}
        label={guide.last ? "Już jadłem" : "Zjadłem coś innego"}
        onClick={onOwn}
        className="fuel-recent-meal"
        value={guide.last ? guide.eaten : undefined}
      />
      <details className="fuel-v4-list-details">
        <summary className="fuel-v4-row">
          <GlassWater size={18} aria-hidden="true" />
          <span className="fuel-v4-row-label">Napoje</span>
          <span className="fuel-v4-row-value">
            {guide.drinkMl ? `${guide.drinkMl} ml dziś` : "Dodaj"}
          </span>
          <ChevronRight size={16} className="fuel-v4-row-chevron" aria-hidden="true" />
        </summary>
        <form
          className="fuel-drink-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onDrink(Number(ml), kind);
          }}
        >
          <label>
            Napój
            <select value={kind} onChange={(e) => setKind(e.target.value as "water" | "sports")}>
              <option value="water">Woda</option>
              <option value="sports">Napój sportowy</option>
            </select>
          </label>
          <label>
            Ile wypiłeś (ml)?
            <input
              type="number"
              min="1"
              max="2000"
              inputMode="numeric"
              value={ml}
              onChange={(e) => setMl(e.target.value)}
              required
            />
          </label>
          <button className="fuel-secondary" disabled={!valid}>
            Zapisz napój
          </button>
        </form>
      </details>
      {onReminders &&
        (native ? (
          <div className="fuel-v4-row">
            <Bell size={18} aria-hidden="true" />
            <button className="fuel-v4-row-label" onClick={onReminders}>
              Przypomnij mi
            </button>
            <button
              role="switch"
              aria-checked={!!remindersOn}
              aria-label="Przypomnienia Fuel"
              className={`fuel-v4-switch ${remindersOn ? "is-on" : ""}`}
              disabled={reminderBusy}
              onClick={onToggleReminders}
            >
              <span />
            </button>
          </div>
        ) : (
          <Row
            icon={<Bell size={18} />}
            label="Przypomnienie"
            value="Kalendarz"
            onClick={onReminders}
          />
        ))}
      <Row
        icon={<History size={18} className={savedToday ? "bw-tone--success" : undefined} />}
        label="Historia"
        value={savedToday ? <span className="bw-tone--success">Zapisano dziś</span> : undefined}
        onClick={onHistory}
      />
    </section>
  );
}

function Row({
  icon,
  label,
  value,
  onClick,
  className,
}: {
  icon: ReactNode;
  label: string;
  value?: ReactNode;
  onClick(): void;
  className?: string;
}) {
  return (
    <button className={`fuel-v4-row ${className ?? ""}`} onClick={onClick}>
      <span aria-hidden="true" className="fuel-v4-row-icon">
        {icon}
      </span>
      <span className="fuel-v4-row-label">{label}</span>
      {value != null && <span className="fuel-v4-row-value">{value}</span>}
      <ChevronRight size={16} className="fuel-v4-row-chevron" aria-hidden="true" />
    </button>
  );
}
