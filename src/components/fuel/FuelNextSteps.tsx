import { useState, type ReactNode } from "react";
import {
  Backpack,
  Bell,
  Check,
  ChevronRight,
  Droplet,
  GlassWater,
  PackageCheck,
  ShoppingBag,
  SlidersHorizontal,
  Utensils,
} from "lucide-react";
import { fuelDayGuide } from "@/lib/fuel/guidance";
import type { FuelContext, FuelDeviceData, FuelTiming } from "@/lib/fuel/experience";

/**
 * Under the meal card: water with one-tap +250 ml, the meal after the session,
 * then one quiet list with every secondary tool in the same row style.
 */
export function FuelNextSteps({
  middle = null,
  afterLabel = null,
  onAfter,
  onSettings,
  context,
  timing,
  now,
  data,
  nextSession,
  laterTitle,
  tomorrowMatch,
  native,
  remindersOn,
  reminderBusy,
  onOwn,
  onStore,
  onPack,
  onTomorrow,
  onReminders,
  onToggleReminders,
  onDrink,
}: {
  /** Shown between the water card and the list (proven sets). */
  middle?: ReactNode;
  /** "Po treningu" while the session is still ahead; null hides the row. */
  afterLabel?: string | null;
  onAfter?(): void;
  onSettings(): void;
  context: FuelContext;
  timing: FuelTiming;
  now: number;
  data: FuelDeviceData;
  nextSession?: FuelContext | null;
  /** Title of a set saved for later, if any. */
  laterTitle?: string | null;
  tomorrowMatch?: boolean;
  native?: boolean;
  remindersOn?: boolean;
  reminderBusy?: boolean;
  onOwn(): void;
  onStore?(): void;
  onPack(): void;
  onTomorrow?(): void;
  onReminders?(): void;
  onToggleReminders?(): void;
  onDrink(ml: number, kind: "water" | "sports"): void;
}) {
  const [ml, setMl] = useState("250");
  const [added, setAdded] = useState<number | null>(null);
  const [kind, setKind] = useState<"water" | "sports">("water");
  const guide = fuelDayGuide(context, timing, now, data, nextSession);
  const valid =
    ml.trim() !== "" && Number.isFinite(Number(ml)) && Number(ml) >= 1 && Number(ml) <= 2000;
  return (
    <>
      <section className="fuel-water" aria-label="Woda">
        <Droplet size={24} aria-hidden="true" className="fuel-water-icon" />
        <div className="fuel-water-body">
          <p className="fuel-water-head">
            <strong>Woda</strong>
            <span className="tabular-nums">{guide.drinkMl} ml dziś</span>
          </p>
          {added !== null && (
            <p className="fuel-water-added" role="status">
              <Check size={16} aria-hidden="true" /> Dodano {added} ml
            </p>
          )}
        </div>
        <button
          type="button"
          className="fuel-water-add"
          onClick={() => {
            onDrink(250, "water");
            setAdded(250);
          }}
        >
          + 250 ml
        </button>
      </section>
      {afterLabel && onAfter && (
        <button type="button" className="fuel-after-row" onClick={onAfter}>
          <i aria-hidden="true" />
          <span>
            <strong>{afterLabel}</strong>
            <small>Posiłek po wysiłku</small>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}
      {middle}
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
            <span className="fuel-v4-row-label">Inny napój</span>
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
        <Row icon={<SlidersHorizontal size={18} />} label="Ustawienia" onClick={onSettings} />
      </section>
    </>
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
