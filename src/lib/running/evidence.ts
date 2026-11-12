/**
 * Źródła dawek biegowych. Silnik przypisuje każdej recepturze identyfikatory
 * badań, na których oparto metodę, dawkę i grupę zawodników. Ekran sesji
 * pokazuje tylko, co zrobić; uzasadnienie zostaje w kodzie i raportach.
 */
export type RunningEvidenceId =
  | "helgerud2001"
  | "mcmillan2005"
  | "faude2013"
  | "dupont2004"
  | "buchheit2013a"
  | "buchheit2013b"
  | "buchheit2010rsa"
  | "bishop2011"
  | "taylor2015"
  | "engel2018"
  | "costigan2015"
  | "berthon1997"
  | "foster2001"
  | "seiler2010"
  | "stoggl2014"
  | "robineau2016"
  | "lloyd2012";

export interface RunningEvidence {
  id: RunningEvidenceId;
  citation: string;
  population: string;
  usedFor: string;
}

export const RUNNING_EVIDENCE: Record<RunningEvidenceId, RunningEvidence> = {
  helgerud2001: {
    id: "helgerud2001",
    citation:
      "Helgerud J, Engen LC, Wisløff U, Hoff J. Aerobic endurance training improves soccer performance. Med Sci Sports Exerc. 2001;33(11):1925–1931.",
    population: "Juniorzy elitarni, ok. 18 lat",
    usedFor: "Długie interwały 4 × 4 min przy 90–95% HRmax z 3 min truchtu.",
  },
  mcmillan2005: {
    id: "mcmillan2005",
    citation:
      "McMillan K, Helgerud J, Macdonald R, Hoff J. Physiological adaptations to soccer specific endurance training in professional youth soccer players. Br J Sports Med. 2005;39(5):273–277.",
    population: "Młodzież zawodowa, ok. 16–17 lat",
    usedFor: "Długie interwały 4 × 4 min dwa razy w tygodniu w sezonie.",
  },
  faude2013: {
    id: "faude2013",
    citation:
      "Faude O, Schnittker R, Schulte-Zurhausen R, Müller F, Meyer T. High intensity interval training vs. high-volume running training during pre-season conditioning in high-level youth football. J Sports Sci. 2013;31(13):1441–1450.",
    population: "Juniorzy wysokiego poziomu, ok. 17 lat",
    usedFor: "Interwały o porównywalnym efekcie przy mniejszej objętości niż bieg ciągły.",
  },
  dupont2004: {
    id: "dupont2004",
    citation:
      "Dupont G, Akakpo K, Berthoin S. The effect of in-season, high-intensity interval training in soccer players. J Strength Cond Res. 2004;18(3):584–589.",
    population: "Dorośli zawodnicy w sezonie",
    usedFor: "Krótkie interwały 15 s / 15 s (12–15 powtórzeń) w trakcie sezonu.",
  },
  buchheit2013a: {
    id: "buchheit2013a",
    citation:
      "Buchheit M, Laursen PB. High-intensity interval training, solutions to the programming puzzle. Part I: cardiopulmonary emphasis. Sports Med. 2013;43(5):313–338.",
    population: "Sporty zespołowe i wytrzymałościowe",
    usedFor:
      "Formaty HIIT: długie (2–4 min przy 90–95% vVO2max) i krótkie (10–60 s przy 100–120%).",
  },
  buchheit2013b: {
    id: "buchheit2013b",
    citation:
      "Buchheit M, Laursen PB. High-intensity interval training, solutions to the programming puzzle. Part II: anaerobic energy, neuromuscular load and practical applications. Sports Med. 2013;43(10):927–954.",
    population: "Sporty zespołowe",
    usedFor: "Koszt nerwowo-mięśniowy HIIT i rozmieszczenie względem siły, sprintu i meczu.",
  },
  buchheit2010rsa: {
    id: "buchheit2010rsa",
    citation:
      "Buchheit M, Mendez-Villanueva A, Delhomel G, Brughelli M, Ahmaidi S. Improving repeated sprint ability in young elite soccer players: repeated shuttle sprints vs. explosive strength training. J Strength Cond Res. 2010;24(10):2715–2722.",
    population: "Młodzież elitarna, ok. 14–15 lat",
    usedFor: "RSA: 2–3 serie po 5–6 sprintów 15–20 m z krótką przerwą.",
  },
  bishop2011: {
    id: "bishop2011",
    citation:
      "Bishop D, Girard O, Mendez-Villanueva A. Repeated-sprint ability — part II: recommendations for training. Sports Med. 2011;41(9):741–756.",
    population: "Sporty zespołowe",
    usedFor: "Odróżnienie RSA (niepełna regeneracja) od treningu maksymalnej szybkości.",
  },
  taylor2015: {
    id: "taylor2015",
    citation:
      "Taylor J, Macpherson T, Spears I, Weston M. The effects of repeated-sprint training on field-based fitness measures: a meta-analysis of controlled and non-controlled trials. Sports Med. 2015;45(6):881–891.",
    population: "Sporty zespołowe, różne poziomy",
    usedFor: "Efekt RSA przy krótkich blokach 2–3 serii; objętość jako zmienna progresji.",
  },
  engel2018: {
    id: "engel2018",
    citation:
      "Engel FA, Ackermann A, Chtourou H, Sperlich B. High-intensity interval training performed by young athletes: a systematic review and meta-analysis. Front Physiol. 2018;9:1012.",
    population: "Młodzi sportowcy 9–18 lat",
    usedFor: "HIIT u młodzieży: krótkie dawki skuteczne przy małej objętości.",
  },
  costigan2015: {
    id: "costigan2015",
    citation:
      "Costigan SA, Eather N, Plotnikoff RC, Taaffe DR, Lubans DR. High-intensity interval training for improving health-related fitness in adolescents: a systematic review and meta-analysis. Br J Sports Med. 2015;49(19):1253–1261.",
    population: "Nastolatki",
    usedFor: "Krótki HIIT jako bezpieczna forma pracy tlenowej u młodszych.",
  },
  berthon1997: {
    id: "berthon1997",
    citation:
      "Berthon P, Fellmann N, Bedu M, et al. A 5-min running field test as a measurement of maximal aerobic velocity. Eur J Appl Physiol. 1997;75(3):233–238.",
    population: "Dorośli aktywni",
    usedFor: "Test 5 min jako szacunek MAS; wymaga równego, maksymalnego wysiłku.",
  },
  foster2001: {
    id: "foster2001",
    citation:
      "Foster C, Florhaug JA, Franklin J, et al. A new approach to monitoring exercise training. J Strength Cond Res. 2001;15(1):109–115.",
    population: "Sportowcy, także młodzież",
    usedFor: "Skala RPE CR-10 do prowadzenia intensywności bez pomiaru tempa.",
  },
  seiler2010: {
    id: "seiler2010",
    citation:
      "Seiler S. What is best practice for training intensity and duration distribution in endurance athletes? Int J Sports Physiol Perform. 2010;5(3):276–291.",
    population: "Sportowcy wytrzymałościowi",
    usedFor: "Większość objętości w niskiej intensywności, mocne sesje rzadko i celowo.",
  },
  stoggl2014: {
    id: "stoggl2014",
    citation:
      "Stöggl T, Sperlich B. Polarized training has greater impact on key endurance variables than threshold, high intensity, or high volume training. Front Physiol. 2014;5:33.",
    population: "Sportowcy wytrzymałościowi",
    usedFor: "Łączenie spokojnych biegów z mocnymi interwałami zamiast stałego średniego tempa.",
  },
  robineau2016: {
    id: "robineau2016",
    citation:
      "Robineau J, Babault N, Piscione J, Lacome M, Bigard AX. Specific training effects of concurrent aerobic and strength exercises depend on recovery duration. J Strength Cond Res. 2016;30(3):672–683.",
    population: "Dorośli zawodnicy sportów zespołowych",
    usedFor: "Mocny bieg i siła tego samego dnia tylko lżej; przerwa 24 h ogranicza interferencję.",
  },
  lloyd2012: {
    id: "lloyd2012",
    citation:
      "Lloyd RS, Oliver JL. The Youth Physical Development model: a new approach to long-term athletic development. Strength Cond J. 2012;34(3):61–72.",
    population: "Dzieci i młodzież",
    usedFor: "Dzieci: krótka, zróżnicowana praca; specyficzny trening wydolności później.",
  },
};
