import {afterEach,describe,it,expect,vi} from "vitest";
import {generatePlanAsync} from "./asyncPlan";
import type {Profile} from "./types";
const p={} as Profile;
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe("plan worker lifecycle",()=>{
 it("returns a worker result and terminates the worker",async()=>{
  const terminate=vi.fn();
  vi.stubGlobal("Worker",class {
   onmessage:((e:{data:unknown})=>void)|null=null;
   terminate=terminate;
   postMessage(){queueMicrotask(()=>this.onmessage?.({data:{plan:[]}}));}
  });
  await expect(generatePlanAsync(p)).resolves.toEqual([]);expect(terminate).toHaveBeenCalledOnce();
 });
 it("rejects on worker failure and cleans up",async()=>{
  const terminate=vi.fn();
  vi.stubGlobal("Worker",class {
   onerror:(()=>void)|null=null;terminate=terminate;
   postMessage(){queueMicrotask(()=>this.onerror?.());}
  });
  await expect(generatePlanAsync(p)).rejects.toThrow();expect(terminate).toHaveBeenCalledOnce();
 });
 it("terminates a stalled worker after the timeout",async()=>{
  vi.useFakeTimers();const terminate=vi.fn();
  vi.stubGlobal("Worker",class {terminate=terminate;postMessage(){}});
  const result=expect(generatePlanAsync(p)).rejects.toThrow("zbyt długo");
  await vi.advanceTimersByTimeAsync(15000);await result;expect(terminate).toHaveBeenCalledOnce();
 });
});
