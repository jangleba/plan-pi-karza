import type { Drill } from "./drill";
import type { Position } from "./profile";
import { TECHNICAL_REFERENCE_DRILLS } from "./technical/scene";

/**
 * Szkice ćwiczeń technicznych solo (bez partnera) oparte na typowych układach
 * ze źródeł treningowych (siatka z kolorowymi stożkami, slalom, pierwszy kontakt).
 * DO PRZEGLĄDU przez trenera – nie są to gotowe sesje trenera.
 */
export const TECHNIQUE_DRILLS: Drill[] = [
  {
    id: "colour-grid",
    group: "dribble",
    title: "Siatka z kolorami",
    field: { width: 15, height: 15, kind: "patch" },
    cones: [
      { x: 2, y: 2, color: "red" },
      { x: 13, y: 2, color: "yellow" },
      { x: 2, y: 13, color: "green" },
      { x: 13, y: 13, color: "blue" },
    ],
    arrows: [
      { style: "dribble", points: [{ x: 7.5, y: 7.5 }, { x: 2.5, y: 3 }], step: 1 },
      { style: "dribble", points: [{ x: 2.5, y: 3 }, { x: 12.5, y: 12.5 }], step: 2 },
    ],
    goal: "Prowadzenie z głową do góry i reakcja na bodziec.",
    dose: "4 serie × 45 s, przerwa 60 s",
    points: [
      "Gdy zobaczysz kolor, prowadź piłkę do stożka tego koloru.",
      "Głowa do góry, krótkie dotknięcia.",
      "Zmieniaj nogę prowadzącą.",
    ],
    source: "Układ siatki 15×15 m z kolorowymi stożkami (plany FAW, sportsessionplanner.com).",
  },
  {
    id: "slalom-sprint",
    group: "dribble",
    title: "Slalom i zmiana kierunku",
    field: { width: 30, height: 12, kind: "patch" },
    cones: [4, 9, 14, 19, 24].map((x, i) => ({ x, y: i % 2 ? 4 : 8, color: "yellow" as const })),
    arrows: [
      { style: "dribble", points: [{ x: 1, y: 6 }, { x: 4, y: 6 }, { x: 9, y: 6 }, { x: 14, y: 6 }, { x: 19, y: 6 }, { x: 24, y: 6 }, { x: 29, y: 6 }], step: 1 },
      { style: "run", points: [{ x: 29, y: 10 }, { x: 1, y: 10 }], step: 2 },
    ],
    goal: "Kontrola piłki przy zmianie kierunku, potem szybki powrót.",
    dose: "6 × odcinek, powrót biegiem",
    points: ["Zewnętrzną częścią stopy przy stożku.", "Przyspiesz po minięciu stożka."],
    source: "Zig-zag cone dribbling (sportsessionplanner.com, plan dla początkujących).",
  },
  {
    id: "figure-eight",
    group: "dribble",
    title: "Ósemka wokół dwóch stożków",
    field: { width: 12, height: 8, kind: "patch" },
    cones: [{ x: 3.5, y: 4, color: "yellow" }, { x: 8.5, y: 4, color: "yellow" }],
    arrows: [
      { style: "dribble", points: [{ x: 6, y: 4 }, { x: 4.8, y: 1.8 }, { x: 2, y: 4 }, { x: 4.8, y: 6.2 }, { x: 6, y: 4 }, { x: 7.2, y: 1.8 }, { x: 10, y: 4 }, { x: 7.2, y: 6.2 }, { x: 6, y: 4 }], step: 1, note: "Ósemka wokół stożków, piłka blisko stopy" },
    ],
    goal: "Bliska kontrola piłki w ciasnych zwrotach, obiema nogami.",
    dose: "4 serie × 40 s, przerwa 45 s",
    points: ["Krótkie dotknięcia, piłka blisko stopy.", "Raz zewnętrzną, raz wewnętrzną częścią stopy.", "Co serię zmieniaj kierunek ósemki."],
    source: "Szkic własny (do przeglądu trenera).",
  },
  {
    id: "feint-accelerate",
    group: "dribble",
    title: "Zwód i przyspieszenie",
    field: { width: 25, height: 10, kind: "patch" },
    cones: [{ x: 12, y: 5, color: "red", label: "obrońca" }],
    arrows: [
      { style: "dribble", points: [{ x: 2, y: 5 }, { x: 9, y: 5 }], step: 1, note: "Spokojne prowadzenie do obrońcy" },
      { style: "dribble", points: [{ x: 9, y: 5 }, { x: 11, y: 3 }, { x: 14, y: 3.4 }], step: 2, note: "Zwód: pokaż jedno, idź w drugą stronę" },
      { style: "dribble", points: [{ x: 14, y: 3.4 }, { x: 23, y: 3.4 }], step: 3, note: "Mocne przyspieszenie za obrońcą" },
    ],
    goal: "Zwód i wyjście z przyspieszeniem, bez zatrzymywania piłki.",
    dose: "6 powtórzeń, powrót truchtem, zmień stronę zwodu",
    points: ["Zwolnij przed stożkiem, potem wybuch.", "Pierwsze dotknięcie po zwodzie daleko przed siebie.", "Zmieniaj stronę zwodu."],
    source: "Szkic własny (do przeglądu trenera).",
  },
  {
    id: "t-turns",
    group: "dribble",
    title: "Zmiana kierunku „T”",
    field: { width: 14, height: 14, kind: "patch" },
    cones: [{ x: 7, y: 12, color: "green" }, { x: 7, y: 5, color: "yellow" }, { x: 2, y: 5, color: "red" }, { x: 12, y: 5, color: "blue" }],
    arrows: [
      { style: "dribble", points: [{ x: 7, y: 12 }, { x: 7, y: 5 }], step: 1, note: "Do środkowego stożka" },
      { style: "dribble", points: [{ x: 7, y: 5 }, { x: 2, y: 5 }], step: 2, note: "W lewo, ostry zwrot przy stożku" },
      { style: "dribble", points: [{ x: 2, y: 5 }, { x: 12, y: 5 }], step: 3, note: "Przez środek na prawą stronę" },
      { style: "dribble", points: [{ x: 12, y: 5 }, { x: 7, y: 5 }, { x: 7, y: 12 }], step: 4, note: "Z powrotem na start" },
    ],
    goal: "Hamowanie, zwrot i ruszenie z piłką w każdą stronę.",
    dose: "5 przejazdów, przerwa 40 s",
    points: ["Zwrot wewnętrzną lub zewnętrzną częścią stopy.", "Nisko na nogach przy zwrocie.", "Zmieniaj nogę prowadzącą co przejazd."],
    source: "Szkic własny (do przeglądu trenera).",
  },
  {
    id: "wall-first-touch",
    group: "touch",
    title: "Odbicie o ścianę i przyjęcie w ruch",
    field: { width: 14, height: 10, kind: "patch" },
    cones: [{ x: 7, y: 0.8, color: "green", label: "ściana" }],
    arrows: [
      { style: "pass", points: [{ x: 7, y: 7.2 }, { x: 7, y: 1.5 }], step: 1, note: "Podanie w ścianę, jednym kontaktem" },
      { style: "pass", points: [{ x: 7, y: 1.5 }, { x: 7, y: 6.6 }], step: 2, note: "Piłka wraca" },
      { style: "dribble", points: [{ x: 7, y: 6.6 }, { x: 11.5, y: 6 }], step: 3, note: "Przyjęcie od razu w kierunku następnego ruchu" },
    ],
    goal: "Pierwszy kontakt, który od razu ustawia piłkę do dalszej gry.",
    dose: "4 serie × 40 s, przerwa 45 s",
    points: ["Przyjmij piłkę w ruch, nie pod siebie.", "Zmieniaj nogę przyjęcia.", "Podanie twardo, żeby piłka wróciła."],
    source: "Szkic własny (do przeglądu trenera).",
  },
  {
    id: "touch-and-turn",
    group: "touch",
    title: "Przyjęcie z obrotem po odbiciu",
    field: { width: 14, height: 12, kind: "patch" },
    cones: [{ x: 7, y: 0.8, color: "green", label: "ściana" }, { x: 4, y: 8, color: "yellow" }, { x: 10, y: 8, color: "yellow" }],
    arrows: [
      { style: "pass", points: [{ x: 7, y: 9 }, { x: 7, y: 1.5 }], step: 1, note: "Podanie w ścianę" },
      { style: "pass", points: [{ x: 7, y: 1.5 }, { x: 7, y: 8.4 }], step: 2, note: "Piłka wraca" },
      { style: "dribble", points: [{ x: 7, y: 8.4 }, { x: 4.8, y: 6.4 }, { x: 2.5, y: 9 }], step: 3, note: "Przyjęcie z obrotem na stożek" },
    ],
    goal: "Przyjęcie z obrotem, bez zatrzymywania się.",
    dose: "4 serie × 6 powtórzeń, naprzemiennie strony",
    points: ["Obejrzyj się przed przyjęciem (barki, głowa).", "Przyjmij w stronę obrotu.", "Obracaj się raz w lewo, raz w prawo."],
    source: "Szkic własny (do przeglądu trenera).",
  },
  {
    id: "two-point-passing",
    group: "touch",
    title: "Podania w dwa punkty",
    field: { width: 16, height: 10, kind: "patch" },
    cones: [{ x: 4, y: 0.8, color: "red", label: "A" }, { x: 12, y: 0.8, color: "blue", label: "B" }],
    arrows: [
      { style: "pass", points: [{ x: 8, y: 8 }, { x: 4, y: 1.5 }], step: 1, note: "Podanie w punkt A" },
      { style: "pass", points: [{ x: 4, y: 1.5 }, { x: 7, y: 7.6 }], step: 2, note: "Przyjęcie jednym kontaktem" },
      { style: "pass", points: [{ x: 7, y: 7.6 }, { x: 12, y: 1.5 }], step: 3, note: "Podanie w punkt B" },
      { style: "pass", points: [{ x: 12, y: 1.5 }, { x: 9, y: 7.6 }], step: 4, note: "Przyjęcie jednym kontaktem" },
    ],
    goal: "Celność podań i przyjęcie w ruchu na obie strony.",
    dose: "4 serie × 45 s, przerwa 45 s",
    points: ["Celuj w stożek, nie w ścianę.", "Przyjęcie zawsze w stronę następnego podania.", "Oba punkty obiema nogami."],
    source: "Szkic własny (do przeglądu trenera).",
  },
];

