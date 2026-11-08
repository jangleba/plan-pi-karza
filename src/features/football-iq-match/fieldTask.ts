/** One concrete thing to try on the real pitch after an IQ action.
 * Kept free of engine imports so the Start screen can read it cheaply.
 */
import type { JourneyDefinition } from "./journeyTypes";

export type FieldTask = {
  id: string;
  /** Imperative, one sentence: only what to do. */
  text: string;
  topicId: string;
  createdAt: string;
  done?: boolean;
};

const SCAN = "Zanim dostaniesz piłkę, spójrz dwa razy przez ramię.";
const OFFSIDE =
  "Przy podaniu do przodu stój na linii ostatniego obrońcy i ruszaj w chwili podania.";

/** Tasks per topic. Situation topics use their key, older lessons their concept. */
export const fieldTasks: Record<string, string[]> = {
  counter: [
    "Po odbiorze piłki pierwsze spojrzenie kieruj do przodu, na wolnego napastnika.",
    "W kontrze biegnij szeroko i do przodu, zanim partner podniesie głowę.",
  ],
  "gk-build": [
    "Przy wznowieniu od bramkarza ustaw się szeroko, przy linii pola karnego, przodem do boiska.",
    "Przed przyjęciem od bramkarza sprawdź, gdzie stoi najbliższy napastnik rywala.",
  ],
  cross: [
    "Przy dośrodkowaniu ruszaj w pole karne dopiero, gdy skrzydłowy podnosi głowę.",
    "Przy każdym dośrodkowaniu atakuj bliższy słupek albo punkt karny.",
  ],
  "counter-press": [
    "Po stracie piłki przez 5 sekund biegnij do piłki albo zamknij najbliższe podanie.",
    "Po stracie zatrzymaj się dopiero wtedy, gdy rywal zagra do tyłu albo na bok.",
  ],
  "low-block": [
    "Przeciw niskiej obronie zmień stronę gry dwa razy, zanim zagrasz w pole karne.",
    "Ustaw się między obrońcami a pomocnikami rywala, bokiem do bramki.",
  ],
  "wide-1v1": [
    "W pojedynku 1 na 1 przyspiesz dopiero po zwodzie.",
    "Raz w meczu zaatakuj obrońcę od razu po przyjęciu, bez zatrzymania.",
  ],
  "defend-centre": [
    "Gdy rywal ma piłkę przed polem karnym, stań bokiem między nim a bramką.",
    "Co kilka sekund sprawdź napastnika za swoimi plecami.",
  ],
  "hold-up": [
    "Zanim dostaniesz piłkę tyłem do bramki, dotknij ręką obrońcy za plecami.",
    "Po przyjęciu tyłem do bramki odegraj w 1–2 kontaktach do partnera przodem do gry.",
  ],
  "fullback-overlap": [
    "Gdy skrzydłowy schodzi z piłką do środka, obiegnij go po zewnętrznej.",
    "Po obiegnięciu dośrodkuj albo zagraj wzdłuż pola karnego w 2 kontaktach.",
  ],
  "gk-switch": [
    "Zanim dostaniesz piłkę, sprawdź, po której stronie rywal ma mniej zawodników.",
    "Przy wyprowadzeniu od bramki zagraj raz długo na wolną stronę.",
  ],
  "gk-sweep": [
    "Gdy Twoja obrona stoi wysoko, stój kilka metrów przed bramką.",
    "Przy każdym podaniu za obrońców ruszaj od razu, zanim piłka spadnie.",
  ],
  "gk-counter": [
    "Po złapaniu piłki od razu szukaj wzrokiem wolnego skrzydłowego.",
    "Po złapaniu piłki wznów grę w ciągu 3 sekund, gdy partner jest wolny.",
  ],
  "cb-carry": [
    "Gdy nikt Cię nie atakuje, wprowadź piłkę 10 metrów do przodu.",
    "Prowadź piłkę na rywala i podaj, gdy on ruszy do Ciebie.",
  ],
  "cb-step-out": [
    "Wychodź do rywala między liniami tylko wtedy, gdy partner Cię asekuruje.",
    "Gdy rywal stoi tyłem do bramki, doskocz blisko i nie pozwól mu się obrócić.",
  ],
  "fb-inverted": [
    "Gdy skrzydłowy stoi szeroko, zejdź bliżej środka i zabierz ze sobą rywala.",
    "Przed podaniem od stopera sprawdź, czy rywal idzie za Tobą.",
  ],
  "fb-2v1": [
    "Przy dwóch rywalach przy linii cofaj się bokiem i zamykaj podanie do środka.",
    "Nie doskakuj od razu: czekaj, aż partner wróci i będzie dwóch na dwóch.",
  ],
  "six-pivot": [
    "Ustaw się tak, żeby stoper widział Cię między dwoma rywalami.",
    "Zanim dostaniesz piłkę, spójrz, gdzie stoi rywal za Twoimi plecami.",
  ],
  "six-screen": [
    "Gdy rywal ma piłkę z boku, stań między nim a rywalem za Twoimi plecami.",
    "Co kilka sekund sprawdź, kto stoi za Tobą przed Twoimi stoperami.",
  ],
  "six-switch": [
    "Gdy po jednej stronie jest tłok, zagraj na drugą stronę w 2 kontaktach.",
    "Przed przyjęciem spójrz na drugą stronę boiska.",
  ],
  "eight-third-man": [
    "Gdy rywal kryje Cię z tyłu, zrób krok do piłki i odejdź za jego plecy.",
    "Po odegraniu od razu ruszaj w nowe miejsce do przodu.",
  ],
  "eight-box": [
    "Przy dośrodkowaniu wbiegaj w pole karne później niż napastnik.",
    "Przy akcji skrzydłem stań na skraju pola karnego na zgranie do tyłu.",
  ],
  "ten-turn": [
    "Zanim dostaniesz piłkę między liniami, sprawdź, czy rywal stoi za Tobą.",
    "Gdy nikt Cię nie naciska, przyjmij piłkę przodem do bramki rywala.",
  ],
  "ten-press": [
    "Doskakuj do stopera tak, żeby szóstka rywala była za Twoimi plecami.",
    "Biegnij do piłki po łuku i zamykaj podanie do środka.",
  ],
  "wing-press": [
    "Doskakuj do stopera po łuku od strony linii bocznej.",
    "Gdy stoper podaje do bocznego obrońcy, doskocz do niego od razu.",
  ],
  "nine-press": [
    "Doskakuj do stopera po łuku, żeby nie mógł podać do drugiego stopera.",
    "Po pierwszym doskoku wróć zasłonić szóstkę rywala.",
  ],
  "nine-depth": [
    "Stój na linii ostatniego obrońcy i ruszaj w chwili podania.",
    "Gdy obrońcy stoją wysoko, raz w akcji wbiegnij za ich plecy.",
  ],
  "third-player": [
    "Po podaniu od razu ruszaj w nowe miejsce, żeby dostać piłkę od trzeciego zawodnika.",
    SCAN,
  ],
  "overload-switch": [
    "Gdy po jednej stronie jest tłok, przenieś grę na drugą stronę w najwyżej 2 podaniach.",
    SCAN,
  ],
  "press-cover": [
    "Zanim doskoczysz do rywala, sprawdź, czy partner stoi za Tobą.",
    "Doskakuj po łuku, tak żeby zasłonić podanie do środka.",
  ],
};

