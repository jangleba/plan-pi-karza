import type { TrainingExercise } from "@/lib/loadwise/types";

export interface AnimationCatalogEntry {
  id: string;
  title: string;
  sourceUrl?: string;
}

export interface AnimationSelection extends AnimationCatalogEntry {
  notes?: string[];
  choices?: Array<{ id: string; title: string }>;
  /** More than one session rhythm is present, or a legacy name is ambiguous. */
  needsChoice?: boolean;
}

/** Animation identities only. Source identity does not certify reconstructed technique. */
export const ANIMATION_CATALOG: readonly AnimationCatalogEntry[] = [
  {
    "id": "a_skip",
    "title": "Skip A",
    "sourceUrl": "https://lran.org.uk/technique-drills-2"
  },
  {
    "id": "b_skip",
    "title": "Skip B",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=15"
  },
  {
    "id": "c_skip",
    "title": "Skip C",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf"
  },
  {
    "id": "d_skip",
    "title": "Skip D",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf"
  },
  {
    "id": "a_march",
    "title": "Marsz A",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf"
  },
  {
    "id": "review:a_skip:gather",
    "title": "Skip A — z dostawieniem nóg",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf"
  },
  {
    "id": "review:a_skip:extra_bounce",
    "title": "Skip A — z przejściem (dodatkowe odbicie)",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf"
  },
  {
    "id": "review:a_skip:continuous",
    "title": "Skip A — ciągły",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf"
  },
  {
    "id": "review:b_skip:gather",
    "title": "Skip B — z dostawieniem nóg",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=15"
  },
  {
    "id": "review:b_skip:extra_bounce",
    "title": "Skip B — z przejściem (dodatkowe odbicie)",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=15"
  },
  {
    "id": "review:b_skip:continuous",
    "title": "Skip B — ciągły",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=15"
  },
  {
    "id": "review:c_skip:gather",
    "title": "Skip C — z dostawieniem nóg",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf"
  },
  {
    "id": "review:c_skip:extra_bounce",
    "title": "Skip C — z przejściem (dodatkowe odbicie)",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf"
  },
  {
    "id": "review:c_skip:continuous",
    "title": "Skip C — ciągły",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf"
  },
  {
    "id": "review:d_skip:gather",
    "title": "Skip D — z dostawieniem nóg",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf"
  },
  {
    "id": "review:d_skip:extra_bounce",
    "title": "Skip D — z przejściem (dodatkowe odbicie)",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf"
  },
  {
    "id": "review:d_skip:continuous",
    "title": "Skip D — ciągły",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf"
  },
  {
    "id": "a_skip_add_step",
    "title": "Skip A z add-step",
    "sourceUrl": "https://coachtube.com/course/track-and-field/sprint-drills-chris-parno/18363570"
  },
  {
    "id": "a_skip_no_add_step",
    "title": "Skip A bez add-step",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf"
  },
  {
    "id": "switch_skip_a",
    "title": "Switch → Skip A",
    "sourceUrl": "https://www.sportsmith.co/articles/applying-the-sprint-mechanics-assessment-score-s-mas-as-a-framework-to-address-hamstring-injuries-in-elite-football/"
  },
  {
    "id": "double_switch_skip_a",
    "title": "Double switch → Skip A",
    "sourceUrl": "https://www.sportsmith.co/articles/applying-the-sprint-mechanics-assessment-score-s-mas-as-a-framework-to-address-hamstring-injuries-in-elite-football/"
  },
  {
    "id": "skip_a_to_d",
    "title": "Skip A → Skip D",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf"
  },
  {
    "id": "skip_b_alternate_bounds",
    "title": "Skip B → wieloskok naprzemienny",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf"
  },
  {
    "id": "a_accent",
    "title": "A-accent",
    "sourceUrl": "https://ygsp.co.uk/your-gym-sports-performance/free-sc-resources/exercsie-library/"
  },
  {
    "id": "c_accent",
    "title": "C-accent",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf"
  },
  {
    "id": "power_skip_height",
    "title": "Power skip na wysokość",
    "sourceUrl": "https://www.dvidshub.net/video/642016/power-skip-height"
  },
  {
    "id": "power_skip_distance",
    "title": "Power skip na odległość",
    "sourceUrl": "https://www.dvidshub.net/video/642014/power-skip-distance"
  },
  {
    "id": "a_switch_progression",
    "title": "Zmiany A: pojedyncza → podwójna → potrójna",
    "sourceUrl": "https://www.sportsmith.co/articles/applying-the-sprint-mechanics-assessment-score-s-mas-as-a-framework-to-address-hamstring-injuries-in-elite-football/"
  },
  {
    "id": "wall_march",
    "title": "Marsz przy ścianie",
    "sourceUrl": "https://athletics.squarespace.com/coaching-education/three-great-acceleration-drills-loren-landows-drill-progression"
  },
  {
    "id": "wall_single_switch",
    "title": "Pojedyncza zmiana przy ścianie",
    "sourceUrl": "https://gaa-pathway-resources.com/articles/athletic-development/dave-hare-functional-training/sprint-mechanics-dave-hare"
  },
  {
    "id": "wall_double_switch",
    "title": "Podwójna zmiana przy ścianie",
    "sourceUrl": "https://gaa-pathway-resources.com/articles/athletic-development/dave-hare-functional-training/sprint-mechanics-dave-hare"
  },
  {
    "id": "wall_triple_switch",
    "title": "Potrójna zmiana przy ścianie",
    "sourceUrl": "https://gaa-pathway-resources.com/articles/athletic-development/dave-hare-functional-training/sprint-mechanics-dave-hare"
  },
  {
    "id": "ankling",
    "title": "Ankling",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=16"
  },
  {
    "id": "low_dribble",
    "title": "Niski dribble",
    "sourceUrl": "https://www.sportsmith.co/articles/applying-the-sprint-mechanics-assessment-score-s-mas-as-a-framework-to-address-hamstring-injuries-in-elite-football/"
  },
  {
    "id": "high_dribble",
    "title": "Wysoki dribble",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=17"
  },
  {
    "id": "dribble_to_sprint_transition",
    "title": "Przejście z dribblingu do sprintu",
    "sourceUrl": "https://simplifaster.com/articles/microdosing-speed-in-season-team-sports/"
  },
  {
    "id": "alternate_leg_bounds",
    "title": "Wieloskok naprzemienny",
    "sourceUrl": "https://blog.overtimeathletes.com/fix-you-sprint-3-best-drills-for-linear-speed/"
  },
  {
    "id": "scissor_exchange_jump",
    "title": "Naprzemienny skok nożycowy z wymianą",
    "sourceUrl": "https://www.sportsmith.co/articles/applying-the-sprint-mechanics-assessment-score-s-mas-as-a-framework-to-address-hamstring-injuries-in-elite-football/"
  },
  {
    "id": "straight_leg_run_bound",
    "title": "Bieg z prostą nogą / bound",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=14"
  },
  {
    "id": "scissor_bounds",
    "title": "Naprzemienne wyskoki nożycowe",
    "sourceUrl": "https://www.sportsmith.co/articles/applying-the-sprint-mechanics-assessment-score-s-mas-as-a-framework-to-address-hamstring-injuries-in-elite-football/"
  },
  {
    "id": "bilateral_pogo",
    "title": "Pogo obunóż",
    "sourceUrl": "https://theprehabguys.com/vimeo-video/pogos-in-place-2/"
  },
  {
    "id": "lateral_pogo",
    "title": "Pogo boczne",
    "sourceUrl": "https://theprehabguys.com/vimeo-video/pogos-frontal/"
  },
  {
    "id": "snap_down",
    "title": "Lądowanie snap-down",
    "sourceUrl": "https://theprehabguys.com/vimeo-video/snap-down/"
  },
  {
    "id": "lateral_bound_to_stick",
    "title": "Skok boczny z zatrzymaniem",
    "sourceUrl": "https://vimeo.com/883311543"
  },
  {
    "id": "single_leg_hops",
    "title": "Podskoki jednonóż — element starszego zestawu",
    "sourceUrl": "https://ucalgary.ca/shred-injuries/all-sports/ice-hockey/single-leg-hops"
  },
  {
    "id": "broad_jump",
    "title": "Skok w dal z miejsca — element starszego zestawu",
    "sourceUrl": "https://theprehabguys.com/vimeo-video/broad-jump-2/"
  },
  {
    "id": "acceleration_mechanics",
    "title": "Mechanika przyspieszenia",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=9"
  },
  {
    "id": "max_velocity_high_volume",
    "title": "Prędkość maksymalna — wysoka objętość",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=12"
  },
  {
    "id": "falling_start",
    "title": "Start z upadku",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=9"
  },
  {
    "id": "split_stance_start",
    "title": "Start z pozycji wykrocznej",
    "sourceUrl": "https://drivelinebaseball.com/blogs/blog/off-season-speed-training-for-position-players-part-2-acceleration"
  },
  {
    "id": "push_up_start",
    "title": "Start z podporu",
    "sourceUrl": "https://www.dvidshub.net/video/641015/push-up-start"
  },
  {
    "id": "half_kneeling_start",
    "title": "Start z półklęku",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=10"
  },
  {
    "id": "lateral_start_acceleration",
    "title": "Start boczny do przyspieszenia",
    "sourceUrl": "https://brucebolt.us/blogs/news/be-better-training-hack-improve-your-60"
  },
  {
    "id": "crossover_start_acceleration",
    "title": "Start skrzyżny do przyspieszenia",
    "sourceUrl": "https://brucebolt.us/blogs/news/be-better-training-hack-improve-your-60"
  },
  {
    "id": "turn_and_go_start",
    "title": "Start obróć się i biegnij"
  },
  {
    "id": "app_audio_reaction_start",
    "title": "Start reakcyjny na sygnał audio aplikacji",
    "sourceUrl": "https://www.dvidshub.net/video/641015/push-up-start"
  },
  {
    "id": "free_acceleration_sprint",
    "title": "Swobodny sprint akceleracyjny",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=8"
  },
  {
    "id": "progressive_build_up_sprint",
    "title": "Progresywny bieg narastający",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=12"
  },
  {
    "id": "flying_sprint",
    "title": "Sprint lotny",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=12"
  },
  {
    "id": "upright_football_sprint",
    "title": "Piłkarski sprint wyprostowany 30–40 m",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=11"
  },
  {
    "id": "fast_relaxed_fast_run",
    "title": "Kontrolowany bieg szybko–luźno–szybko",
    "sourceUrl": "https://coachathletics.com.au/coaching-education/sprinting-physical-preparation"
  },
  {
    "id": "football_curved_sprint",
    "title": "Piłkarski sprint po łuku",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=19"
  },
  {
    "id": "reactive_curved_sprint",
    "title": "Reaktywny sprint po łuku lewo/prawo",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=19"
  },
  {
    "id": "resisted_sled_acceleration",
    "title": "Przyspieszenie z oporem sań",
    "sourceUrl": "https://athletics.squarespace.com/coaching-education/three-great-acceleration-drills-loren-landows-drill-progression"
  },
  {
    "id": "progressive_run_three_step_stop",
    "title": "Progresywny bieg i zatrzymanie w trzech krokach",
    "sourceUrl": "https://simplifaster.com/articles/microdosing-speed-in-season-team-sports/"
  },
  {
    "id": "run_two_step_stop",
    "title": "Bieg i zatrzymanie w dwóch krokach",
    "sourceUrl": "https://simplifaster.com/articles/microdosing-speed-in-season-team-sports/"
  },
  {
    "id": "progressive_deceleration_5_10_15",
    "title": "Progresywne hamowanie 5 → 10 → 15 m",
    "sourceUrl": "https://www.rugbyspeedcoach.com/post/speed-hack-12-master-this-skill-to-change-direction-explosively"
  },
  {
    "id": "accel_decel_reaccel",
    "title": "Przyspieszenie–hamowanie–ponowne przyspieszenie",
    "sourceUrl": "https://ucalgary.ca/shred-injuries/all-sports/soccer/quick-start-and-stops"
  },
  {
    "id": "deceleration_lateral_exit",
    "title": "Hamowanie z wyjściem bocznym",
    "sourceUrl": "https://ucalgary.ca/shred-injuries/all-sports/soccer/partner-plant-and-cut"
  },
  {
    "id": "planned_cut",
    "title": "Zaplanowane cięcie",
    "sourceUrl": "https://www.nsca.com/education/videos/deceleration-change-of-direction-and-reacceleration/"
  },
  {
    "id": "planned_505",
    "title": "Zaplanowany test 5-0-5",
    "sourceUrl": "https://www.dashrsystems.com/drills/505-agility/"
  },
  {
    "id": "cut_and_reaccelerate",
    "title": "Cięcie i ponowne przyspieszenie",
    "sourceUrl": "https://ucalgary.ca/shred-injuries/all-sports/soccer/partner-plant-and-cut"
  },
  {
    "id": "app_audio_forward_left_right",
    "title": "Sygnał audio aplikacji: przód/lewo/prawo",
    "sourceUrl": "https://ucalgary.ca/shred-injuries/all-sports/soccer/quick-start-and-stops"
  },
  {
    "id": "app_visual_colour_cue_cod",
    "title": "Zmiana kierunku na sygnał wizualny/kolor",
    "sourceUrl": "https://ucalgary.ca/shred-injuries/all-sports/soccer/partner-plant-and-cut"
  },
  {
    "id": "reactive_180_turn",
    "title": "Reaktywny obrót 180°",
    "sourceUrl": "https://www.dashrsystems.com/drills/505-agility/"
  },
  {
    "id": "sprint_ramp_warmup",
    "title": "Przygotowanie RAMP do sprintu",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=13"
  },
  {
    "id": "bwprep:walk",
    "title": "Lekki trucht",
    "sourceUrl": "https://ucalgary.ca/shred-injuries/all-sports/soccer/forward-runbackward-run"
  },
  {
    "id": "bwprep:ankle",
    "title": "Kolano nad stopę",
    "sourceUrl": "https://theprehabguys.com/vimeo-video/ankle-dorsiflexion-mobilization-static/"
  },
  {
    "id": "bwprep:adductor",
    "title": "Cofanie bioder w podparciu",
    "sourceUrl": "https://www.physitrack.com/exercise-library/how-to-perform-the-adductor-rockback-exercise"
  },
  {
    "id": "bwprep:march",
    "title": "Marsz z uniesieniem kolana",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=15"
  },
  {
    "id": "bwprep:run",
    "title": "Bieg narastająco",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=9"
  },
  {
    "id": "legacy:6",
    "title": "Ankling + niskie dribbles",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=16"
  },
  {
    "id": "legacy:8",
    "title": "Pogo jumps + snap down",
    "sourceUrl": "https://theprehabguys.com/vimeo-video/pogos-in-place-2/"
  },
  {
    "id": "legacy:11",
    "title": "Single-leg hops + broad jump",
    "sourceUrl": "https://theprehabguys.com/vimeo-video/broad-jump-2/"
  },
  {
    "id": "legacy:12",
    "title": "Technika biegu (skip A/B, akcent)",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf"
  },
  {
    "id": "legacy:14",
    "title": "Starty z różnych pozycji (split / lateral / push-up start)",
    "sourceUrl": "https://drivelinebaseball.com/blogs/blog/off-season-speed-training-for-position-players-part-2-acceleration"
  },
  {
    "id": "legacy:15",
    "title": "Falling start + split stance start",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf#page=9"
  },
  {
    "id": "legacy:16",
    "title": "Dynamiczna rozgrzewka biegowa + A-skip/B-skip",
    "sourceUrl": "https://www.athleticsireland.ie/wp-content/uploads/2024/10/AAI-Coach_Sprints_Manual.pdf"
  }
];