export const POSITION_DRILLS: Drill[] = [
  {
    id: "run-in-finish",
    group: "finish",
    title: "Wbiegnięcie w pole karne i strzał",
    titleA: "Do środka",
    field: { width: 34, height: 24, kind: "half" },
    cones: [{ x: 20.5, y: 12.8 }],
    rebounders: [{ x: 7.5, y: 17.2, angle: -72 }],
    arrows: [
      { style: "pass", points: [{ x: 16.2, y: 20.6 }, { x: 8.7, y: 17.6 }], step: 1, note: "Podaj w rebounder" },
      { style: "run", points: [{ x: 17, y: 21 }, { x: 20.6, y: 17.6 }, { x: 19.2, y: 13.6 }], step: 2, note: "Wbiegnij w pole karne, za linię obrony" },
      { style: "pass", points: [{ x: 8.7, y: 17.6 }, { x: 18.4, y: 14.2 }], step: 3, note: "Piłka wraca pod nogę" },
      { style: "touch", points: [{ x: 18.4, y: 14.2 }, { x: 19.2, y: 12.3 }], step: 4, note: "Pierwszy kontakt w stronę bramki, pod strzał" },
      { style: "shot", points: [{ x: 19.2, y: 12.3 }, { x: 14.3, y: 0.5 }], step: 5, note: "Strzał w dalszy róg" },
    ],
    distances: [{ from: { x: 30, y: 0 }, to: { x: 30, y: 12.8 }, label: "12,8 m" }],
    goals: [{ x: 17, y: 0, width: 7.32 }],
    tip: "Podaj, wbiegnij i strzel po jednym przyjęciu.",
    setup: "Start i piłka 21 m od linii bramkowej, na osi bramki. Rebounder 9,5 m na lewo od startu i 4 m bliżej bramki, ustawiony na punkt strzału. Stożek strzelecki 12,8 m od linii bramkowej, 3,5 m na prawo od osi.",
    variants: [{
      id: "B", title: "Do linii",
      cones: [{ x: 29.4, y: 13 }, { x: 22.6, y: 9.8 }],
      rebounders: [{ x: 26.6, y: 17.4, angle: 72 }],
      arrows: [
        { style: "pass", points: [{ x: 17.8, y: 20.6 }, { x: 25.4, y: 17.8 }], step: 1, note: "Podaj w rebounder" },
        { style: "run", points: [{ x: 17, y: 21 }, { x: 23.6, y: 19 }, { x: 29.2, y: 13.8 }], step: 2, note: "Biegnij szeroko, wzdłuż linii bocznej" },
        { style: "pass", points: [{ x: 25.4, y: 17.8 }, { x: 28.6, y: 14.4 }], step: 3, note: "Piłka wraca w bieg" },
        { style: "dribble", points: [{ x: 28.6, y: 14.4 }, { x: 25.4, y: 11.6 }, { x: 22.6, y: 10.2 }], step: 4, note: "Zejdź do środka z piłką" },
        { style: "shot", points: [{ x: 22.6, y: 10.2 }, { x: 14.3, y: 0.5 }], step: 5, note: "Strzał w dalszy róg" },
      ],
      distances: [{ from: { x: 4, y: 0 }, to: { x: 4, y: 13 }, label: "13 m" }],
      tip: "Wbiegnij szeroko i zejdź do środka na strzał.",
      setup: "Start i piłka 21 m od linii bramkowej, na osi bramki. Rebounder 9,5 m na prawo od startu. Dwa stożki: 13 m od linii bramkowej przy prawej linii bocznej oraz 10 m od linii, 5,5 m na prawo od osi (miejsce strzału).",
    }],
    goal: "Ruch za obronę, pierwszy kontakt pod strzał i wykończenie.",
    dose: "4 serie × 4 powtórzenia, przerwa 90 s",
    points: ["Zmień tempo przy wbiegnięciu w pole karne.", "Pierwszy kontakt w stronę bramki, nie w bok.", "Strzał po jednym przyjęciu."],
    positions: ["napastnik", "skrzydlowy"],
    source: "Szkic własny (do przeglądu trenera).",
  },
  {
    id: "wall-passing",
    group: "touch",
    title: "Podanie i pierwszy kontakt o ścianę",
    field: { width: 12, height: 10, kind: "patch" },
    cones: [{ x: 3, y: 8, color: "green" }, { x: 9, y: 8, color: "green" }],
    arrows: [
      { style: "pass", points: [{ x: 6, y: 7 }, { x: 6, y: 1 }], step: 1 },
      { style: "run", points: [{ x: 3, y: 8 }, { x: 9, y: 8 }], step: 2 },
    ],
    goal: "Pierwszy kontakt i podanie bez partnera.",
    dose: "4 serie × 40 s, przerwa 45 s",
    points: ["Przyjęcie w kierunku następnego ruchu.", "Zmieniaj nogę."],
    positions: ["pomocnik", "obronca"],
    source: "Szkic własny (do przeglądu trenera).",
  },
  {
    id: "dribble-shoot",
    group: "finish",
    title: "Prowadzenie i strzał",
    titleA: "Z osi",
    field: { width: 34, height: 24, kind: "half" },
    cones: [{ x: 17, y: 21 }, { x: 17, y: 12.5 }],
    arrows: [
      { style: "dribble", points: [{ x: 17, y: 20.2 }, { x: 17.6, y: 16.4 }, { x: 17, y: 13.4 }], step: 1, note: "Prowadź do stożka, głowa do góry" },
      { style: "touch", points: [{ x: 17, y: 13.4 }, { x: 16, y: 12 }], step: 2, note: "Ostatnie dotknięcie z boku piłki, pod strzał" },
      { style: "shot", points: [{ x: 16, y: 12 }, { x: 14, y: 0.5 }], step: 3, note: "Strzał w dalszy róg" },
    ],
    distances: [{ from: { x: 22, y: 12.5 }, to: { x: 22, y: 21 }, label: "8,5 m" }, { from: { x: 30, y: 0 }, to: { x: 30, y: 12.5 }, label: "12,5 m" }],
    goals: [{ x: 17, y: 0, width: 7.32 }],
    tip: "Ostatnie dotknięcie ustawia piłkę pod strzał.",
    setup: "Stożek startowy 21 m od linii bramkowej, na osi bramki. Drugi stożek 8,5 m dalej, 12,5 m od linii bramkowej.",
    variants: [{
      id: "B", title: "Z prawej",
      cones: [{ x: 28.5, y: 19 }, { x: 22.6, y: 12.8 }],
      arrows: [
        { style: "dribble", points: [{ x: 28, y: 18.2 }, { x: 25.2, y: 16.4 }, { x: 23.2, y: 13.6 }], step: 1, note: "Prowadź po skosie do stożka" },
        { style: "touch", points: [{ x: 23.2, y: 13.6 }, { x: 22, y: 12.2 }], step: 2, note: "Ostatnie dotknięcie do środka" },
        { style: "shot", points: [{ x: 22, y: 12.2 }, { x: 14.2, y: 0.5 }], step: 3, note: "Strzał w dalszy słupek" },
      ],
      distances: [{ from: { x: 4, y: 0 }, to: { x: 4, y: 12.8 }, label: "12,8 m" }],
      tip: "Zejdź po skosie i strzel w dalszy słupek.",
      setup: "Stożek startowy 19 m od linii bramkowej i 5,5 m od prawej linii bocznej. Drugi stożek 7,5 m dalej po skosie, 12,8 m od linii bramkowej.",
    }],
    goal: "Strzał po prowadzeniu: ostatnie dotknięcie ustawia piłkę pod strzał.",
    dose: "4 serie × 4 powtórzenia, przerwa 90 s",
    points: ["Ostatnie dotknięcie lekko z boku piłki.", "Celuj w róg, nie w bramkarza.", "Naprzemiennie prawa i lewa noga."],
    positions: ["napastnik", "skrzydlowy", "pomocnik"],
    source: "Szkic własny (do przeglądu trenera).",
  },
  {
    id: "wall-one-touch-shot",
    group: "finish",
    title: "Strzał z pierwszej piłki po odbiciu",
    titleA: "Ściana z lewej",
    field: { width: 34, height: 24, kind: "half" },
    cones: [{ x: 17.4, y: 13.4 }],
    rebounders: [{ x: 8, y: 14.8, angle: -68 }],
    arrows: [
      { style: "pass", points: [{ x: 16.2, y: 18.4 }, { x: 8.9, y: 15.2 }], step: 1, note: "Podaj w rebounder" },
      { style: "run", points: [{ x: 17, y: 18.6 }, { x: 18.6, y: 16 }, { x: 17.6, y: 13.8 }], step: 2, note: "Ustaw się do strzału, ciało bokiem" },
      { style: "pass", points: [{ x: 8.9, y: 15.2 }, { x: 16.8, y: 13.6 }], step: 3, note: "Piłka wraca pod strzał" },
      { style: "shot", points: [{ x: 16.8, y: 13.6 }, { x: 20.4, y: 0.5 }], step: 4, note: "Strzał z pierwszej piłki" },
    ],
    distances: [{ from: { x: 30, y: 0 }, to: { x: 30, y: 13.6 }, label: "13,6 m" }],
    goals: [{ x: 17, y: 0, width: 7.32 }],
    tip: "Ustaw ciało do strzału, zanim piłka wróci.",
    setup: "Start 18,5 m od linii bramkowej, na osi bramki. Rebounder 9 m na lewo od startu i 4 m bliżej bramki, ustawiony na punkt strzału. Stożek strzelecki 13,5 m od linii bramkowej.",
    variants: [{
      id: "B", title: "Ściana z prawej",
      cones: [{ x: 16.6, y: 13.4 }],
      rebounders: [{ x: 26, y: 14.8, angle: 68 }],
      arrows: [
        { style: "pass", points: [{ x: 17.8, y: 18.4 }, { x: 25.1, y: 15.2 }], step: 1, note: "Podaj w rebounder" },
        { style: "run", points: [{ x: 17, y: 18.6 }, { x: 15.4, y: 16 }, { x: 16.4, y: 13.8 }], step: 2, note: "Ustaw się do strzału, ciało bokiem" },
        { style: "pass", points: [{ x: 25.1, y: 15.2 }, { x: 17.2, y: 13.6 }], step: 3, note: "Piłka wraca pod strzał" },
        { style: "shot", points: [{ x: 17.2, y: 13.6 }, { x: 13.6, y: 0.5 }], step: 4, note: "Strzał z pierwszej piłki" },
      ],
      tip: "Druga noga: rebounder po prawej, strzał w lewy róg.",
      setup: "To samo ustawienie jak w wariancie A, ale rebounder 9 m na prawo od startu.",
    }],
    goal: "Szybkie wykończenie z pierwszej piłki po wymianie.",
    dose: "4 serie × 4 powtórzenia, przerwa 90 s",
    points: ["Ustaw ciało do strzału, zanim piłka wróci.", "Uderz bez przyjęcia, noga pewna.", "Zmieniaj stronę ściany i nogę strzału."],
    positions: ["napastnik", "skrzydlowy", "pomocnik"],
    source: "Szkic własny (do przeglądu trenera).",
  },
  {
    id: "corner-accuracy",
    group: "finish",
    title: "Celność strzałów w narożniki",
    titleA: "Z 14 m",
    field: { width: 34, height: 24, kind: "half" },
    cones: [{ x: 14.2, y: 1.8, color: "red", label: "L" }, { x: 19.8, y: 1.8, color: "blue", label: "P" }, { x: 17, y: 14.9 }],
    arrows: [
      { style: "shot", points: [{ x: 17, y: 14 }, { x: 14.2, y: 0.5 }], step: 1, note: "Strzał w lewy narożnik" },
      { style: "shot", points: [{ x: 17, y: 14 }, { x: 19.8, y: 0.5 }], step: 2, note: "Strzał w prawy narożnik" },
    ],
    distances: [{ from: { x: 14.2, y: 3.6 }, to: { x: 19.8, y: 3.6 }, label: "5,6 m" }, { from: { x: 30, y: 0 }, to: { x: 30, y: 14 }, label: "14 m" }],
    goals: [{ x: 17, y: 0, width: 7.32 }],
    tip: "Najpierw celność, potem moc.",
    setup: "Piłka 14 m od linii bramkowej, na osi bramki. Dwa stożki przy słupkach, 1 m od linii bramkowej i 5,6 m od siebie (po jednym w każdym narożniku).",
    variants: [{
      id: "B", title: "Z 20 m",
      cones: [{ x: 14.2, y: 1.8, color: "red", label: "L" }, { x: 19.8, y: 1.8, color: "blue", label: "P" }, { x: 17, y: 21.4 }],
      arrows: [
        { style: "dribble", points: [{ x: 17, y: 20.6 }, { x: 17.5, y: 18.6 }, { x: 17, y: 16.8 }], step: 1, note: "Najazd na piłkę z 4 m" },
        { style: "shot", points: [{ x: 17, y: 16.8 }, { x: 14.2, y: 0.5 }], step: 2, note: "Strzał w lewy narożnik" },
        { style: "shot", points: [{ x: 17, y: 16.8 }, { x: 19.8, y: 0.5 }], step: 3, note: "Strzał w prawy narożnik" },
      ],
      distances: [{ from: { x: 30, y: 0 }, to: { x: 30, y: 16.8 }, label: "16,8 m" }],
      tip: "Strzał z dalszej odległości wymaga czystego uderzenia.",
      setup: "Piłka tuż za linią pola karnego, 16,8 m od linii bramkowej, najazd z 4 m dalej. Stożki przy słupkach jak w wariancie A.",
    }],
    goal: "Celność strzału z miejsca, w obie strony.",
    dose: "5 serii × 6 strzałów (liczysz trafienia w stożek), przerwa 60 s",
    points: ["Noga podporowa obok piłki, wzrok na celu.", "Najpierw celność, potem moc.", "Zapisuj trafienia w stożki i próbuj poprawić wynik."],
    positions: ["napastnik", "skrzydlowy", "pomocnik"],
    source: "Szkic własny (do przeglądu trenera).",
  },
];