const topicKey = (def: JourneyDefinition) =>
  def.topicId.startsWith("iqs-") ? def.topicId.slice(4) : (def.concept ?? "");

export function pickFieldTask(
  def: JourneyDefinition,
  finish: "goal" | "miss" | "offside" | "stopped" | undefined,
  previous: FieldTask | null,
  now = new Date(),
): FieldTask {
  const list = fieldTasks[topicKey(def)] ?? [SCAN];
  const pool = finish === "offside" ? [OFFSIDE, ...list] : list;
  // Rotate within the topic so a repeated lesson gives a new task.
  const lastIndex = previous ? pool.indexOf(previous.text) : -1;
  const text = pool[(lastIndex + 1) % pool.length];
  return {
    id: `${def.topicId}:${pool.indexOf(text)}`,
    text,
    topicId: def.topicId,
    createdAt: now.toISOString(),
  };
}

const storageKey = (owner: string) => `ballwise:iq:field-task:v1:${owner}`;
type Store = Pick<Storage, "getItem" | "setItem">;

export function loadFieldTask(
  owner: string | undefined,
  storage: Pick<Storage, "getItem"> = localStorage,
): FieldTask | null {
  if (!owner) return null;
  try {
    const raw = storage.getItem(storageKey(owner));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<FieldTask>;
    return typeof v.text === "string" &&
      typeof v.id === "string" &&
      typeof v.topicId === "string" &&
      typeof v.createdAt === "string"
      ? (v as FieldTask)
      : null;
  } catch {
    return null;
  }
}
export function saveFieldTask(
  owner: string | undefined,
  task: FieldTask,
  storage: Store = localStorage,
) {
  if (!owner) return;
  try {
    storage.setItem(storageKey(owner), JSON.stringify(task));
  } catch {
    /* Storage full or blocked: the task still shows on the result screen. */
  }
}
export function completeFieldTask(owner: string | undefined, storage: Store = localStorage) {
  const task = loadFieldTask(owner, storage);
  if (task) saveFieldTask(owner, { ...task, done: true }, storage);
}
/** The open task for the Start screen, or null when none or already done. */
export function openFieldTask(
  owner: string | undefined,
  storage: Pick<Storage, "getItem"> = localStorage,
) {
  const task = loadFieldTask(owner, storage);
  return task && !task.done ? task : null;
}
