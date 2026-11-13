// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MethodExecutionCoach } from "./MethodExecutionCoach";
import { executionFor } from "@/lib/loadwise/methods/catalogue";
vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "velocity-owner" } }) }));
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("keeps velocity instruction previews read-only and separate from recorded measurements", async () => {
  const plan = executionFor("M39");
  expect(plan?.mode).toBe("velocity");
  await act(async () =>
    root.render(<MethodExecutionCoach plan={plan!} context="squat" enabled={false} />),
  );
  expect(host.textContent).toContain("Telefon jej nie mierzy");
  expect(host.querySelector("input:not(:disabled)")).toBeNull();
  expect(host.querySelector("button:not(:disabled)")).toBeNull();
  expect(localStorage.length).toBe(0);
});
