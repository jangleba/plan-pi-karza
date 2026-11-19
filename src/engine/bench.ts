import type { AnimKey } from "../exercises/anims";
import type { Position } from "./profile";

/**
 * Tryb ławki: dla zawodnika, który czeka na wejście. Trzy rzeczy:
 *  1) obserwacja rywala – 3 pytania dla pozycji, odpowiedź jednym dotknięciem,
 *  2) krótka aktywacja przy linii bocznej zależna od tego, ile czasu zostało,
 *  3) „Pierwsze 3 minuty” – hasło i zdania ułożone z odpowiedzi.
 *
 * Treści pytań i wskazówek są MOJE (ogólne zasady gry), DO PRZEGLĄDU TRENERA; polecenia trenera
 * zawsze mają pierwszeństwo. Aktywacja jest lekka (bez sprintów na maksa), bo zwykle odbywa się
 * w pasie 10–20 m przy linii bocznej, za zgodą trenera.
 */

export interface BenchOption { id: string; label: string; tip: string; word: string }
export interface BenchQuestion { id: string; ask: string; options: BenchOption[] }

const o = (id: string, label: string, word: string, tip: string): BenchOption => ({ id, label, word, tip });
const q = (id: string, ask: string, ...options: BenchOption[]): BenchQuestion => ({ id, ask, options });