const EXTRA_NAME_ALIASES: Readonly<Record<string, string>> = {
  "Mechanika przyspieszenia": "acceleration_mechanics",
  "Mechanika akceleracji (niska objętość)": "acceleration_mechanics",
  "Prędkość maksymalna — wysoka objętość": "max_velocity_high_volume",
  "Max velocity — wysoka objętość": "max_velocity_high_volume",
  "Skip A z add-step": "a_skip_add_step",
  "A skip with add step": "a_skip_add_step",
  "Skip A bez add-step": "a_skip_no_add_step",
  "A skip without add step": "a_skip_no_add_step",
  "Switch → Skip A": "switch_skip_a",
  "Switch to A skip": "switch_skip_a",
  "Double switch → Skip A": "double_switch_skip_a",
  "Double switch to A skip": "double_switch_skip_a",
  "Skip A → Skip D": "skip_a_to_d",
  "A skip to D skip": "skip_a_to_d",
  "Skip B → wieloskok naprzemienny": "skip_b_alternate_bounds",
  "B skip to alternate-leg bounds": "skip_b_alternate_bounds",
  "A-accent": "a_accent",
  "A accent": "a_accent",
  "C-accent": "c_accent",
  "C accent": "c_accent",
  "Wieloskok naprzemienny": "alternate_leg_bounds",
  "Alternate-leg bounds": "alternate_leg_bounds",
  "Power skip na wysokość": "power_skip_height",
  "Power skip for height": "power_skip_height",
  "Power skip na odległość": "power_skip_distance",
  "Power skip for distance": "power_skip_distance",
  "Naprzemienny skok nożycowy z wymianą": "scissor_exchange_jump",
  "Alternating scissor exchange jump": "scissor_exchange_jump",
  "Przygotowanie RAMP do sprintu": "sprint_ramp_warmup",
  "Sprint RAMP warm-up": "sprint_ramp_warmup",
  "Marsz A": "a_march",
  "A march": "a_march",
  "Skip A": "a_skip",
  "A skip": "a_skip",
  "Skip C": "c_skip",
  "C skip": "c_skip",
  "Skip B": "b_skip",
  "B skip": "b_skip",
  "Skip D": "d_skip",
  "D skip": "d_skip",
  "Ankling": "ankling",
  "Niski dribble": "low_dribble",
  "Low dribble": "low_dribble",
  "Wysoki dribble": "high_dribble",
  "High dribble": "high_dribble",
  "Bieg z prostą nogą / bound": "straight_leg_run_bound",
  "Straight-leg run/bound": "straight_leg_run_bound",
  "Marsz przy ścianie": "wall_march",
  "Wall march": "wall_march",
  "Pojedyncza zmiana przy ścianie": "wall_single_switch",
  "Wall single switch": "wall_single_switch",
  "Podwójna zmiana przy ścianie": "wall_double_switch",
  "Wall double switch": "wall_double_switch",
  "Potrójna zmiana przy ścianie": "wall_triple_switch",
  "Wall triple switch": "wall_triple_switch",
  "Przejście z dribblingu do sprintu": "dribble_to_sprint_transition",
  "Dribble-to-sprint transition": "dribble_to_sprint_transition",
  "Start z upadku": "falling_start",
  "Falling start": "falling_start",
  "Start z pozycji wykrocznej": "split_stance_start",
  "Split-stance start": "split_stance_start",
  "Start z podporu": "push_up_start",
  "Push-up start": "push_up_start",
  "Start z półklęku": "half_kneeling_start",
  "Half-kneeling start": "half_kneeling_start",
  "Start boczny do przyspieszenia": "lateral_start_acceleration",
  "Lateral start into acceleration": "lateral_start_acceleration",
  "Start skrzyżny do przyspieszenia": "crossover_start_acceleration",
  "Crossover start into acceleration": "crossover_start_acceleration",
  "Start obróć się i biegnij": "turn_and_go_start",
  "Turn-and-go start": "turn_and_go_start",
  "Start reakcyjny na sygnał audio aplikacji": "app_audio_reaction_start",
  "App audio-cue reaction start": "app_audio_reaction_start",
  "Swobodny sprint akceleracyjny": "free_acceleration_sprint",
  "Free acceleration sprint": "free_acceleration_sprint",
  "Progresywny bieg narastający": "progressive_build_up_sprint",
  "Progressive build-up sprint": "progressive_build_up_sprint",
  "Sprint lotny": "flying_sprint",
  "Flying sprint": "flying_sprint",
  "Piłkarski sprint wyprostowany 30–40 m": "upright_football_sprint",
  "Upright 30–40 m football sprint": "upright_football_sprint",
  "Kontrolowany bieg szybko–luźno–szybko": "fast_relaxed_fast_run",
  "Controlled fast–relaxed–fast run": "fast_relaxed_fast_run",
  "Piłkarski sprint po łuku": "football_curved_sprint",
  "Football curved sprint": "football_curved_sprint",
  "Reaktywny sprint po łuku lewo/prawo": "reactive_curved_sprint",
  "Reactive left/right curved sprint": "reactive_curved_sprint",
  "Progresywny bieg i zatrzymanie w trzech krokach": "progressive_run_three_step_stop",
  "Progressive run-to-three-step stop": "progressive_run_three_step_stop",
  "Bieg i zatrzymanie w dwóch krokach": "run_two_step_stop",
  "Run-to-two-step stop": "run_two_step_stop",
  "Progresywne hamowanie 5 → 10 → 15 m": "progressive_deceleration_5_10_15",
  "Progressive 5 m → 10 m → 15 m deceleration": "progressive_deceleration_5_10_15",
  "Przyspieszenie–hamowanie–ponowne przyspieszenie": "accel_decel_reaccel",
  "Acceleration–deceleration–reacceleration": "accel_decel_reaccel",
  "Hamowanie z wyjściem bocznym": "deceleration_lateral_exit",
  "Deceleration into lateral exit": "deceleration_lateral_exit",
  "Zaplanowane cięcie": "planned_cut",
  "Planned cut": "planned_cut",
  "Zaplanowany test 5-0-5": "planned_505",
  "Planned 5-0-5": "planned_505",
  "Cięcie i ponowne przyspieszenie": "cut_and_reaccelerate",
  "Cut-and-reaccelerate": "cut_and_reaccelerate",
  "Sygnał audio aplikacji: przód/lewo/prawo": "app_audio_forward_left_right",
  "App audio cue: forward/left/right": "app_audio_forward_left_right",
  "Zmiana kierunku na sygnał wizualny/kolor": "app_visual_colour_cue_cod",
  "App visual or colour cue change of direction": "app_visual_colour_cue_cod",
  "Reaktywny obrót 180°": "reactive_180_turn",
  "Reactive 180° turn": "reactive_180_turn",
  "Zmiany A: pojedyncza → podwójna → potrójna": "a_switch_progression",
  "A-switch single/double/triple": "a_switch_progression",
  "Naprzemienne wyskoki nożycowe": "scissor_bounds",
  "Scissor bounds": "scissor_bounds",
  "Przyspieszenie z oporem sań": "resisted_sled_acceleration",
  "Resisted sled acceleration": "resisted_sled_acceleration",
  "Pogo obunóż": "bilateral_pogo",
  "Bilateral pogo": "bilateral_pogo",
  "Pogo boczne": "lateral_pogo",
  "Lateral pogo": "lateral_pogo",
  "Lądowanie snap-down": "snap_down",
  "Snap-down / niskie pogo": "snap_down",
  "Skok boczny z zatrzymaniem": "lateral_bound_to_stick",
  "Lateral bound to stick": "lateral_bound_to_stick",
  "Sprint A-Skip": "a_skip",
  "Sprint B-Skip": "b_skip",
  "Sprint C-Skip": "c_skip",
  "Sprint D-Skip": "d_skip",
  "Narastające przebieżki (build-up)": "progressive_build_up_sprint",
  "Ankling + niskie dribbles": "legacy:6",
  "Wall drill — single switch": "wall_single_switch",
  "Pogo jumps + snap down": "legacy:8",
  "Niskie pogo jumps": "bilateral_pogo",
  "Bounds (wieloskoki) — niska objętość": "alternate_leg_bounds",
  "Single-leg hops + broad jump": "legacy:11",
  "Technika biegu (skip A/B, akcent)": "legacy:12",
  "Luźne przebieżki techniczne": "progressive_build_up_sprint",
  "Starty z różnych pozycji (split / lateral / push-up start)": "legacy:14",
  "Falling start + split stance start": "legacy:15",
  "Dynamiczna rozgrzewka biegowa + A-skip/B-skip": "legacy:16"
};

