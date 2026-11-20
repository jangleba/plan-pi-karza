# Football IQ: ocena modelu zawodnika i wymagania dla nowego modelu GLB

Stan na 2026-11-20. Dokument opisuje, co jest dziś, czego brakuje i co musi spełniać nowy model. **Żadnego nowego pliku nie pobrano ani nie dodano do repo**: licencji kandydatów nie da się potwierdzić z poziomu tej sesji, a zasada brzmi „tylko materiały z potwierdzoną licencją komercyjną”.

## 1. Ocena obecnego modelu (`public/iq/player.glb`, ok. 330 kB)

Co działa:
- Szkielet w układzie Mixamo (`mixamorig*`), ok. 1,8 m, dwie siatki oskórowane jednym szkieletem, 4 klipy (bieg w pliku, chód, stanie i podanie w JSON).
- Strój jest barwiony w shaderze (skóra, koszulka, spodenki, getry, buty, rękawice), numer na plecach i „czapka” włosów dorysowane w kodzie.

Ograniczenia, których nie da się naprawić w kodzie:
- To uniwersalny manekin: brak twarzy, włosów, szwów i faktury materiału, ręce i stopy są uproszczone. Z bliska (kamera 2–3 m) wygląda jak lalka.
- Oskórowanie w biodrach, łokciach i kolanach daje „bąble” przy zgięciu (widać na udach i spodenkach).
- Strój to jeden materiał z wagami części na wierzchołek, więc nie ma kołnierza, lampasów, wzorów, logo ani imienia na koszulce.
- Zestaw animacji jest minimalny: stanie, chód, bieg, podanie. Brakuje: ruszania i hamowania, zwrotów (90/180°), przyjęcia piłki, strzału, prowadzenia piłki, odbioru (wślizg), ruchów bramkarza.
- Pochodzenie i warunki licencji plików Mixamo są w `docs/REJESTR-LICENCJI.md` nadal **„do ustalenia”** (konto, data pobrania, zakres użycia w produkcie komercyjnym, zakaz udostępniania plików osobno). To blokuje uznanie obecnych plików za potwierdzone.

Wniosek: poprawki w kodzie (ostrość, światło, faza kroku, granice stroju) poprawiły to, co się dało. Dalsza jakość postaci wymaga nowego modelu i animacji z potwierdzoną licencją.

## 2. Wymagania dla nowego modelu

### Format i szkielet
- glTF 2.0 binarny (`.glb`), metry, skala 1:1, postać ok. 1,80 m, początek układu między stopami na murawie, przód postaci wzdłuż +Z, pion +Y.
- Szkielet humanoidalny z kościami o stałych nazwach. Najprościej: nazwy zgodne z Mixamo (`mixamorigHips`, `…Spine/Spine1/Spine2`, `…Neck`, `…Head`, `…Left/RightUpLeg/Leg/Foot/ToeBase`, ramiona i palce), wtedy `partOf` i klipy działają bez zmian. Inne nazewnictwo jest dopuszczalne, jeśli dostarczona jest tabela odwzorowania.
- Poza biodrami (`Hips`) brak kości z ruchem „root”. Max 65 kości, 4 wagi na wierzchołek.
- Poza bazowa: A-pose lub T-pose, ta sama dla wszystkich klipów.

### Siatka i materiały
- Poziom szczegółowości główny: 8–15 tys. trójkątów na postać (22 postaci na boisku, cel: poniżej 200 tys. trójkątów na scenę łącznie z trybunami). Opcjonalny drugi poziom (LOD) 3–5 tys. dla zawodników dalej niż ok. 30 m.
- Osobne siatki lub osobne sloty materiałów: ciało, koszulka, spodenki, getry, buty, rękawice, włosy, twarz. Dzięki temu strój barwi się jednym kolorem na slot, a skóra, włosy i buty mają warianty.
- Materiały PBR (metal-rough), tekstury do 1024² dla ciała i 512² dla stroju, kompresja KTX2/Basis lub WebP w paczce docelowej. Wszystkie tekstury w układzie UV bez nakładania się.
- Na koszulce wydzielone pole UV na numer na plecach i opcjonalnie nazwisko, na piersi pole na herb lub sponsora.
- Warianty ciała: co najmniej 4 odcienie skóry i 4 fryzury (tekstury lub osobne siatki), bez osobnych plików na każdą kombinację.
- Oskórowanie sprawdzone przy zgięciu bioder (90°), kolan (120°) i łokci (110°): bez „bąbli” i przebić.

