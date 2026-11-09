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

const SPACE = "Gdy partner ma piłkę, stań w wolnym miejscu między dwoma rywalami.";
const OFFSIDE =
  "W chwili podania do przodu bądź najdalej na linii przedostatniego rywala, potem ruszaj.";

/** Tactical tasks per topic: where and when to move against the rival shape.
 * No body details (head, hips, scanning): only position, timing and space.
 * Situation topics use their key, older lessons their concept. */
export const fieldTasks: Record<string, string[]> = {
  counter: [
    "W kontrze biegnij do przodu w wolny pas, którego nie pilnuje żaden obrońca.",
    "W przewadze w kontrze ustaw się szeroko, żeby obrońca musiał wybrać jednego z was.",
  ],
  "gk-build": [
    "Przy wznowieniu od bramkarza stań szeroko, poza zasięgiem najbliższego napastnika.",
    "Gdy napastnik rywala doskakuje do bramkarza, przesuń się w miejsce, które on opuścił.",
  ],
  cross: [
    "Przy dośrodkowaniu wbiegaj w strefę, której żaden obrońca nie zamyka.",
    "Gdy partner atakuje bliższy słupek, Ty zajmij punkt karny albo dalszy słupek.",
  ],
  "counter-press": [
    "Po stracie blisko piłki, z partnerami obok, zamknij najbliższe podanie do przodu.",
    "Po stracie skróć odległość do partnerów, żeby rywal z piłką był otoczony.",
  ],
  "low-block": [
    "Przeciw niskiej obronie ustaw się między liniami rywala, w strefie bez krycia.",
    "Gdy rywal broni środka, przenieś grę na stronę, na której jest mniej obrońców.",
  ],
  "wide-1v1": [
    "Atakuj 1 na 1 chętniej, gdy obrońca nie ma blisko asekuracji.",
    "Gdy obrońca ma asekurację, oddaj piłkę i wbiegnij w miejsce za nim.",
  ],
  "defend-centre": [
    "Gdy rywal ma piłkę przed polem karnym, stań między nim a środkiem bramki.",
    "Nie łam linii obrony: cofaj się i wychodź razem z partnerami.",
  ],
  "hold-up": [
    "Tyłem do bramki odegraj do partnera, który stoi przodem do gry.",
    "Po odegraniu wbiegnij w lukę między obrońcami, którą zostawił Twój obrońca.",
  ],
  "fullback-overlap": [
    "Gdy skrzydłowy schodzi do środka, wbiegnij w wolny pas przy linii za nim.",
    "Obiegaj tylko wtedy, gdy za Tobą zostaje partner, który zabezpieczy stratę.",
  ],
  "gk-switch": [
    "Gdy rywal naciska jedną stroną, wyprowadź piłkę na drugą stronę boiska.",
    "Graj krótko tylko do partnera, który ma wolną drogę do przodu.",
  ],
  "gk-sweep": [
    "Gdy Twoja obrona stoi wysoko, stań kilka metrów przed bramką.",
    "Przy wysokiej linii obrony asekuruj przestrzeń za plecami obrońców.",
  ],
  "gk-counter": [
    "Po złapaniu piłki wznów grę do partnera na stronie, gdzie rywale nie wrócili.",
    "Gdy wszyscy rywale są blisko piłki, zagraj na wolną stronę boiska.",
  ],
  "cb-carry": [
    "Gdy nikt Cię nie atakuje, wprowadź piłkę do przodu, aż rywal do Ciebie ruszy.",
    "Gdy rywal ruszy do Ciebie, podaj do partnera, którego wcześniej krył.",
  ],
  "cb-step-out": [
    "Wychodź do rywala między liniami tylko wtedy, gdy partner zajmie Twoje miejsce.",
    "Gdy nikt Cię nie asekuruje, trzymaj linię obrony i zamknij podanie za plecy.",
  ],
  "fb-inverted": [
    "Gdy skrzydłowy stoi szeroko, zejdź bliżej środka i zabierz ze sobą rywala.",
    "Zostań szeroko, gdy w środku nie ma wolnego miejsca.",
  ],
  "fb-2v1": [
    "Przy dwóch rywalach przy linii cofaj się i zamykaj podanie do środka.",
    "Nie doskakuj od razu: opóźniaj, aż wróci partner i będzie dwóch na dwóch.",
  ],
  "six-pivot": [
    "Ustaw się między dwoma napastnikami rywala, w linii podania od stopera.",
    "Gdy rywal stoi za Tobą, odejdź w bok i zrób miejsce na podanie do przodu.",
  ],
  "six-screen": [
    "Gdy rywal ma piłkę z boku, stań w linii podania do rywala za Twoimi plecami.",
    "Trzymaj się przed stoperami, w strefie między nimi a pomocnikami rywala.",
  ],
  "six-switch": [
    "Gdy po jednej stronie jest tłok, zagraj na drugą stronę w 2 podaniach.",
    "Ustaw się tak, żeby mieć wolną linię podania na obie strony boiska.",
  ],
  "eight-third-man": [
    "Gdy rywal kryje Cię z bliska, odejdź za jego plecy i zwolnij miejsce dla partnera.",
    "Po podaniu wbiegnij w wolne miejsce do przodu, zanim rywale się przesuną.",
  ],
  "eight-box": [
    "Przy dośrodkowaniu wbiegaj w pole karne później niż napastnik, w wolną strefę.",
    "Przy akcji skrzydłem stań na skraju pola karnego na podanie do tyłu.",
  ],
  "ten-turn": [
    "Stań między pomocnikami a obrońcami rywala, w strefie, której nikt nie kryje.",
    "Gdy rywal stoi tuż za Tobą, odegraj do partnera przodem do gry.",
  ],
  "ten-press": [
    "Doskakuj do stopera tak, żeby szóstka rywala była za Twoimi plecami.",
    "Biegnij do piłki po łuku i zamykaj podanie do środka.",
  ],
  "wing-press": [
    "Doskakuj do stopera od strony linii bocznej, żeby nie mógł podać na skrzydło.",
    "Gdy stoper poda do bocznego obrońcy, od razu doskocz do niego.",
  ],
  "nine-press": [
    "Doskakuj do stopera po łuku, żeby nie mógł podać do drugiego stopera.",
    "Po pierwszym doskoku wróć zasłonić szóstkę rywala.",
  ],
  "nine-depth": [
    "W chwili podania bądź najdalej na linii przedostatniego rywala i ruszaj za obrońców.",
    "Gdy obrońcy stoją wysoko, raz w akcji wbiegnij za ich plecy.",
  ],
  "gk-middle": [
    "Gdy napastnicy rywala wychodzą do stoperów, zagraj do szóstki między nimi.",
    "Przed podaniem sprawdź, który partner stoi za pierwszą linią pressingu.",
  ],
  "gk-channel": [
    "Gdy rywal może zagrać w kanał między stoperem a bocznym, wyjdź przed bramkę w stronę tego kanału.",
    "Przy wysokiej linii obrony stań tak, by zdążyć do podania za plecy obrońców.",
  ],
  "cb-cover": [
    "Gdy boczny obrońca doskakuje do skrzydłowego, przesuń się w stronę jego miejsca za nim.",
    "Asekurując partnera, stój między nim a bramką, nie w jednej linii z nim.",
  ],
  "six-cover": [
    "Gdy stoper wychodzi do rywala, zajmij jego miejsce w linii obrony.",
    "Po wyjściu stopera zamknij podanie do napastnika za jego plecami.",
  ],
  "cb-delay": [
    "Sam przeciw dwóm: cofaj się i zamykaj podanie do drugiego rywala, nie doskakuj.",
    "Opóźniaj kontrę, aż wróci partner i będzie dwóch na dwóch.",
  ],
  "six-delay": [
    "Po stracie, gdy jesteś blisko rywala z piłką, doskocz od razu i zamknij mu drogę do przodu.",
    "Gdy jesteś dalej od piłki, cofaj się i zamknij podanie do napastnika rywala.",
  ],
  "wing-behind": [
    "Gdy boczny obrońca wychodzi do Ciebie, wbiegnij za jego plecy w chwili podania.",
    "Startuj z linii przedostatniego rywala, żeby nie być na spalonym.",
  ],
  "ten-behind": [
    "Gdy napastnik ściąga stoperów, wbiegnij w lukę za nimi z drugiej linii.",
    "Ruszaj w chwili podania, z linii przedostatniego rywala.",
  ],
  "third-player": [
    "Po podaniu od razu ruszaj w nowe wolne miejsce, żeby dostać piłkę od trzeciego.",
    SPACE,
  ],
  "overload-switch": [
    "Gdy po jednej stronie jest tłok, przenieś grę na drugą stronę w najwyżej 2 podaniach.",
    SPACE,
  ],
  "press-cover": [
    "Doskakuj do rywala tylko wtedy, gdy partner stoi za Tobą jako asekuracja.",
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
  const list = fieldTasks[topicKey(def)] ?? [SPACE];
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

export const fieldTaskKey = (owner: string) => `ballwise:iq:field-task:v1:${owner}`;
const storageKey = fieldTaskKey;
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
