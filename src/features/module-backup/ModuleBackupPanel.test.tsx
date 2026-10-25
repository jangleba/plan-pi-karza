// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModuleBackupPanel } from "./ModuleBackupPanel";
import { createModuleSnapshot } from "./model";
import type { ModuleBackupRow } from "./client";
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  fetch: vi.fn(),
  deliver: vi.fn(),
  health: false,
}));
vi.mock("./client", () => ({
  listModuleBackups: mocks.list,
  saveModuleBackup: mocks.save,
  fetchModuleBackup: mocks.fetch,
  summarizeBackup: (row: ModuleBackupRow) => ({
    user_id: row.user_id,
    module: row.module,
    device_id: row.device_id,
    revision: row.revision,
    operation_id: row.operation_id,
    updated_at: row.updated_at,
  }),
  moduleBackupDeviceId: () => "device-a",
}));
vi.mock("@/lib/loadwise/deliverExportFile", () => ({ deliverExportFile: mocks.deliver }));
vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => ({ state: { profile: { healthPersonalizationEnabled: mocks.health } } }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
let host: HTMLDivElement, root: Root;
const button = (text: string) =>
  [...host.querySelectorAll("button")].find((node) => node.textContent?.trim() === text)!;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  mocks.health = false;
  mocks.list.mockReset().mockResolvedValue([]);
  mocks.save.mockReset();
  mocks.fetch.mockReset().mockImplementation(async () => row());
  mocks.deliver.mockReset().mockResolvedValue("cancelled");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});
const render = async (owner = "a") => {
  await act(async () => root.render(<ModuleBackupPanel userId={owner} />));
};
function row(): ModuleBackupRow {
  return {
    user_id: "a",
    module: "iq",
    device_id: "device-a",
    revision: 1,
    operation_id: "operation",
    updated_at: new Date().toISOString(),
    payload: createModuleSnapshot("iq", "a") as unknown as ModuleBackupRow["payload"],
  };
}
describe("manual cloud backup consent and ownership", () => {
  it("never uploads on mount or local changes, and disables private text without health consent", async () => {
    await render();
    expect(mocks.list).toHaveBeenCalledWith("a", "iq");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(button("Zapisz kopię tego urządzenia").disabled).toBe(true);
    const checkboxes = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checkboxes[1].disabled).toBe(true);
    expect(host.querySelector('a[href="/data-rights"]')).not.toBeNull();
    await act(async () =>
      window.dispatchEvent(
        new CustomEvent("ballwise:module-data-changed", { detail: { userId: "a", module: "iq" } }),
      ),
    );
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("saves only after explicit consent and button click, with private text off by default", async () => {
    await render();
    mocks.save.mockResolvedValue(row());
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => button("Zapisz kopię tego urządzenia").click());
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.save.mock.calls[0][3].includesUserText).toBe(false);
    expect(host.textContent).toContain("Kopia zapisana na Twoim koncie");
  });
  it("does not apply an old account's late save response to the new account", async () => {
    let finish: (row: ModuleBackupRow) => void = () => {};
    mocks.save.mockImplementation(
      () =>
        new Promise<ModuleBackupRow>((resolve) => {
          finish = resolve;
        }),
    );
    await render();
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await act(async () => button("Zapisz kopię tego urządzenia").click());
    await render("b");
    await act(async () => finish(row()));
    expect(host.textContent).not.toContain("Kopia zapisana na Twoim koncie");
    expect(host.textContent).not.toContain("Urządzenie device-a");
  });
  it("exports through the owner-scoped native helper and reports cancellation honestly", async () => {
    mocks.list.mockResolvedValue([row()]);
    await render();
    await act(async () => button("Pobierz kopię").click());
    expect(mocks.deliver.mock.calls[0][3]).toBe("a");
    expect(host.textContent).toContain("Udostępnianie anulowane");
    expect(host.textContent).not.toContain("Kopię przekazano do zapisania");
  });
  it("preserves data and explains a concurrent revision conflict", async () => {
    await render();
    mocks.save.mockRejectedValue({ code: "40001", message: "conflict" });
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await act(async () => button("Zapisz kopię tego urządzenia").click());
    expect(host.textContent).toContain("Kopia została zmieniona w innym oknie");
  });
});
