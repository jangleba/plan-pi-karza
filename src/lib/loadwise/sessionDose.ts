import type { SessionDay } from "./types";
import { structuredToFlat } from "./strengthBlocks";
/** Reduce work quantities; preserve distance per sprint and all rest intervals. */
export function reducePrescription(value: string | undefined, factor: number): string | undefined {
  if (!value || factor >= 1) return value;
  return value.replace(/^(\d+)(?=\s*(?:[×x]|serie|powt|min|s\b))/i,
    n=>String(Math.max(1, Math.floor(Number(n)*factor))));
}
export function reduceSessionDose(session: SessionDay, factor: number): SessionDay {
  if (factor >= 1) return session;
  const flat = (items: SessionDay["sections"]["main"]) => (items ?? []).map(e=>({...e,
    prescription:reducePrescription(e.prescription,factor) ?? e.prescription,
    displayPrescription:reducePrescription(e.displayPrescription,factor),
  }));
  const structuredSections = session.structuredSections?.map(s=>({...s,blocks:s.blocks.map(b=>({...b,
    exercises:b.exercises.map(e=>({...e,
      sets:e.sets?.replace(/^(\d+)/,n=>String(Math.max(1,Math.floor(Number(n)*factor)))),
      duration:!e.sets ? reducePrescription(e.duration,factor):e.duration,
      reps:!e.sets && !e.duration ? reducePrescription(e.reps,factor):e.reps,
      displayPrescription:reducePrescription(e.displayPrescription,factor),
      groundContacts:e.groundContacts ? Math.max(1,Math.floor(e.groundContacts*factor)):e.groundContacts,
    })),
  }))}));
  return {...session,structuredSections,sections:structuredSections?.length ? structuredToFlat(structuredSections):{
    warmup:flat(session.sections.warmup),main:flat(session.sections.main),accessory:flat(session.sections.accessory),
    footballTransfer:flat(session.sections.footballTransfer),cooldown:flat(session.sections.cooldown),
  },exercises:session.exercises ? flat(session.exercises):undefined};
}