export const BENCH_QUESTIONS: Record<Position, BenchQuestion[]> = {
  pomocnik: [
    q("pom-press", "Jak pressuje rywal?",
      o("high", "Wysoko", "Szybko", "Pierwszy kontakt i podanie – nie trzymaj piłki, szukaj gry za plecy pressu."),
      o("mid", "W środku", "Bokiem", "Pokaż się między liniami, ciałem bokiem, otwórz grę na wolną stronę."),
      o("low", "Nisko", "Cierpliwie", "Graj cierpliwie, zmieniaj strony, szukaj podania lub strzału z drugiej linii.")),
    q("pom-space", "Gdzie jest wolne miejsce?",
      o("behind", "Za obroną", "Za plecy", "Wbiegaj za linię obrony i pytaj o piłkę w tempo."),
      o("wide", "Na skrzydłach", "Szeroko", "Rozciągnij grę podaniem na bok, potem wejdź do środka."),
      o("between", "Między liniami", "Między liniami", "Zajmij strefę między pomocą a obroną i przyjmuj piłkę bokiem.")),
    q("pom-pace", "Jakie jest tempo gry?",
      o("slow", "Wolne", "Tempo", "Podkręć tempo już od pierwszego kontaktu."),
      o("chaos", "Chaotyczne", "Spokój", "Uspokój grę: pewne przyjęcie, proste podanie."),
      o("tired", "Rywale słabną", "Mocno", "Ruszaj mocno – wygrywaj pojedynki i drugie piłki.")),
  ],
  skrzydlowy: [
    q("skr-def", "Jaki jest obrońca przeciw Tobie?",
      o("slow", "Wolny", "Za plecy", "Graj 1 na 1 i wychodź za jego plecy."),
      o("rough", "Wchodzi ostro", "Jeden dotyk", "Szybko zmieniaj kierunek i graj na jeden dotyk – wykorzystaj jego wślizg."),
      o("deep", "Cofnięty", "Do środka", "Wchodź do środka i szukaj strzału lub podania.")),
    q("skr-cover", "Czy ma asekurację?",
      o("yes", "Tak, podwajają", "Odegraj", "Szybko odegraj do środka, nie pakuj się w dwóch."),
      o("no", "Jest sam", "Atakuj", "Nie spiesz się z odegraniem – masz przestrzeń na 1 na 1.")),
    q("skr-gk", "Bramkarz rywala przy dośrodkowaniach?",
      o("far", "Wychodzi daleko", "Nisko", "Dośrodkuj niżej i mocniej albo zagraj płasko przed bramkę."),
      o("line", "Zostaje na linii", "Wysoko", "Dośrodkuj wysoko i dalej, atakuj bliższy słupek.")),
  ],
  napastnik: [
    q("nap-cb", "Jak ustawiają się stoperzy?",
      o("high", "Wysoka linia", "Za plecy", "Graj na granicy spalonego i szukaj podania za plecy."),
      o("low", "Nisko", "Schodź", "Schodź do piłki, odgrywaj i wbiegaj w drugie tempo."),
      o("wide", "Rozciągnięci", "Luka", "Wchodź w lukę między stoperami.")),
    q("nap-gk", "Jak gra ich bramkarz?",
      o("far", "Wychodzi daleko", "Lob", "Szukaj lobu albo piłki za linię obrony."),
      o("line", "Zostaje na linii", "Szybko", "Strzelaj mocno przy słupku, bez zwłoki."),
      o("shaky", "Niepewny w polu", "Dobitka", "Atakuj dośrodkowania i dobitki.")),
    q("nap-build", "Co robi ich obrońca z piłką?",
      o("gk", "Gra do bramkarza", "Presuj", "Presuj bramkarza i najbliższego obrońcę tuż po podaniu."),
      o("long", "Wybija daleko", "Druga piłka", "Idź do drugiej piłki, nie zostawaj za nią."),
      o("calm", "Rozgrywa spokojnie", "Odbiór", "Wejdź w pressing zaraz po jego słabym przyjęciu.")),
  ],
  obronca: [
    q("obr-threat", "Kto jest najgroźniejszy u rywala?",
      o("fast", "Szybki", "Krok", "Trzymaj krok i ciało bokiem – nie daj biegu za plecy."),
      o("strong", "Silny, gra tyłem", "Wyprzedź", "Wyprzedzaj piłkę, nie pozwalaj przyjmować tyłem do bramki."),
      o("tech", "Technik, drybluje", "Opóźniaj", "Nie wślizguj się. Opóźniaj i czekaj na jego błąd.")),
    q("obr-fwd", "Jak rywal gra do przodu?",
      o("long", "Długie piłki", "Druga piłka", "Wygrywaj pojedynki w powietrzu i pilnuj drugiej piłki za plecami."),
      o("short", "Krótkie podania", "Linia", "Wyskakuj do piłki, gdy przyjmuje tyłem; trzymaj linię z partnerami."),
      o("cross", "Dośrodkowania", "Komunikuj", "Pilnuj człowieka w polu karnym i komunikuj się głosem.")),
    q("obr-line", "Jak wysoko gra Twoja obrona?",
      o("high", "Wysoko", "Razem", "Cała linia razem krok do przodu; uważaj na piłki za plecy."),
      o("low", "Nisko", "Zwarcie", "Zwarcie blisko bramki; jeden wybija, drugi asekuruje."),
      o("mixed", "Zmienia się", "Mów", "Ustalaj wysokość linii głosem z partnerami.")),
  ],
  bramkarz: [
    q("bra-finish", "Jak rywal kończy akcje?",
      o("long", "Z dystansu", "Pewnie", "Stań lekko do przodu; łap pewnie, nie odbijaj piłki na pole."),
      o("cross", "Z dośrodkowań", "Decyzja", "Decyduj wcześnie: wychodzisz głośno albo zostajesz."),
      o("one", "Sam na sam", "Wyjście", "Wychodź do piłek za plecami obrońców, bądź duży i szeroki.")),
    q("bra-press", "Czy pressują Twoje wyprowadzenie?",
      o("yes", "Tak, wysoko", "Prosto", "Graj prosto na bok lub daleko – bez ryzyka na środku."),
      o("some", "Częściowo", "Wybór", "Szukaj wolnego obrońcy, a gdy go nie ma – zagraj daleko."),
      o("no", "Nie", "Szybko", "Wznawiaj grę szybko i otwórz się do partnera.")),
    q("bra-fw", "Jak gra ich napastnik?",
      o("fast", "Szybki, za plecy", "Wyżej", "Podnieś się wyżej za obroną i komunikuj z obrońcami."),
      o("air", "Silny w powietrzu", "Głośno", "Wołaj głośno i wcześnie wychodź do wysokich piłek."),
      o("shot", "Strzela z półobrotu", "Na nogach", "Skracaj kąt i zostań na nogach do końca.")),
  ],
};

/** Zdania dopisywane, gdy odpowiedzi jest mniej niż trzy (ogólne dla każdej pozycji). */
export const BENCH_DEFAULTS = [
  "Pierwsze kontakty proste i pewne – wejdź w rytm gry.",
  "Mów od pierwszej akcji – komunikacja ustawia drużynę.",
  "Zapytaj kolegów z boiska, co działa u rywala.",
];
export const BENCH_DEFAULT_WORD = "Prosto";

/** Odpowiedzi: identyfikator pytania → identyfikator opcji. */
export type BenchAnswers = Record<string, string>;

export interface BenchPlan {
  /** Hasło z pierwszej odpowiedzi (lub domyślne). */
  word: string;
  /** Do trzech zdań na pierwsze minuty. */
  lines: string[];
  answered: number;
  total: number;
}

