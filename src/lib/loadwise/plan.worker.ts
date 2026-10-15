import { generatePlan } from "./planEngine";
import type { Profile } from "./types";
self.onmessage = (event: MessageEvent<{profile:Profile;date:string;days:number;week:number}>) => {
  try {const p=event.data;self.postMessage({plan:generatePlan(p.profile,new Date(p.date),p.days,p.week)});}
  catch (error) {self.postMessage({error:error instanceof Error ? error.message:String(error)});}
};
