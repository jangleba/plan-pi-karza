#!/usr/bin/env python3
"""Generuje supabase/functions/_shared/radar/places.ts z GeoNames (PL.txt).
Źródło: GeoNames, licencja CC BY 4.0 (https://www.geonames.org) – wymagane uznanie autorstwa.
Użycie: python3 scripts/build-pl-places.py ścieżka/do/PL.txt > supabase/functions/_shared/radar/places.ts
Miejscowości klasy P, bez części miast (PPLX), ludność >= 3000, najludniejsza dla danej nazwy."""
import re, sys, unicodedata

OVERRIDE = {"Warsaw": "Warszawa"}
fold = lambda s: re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", s.replace("ł", "l").replace("Ł", "L")).encode("ascii", "ignore").decode().lower())
PL = re.compile(r"[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]")

rows = {}
for line in open(sys.argv[1], encoding="utf-8"):
    f = line.rstrip("\n").split("\t")
    if f[6] != "P" or f[7] == "PPLX":
        continue
    try:
        pop = int(f[14])
    except ValueError:
        continue
    if pop < 3000:
        continue
    name = OVERRIDE.get(f[1], f[1])
    if name == f[1]:  # ładniejsza forma z polskimi znakami, jeśli GeoNames ją zna (np. Bielsko-Biała)
        key = fold(name)
        alts = [a for a in f[3].split(",") if a != name and fold(a) == key and PL.search(a)]
        if not PL.search(name) and alts:
            name = sorted(alts, key=lambda a: ("-" not in a and "-" in f[1], len(a)))[0]
    cur = rows.get(name)
    if not cur or pop > cur[0]:
        rows[name] = (pop, float(f[4]), float(f[5]))

out = sorted(rows.items(), key=lambda kv: -kv[1][0])
print("// WYGENEROWANE przez scripts/build-pl-places.py – nie edytować ręcznie.")
print("// Źródło: GeoNames (https://www.geonames.org), licencja CC BY 4.0 – wymaga uznania autorstwa (patrz ekran Źródła).")
print("// [nazwa, szerokość, długość, liczba mieszkańców]; miejscowości od 3000 mieszkańców, bez części miast.")
print("export const PL_PLACES: ReadonlyArray<readonly [string, number, number, number]> = [")
for n, (pop, la, lo) in out:
    print(f'  [{n!r}, {la:.3f}, {lo:.3f}, {pop}],'.replace("'", '"'))
print("];")
