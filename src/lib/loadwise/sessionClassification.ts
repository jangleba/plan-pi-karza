import type {
  ExerciseItem,
  Intensity,
  SessionCategory,
  SessionClassification,
  SessionDay,
  SessionGeneratedBy,
  SessionLoadLevel,
  SessionSubcategory,
} from "./types";

/**
 * ──────────────────────────────────────────────────────────────────────────
 * CENTRALNY SYSTEM KLASYFIKACJI TRENINGÓW LOADWISE
 * ──────────────────────────────────────────────────────────────────────────
 * Jedyne źródło prawdy: czym jest dana sesja. Wszystkie reguły (2 siłownie,
 * wydolność, szybkość, klub, mecz) muszą korzystać z tych helperów, a nie ze
 * skanowania nazw/tagów w różnych miejscach kodu.
 *
 * Każda sesja wygenerowana przez silnik MUSI przejść przez
 * normalizeSessionCategory() zanim trafi do planu.
 */

// ───────────────────────────── Tekst sesji ─────────────────────────────

function exercisesText(session: SessionDay): string {
  const fromSections = session.sections
    ? [
        ...(session.sections.warmup ?? []),
        ...(session.sections.main ?? []),
        ...(session.sections.accessory ?? []),
        ...(session.sections.footballTransfer ?? []),
        ...(session.sections.cooldown ?? []),
      ]
    : [];
  const fromExercises: ExerciseItem[] = session.exercises ?? [];
  const all = fromSections.length ? fromSections : fromExercises;
  return all
    .map((e) => `${e.name ?? ""} ${e.prescription ?? ""} ${e.cue ?? ""}`)
    .join(" ");
}

/** Tekst nagłówka — tytuł, typ, cel. Najpewniejsze do klasyfikacji. */
function headerText(session: SessionDay): string {
  // Nie używamy goalLabel: etykieta celu profilu (np. "Siła i stabilność" albo
  // "Mobilność / prehab") fałszywie klasyfikowała każdą sesję przez pryzmat
  // celu, a nie realnej treści dnia.
  return `${session.title ?? ""} ${session.sessionType ?? ""} ${session.goalOfSession ?? ""}`.toLowerCase();
}

function fullText(session: SessionDay): string {
  return `${headerText(session)} ${exercisesText(session)}`.toLowerCase();
}

const has = (text: string, re: RegExp): boolean => re.test(text);

// ───────────────────────────── Detektory słów kluczowych ─────────────────────────────

const RE_STRENGTH =
  /(?<!wy)sił|moc|power|strength|przysiad|squat|martwy|deadlift|trap[\s-]?bar|rdl|hinge|split squat|goblet|hip thrust|wyciskan|wiosł|podciąg|nordic|hypertroph|hipertrof|podtrzyman/i;

const RE_ENDURANCE =
  /wytrzym|wydol|tlen|aerob|kondyc|tempo|interwa|interval|zone\s*2|strefa\s*2|easy run|lekki bieg|ciągły bieg|recovery run|rower|bike|basen|pool|low[\s-]?impact|repeated tempo|rsa|powtarzan.{0,12}sprint|bieg /i;

const RE_SPEED =
  /sprint|szybko|prędko|przyspiesz|akcelerac|accelerat|first step|pierwszy krok|max(?:ymaln)?.{0,6}(?:prędko|velocity)|max velocity|flying|lotne|mechanik.{0,6}bieg|sprint mechanics|hamowan|deceler|braking|zmian.{0,6}kierunk|change of direction|\bcod\b|zwinno|agility/i;

const RE_ACCELERATION =
  /akcelerac|accelerat|przyspiesz|first step|pierwszy krok|start/i;
const RE_MAX_VELOCITY =
  /max(?:ymaln)?.{0,6}(?:prędko|velocity)|max velocity|flying|lotne|prędkość maksymaln/i;
const RE_DECELERATION = /hamowan|deceler|braking|wytraca/i;
const RE_COD =
  /zmian.{0,6}kierunk|change of direction|\bcod\b|zwinno|agility|cut |zwrot/i;

