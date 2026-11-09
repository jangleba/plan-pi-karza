/** Tactical tasks from Football IQ for the club training session.
 * Only what to do: a trigger in the rival shape and where/when to move.
 * No body details (head, hips, scanning) and no "why".
 * Kept free of engine imports so the session screen can read it cheaply.
 */
import type { Level, Position } from "@/lib/loadwise/types";

/** 1: one clear trigger, 2: trigger + condition, 3: reads two lines at once. */
export type CueTier = 1 | 2 | 3;
export type ClubCue = { topic: string; label: string; tier: CueTier; text: string };

type Topic = { label: string; positions: Position[]; cues: [CueTier, string][] };

/** Keys match the IQ situation keys, so the last IQ lesson leads the list. */
export const clubTopics: Record<string, Topic> = {
  "gk-build": {
    label: "Wyprowadzenie od bramkarza",
    positions: ["goalkeeper"],
    cues: [
      [
        1,
        "Gdy napastnik doskakuje do stopera z piłką, stań w linii za tym stoperem jako wolne podanie zwrotne.",
      ],
      [
        2,
        "Gdy rywal kryje obu stoperów, prowadź piłkę, aż jeden z napastników ruszy do Ciebie, i graj do stopera, którego zostawił.",
      ],
      [
        3,
        "Gdy rywal naciska trzema graczami na stoperów i Ciebie, zagraj nad pierwszą linią do pomocnika za plecami napastników, zanim ich pomocnicy się przesuną.",
      ],
    ],
  },
  "gk-sweep": {
    label: "Gra za linią obrony",
    positions: ["goalkeeper"],
    cues: [
      [
        1,
        "Przy wysokiej linii obrony przesuwaj się razem z piłką i stój kilka metrów przed polem bramkowym.",
      ],
      [
        2,
        "Wychodź do piłki za obronę tylko wtedy, gdy dotrzesz do niej przed napastnikiem; w innym wypadku zostań przy bramce.",
      ],
      [
        3,
        "Gdy rywal z piłką nie jest atakowany, cofnij się o 2–3 metry; gdy partner go atakuje, wróć wyżej za linię obrony.",
      ],
    ],
  },
  "gk-counter": {
    label: "Wznowienie do kontry",
    positions: ["goalkeeper"],
    cues: [
      [2, "Po złapaniu dośrodkowania szukaj partnera na stronie, z której przyszło dośrodkowanie."],
      [
        3,
        "Gdy dwóch napastników rywala kryje stoperów, graj od razu do bocznego obrońcy, do którego rywal ma najdalej.",
      ],
    ],
  },
  "cb-carry": {
    label: "Wprowadzenie piłki",
    positions: ["defender"],
    cues: [
      [
        1,
        "Gdy napastnik kryje tylko jednego stopera, wprowadź piłkę w wolną strefę, aż pomocnik rywala do Ciebie wyjdzie, i podaj do partnera, którego krył.",
      ],
      [
        3,
        "Gdy szóstka rywala idzie za Twoim pomocnikiem, wprowadź piłkę w strefę, którą opuściła, i graj do napastnika schodzącego do Ciebie.",
      ],
    ],
  },
  "cb-step-out": {
    label: "Wyjście z linii obrony",
    positions: ["defender"],
    cues: [
      [
        2,
        "Wychodź za rywalem między linie tylko wtedy, gdy podanie do niego jest w drodze, a partner obok zajmie Twoje miejsce.",
      ],
      [
        3,
        "Gdy rywal między liniami dostaje piłkę przodem do bramki, zostań w linii i zamknij podanie za plecy; wychodź tylko do rywala tyłem do bramki.",
      ],
    ],
  },
  "defend-centre": {
    label: "Linia obrony",
    positions: ["defender"],
    cues: [
      [
        1,
        "Przy piłce po drugiej stronie zejdź do środka, na linię stoperów, i pilnuj wbiegającego skrzydłowego od strony bramki.",
      ],
      [
        2,
        "Gdy rywal z piłką nie jest atakowany i może zagrać za obronę, cofnijcie linię; gdy partner go atakuje, wyjdźcie razem do przodu.",
      ],
    ],
  },
  "fb-2v1": {
    label: "Obrona 1 na 2 przy linii",
    positions: ["defender"],
    cues: [
      [
        1,
        "W 1 na 2 przy linii zamknij podanie do środka i cofaj się, aż wróci skrzydłowy; nie doskakuj do piłki przed jego powrotem.",
      ],
    ],
  },
  "fb-inverted": {
    label: "Boczny obrońca w środku",
    positions: ["defender"],
    cues: [
      [
        3,
        "Gdy Wasz skrzydłowy trzyma szerokość, zejdź obok szóstki; gdy skrzydłowy rywala pójdzie za Tobą, zagraj szybko do Waszego skrzydłowego.",
      ],
    ],
  },
  "fullback-overlap": {
    label: "Obieganie",
    positions: ["defender"],
    cues: [
      [
        2,
        "Gdy skrzydłowy schodzi z piłką do środka, wbiegnij w wolny pas przy linii za plecami jego obrońcy.",
      ],
      [
        3,
        "Obiegaj tylko wtedy, gdy za piłką zostaje trzech Waszych graczy na dwóch napastników rywala.",
      ],
    ],
  },
  "six-pivot": {
    label: "Szóstka przy wyprowadzeniu",
    positions: ["midfielder"],
    cues: [
      [
        1,
        "Gdy stoper ma piłkę, stań w luce między dwoma napastnikami rywala, w linii podania od niego, a nie za plecami napastnika.",
      ],
      [
        3,
        "Gdy napastnik rywala stoi w Twoim cieniu, odejdź w bok i zostaw stoperowi wolne podanie do ósemki za Tobą.",
      ],
    ],
  },
  "six-screen": {
    label: "Zasłona przed obroną",
    positions: ["midfielder"],
    cues: [
      [
        2,
        "Gdy rywal ma piłkę w bocznym sektorze, stań w linii podania do jego napastnika schodzącego między linie.",
      ],
    ],
  },
  "six-switch": {
    label: "Zmiana strony gry",
    positions: ["midfielder"],
    cues: [
      [
        2,
        "Gdy rywale mają przewagę po stronie piłki, odejdź od niej tak, żeby mieć wolną linię na drugą stronę, i przenieś grę w najwyżej dwóch podaniach.",
      ],
    ],
  },
  "eight-third-man": {
    label: "Trzeci zawodnik",
    positions: ["midfielder"],
    cues: [
      [
        2,
        "Gdy pomocnik rywala kryje Cię z bliska, wyjdź do piłki, żeby poszedł za Tobą, i od razu wbiegnij w miejsce, które opuścił.",
      ],
      [
        3,
        "Po podaniu do napastnika tyłem do bramki ruszaj w lukę obok jego obrońcy, zanim pomocnicy rywala się cofną.",
      ],
    ],
  },
  "eight-box": {
    label: "Wejście w pole karne",
    positions: ["midfielder"],
    cues: [
      [
        2,
        "Przy akcji skrzydłem czekaj na skraju pola karnego, aż obrońcy cofną się pod bramkę, i dopiero wtedy wbiegnij w wolną strefę.",
      ],
    ],
  },
  "ten-turn": {
    label: "Gra między liniami",
    positions: ["midfielder", "forward"],
    cues: [
      [
        1,
        "Gdy szóstka rywala idzie do piłki, stań w miejscu, które opuściła, między ich linią pomocy a obrony.",
      ],
      [
        3,
        "Gdy stoper rywala wychodzi za Tobą między linie, zagraj do partnera i wbiegnij w miejsce, które stoper zostawił.",
      ],
    ],
  },
  "ten-press": {
    label: "Pressing pomocnika",
    positions: ["midfielder"],
    cues: [
      [
        2,
        "W pressingu biegnij do stopera po łuku, tak żeby szóstka rywala była za Twoimi plecami; doskocz, gdy piłka pójdzie na bok.",
      ],
    ],
  },
  "counter-press": {
    label: "Pressing po stracie",
    positions: ["midfielder", "forward"],
    cues: [
      [
        3,
        "Po stracie doskocz od razu tylko wtedy, gdy co najmniej dwóch partnerów jest blisko piłki; w innym wypadku cofnij się i zamknij środek.",
      ],
    ],
  },
  "low-block": {
    label: "Przeciw niskiej obronie",
    positions: ["midfielder", "forward"],
    cues: [
      [
        3,
        "Przeciw niskiej obronie stań między bocznym obrońcą a stoperem rywala; gdy boczny obrońca do Ciebie wyjdzie, zagraj za jego plecy do skrzydłowego.",
      ],
    ],
  },
  "nine-depth": {
    label: "Bieg za linię obrony",
    positions: ["forward"],
    cues: [
      [
        1,
        "Stój na linii przedostatniego rywala i ruszaj za obronę w chwili, gdy partner z piłką nie jest atakowany i może grać do przodu.",
      ],
      [
        3,
        "Gdy stoper wychodzi do partnera między liniami, wbiegnij skośnie w lukę, którą zostawił, zanim drugi stoper ją zamknie.",
      ],
    ],
  },
  "nine-press": {
    label: "Pressing napastnika",
    positions: ["forward"],
    cues: [
      [
        2,
        "Biegnij do stopera po łuku, zamykając podanie do drugiego stopera; po podaniu na bok wróć zasłonić szóstkę rywala.",
      ],
    ],
  },
  "hold-up": {
    label: "Gra tyłem do bramki",
    positions: ["forward"],
    cues: [
      [
        2,
        "Tyłem do bramki odegraj do partnera przodem do gry i od razu wbiegnij w lukę między obrońcą, który wyszedł za Tobą, a jego partnerem.",
      ],
    ],
  },
  "wing-press": {
    label: "Pressing skrzydłowego",
    positions: ["forward"],
    cues: [
      [
        2,
        "Gdy stoper rywala ma piłkę, stań w linii podania do bocznego obrońcy; doskocz, gdy stoper zagra do środka albo do bocznego.",
      ],
    ],
  },
  "wide-1v1": {
    label: "1 na 1 przy linii",
    positions: ["forward"],
    cues: [
      [
        1,
        "Atakuj obrońcę 1 na 1, gdy jego asekuracja jest daleko; gdy jest blisko, zagraj do partnera i wbiegnij za plecy obrońcy.",
      ],
    ],
  },
  cross: {
    label: "Dośrodkowanie",
    positions: ["forward"],
    cues: [
      [
        2,
        "Przy dośrodkowaniu z drugiej strony wbiegaj na dalszy słupek, za plecami bocznego obrońcy, który pilnuje środka.",
      ],
    ],
  },
  counter: {
    label: "Kontra",
    positions: ["forward", "midfielder"],
    cues: [
      [
        3,
        "W kontrze biegnij w pas między dwoma obrońcami; trzymaj się linii przedostatniego rywala i przyspiesz dopiero w chwili podania.",
      ],
    ],
  },
};