export function benchPlan(position: Position, answers: BenchAnswers): BenchPlan {
  const qs = BENCH_QUESTIONS[position];
  const picked = qs.flatMap((question) => {
    const opt = question.options.find((x) => x.id === answers[question.id]);
    return opt ? [opt] : [];
  });
  const lines = [...picked.map((x) => x.tip), ...BENCH_DEFAULTS].slice(0, 3);
  return { word: picked[0]?.word ?? BENCH_DEFAULT_WORD, lines, answered: picked.length, total: qs.length };
}

/* ---------- aktywacja przy linii bocznej ---------- */

export interface BenchStep {
  id: string;
  title: string;
  seconds: number;
  cue: string;
  anim?: AnimKey;
  side?: "L" | "P";
}

interface Move { title: string; cue: string; anim?: AnimKey; sides?: boolean }

const MOVES: Record<string, Move> = {
  jog: { title: "Trucht wzdłuż linii", cue: "Spokojnie, równy oddech, rozluźnione barki" },
  skipA: { title: "Skip A", cue: "Kolano w górę, stopa pod biodrem, ręce w przeciwfazie", anim: "skip" },
  kneeup: { title: "Wysokie kolana", cue: "Sylwetka prosto, lekko na przodostopiu", anim: "kneedrive" },
  lunge: { title: "Wykroki", cue: "Tułów prosto, kolano nad stopą, wstajesz pewnie", anim: "split" },
  squat: { title: "Przysiad swobodny", cue: "Kolana w linii stóp, plecy proste, pięty na ziemi", anim: "squat-free" },
  calf: { title: "Wspięcia na palce", cue: "Wysoko na przodostopiu, wolno w dół", anim: "calf" },
  pogo: { title: "Skoki sprężyste", cue: "Krótki kontakt z podłożem, sztywne kostki", anim: "pogo" },
  hop: { title: "Skoki na jednej nodze", cue: "Lądowanie miękko, kolano w linii stopy", anim: "hop", sides: true },
  "prog-60": { title: "Przyspieszenie 60%", cue: "10–15 m lekko, potem wolny powrót", anim: "sprint" },
  "prog-75": { title: "Przyspieszenie 75%", cue: "10–15 m płynnie, bez szarpania", anim: "sprint" },
};

/** Ile czasu zostało do wejścia na boisko (minuty). */
export type BenchEta = 15 | 10 | 5 | 0;
export const BENCH_ETAS: Array<[BenchEta, string]> = [[15, "Za 15 min"], [10, "Za 10 min"], [5, "Za 5 min"], [0, "Wchodzę"]];

/** Kolejność i czas (s) ćwiczeń; pary lewa/prawa mają czas jednej strony. */
const ROUTINES: Record<BenchEta, Array<[string, number]>> = {
  15: [["jog", 60], ["skipA", 30], ["kneeup", 20], ["lunge", 40], ["squat", 30], ["calf", 30], ["pogo", 20], ["hop", 15], ["prog-60", 30], ["prog-75", 30]],
  10: [["jog", 45], ["skipA", 20], ["lunge", 30], ["squat", 20], ["pogo", 20], ["prog-60", 30], ["prog-75", 30]],
  5: [["kneeup", 20], ["squat", 20], ["pogo", 20], ["prog-75", 30]],
  0: [["pogo", 15], ["squat", 15]],
};

export interface BenchRoutine { eta: BenchEta; steps: BenchStep[]; seconds: number; minutes: number }

export function benchRoutine(eta: BenchEta): BenchRoutine {
  const steps = ROUTINES[eta].flatMap(([key, seconds]): BenchStep[] => {
    const m = MOVES[key]!;
    const base = { title: m.title, cue: m.cue, anim: m.anim, seconds };
    return m.sides
      ? [{ ...base, id: `${key}-L`, side: "L" }, { ...base, id: `${key}-P`, side: "P" }]
      : [{ ...base, id: key }];
  });
  const seconds = steps.reduce((s, x) => s + x.seconds, 0);
  return { eta, steps, seconds, minutes: Math.max(1, Math.round(seconds / 60)) };
}

/* ---------- zapis odpowiedzi na dziś ---------- */

const key = (date: string) => `bench:${date}`;

export function loadBench(date: string): BenchAnswers {
  try {
    const v = JSON.parse(localStorage.getItem(key(date)) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as BenchAnswers) : {};
  } catch {
    return {};
  }
}

export function saveBench(date: string, answers: BenchAnswers): void {
  try { localStorage.setItem(key(date), JSON.stringify(answers)); } catch { /* brak pamięci */ }
}