const RE_RECOVERY = /regener|recovery|roztrenowan|odnow|chłodzen|cooldown/i;
const RE_PREHAB = /prehab|stabiliz|robust|odporno|copenhagen|nordic|przywodzic/i;
const RE_MOBILITY = /mobiln|mobility|rozciągan|stretch|zakres ruchu|rom/i;
const RE_BALL = /piłk|technik|finishing|dryblin|podani|przyjęci|scanning|ball/i;

const RE_SPEED_FOCUS_CLUB =
  /sprint|szybko|prędko|przyspiesz|akcelerac|max velocity|high[\s-]?speed|wysok.{0,8}prędko|cod|zmian.{0,6}kierunk|change of direction/i;

const RE_HEAVY_LEGS =
  /przysiad|squat|martwy|deadlift|trap[\s-]?bar|rdl|hinge|split squat|wykrok|lunge|hip thrust|nordic/i;

const RE_HIGH_IMPACT_RUN =
  /sprint|max velocity|flying|interwa|interval|rsa|powtarzan.{0,12}sprint|skok|jump|plyo|plyometr/i;

// ───────────────────────────── Klasyfikacja kategorii ─────────────────────────────

interface CategoryResult {
  category: SessionCategory;
  subcategory: SessionSubcategory;
  sourceRule: string;
}

function classifyEndurance(text: string): SessionSubcategory {
  if (has(text, /recovery run|bieg regener/)) return "recovery_run";
  if (has(text, /rower|bike/)) return "bike_conditioning";
  if (has(text, /basen|pool/)) return "pool_conditioning";
  if (has(text, /low[\s-]?impact|niskoudarow/)) return "low_impact_conditioning";
  if (has(text, /zone\s*2|strefa\s*2/)) return "zone2_aerobic";
  if (has(text, /repeated tempo|powtarzan.{0,8}tempo/)) return "repeated_tempo";
  if (has(text, /aerob.{0,8}interwa|aerobic interval|tlenow.{0,8}interwa/))
    return "aerobic_intervals";
  if (has(text, /extensive|ekstensywn|interwa|interval/))
    return "extensive_intervals";
  if (has(text, /tempo/)) return "tempo_aerobic";
  if (has(text, /short|krótk.{0,8}aerob/)) return "short_aerobic_block";
  if (has(text, /easy run|lekki bieg|jog/)) return "easy_run";
  return "easy_run";
}

function classifySpeed(text: string): SessionSubcategory {
  if (has(text, RE_COD)) return "change_of_direction";
  if (has(text, RE_DECELERATION)) return "deceleration";
  if (has(text, RE_MAX_VELOCITY)) return "max_velocity";
  if (has(text, /flying|lotne/)) return "flying_sprints";
  if (has(text, /mechanik|mechanics/)) return "sprint_mechanics";
  if (has(text, /first step|pierwszy krok/)) return "first_step";
  if (has(text, /agility|zwinno/)) return "agility_speed";
  if (has(text, RE_ACCELERATION)) return "acceleration";
  return "acceleration";
}

function classifyGym(text: string): SessionSubcategory {
  if (has(text, /masa ciała|masą ciała|bodyweight|bez sprzętu|kalisten|z ciężarem ciała/))
    return "bodyweight_strength";
  if (has(text, /full body|całe ciało|full-body/)) return "full_body_strength";
  if (has(text, /moc|power/)) return "power_maintenance";
  if (has(text, /podtrzyman|maintenance/)) return "strength_maintenance";
  if (has(text, /górn|upper|wyciskan|wiosł|podciąg|press|pull/))
    return "upper_strength";
  return "lower_strength";
}

/**
 * Rdzeń klasyfikacji — zwraca kategorię, podkategorię i regułę, która
 * zadecydowała. Kolejność reguł jest istotna (np. dzień meczowy wygrywa).
 */
