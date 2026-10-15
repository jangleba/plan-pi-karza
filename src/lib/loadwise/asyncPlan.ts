import type { Profile, SessionDay } from "./types";
export async function generatePlanAsync(profile: Profile, date = new Date(), days=28, week=0): Promise<SessionDay[]> {
  if (typeof Worker === "undefined") return (await import("./planEngine")).generatePlan(profile,date,days,week);
  return new Promise((resolve,reject)=>{
    let worker: Worker;
    try {worker = new Worker(new URL("./plan.worker.ts",import.meta.url),{type:"module"});}
    catch {void import("./planEngine").then(m=>resolve(m.generatePlan(profile,date,days,week))).catch(reject);return;}
    const timer = setTimeout(()=>{worker.terminate();reject(new Error("Przeliczanie planu trwa zbyt długo. Spróbuj ponownie."));},15000);
    const cleanup = () => {clearTimeout(timer);worker.terminate();};
    worker.onmessage = event=>{cleanup();if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.plan);};
    worker.onerror = () => {cleanup();reject(new Error("Nie udało się przeliczyć planu."));};
    worker.onmessageerror = () => {cleanup();reject(new Error("Nieprawidłowa odpowiedź silnika planu."));};
    try {
    worker.postMessage({profile,date:date.toISOString(),days,week});
    } catch (error) {cleanup();reject(error);}
  });
}
