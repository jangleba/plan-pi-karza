import {describe,it,expect} from "vitest";
import {profileForPolicyRebuild,retainCompletedSessions} from "./retainCompletedSessions";
import type {Profile,SessionDay} from "./types";
const day=(date:string,dbId:string,patch:Partial<SessionDay>={})=>({date,dbId,title:dbId,dayType:"training",generatorVersion:"new",secondSession:null,...patch} as SessionDay);
describe("policy upgrades preserve history and calendar",()=>{
 it("retains completed first and second session identities",()=>{
  const old=day("2026-10-15","first",{secondSession:day("2026-10-15","second")});
  const result=retainCompletedSessions([day(old.date,"new")],[old],{first:{completed:true,rpe:6,notes:""},second:{completed:true,rpe:5,notes:""}});
  expect(result[0].dbId).toBe("first");expect(result[0].secondSession?.dbId).toBe("second");
 });
 it("retains missed past sessions instead of rewriting history",()=>{
  const old=day("2026-10-14","past");const fresh=day(old.date,"new");
  expect(retainCompletedSessions([fresh],[old],{},"2026-10-15")[0].dbId).toBe("past");
 });
 it("rebuilds from confirmed match dates, including an explicit no-match week",()=>{
  const p=profileForPolicyRebuild({weeklyMatches:true,matchDate:"2026-10-18"} as Profile,[day("2026-10-21","match",{dayType:"match"})]);
  expect(p.matchDates).toEqual(["2026-10-21"]);expect(p.weeklyMatches).toBe(false);
  expect(profileForPolicyRebuild(p,[]).matchDate).toBeNull();
 });
});