function resolveCategory(session: SessionDay): CategoryResult {
  // 1) Typ dnia ma najwyższy priorytet dla mecz / klub / wolne.
  if (session.dayType === "match") {
    return { category: "match", subcategory: "match", sourceRule: "dayType=match" };
  }
  if (session.dayType === "rest") {
    return { category: "rest", subcategory: "rest", sourceRule: "dayType=rest" };
  }

  const text = fullText(session);
  const header = headerText(session);
  // Wąski sygnał: sesja JAWNIE oznaczona jako siłownia w tytule/typie (np.
  // "Siła / moc na siłowni"). Chroni przed błędną klasyfikacją jako prehab, gdy
  // opis zawiera słowa typu "stabilizacja" — ale NIE reklasyfikuje zwykłego
  // prehabu/prewencji.
  const strengthTitle = /na siłowni|siła\s*\/\s*moc/i.test(
    `${session.title ?? ""} ${session.sessionType ?? ""}`,
  );

  if (session.dayType === "club") {
    // Klub domyślnie = club. NIE liczy się jako endurance ani speed,
    // chyba że jest WYRAŹNIE oznaczony jako speed-focused.
    if (has(header, RE_SPEED_FOCUS_CLUB)) {
      return {
        category: "club",
        subcategory: "club_speed_focus",
        sourceRule: "club + speed-focused tag",
      };
    }
    return {
      category: "club",
      subcategory: "club_general",
      sourceRule: "dayType=club (default general)",
    };
  }

  // 2) Mecz / klub wykryty z nagłówka (sesje bez dayType, np. dodane ręcznie).
  if (has(header, /\bmecz\b|\bmatch\b/)) {
    return { category: "match", subcategory: "match", sourceRule: "header=match" };
  }
  if (has(header, /trening klubow|\bklub\b|team training/)) {
    if (has(header, RE_SPEED_FOCUS_CLUB)) {
      return {
        category: "club",
        subcategory: "club_speed_focus",
        sourceRule: "header=club + speed-focused",
      };
    }
    return {
      category: "club",
      subcategory: "club_general",
      sourceRule: "header=club",
    };
  }

  // 3) Regeneracja / prehab / mobilność — NIE liczą się jako pełna siłownia.
  //    Sprawdzamy zanim spojrzymy na słowa siłowe (prehab ma ćwiczenia siłowe).
  if (session.dayType === "recovery" || has(header, RE_RECOVERY)) {
    return {
      category: "recovery_prehab",
      subcategory: "recovery",
      sourceRule: "recovery day/header",
    };
  }
  if (has(header, RE_PREHAB) && !strengthTitle) {
    return {
      category: "recovery_prehab",
      subcategory: "prehab",
      sourceRule: "header=prehab",
    };
  }
  if (has(header, RE_MOBILITY) && !has(header, RE_STRENGTH)) {
    return {
      category: "mobility",
      subcategory: "mobility",
      sourceRule: "header=mobility",
    };
  }

  // 4) Szybkość — sprawdzamy przed siłą (sprinty bywają w "mocy"), ale po
  //    wyraźnej siłowni. Najpierw nagłówek.
  if (has(header, RE_SPEED)) {
    return {
      category: "speed_sprint",
      subcategory: classifySpeed(header),
      sourceRule: "header=speed",
    };
  }

  // 5) Siłownia.
  if (has(header, RE_STRENGTH)) {
    return {
      category: "gym_strength",
      subcategory: classifyGym(header),
      sourceRule: "header=strength",
    };
  }

  // 6) Wydolność.
  if (has(header, RE_ENDURANCE)) {
    return {
      category: "endurance_conditioning",
      subcategory: classifyEndurance(header),
      sourceRule: "header=endurance",
    };
  }

  // 7) Piłka / technika.
  if (has(header, RE_BALL)) {
    return {
      category: "other",
      subcategory: "ball_technical",
      sourceRule: "header=ball",
    };
  }

  // 8) Fallback po pełnym tekście (ćwiczenia).
  if (has(text, RE_SPEED)) {
    return {
      category: "speed_sprint",
      subcategory: classifySpeed(text),
      sourceRule: "text=speed",
    };
  }
  if (has(text, RE_STRENGTH)) {
    return {
      category: "gym_strength",
      subcategory: classifyGym(text),
      sourceRule: "text=strength",
    };
  }
  if (has(text, RE_ENDURANCE)) {
    return {
      category: "endurance_conditioning",
      subcategory: classifyEndurance(text),
      sourceRule: "text=endurance",
    };
  }
  if (has(text, RE_MOBILITY) || has(text, RE_PREHAB)) {
    return {
      category: "recovery_prehab",
      subcategory: "prehab",
      sourceRule: "text=prehab/mobility",
    };
  }
  if (has(text, RE_BALL)) {
    return {
      category: "other",
      subcategory: "ball_technical",
      sourceRule: "text=ball",
    };
  }

  return { category: "other", subcategory: "unknown", sourceRule: "fallback" };
}

