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