const LEVEL_TIER: Record<Level, CueTier> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
  elite: 3,
};

/** Topic key of an IQ topic id ("iqs-cb-carry" -> "cb-carry"). */
export function iqTopicKey(topicId: string | null | undefined) {
  if (!topicId) return null;
  const key = topicId.startsWith("iqs-") ? topicId.slice(4) : topicId;
  return clubTopics[key] ? key : null;
}

const dayNumber = (isoDate: string) => {
  const t = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / 86_400_000) : 0;
};

/** Hardest eligible cue of a topic, or null when all are above the level. */
function hardestCue(key: string, maxTier: CueTier): ClubCue | null {
  const topic = clubTopics[key];
  const eligible = topic.cues.filter(([tier]) => tier <= maxTier);
  if (!eligible.length) return null;
  const [tier, text] = eligible[eligible.length - 1];
  return { topic: key, label: topic.label, tier, text };
}

/** Tasks for one club session: the last IQ topic first, then the
 * position's topics rotated by date, never two from the same topic.
 * Advanced and elite players get three tasks, at least one of tier 3. */
export function clubTacticalCues(input: {
  position: Position;
  level: Level;
  date: string;
  recentIqTopicId?: string | null;
}): ClubCue[] {
  const maxTier = LEVEL_TIER[input.level] ?? 1;
  const count = maxTier === 3 ? 3 : 2;
  const keys = Object.keys(clubTopics).filter((k) =>
    clubTopics[k].positions.includes(input.position),
  );
  const offset = keys.length ? dayNumber(input.date) % keys.length : 0;
  const rotated = [...keys.slice(offset), ...keys.slice(0, offset)];
  const recent = iqTopicKey(input.recentIqTopicId);
  const order = recent ? [recent, ...rotated.filter((k) => k !== recent)] : rotated;

  const cues: ClubCue[] = [];
  for (const key of order) {
    if (cues.length >= count) break;
    const cue = hardestCue(key, maxTier);
    if (cue) cues.push(cue);
  }
  if (maxTier === 3 && !cues.some((c) => c.tier === 3)) {
    const extra = order
      .filter((k) => !cues.some((c) => c.topic === k))
      .map((k) => hardestCue(k, 3))
      .find((c) => c?.tier === 3);
    if (extra) cues[cues.length - 1] = extra;
  }
  return cues;
}