/** Wszystkie ćwiczenia z biblioteki. */
export const ALL_DRILLS: Drill[] = [...POSITION_DRILLS, ...TECHNIQUE_DRILLS, ...TECHNICAL_REFERENCE_DRILLS];
export const drillById = (id: string): Drill | undefined => ALL_DRILLS.find((d) => d.id === id);

/** Ćwiczenia dla pozycji najpierw, potem wspólne. */
export function drillsFor(position: Position | undefined): Drill[] {
  const all = [...POSITION_DRILLS, ...TECHNIQUE_DRILLS];
  const forMe = all.filter((d) => !d.positions || (position && d.positions.includes(position)));
  return [...forMe.filter((d) => d.positions), ...forMe.filter((d) => !d.positions)];
}

export interface RecoverySession {
  title: string;
  minutes: number;
  /** Elementy z mocniejszymi dowodami na górze. */
  foundation: string[];
  optional: string[];
  source: string;
}

/**
 * Regeneracja po meczu wg przeglądów: fundamentem są odżywianie, nawodnienie i sen;
 * zimna woda i masaż poprawiają głównie odczuwaną regenerację; aktywna regeneracja
 * i rozciąganie – słabe dowody, więc opcjonalnie.
 */
export const RECOVERY: RecoverySession = {
  title: "Regeneracja po meczu",
  minutes: 15,
  foundation: [
    "Posiłek z węglowodanami i białkiem w ciągu 1–2 godzin po meczu.",
    "Nawodnienie: pij do jasnego koloru moczu.",
    "Sen: priorytet, bez skracania nocy po meczu.",
  ],
  optional: [
    "Spokojny spacer lub rower 10–15 min (dla poczucia lekkości).",
    "Rolowanie lub masaż na obolałe partie.",
    "Zimny prysznic lub kąpiel 5–15 °C, 5–20 min – głównie na ból i zmęczenie odczuwane.",
  ],
  source:
    "Przeglądy systematyczne: pubmed.ncbi.nlm.nih.gov/35961644, pubmed.ncbi.nlm.nih.gov/23315753, pmc.ncbi.nlm.nih.gov/articles/PMC9465732.",
};

/**
 * Krótka regeneracja na słaby dzień (zamiast sesji, gdy check-in jest bardzo słaby). Bez meczu w tle.
 * Ogólne zasady (spokojny ruch, rozciąganie, nawodnienie i posiłek); treść do przeglądu trenera.
 */
export const RECOVERY_LIGHT: RecoverySession = {
  title: "Regeneracja na słaby dzień",
  minutes: 20,
  foundation: [
    "Lekki ruch 10–15 min: spacer albo spokojny rower. Bez zadyszki.",
    "Rozciąganie i mobilność 5–10 min: łydki, uda, biodra. Bez bólu.",
    "Pij regularnie i zjedz normalny posiłek z białkiem i węglowodanami.",
  ],
  optional: [],
  source: "Ogólne zasady regeneracji; treść do przeglądu trenera.",
};

