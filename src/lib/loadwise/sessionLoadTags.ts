import type { SessionDay, LoadTag } from "./types";

/** Scheduling categories from actual work; not an injury probability or medical score. */
export function computeLoadTags(session: SessionDay): LoadTag[] {
  const tags = new Set<LoadTag>();
  const t = `${session.sessionType} ${session.title}`.toLowerCase();
  const allText = [
    ...session.sections.warmup,
    ...session.sections.main,
    ...session.sections.accessory,
  ]
    .map((e) => e.name.toLowerCase())
    .join(" | ");

  if (session.dayType === "match") {
    tags.add("neural_high");
    tags.add("lower_body_high");
  } else if (session.dayType === "club") {
    tags.add("neural_high");
  } else if (session.dayType === "recovery" || session.dayType === "rest") {
    tags.add("recovery_low");
  } else if (session.dayType === "md-1") {
    tags.add("technical_low");
  }

  const isGym = /sił|\bmoc(?:y|ą|owy|owa|owe)?\b|power|strength/i.test(t);
  if (isGym && session.intensity !== "niska") {
    tags.add("lower_body_high");
    tags.add("neural_high");
    tags.add("axial_load");
    if (/przysiad|squat|quad/i.test(t + " " + allText)) tags.add("squat_quad_dominant");
    if (/trap bar|hinge|martwy|deadlift|rdl|biodr/i.test(t + " " + allText))
      tags.add("hinge_posterior_chain");
    if (/nordic|rdl|martwy|ghr|razor|ekscentry/i.test(allText)) tags.add("hamstring_eccentric");
    if (/łydk|calf|pogo|wspięci/i.test(allText)) tags.add("calf_achilles_stiffness");
    if (/skok|jump|bound|plyo|pogo|płotk|depth/i.test(allText)) tags.add("plyometric_contacts");
    if (/przywodzic|adduct|copenhagen/i.test(allText)) tags.add("adductor_lateral");
    if (/wiosł|podciąg|wyciskan|ohp|pull|press|biceps|triceps/i.test(allText))
      tags.add("upper_body");
    tags.add("core");
  } else if (/sprint|przyspiesz|akcelerac|szybko/i.test(t)) {
    tags.add("neural_high");
    tags.add("plyometric_contacts");
  } else if (/zwinno|cod|kierunk|agility|hamowan/i.test(t)) {
    tags.add("neural_high");
    tags.add("adductor_lateral");
  } else if (/wytrzym|bieg|aerob|kondyc|endurance/i.test(t)) {
    tags.add(session.intensity === "wysoka" ? "neural_high" : "recovery_low");
  } else if (/prehab|mobiln|stabil/i.test(t)) {
    tags.add("recovery_low");
    tags.add("core");
  }
  return [...tags];
}
