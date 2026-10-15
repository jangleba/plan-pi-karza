# Długie piłki i wyskok do główki — przygotowanie

Ta paczka zawiera działające rozszerzenie piłek górnych (480 scenariuszy) oraz
zaplecze pod nowe, rzeczywiste klipy Y Bot. Nowe główki pozostają wyłączone.
Nie dołączono zastępczych animacji skoku ani nowych plików FBX.

## Działa teraz

- Dotychczasowe sylwetki i cztery pliki Mixamo pozostają identyczne.
- Przerzut, podcięcie, dośrodkowanie, przyjęcie i dalsza akcja używają
  przetestowanego rozszerzenia z paczki „Piłka górna i nowe akcje”.
- Brak, błąd pobrania lub uszkodzenie nowego opcjonalnego FBX nie blokuje boiska.
- Dodanie samego pliku nie włącza niesprawdzonej animacji.

## Przygotowane pod prawdziwe pliki

`assets/long-kick.fbx` i `assets/header.fbx` ładowane są opcjonalnie.
Konfiguracja w `aerialClips.ts` celowo jest pusta. Każdy wpis wymaga sumy SHA-256
konkretnego eksportu, rzeczywistego czasu trwania, klatki kontaktu i zmierzonego
położenia środka piłki. Główka dodatkowo wymaga klatek wybicia i lądowania.
Zgodność szkieletu, ścieżek, sumy pliku, czasu oraz uniesienia bioder jest
sprawdzana przed oznaczeniem klipu jako `ready`.

`aerialSequence.ts` synchronizuje podanie, dobiegnięcie, wyskok, główkę do partnera
i opanowanie zgrania. Piłka dochodzi do skalibrowanego punktu na dokładnej klatce
kontaktu; kolejne zagranie zaczyna się w tym samym miejscu. Ruch pionowy pochodzi
z bioder w klipie FBX, bez dodawania sztucznego podskoku. Pozycja i czas każdej
klatki zależą od czasu odtwarzania, dzięki czemu pauza i przewijanie nie kumulują
ruchu. Dostępny nowy długi zamach używa własnej klatki kontaktu; w przeciwnym
razie sekwencja korzysta ze sprawdzonego Soccer Pass.

`aerialRehearsals.ts` zawiera 8 układów pozycyjnych z lustrzanymi wariantami
(16 przygotowanych sekwencji technicznych). Są to materiały do sprawdzenia
animacji i dalszej budowy decyzji. **Nie są dodatkowymi grywalnymi scenariuszami**
i nie zwiększają licznika 480. Nie ma ich w katalogu gracza ani w historii prób.

| Pozycja        | Przygotowany przebieg                                      |
| -------------- | ---------------------------------------------------------- |
| Bramkarz       | Długie podanie, zgranie napastnika, zebranie drugiej piłki |
| Stoper         | Ustawienie pod lot, wyskok, główka do bocznego sektora     |
| Boczny obrońca | Dośrodkowanie, zgranie do środka, dalsze wsparcie          |
| Szóstka        | Ustawienie pod zgranie i przyjęcie drugiej piłki           |
| Ósemka         | Podejście w drugim tempie i otwarcie gry do przodu         |
| Dziesiątka     | Wyjście poza cień obrońcy, zgranie na trzeciego            |
| Skrzydłowy     | Ruch na dalszy słupek, wyskok i główka do partnera         |
| Napastnik      | Wyprzedzenie obrońcy, wyskok, zgranie i kolejny ruch       |

Opisane dalsze decyzje są rozpisane jako krótkie wskazówki. Sampler techniczny
odtwarza podanie → główkę → przyjęcie. Nie symuluje jeszcze pojedynku z rywalem,
wygrania drugiej piłki pod presją ani następującej kontry.

## Po otrzymaniu eksportów

Użyj tego samego Y Bot oraz ustawień wcześniej uzgodnionych dla dodatkowych
klipów: FBX Binary, Without Skin, 30 FPS, Keyframe Reduction None.
Oryginały zachowaj do porównania; nazwy robocze w projekcie to `long-kick.fbx`
i `header.fbx`.

Przegląd danych (uruchomiony z katalogu repozytorium):

```sh
node src/features/football-iq-match/tools/inspect-aerial.mjs /sciezka/header.fbx
node src/features/football-iq-match/tools/inspect-aerial.mjs /sciezka/header.fbx 24
```

Skrypt jest tylko do odczytu. Raportuje sumę pliku, czas trwania oraz pozycje
bioder, głowy i palców stóp co 1/30 sekundy. Argument 24 jest przykładową klatką,
nie ustawieniem dla nieznanego klipu. Kość Head nie jest powierzchnią czoła:
offset środka piłki trzeba ustalić na rzeczywistym klipie i sprawdzić wizualnie
przy wysokości postaci 6.8.

Po kalibracji `buildAerialRehearsal(id, asset)` tworzy odtwarzanie, a
`sampleAerialSequence(sequence, seconds)` daje `PlaybackFrame` akceptowaną przez
istniejący renderer boiska. W następnym etapie trzeba zweryfikować rzeczywisty
kontakt i lądowanie, dodać decyzje/rywali do banku IQ i wersjonowanie historii,
a dopiero potem udostępnić nowe akcje graczowi. Osobnej kontroli wymaga iPhone.

Testy skoku w tej paczce używają syntetycznego ruchu na prawdziwym szkielecie
do sprawdzania importu, przewijania i zachowania wysokości. Nie potwierdzają
jakości nieotrzymanych jeszcze animacji Mixamo.
