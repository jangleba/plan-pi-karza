// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Field } from "./app-ui";
import { Slider } from "./slider";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("names the keyboard slider and associates field feedback with its actual thumb", async () => {
  const changed = vi.fn();
  await act(async () =>
    root.render(
      <Field label="Zmiana co 5 s" error="Sprawdź czas bodźca.">
        <Slider
          aria-label="Czas między bodźcami"
          defaultValue={[5]}
          min={2}
          max={15}
          step={1}
          onValueChange={changed}
        />
      </Field>,
    ),
  );
  const thumb = host.querySelector<HTMLElement>('[role="slider"]')!;
  expect(document.getElementById(thumb.getAttribute("aria-labelledby")!)?.textContent).toBe(
    "Zmiana co 5 s",
  );
  expect(document.getElementById(thumb.getAttribute("aria-describedby")!)?.textContent).toBe(
    "Sprawdź czas bodźca.",
  );
  expect(thumb.getAttribute("aria-invalid")).toBe("true");
  thumb.focus();
  await act(async () =>
    thumb.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })),
  );
  expect(document.activeElement).toBe(thumb);
  expect(thumb.getAttribute("aria-valuenow")).toBe("6");
  expect(changed).toHaveBeenLastCalledWith([6]);
});
