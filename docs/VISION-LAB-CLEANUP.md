# Trwałe usunięcie Vision Lab

Instrukcja dotyczy wyłącznie wycofanego **Vision Lab**. Aktywny
[BallWise Lab](BALLWISE-LAB-PROTOCOL.md), jego lokalna kamera i tabela
`lab_test_results` pozostają w aplikacji.

Stary interfejs usunięto z kodu, a tabela `vision_tests` jest usuwana przez
migrację wydania. Samo istnienie migracji nie potwierdza wykonania jej w projekcie. Samych
filmów nie wolno kasować bezpośrednio poleceniem SQL na `storage.objects`.
Do tego służy Storage API i skrypt `scripts/remove-vision-lab.mjs`.

1. Zastosuj migrację `20260909090000_release_foundation.sql`. Wyłącza ona
   publiczny dostęp do bucketa i usuwa polityki wysyłania/odczytu.
2. Potwierdź wybrany projekt i brak potrzebnych archiwalnych nagrań. W lokalnym terminalu ustaw na czas jednego polecenia `SUPABASE_URL` oraz
   `SUPABASE_SERVICE_ROLE_KEY` projektu.
3. Uruchom `npm run cleanup:vision`.
4. Skrypt listuje wszystkie foldery, usuwa pliki paczkami przez Storage API,
   a dopiero potem usuwa pusty bucket.

Klucza `service_role` nie wolno wpisywać do `.env` frontendu, GitHuba ani ZIP-a.
Operacja jest nieodwracalna; wykonuj ją dopiero po upewnieniu się, że stare
filmy Vision Lab nie są już potrzebne.
