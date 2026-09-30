// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Field, Tabs } from "./app-ui";
import { Input } from "./input";
import { Popover, PopoverTrigger } from "./popover";
import { Button } from "./button";
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
it("keeps a nested Radix trigger as a single child and associates its error", async () => {
  await act(async () =>
    root.render(
      <Field label="Data meczu" htmlFor="match" error="Wybierz datę.">
        <Popover>
          <PopoverTrigger asChild>
            <Button id="match">Kalendarz</Button>
          </PopoverTrigger>
        </Popover>
      </Field>,
    ),
  );
  const trigger = host.querySelector("button")!;
  expect(trigger.getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById(trigger.getAttribute("aria-describedby")!)?.textContent).toBe(
    "Wybierz datę.",
  );
  await act(async () => trigger.click());
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("lets keyboard users wrap between enabled tabs and jump to either end", async () => {
  function TestTabs() {
    const [value, setValue] = useState("one");
    return (
      <Tabs
        label="Widok"
        value={value}
        onChange={setValue}
        options={[
          { value: "one", label: "Pierwszy" },
          { value: "two", label: "Niedostępny", disabled: true },
          { value: "three", label: "Trzeci" },
        ]}
      />
    );
  }
  await act(async () => root.render(<TestTabs />));
  const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  tabs[0].focus();
  async function press(key: string) {
    await act(async () =>
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })),
    );
  }
  await press("ArrowLeft");
  expect(document.activeElement).toBe(tabs[2]);
  expect(tabs[2].getAttribute("aria-selected")).toBe("true");
  expect(tabs[0].tabIndex).toBe(-1);
  await press("ArrowRight");
  expect(document.activeElement).toBe(tabs[0]);
  await press("End");
  expect(document.activeElement).toBe(tabs[2]);
  await press("Home");
  expect(document.activeElement).toBe(tabs[0]);
});
it("associates field errors with the control while retaining an existing description", async () => {
  await act(async () =>
    root.render(
      <>
        <p id="format">Wpisz pełny adres.</p>
        <Field label="E-mail" htmlFor="email" help="Zachowamy prywatność." error="Sprawdź adres.">
          <Input id="email" aria-describedby="format" />
        </Field>
      </>,
    ),
  );
  const input = host.querySelector("input")!;
  const descriptions = input
    .getAttribute("aria-describedby")!
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent);
  expect(descriptions).toEqual(["Wpisz pełny adres.", "Sprawdź adres."]);
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(host.querySelector("label")?.htmlFor).toBe(input.id);
});
