import { useEffect, useState } from "react";
import { localISO } from "../engine";
import type { Profile } from "../engine";
import { LISTING_KINDS, type ListingKind } from "./lib";
import { RADII, type RadarPrefs, type Radius } from "./prefs";
import { radiusLabel } from "./state";

interface PlaceHit { name: string; lat: number; lon: number }

const chip = (on: boolean) => `rounded-full px-3.5 py-2 text-sm ${on ? "bw-sel font-medium" : "bg-canvas text-ink"}`;
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-5"><div className="mb-2 text-sm text-muted">{label}</div>{children}</div>
);

const ageOn = (birthISO: string, todayISO: string): number => {
  const b = new Date(`${birthISO}T00:00:00Z`), t = new Date(`${todayISO}T00:00:00Z`);
  let a = t.getUTCFullYear() - b.getUTCFullYear();
  if (t.getUTCMonth() < b.getUTCMonth() || (t.getUTCMonth() === b.getUTCMonth() && t.getUTCDate() < b.getUTCDate())) a--;
  return a;
};

/** Kryteria radaru: data urodzenia (zostaje na urządzeniu), miejscowość (ręcznie, bez GPS), promień, rodzaje. */
export function RadarSetup({ profile, prefs, onProfile, onPrefs, onDone }: {
  profile: Profile; prefs: RadarPrefs; onProfile: (p: Profile) => void; onPrefs: (p: RadarPrefs) => void; onDone: () => void;
}) {
  const today = localISO();
  const [yearOnly, setYearOnly] = useState(!profile.birthDate && !!profile.birthYear);
  const [query, setQuery] = useState(prefs.place?.name ?? "");
  const [hits, setHits] = useState<PlaceHit[]>([]);

  // zbiór miejscowości (GeoNames) ładuje się dopiero tutaj, nie w głównym pakiecie
  useEffect(() => {
    let alive = true;
    if (query.trim().length < 2 || query === prefs.place?.name) { setHits([]); return; }
    void import("../../supabase/functions/_shared/radar/geo.ts").then((g) => { if (alive) setHits(g.searchPlaces(query, 6)); });
    return () => { alive = false; };
  }, [query, prefs.place?.name]);

  const setBirthDate = (d: string) => {
    if (!d) return;
    const age = ageOn(d, today);
    onProfile({ ...profile, birthDate: d, birthYear: undefined, ...(age >= 16 && age < 100 ? { age } : {}) });
  };
  const setBirthYear = (y: number) => onProfile({ ...profile, birthDate: undefined, birthYear: y });
  const thisYear = Number(today.slice(0, 4));
  const kinds = LISTING_KINDS.filter(([k]) => k !== "inne");

  return (
    <>
      <Field label="Data urodzenia">
        {yearOnly ? (
          <select value={profile.birthYear ?? ""} onChange={(e) => e.target.value && setBirthYear(Number(e.target.value))}
            className="w-full rounded-2xl bg-canvas px-4 py-3 text-base" aria-label="Rok urodzenia">
            <option value="">Wybierz rok</option>
            {Array.from({ length: 40 }, (_, i) => thisYear - 8 - i).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        ) : (
          <input type="date" value={profile.birthDate ?? ""} min="1980-01-01" max={today} onChange={(e) => setBirthDate(e.target.value)}
            className="w-full rounded-2xl bg-canvas px-4 py-3 text-base" aria-label="Data urodzenia" />
        )}
        <button onClick={() => setYearOnly(!yearOnly)} className="mt-2 text-xs text-accent">{yearOnly ? "Podam pełną datę" : "Podam tylko rok"}</button>
        <p className="mt-1 text-xs text-muted">Zostaje na tym urządzeniu – nie trafia do wyszukiwarki ani AI. {yearOnly ? "Oferty zależne od dnia urodzin będą wymagały pełnej daty." : ""}</p>
      </Field>

      <Field label="Miejscowość">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Wpisz miejscowość" autoComplete="off"
          className="w-full rounded-2xl bg-canvas px-4 py-3 text-base placeholder:text-muted/70" aria-label="Miejscowość" />
        {hits.length > 0 && (
          <ul className="mt-2 overflow-hidden rounded-2xl border border-hairline">
            {hits.map((h) => (
              <li key={h.name}>
                <button onClick={() => { onPrefs({ ...prefs, place: { name: h.name, lat: h.lat, lon: h.lon } }); setQuery(h.name); setHits([]); }}
                  className="w-full border-b border-hairline px-4 py-3 text-left text-[15px] last:border-0">{h.name}</button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-muted">Odległość liczona od środka miejscowości – jest przybliżona. Bez GPS. Współrzędne: GeoNames (CC BY 4.0).</p>
      </Field>

      <Field label="Promień">
        <div className="flex flex-wrap gap-2">
          {RADII.map((r) => <button key={String(r)} aria-pressed={prefs.radiusKm === r} onClick={() => onPrefs({ ...prefs, radiusKm: r as Radius })} className={chip(prefs.radiusKm === r)}>{radiusLabel(r)}</button>)}
        </div>
      </Field>

      <Field label="Rodzaj ofert">
        <div className="flex flex-wrap gap-2">
          {kinds.map(([k, t]) => {
            const on = prefs.kinds.includes(k);
            return <button key={k} aria-pressed={on} onClick={() => onPrefs({ ...prefs, kinds: on ? prefs.kinds.filter((x: ListingKind) => x !== k) : [...prefs.kinds, k] })} className={chip(on)}>{t}</button>;
          })}
        </div>
        <p className="mt-1 text-xs text-muted">Bez wyboru – wszystkie rodzaje.</p>
      </Field>

      <button onClick={onDone} className="bw-grad w-full rounded-2xl py-4 text-base font-medium">Gotowe</button>
    </>
  );
}
