import type { Profile, SessionDay, SessionCompletion } from "./types";
export function profileForPolicyRebuild(profile: Profile, previous: SessionDay[]): Profile {
  const matchDates = previous.filter(d=>d.dayType === "match" || d.secondSession?.dayType === "match").map(d=>d.date);
  return {...profile, matchDates, matchDate:matchDates[0] ?? null, usualMatchDay:"no_fixed_day", weeklyMatches:false};
}
/** Historical prescriptions and completion IDs must survive a policy upgrade. */
export function retainCompletedSessions(fresh: SessionDay[], previous: SessionDay[],
  completions: Record<string, SessionCompletion>, preserveBeforeDate?: string): SessionDay[] {
  const old = new Map(previous.map(day=>[day.date,day]));
  return fresh.map(day=>{
    const saved = old.get(day.date);
    if (!saved) return day;
    const completed = (s: SessionDay | null) => Boolean(s?.dbId && completions[s.dbId]?.completed);
    const history = Boolean(preserveBeforeDate && day.date < preserveBeforeDate);
    const metadata = {generatorVersion:day.generatorVersion,canonicalRevision:day.canonicalRevision,canonicalSchemaVersion:day.canonicalSchemaVersion};
    const keepMain = history || completed(saved);
    const keepSecond = history || completed(saved.secondSession);
    return {...(keepMain ? saved:day),...metadata,
      secondSession:keepSecond && saved.secondSession ? {...saved.secondSession,...metadata}:day.secondSession};
  });
}
