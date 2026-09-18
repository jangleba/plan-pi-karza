BALLWISE 08 — PRAWO, PRYWATNOŚĆ I SUPABASE

1. Wgraj zawartość paczki po paczce 07, zachowując strukturę katalogów.
2. Ustaw dziesięć wartości prawnych według .env.legal.example.
3. W produkcji ustaw VITE_RELEASE_MODE=production.
4. Migracja 20260918183000_secure_defaults_and_health_cleanup.sql musi zostać
   zastosowana do projektu Supabase przez zwykły proces wdrożenia migracji.
5. Nie umieszczaj SUPABASE_SERVICE_ROLE_KEY w repozytorium ani w zmiennych VITE_*.

Paczka obejmuje czyszczenie danych urządzenia, wycofanie zgód bez przeładowania,
bezpieczne domyślne uprawnienia nowych obiektów i aktualną konfigurację wydania.

Automatyczna kontrola kodu wykonana przed spakowaniem:
- TypeScript: OK
- 681 testów: OK
- ESLint: OK
- build produkcyjny: OK
