import { lazy, Suspense, useId, useState, type ReactNode } from "react";
import { ChevronDown, Lightbulb } from "lucide-react";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { resolveDefinitionForExercise } from "@/lib/loadwise/sessionPresentation";
import { resolveQuickGuide } from "@/lib/courseMeasure/quickGuide";
import { getSkipGuide, SKIP_LANDING } from "@/lib/loadwise/skipGuides";
import { getExerciseTechniqueImage } from "@/lib/loadwise/exerciseTechniqueImages";
import { techniqueHint } from "@/lib/trainingCoach/coach";
import { resolveTechniqueLesson } from "@/lib/trainingCoach/biomechanics";
import { TechniqueJointGuide } from "./TechniqueJointGuide";
import { ExerciseAnimationPreview } from "./ExerciseAnimationPreview";
import { resolveExerciseAnimation } from "@/lib/trainingCoach/animationCatalog";
import "./training-coach.css";
import "./sprint-session.css";

const ExerciseCoach = lazy(() => import("./ExerciseCoach").then(module => ({ default: module.ExerciseCoach })));

interface Props {
  exercise: TrainingExercise;
  className?: string;
  compact?: boolean;
  initialExpanded?: boolean;
  showImage?: boolean;
  children?: ReactNode;
}

export function ExerciseQuickGuide(props: Props) {
  return <GuideContent key={`${props.exercise.id}:${props.exercise.exerciseId ?? ""}`} {...props} />;
}

function GuideContent({ exercise, className = "", compact = false, initialExpanded = false, showImage = true, children }: Props) {
  const [open, setOpen] = useState(initialExpanded);
  const [coachOpen, setCoachOpen] = useState(false);
  const panelId = useId();
  const coachId = useId();
  const hint = techniqueHint(exercise);
  const lesson = resolveTechniqueLesson(exercise);
  const skip = getSkipGuide(exercise.exerciseId);
  const guide = resolveQuickGuide(exercise, resolveDefinitionForExercise(exercise));
  const image = skip && showImage && !resolveExerciseAnimation(exercise) ? getExerciseTechniqueImage(skip.exerciseId) : null;
  const reminder = guide.focus ?? lesson?.reminder ?? hint.intent;
  return <section aria-label={`Wskazówki: ${exercise.name}`}
    className={`bw-technique-guide ${skip ? "bw-skip-guide" : ""} ${compact ? "bw-strength-guide" : ""} ${className}`}>
    <div className="bw-technique-heading"><Lightbulb aria-hidden="true" /><span>Wskazówka na teraz</span></div>
    <p className="bw-technique-reminder">{reminder}</p>
    <ExerciseAnimationPreview exercise={exercise} />
    {image && <img src={image.src} alt={image.alt} width={1536} height={1024} loading="lazy" decoding="async" className="bw-skip-image" />}
    {skip && <>
      <ol className="bw-skip-steps">{skip.steps.map(step => <li key={step}>{step}</li>)}</ol>
      <p className="bw-skip-landing">{SKIP_LANDING}</p>
    </>}
    <button type="button" className="bw-technique-trigger" aria-expanded={open} aria-controls={panelId}
      onClick={() => setOpen(value => !value)}>
      {open ? "Zwiń technikę" : lesson ? "Technika i ustawienie stawów" : "Pełna instrukcja ćwiczenia"}<ChevronDown className={open ? "is-open" : ""} aria-hidden="true" />
    </button>
    {open && <div id={panelId} className="bw-technique-panel">
      <TechniqueJointGuide exercise={exercise} />
      <h4>Instrukcja Twojej sesji</h4>
      <dl className="bw-technique-hints">
        {guide.setup && <div><dt>Ustawienie</dt><dd>{guide.setup}</dd></div>}
        <div><dt>Cel ruchu</dt><dd>{hint.intent}</dd></div>
        <div><dt>Wykonanie</dt><dd>{guide.action ?? hint.action}</dd></div>
        <div><dt>Unikaj</dt><dd>{guide.error ?? hint.avoid}</dd></div>
        {exercise.tempo && <div><dt>Tempo z planu</dt><dd>{exercise.tempo}</dd></div>}
      </dl>
      {!skip && Boolean(exercise.instructionSteps?.length) && <ol className="bw-technique-session-steps">
        {exercise.instructionSteps!.map((step, index) => <li key={`${index}:${step.title}`}>{[step.title, step.description].filter(Boolean).join(" — ")}</li>)}
      </ol>}
      {children}
      <button type="button" className="bw-technique-question-trigger" aria-expanded={coachOpen} aria-controls={coachId}
        onClick={() => setCoachOpen(value => !value)}>{coachOpen ? "Zamknij pytania" : "Zapytaj o to ćwiczenie"}</button>
      {coachOpen && <div id={coachId}><Suspense fallback={<p role="status">Otwieram pytania…</p>}>
        <ExerciseCoach exercise={exercise} />
      </Suspense></div>}
    </div>}
  </section>;
}
