import { useState } from "react";
import type { TrainingExercise } from "@/lib/loadwise/types";
import {
  resolveTechniqueLesson, TECHNIQUE_SOURCES,
  type TechniquePhase, type TechniquePose,
} from "@/lib/trainingCoach/biomechanics";

type Point = readonly [number, number];
interface Pose {
  head: Point; shoulder: Point; hip: Point;
  knee: Point; ankle: Point; backKnee: Point; backAnkle: Point;
}

const standing: Pose = {
  head: [140, 35], shoulder: [140, 62], hip: [140, 124],
  knee: [145, 174], ankle: [140, 224], backKnee: [126, 175], backAnkle: [118, 224],
};

/** Teaching snapshots, not a pose estimator or a prescribed joint-angle target. */
export const TECHNIQUE_POSES: Record<TechniquePose, Pose> = {
  standing,
  "a-position": { ...standing, knee: [198, 124], ankle: [198, 181], backKnee: [140, 174], backAnkle: [140, 224] },
  "a-contact": { ...standing, knee: [148, 175], ankle: [140, 224], backKnee: [112, 160], backAnkle: [92, 197] },
  "b-open": { ...standing, knee: [198, 124], ankle: [238, 168], backKnee: [140, 174], backAnkle: [140, 224] },
  "c-fold": { ...standing, knee: [151, 172], ankle: [113, 139], backKnee: [140, 174], backAnkle: [140, 224] },
  "straight-leg": { ...standing, knee: [173, 165], ankle: [207, 209], backKnee: [115, 172], backAnkle: [88, 220] },
  squat: {
    head: [167, 77], shoulder: [151, 102], hip: [116, 159],
    knee: [181, 165], ankle: [163, 224], backKnee: [161, 163], backAnkle: [143, 224],
  },
  hinge: {
    head: [219, 81], shoulder: [198, 104], hip: [121, 133],
    knee: [140, 178], ankle: [130, 224], backKnee: [123, 176], backAnkle: [111, 224],
  },
  split: {
    head: [139, 69], shoulder: [135, 96], hip: [124, 155],
    knee: [190, 165], ankle: [182, 224], backKnee: [87, 199], backAnkle: [48, 218],
  },
  acceleration: {
    head: [196, 39], shoulder: [180, 64], hip: [145, 122],
    knee: [194, 142], ankle: [166, 187], backKnee: [107, 173], backAnkle: [67, 222],
  },
  upright: {
    head: [148, 35], shoulder: [145, 62], hip: [139, 124],
    knee: [191, 133], ankle: [162, 177], backKnee: [126, 175], backAnkle: [113, 223],
  },
  landing: {
    head: [165, 76], shoulder: [151, 101], hip: [119, 156],
    knee: [174, 175], ankle: [154, 224], backKnee: [151, 172], backAnkle: [132, 224],
  },
};

export function kneeAngle(hip: Point, knee: Point, ankle: Point): number {
  const a = [hip[0] - knee[0], hip[1] - knee[1]];
  const b = [ankle[0] - knee[0], ankle[1] - knee[1]];
  const divisor = Math.hypot(...a) * Math.hypot(...b);
  return divisor ? Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / divisor))) * 180 / Math.PI : 0;
}

function TechniqueDiagram({ phase }: { phase: TechniquePhase }) {
  if (!phase.pose) return null;
  return <figure className="bw-joint-figure">
    <img src={`/technique/animations/snapshots/${phase.pose}.svg`} width={320} height={250}
      loading="lazy" decoding="async" alt={`Anatomiczny kontur: ${phase.title}. Kolano: ${phase.knee}`} />
    <figcaption>Pozycja poglądowa{phase.angleLabel ? ` · ${phase.angleLabel} w tej fazie` : ""}</figcaption>
  </figure>;
}

export function TechniqueJointGuide({ exercise }: { exercise: TrainingExercise }) {
  const lesson = resolveTechniqueLesson(exercise);
  const [selected, setSelected] = useState(0);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  if (!lesson) return null;
  const phase = lesson.phases[Math.min(selected, lesson.phases.length - 1)];
  return <section className="bw-joint-guide" aria-label={`Ustawienie stawów: ${exercise.name}`}>
    <h4>Technika krok po kroku</h4>
    <div className="bw-joint-phases" role="group" aria-label="Faza ruchu">
      {lesson.phases.map((item, index) => <button type="button" key={item.title} aria-pressed={index === selected}
        onClick={() => setSelected(index)}>{index + 1}. {item.title}</button>)}
    </div>
    <TechniqueDiagram phase={phase} />
    <p className="bw-joint-cue">{phase.cue}</p>
    <dl className="bw-joint-notes">
      <div><dt>Kolano</dt><dd>{phase.knee}</dd></div>
      <div><dt>Biodro i tułów</dt><dd>{phase.hip}</dd></div>
      <div><dt>Stopa</dt><dd>{phase.foot}</dd></div>
    </dl>
    <p className="bw-joint-mistake"><strong>Unikaj:</strong> {lesson.mistake}</p>
    <button className="bw-joint-source-trigger" type="button" aria-expanded={sourcesOpen}
      onClick={() => setSourcesOpen(value => !value)}>Jak czytać kąt · źródła</button>
    {sourcesOpen && <div className="bw-joint-sources">
      <p>α to kąt między udem a podudziem na schemacie: 180° oznacza prostą nogę, a 90° kąt prosty.
        W opisie zgięcia stawu prostą nogę często oznacza się jako 0° zgięcia — to inna konwencja.
        Rysunek pokazuje fazę wzorca; zakres, tempo i dawkę wykonuj według swojej sesji.</p>
      {lesson.sources.map(id => <a key={id} href={TECHNIQUE_SOURCES[id].url} target="_blank" rel="noopener noreferrer">{TECHNIQUE_SOURCES[id].title}</a>)}
    </div>}
  </section>;
}