// ───────────────────────────── Load level ─────────────────────────────

function deriveLoadLevel(
  session: SessionDay,
  category: SessionCategory,
): SessionLoadLevel {
  if (category === "rest") return "none";
  if (category === "recovery_prehab" || category === "mobility") return "low";
  if (category === "match") return "high";
  const intensity = session.intensity ?? "umiarkowana";
  if (intensity === "wysoka") return "high";
  if (intensity === "umiarkowana") return "moderate";
  return "low";
}

// ───────────────────────────── Główny normalizator ─────────────────────────────

export function classifySession(session: SessionDay): SessionClassification {
  const { category, subcategory, sourceRule } = resolveCategory(session);
  const text = fullText(session);
  const intensity: Intensity = session.intensity ?? "umiarkowana";
  const loadLevel = deriveLoadLevel(session, category);
  const durationMinutes = session.durationMin ?? 0;

  const isClub = category === "club";
  const isMatch = category === "match";
  const isGym = category === "gym_strength";
  const isEndurance = category === "endurance_conditioning";
  const isSpeed = category === "speed_sprint";
  const isRecovery =
    category === "recovery_prehab" && subcategory === "recovery";
  const isPrehab = category === "recovery_prehab" && subcategory === "prehab";
  const isMobility = category === "mobility";

  // Klub liczy się jako speed TYLKO gdy wyraźnie speed-focused.
  const clubIsSpeedFocused = subcategory === "club_speed_focus";

  const isAcceleration =
    (isSpeed && subcategory === "acceleration") ||
    (isSpeed && has(text, RE_ACCELERATION) && subcategory !== "deceleration");
  const isDeceleration =
    isSpeed && (subcategory === "deceleration" || subcategory === "braking");
  const isMaxVelocity =
    isSpeed && (subcategory === "max_velocity" || subcategory === "flying_sprints");
  const isChangeOfDirection =
    isSpeed && (subcategory === "change_of_direction" || subcategory === "agility_speed");

  const isHeavyLegs =
    isGym &&
    intensity !== "niska" &&
    (subcategory === "lower_strength" ||
      subcategory === "full_body_strength" ||
      subcategory === "power_maintenance" ||
      has(text, RE_HEAVY_LEGS));

  const isHighImpactRunning =
    (isSpeed || isEndurance || isClub) &&
    intensity !== "niska" &&
    has(text, RE_HIGH_IMPACT_RUN) &&
    !isMobility &&
    !isRecovery;

  // countsAs* — reguły biznesowe silnika.
  const countsAsClub = isClub;
  const countsAsMatch = isMatch;
  const countsAsStrength = isGym; // prehab/mobility/recovery NIE liczą się jako siłownia
  const countsAsEndurance = isEndurance; // klub NIE liczy się automatycznie
  const countsAsSpeed = isSpeed || (isClub && clubIsSpeedFocused);

  const tags = buildTags({
    category,
    subcategory,
    isHeavyLegs,
    isHighImpactRunning,
    isMaxVelocity,
    isAcceleration,
    isDeceleration,
    isChangeOfDirection,
    clubIsSpeedFocused,
  });

  // Sesja jako druga jednostka dnia — tylko lekkie/wspomagające.
  const canBeSecondSession =
    category === "recovery_prehab" ||
    category === "mobility" ||
    (category === "other" && subcategory === "ball_technical") ||
    (isEndurance && intensity === "niska") ||
    (isClub && clubIsSpeedFocused === false ? false : false) ||
    (isSpeed && intensity === "niska");

  const generatedBy: SessionGeneratedBy =
    session.classification?.generatedBy ??
    (session.dayType === "club"
      ? "club_external"
      : session.dayType === "match"
        ? "match_external"
        : "engine");

  return {
    category,
    subcategory,
    intensity,
    loadLevel,
    durationMinutes,
    tags,
    countsAsStrength,
    countsAsEndurance,
    countsAsSpeed,
    countsAsClub,
    countsAsMatch,
    isGym,
    isClubSession: isClub,
    isEndurance,
    isSpeed,
    isMatch,
    isRecovery,
    isPrehab,
    isMobility,
    isHeavyLegs,
    isHighImpactRunning,
    isMaxVelocity,
    isAcceleration,
    isDeceleration,
    isChangeOfDirection,
    canBeSecondSession,
    generatedBy,
    placementReason: session.classification?.placementReason ?? session.whyToday ?? "",
    sourceRule,
    repairTag: session.classification?.repairTag,
  };
}