function normalise(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKD").replace(/\p{Diacritic}/gu, "")
    .replace(/ł/g, "l").replace(/Ł/g, "L").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

const byId = new Map(ANIMATION_CATALOG.map(entry => [entry.id, entry]));
const byName = new Map<string, string>();
for (const entry of ANIMATION_CATALOG) byName.set(normalise(entry.title), entry.id);
for (const [name, id] of Object.entries(EXTRA_NAME_ALIASES)) byName.set(normalise(name), id);
for (const letter of ["a", "b", "c", "d"]) {
  const base = `${letter}_skip`;
  for (const name of [`skip ${letter}`, `${letter} skip`, `sprint ${letter} skip`, `sprint skip ${letter}`]) {
    byName.set(name, base);
    for (const [suffix, rhythm] of [
      ["z dostawieniem", "gather"], ["z dostawieniem nog", "gather"],
      ["z przejsciem", "extra_bounce"], ["z dodatkowym odbiciem", "extra_bounce"],
      ["ciagly", "continuous"], ["bez przejscia", "continuous"],
      ["bez dodatkowego odbicia", "continuous"],
    ]) byName.set(`${name} ${suffix}`, `review:${base}:${rhythm}`);
  }
}

const VISUAL_ALIASES: Readonly<Record<string, string>> = {
  sprint_a_skip: "a_skip", sprint_b_skip: "b_skip", sprint_c_skip: "c_skip", sprint_d_skip: "d_skip",
};
const LEGACY_ID_ALIASES: Readonly<Record<string, string>> = {
  "legacy:1": "a_skip", "legacy:2": "b_skip", "legacy:3": "c_skip", "legacy:4": "d_skip",
  "legacy:5": "progressive_build_up_sprint", "legacy:7": "wall_single_switch",
  "legacy:9": "bilateral_pogo", "legacy:10": "alternate_leg_bounds",
  "legacy:13": "progressive_build_up_sprint",
};

function knownId(value: string | undefined): string | null {
  const id = value?.trim().toLowerCase();
  if (!id) return null;
  return byId.has(id) ? id : LEGACY_ID_ALIASES[id] ?? null;
}

function visualId(value: string | undefined): string | null {
  const exact = knownId(value);
  if (exact) return exact;
  const id = value?.trim().toLowerCase().replace(/_\d+$/, "");
  // Broad drawings such as bounds/max_velocity_sprint/change_of_direction
  // serve multiple movements and cannot establish the exercise identity.
  return id ? VISUAL_ALIASES[id] ?? null : null;
}

function namedId(name: string): string | null {
  const clean = normalise(name);
  const exact = byName.get(clean);
  if (exact) return exact;
  // Legacy saved rows may append a series number, which identifies neither
  // the exercise's rhythm nor its prescribed speed.
  const simpleSkip = /^(?:sprint )?(?:skip ([abcd])|([abcd]) skip)(?: seria \d+)?$/.exec(clean);
  return simpleSkip ? `${simpleSkip[1] ?? simpleSkip[2]}_skip` : null;
}

type SkipRhythm = "gather" | "extra_bounce" | "continuous";
const RHYTHMS: readonly SkipRhythm[] = ["gather", "extra_bounce", "continuous"];

/** Read explicit rhythm words, excluding their negated forms before matching. */
function rhythmsIn(value: string | undefined): SkipRhythm[] {
  const text = normalise(value);
  const result = new Set<SkipRhythm>();
  if (/\b(?:ciagl\w*|continuous)\b|bez (?:przejscia|dodatkowego odbicia|add step|dostaw\w*)/.test(text)) result.add("continuous");
  const positive = text.replace(/bez (?:przejscia|dodatkowego odbicia|add step|dostaw\w*)/g, " ");
  if (/\bdostaw\w*\b|\bgather\b|obie stopy pod/.test(positive)) result.add("gather");
  if (/\bz przejsciem\b|\bextra bounce\b|dodatkow\w* (?:odbic\w*|kontakt\w*)|(?:krotki|jeden niski sztywny) kontakt na nodze podporowej/.test(positive)) result.add("extra_bounce");
  return RHYTHMS.filter(rhythm => result.has(rhythm));
}

type VariantExercise = TrainingExercise & {
  /** Optional forward-compatible field; old saved rows need no migration. */
  animationVariant?: string;
  variant?: string;
  speedVariant?: string;
  direction?: string;
  radius?: string | number;
};

function fromEntry(id: string): AnimationSelection | null {
  const entry = byId.get(id);
  return entry ? { ...entry } : null;
}

function skipSelection(id: string, exercise: VariantExercise): AnimationSelection | null {
  // A dedicated rhythm card is already unambiguous and must retain its ID.
  if (id.startsWith("review:")) return fromEntry(id);
  const base = /^[abcd]_skip$/.test(id) ? id : id === "a_skip_add_step" || id === "a_skip_no_add_step" ? "a_skip" : null;
  if (!base) return fromEntry(id);

  const variant = normalise(exercise.animationVariant ?? exercise.variant ?? exercise.speedVariant);
  const explicitVariant = variant === "gather" ? ["gather" as const]
    : variant === "extra bounce" ? ["extra_bounce" as const]
    : variant === "continuous" ? ["continuous" as const] : rhythmsIn(variant);
  // The name and displayed dose express the selected session. Full generic
  // technique paragraphs often describe every variant, so they come later.
  let rhythms = [...new Set([...explicitVariant, ...rhythmsIn(exercise.name), ...rhythmsIn(exercise.displayPrescription)])];
  if (!rhythms.length) {
    const steps = exercise.instructionSteps?.map(step => [step.title, step.description].filter(Boolean).join(" ")).join(" ");
    rhythms = rhythmsIn(steps);
  }
  if (!rhythms.length) {
    rhythms = rhythmsIn([exercise.cue, exercise.technique].filter(Boolean).join(" "));
  }
  if (!rhythms.length && id === "a_skip_no_add_step") rhythms = ["continuous"];
  if (!rhythms.length && (id === "a_skip_add_step" || variant === "step in")) rhythms = ["gather", "extra_bounce"];
  if (!rhythms.length) return fromEntry(id);
  if (rhythms.length === 1) return fromEntry(`review:${base}:${rhythms[0]}`);

  const entry = fromEntry(id)!;
  return {
    ...entry,
    needsChoice: true,
    choices: RHYTHMS.filter(rhythm => rhythms.includes(rhythm)).map(rhythm => {
      const item = byId.get(`review:${base}:${rhythm}`)!;
      return { id: item.id, title: item.title };
    }),
    notes: ["Wybierz rytm wykonywany w tej części sesji. Dostawienie oznacza obie stopy pod biodrami; przejście oznacza dodatkowe odbicie na tej samej nodze."],
  };
}

function selectedAnimation(id: string, exercise: VariantExercise): AnimationSelection | null {
  const entry = fromEntry(id);
  if (!entry) return null;
  if (id === "straight_leg_run_bound") return {
    ...entry,
    needsChoice: true,
    choices: [
      { id: "straight_leg_run_bound:run", title: "Bieg z prawie prostymi nogami" },
      { id: "straight_leg_run_bound:bound", title: "Odbicia z prawie prostymi nogami" },
    ],
    notes: ["Nazwa łączy dwa różne ruchy. Wybierz odmianę opisaną w tej części sesji."],
  };
  if (id === "football_curved_sprint" || id === "reactive_curved_sprint") return {
    ...entry,
    needsChoice: true,
    choices: [{ id, title: "Schemat kroku i toru łuku" }],
    notes: ["Podgląd pokazuje krok z boku i tor łuku. Nie odtwarza pełnego przechylenia ciała do środka łuku; promień i kierunek wynikają z sesji."],
  };
  if (id === "planned_cut") {
    const hasSpecificVariant = Boolean(exercise.animationVariant || exercise.variant || exercise.speedVariant
      || exercise.direction || exercise.radius !== undefined);
    const selected = normalise([
      exercise.animationVariant, exercise.variant, exercise.speedVariant,
      exercise.direction, exercise.radius, exercise.name, exercise.displayPrescription,
    ].filter(value => value !== undefined && value !== "").join(" "));
    if (hasSpecificVariant || /\b(?:45|90|135|180|left|right|lewo|prawo|lewy|prawy|wide|medium|narrow|radius|promien|szeroki|waski)\b/.test(selected)) return {
      ...entry,
      needsChoice: true,
      choices: [{ id, title: "Ogólny schemat ustawienia przy cięciu" }],
      notes: ["Schemat szczegółu ustawienia; kąt i kierunek wykonania są opisane w sesji."],
    };
  }
  return skipSelection(id, exercise);
}

/** Resolve a specific animation; unknown movements never receive a sprint fallback. */
export function resolveExerciseAnimation(exercise: TrainingExercise): AnimationSelection | null {
  const exactId = knownId(exercise.exerciseId);
  if (exactId) return selectedAnimation(exactId, exercise);
  // Exact names can disambiguate old shared drawings before visual fallback.
  const named = namedId(exercise.name);
  if (named) return selectedAnimation(named, exercise);
  const visual = visualId(exercise.visualId);
  if (visual) return selectedAnimation(visual, exercise);
  const instance = knownId(exercise.id);
  return instance ? selectedAnimation(instance, exercise) : null;
}
