// @vitest-environment jsdom
import { act, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { birthDateForApproximateAge, NEW_ACCOUNT_MIN_AGE } from "@/lib/loadwise/agePolicy";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  navigate: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => mocks.navigate,
  useRouter: () => ({}),
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/lib/loadwise/auth", () => ({
  useAuth: () => ({ user: null, loading: false, signUp: mocks.signUp }),
}));
vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => ({ hydrated: true, hydrationError: null, state: { profile: null, plan: [] } }),
}));
vi.mock("@/lib/routeWarmup", () => ({ scheduleRouteWarmup: () => () => {} }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn() } }));

import { Route } from "./auth";
const Component = Route.options.component as ComponentType;
let root: Root;
let host: HTMLDivElement;

async function input(id: string, value: string) {
  const element = host.querySelector<HTMLInputElement>(`#${id}`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit(birthDate: string) {
  await input("register-birth-date", birthDate);
  await input("name", "Adam");
  await input("email", "adam@example.com");
  await input("password", "testowe-haslo-123");
  // Deliberately bypass native date validation to verify the submit guard too.
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.signUp.mockReset().mockResolvedValue({ error: null, needsEmailConfirmation: true });
  mocks.error.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Component />));
  await act(async () =>
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Nowe konto")!.click(),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("offers new athlete accounts at the same age floor as onboarding", () => {
  expect(host.textContent).toContain(`Nowe konto zawodnika od ${NEW_ACCOUNT_MIN_AGE} lat`);
  expect(host.querySelector("#register-birth-date")?.getAttribute("max")).toBe(
    birthDateForApproximateAge(NEW_ACCOUNT_MIN_AGE),
  );
  expect(host.textContent).not.toContain("Dla dziecka");
});

it("rejects a 15-year-old before creating an account that cannot finish onboarding", async () => {
  await submit(birthDateForApproximateAge(15));
  expect(mocks.signUp).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("od 16"));
});

it("registers an eligible athlete at the age boundary", async () => {
  const date = birthDateForApproximateAge(NEW_ACCOUNT_MIN_AGE);
  await submit(date);
  expect(mocks.error).not.toHaveBeenCalled();
  expect(mocks.signUp).toHaveBeenCalledWith(
    "adam@example.com",
    "testowe-haslo-123",
    "Adam",
    "athlete",
    date,
  );
});