function buildTags(input: {
  category: SessionCategory;
  subcategory: SessionSubcategory;
  isHeavyLegs: boolean;
  isHighImpactRunning: boolean;
  isMaxVelocity: boolean;
  isAcceleration: boolean;
  isDeceleration: boolean;
  isChangeOfDirection: boolean;
  clubIsSpeedFocused: boolean;
}): string[] {
  const tags = new Set<string>();
  tags.add(input.category);
  tags.add(input.subcategory);
  if (input.isHeavyLegs) tags.add("heavy_legs");
  if (input.isHighImpactRunning) tags.add("high_impact_running");
  if (input.isMaxVelocity) tags.add("max_velocity");
  if (input.isAcceleration) tags.add("acceleration");
  if (input.isDeceleration) tags.add("deceleration");
  if (input.isChangeOfDirection) tags.add("change_of_direction");
  if (input.clubIsSpeedFocused) tags.add("club_speed_focus");
  return [...tags];
}

/**
 * Wzbogaca sesję o znormalizowaną klasyfikację i ujednolica legacy pola
 * (isClubSession / isRecoveryOrPrehab). Wywoływać przed zapisem do planu.
 */
export function normalizeSessionCategory(session: SessionDay): SessionDay {
  const classification = classifySession(session);
  const normalized: SessionDay = {
    ...session,
    classification,
    isClubSession: classification.isClubSession,
    isRecoveryOrPrehab:
      classification.isRecovery ||
      classification.isPrehab ||
      classification.isMobility,
  };
  if (session.secondSession) {
    normalized.secondSession = normalizeSessionCategory(session.secondSession);
  }
  return normalized;
}

// ───────────────────────────── Helpery (źródło prawdy) ─────────────────────────────

function classOf(session: SessionDay): SessionClassification {
  return session.classification ?? classifySession(session);
}

export function isStrengthSession(session: SessionDay): boolean {
  return classOf(session).countsAsStrength;
}

/** Pełna, główna siłownia — liczy się do limitu 2 siłowni tygodniowo. */
export function isMainGymSession(session: SessionDay): boolean {
  const c = classOf(session);
  return c.isGym && !c.isPrehab && !c.isMobility && !c.isRecovery;
}

export function isEnduranceSession(session: SessionDay): boolean {
  return classOf(session).countsAsEndurance;
}

export function isSpeedSession(session: SessionDay): boolean {
  return classOf(session).countsAsSpeed;
}

export function isClubSession(session: SessionDay): boolean {
  return classOf(session).countsAsClub;
}

export function isMatchSession(session: SessionDay): boolean {
  return classOf(session).countsAsMatch;
}

export function isRecoverySession(session: SessionDay): boolean {
  const c = classOf(session);
  return c.isRecovery || c.isPrehab || c.isMobility;
}

export function isHeavyLegsSession(session: SessionDay): boolean {
  return classOf(session).isHeavyLegs;
}

export function isHeavyRunningSession(session: SessionDay): boolean {
  return classOf(session).isHighImpactRunning;
}

export function isAccelerationSession(session: SessionDay): boolean {
  return classOf(session).isAcceleration;
}

export function isDecelerationSession(session: SessionDay): boolean {
  return classOf(session).isDeceleration;
}

export function isMaxVelocitySession(session: SessionDay): boolean {
  return classOf(session).isMaxVelocity;
}

export function isChangeOfDirectionSession(session: SessionDay): boolean {
  return classOf(session).isChangeOfDirection;
}

export function getSessionLoad(session: SessionDay): SessionLoadLevel {
  return classOf(session).loadLevel;
}