### Animacje (wspólny szkielet, 30 klatek/s, bez skali w ścieżkach)
Pętle w miejscu (bez ruchu do przodu w biodrach), każda z **tym samym punktem startu cyklu: lewa stopa najdalej z przodu przy fazie 0** i znaną długością kroku (m na cykl), żeby chód, trucht i bieg dawały się mieszać na jednej fazie kroku (patrz `src/iq/actorMath.ts`):
- stanie (2 warianty), chód, trucht, bieg, sprint,
- prowadzenie piłki w truchcie i w biegu (piłka blisko stopy, rytm dotknięć znany w danych klipu),
- ruszanie ze stania, hamowanie do stania, zwrot 90° i 180° (w miejscu i w biegu).
Jednorazowe, z oznaczoną chwilą kontaktu stopy z piłką (znacznik czasu i pozycja piłki w układzie postaci, jak dziś `PASS`):
- podanie prawą i lewą nogą, strzał, przyjęcie piłki (klatka, udo, stopa), wślizg, przechwyt,
- bramkarz: pozycja wyjściowa, parada w lewo i w prawo, chwyt, wyrzut ręką.
Opcjonalnie: cieszenie się po golu, reakcja na stratę.

### Dostawa i pliki
- Model i klipy w jednym `.glb` lub model + osobne klipy w `.glb`, z listą nazw klipów, czasów kontaktu i prędkości natywnych (m/s) każdej pętli.
- Dla każdego pliku wpis w `docs/REJESTR-LICENCJI.md`: autor, źródło, data pobrania lub umowy, adres strony z licencją, suma kontrolna pliku, zakres użycia.

## 3. Licencja: co jest dopuszczalne

Aplikacja serwuje plik modelu każdemu użytkownikowi w przeglądarce, więc licencja musi pozwalać na **komercyjne użycie i dystrybucję pliku w produkcie** (także w postaci możliwej do wyciągnięcia z przeglądarki). Dopuszczalne:
1. **Praca własna lub zamówiona** u grafika 3D, z pisemną umową: przeniesienie praw autorskich albo licencja wyłączna na użycie komercyjne bez ograniczeń czasu i terytorium, z zakresem obejmującym animacje. Najpewniejsza droga dla postaci i zestawu animacji.
2. **CC0 / domena publiczna** (np. paczki CC0 od niezależnych autorów): licencję sprawdzić na stronie źródła w dniu pobrania i zapisać adres, datę i sumę kontrolną pliku.
3. **Licencja komercyjna sklepu lub autora** wprost zezwalająca na użycie w aplikacji webowej i dystrybucję wbudowanego pliku. Sprawdzić klauzulę o „dystrybucji samodzielnego zasobu” (wiele licencji zabrania udostępniania plików jako zasobów do pobrania, a przeglądarka ujawnia każdy plik).

Niedopuszczalne: licencje z zakazem użycia komercyjnego (NC), „editorial only”, bez prawa do modyfikacji (ND) tam, gdzie trzeba przebarwiać strój, atrybucja bez możliwości jej spełnienia w aplikacji, materiały bez jednoznacznej licencji, „darmowe” modele z forów i serwisów udostępniania bez wskazanego autora.

Mixamo: zasady Adobe i zakres użycia komercyjnego w tej aplikacji trzeba potwierdzić samodzielnie (konto, data pobrania, aktualne warunki) i dopisać do rejestru; do tego czasu status pozostaje „do ustalenia”, a pliki nie powinny być udostępniane osobno.

## 4. Kolejny krok

Wybrać drogę (zamówienie modelu i animacji albo źródło CC0 / komercyjne z potwierdzoną licencją), przejść listę z sekcji 2 i 3, a po dostarczeniu pliku: dopasować `partOf` / `actorMath.ts` do nazw kości, zmierzyć długość kroku i fazę kontaktu (`src/iq/actors.test.ts`, `src/iq/slide.test.ts`) i dopisać wpis do rejestru licencji.
