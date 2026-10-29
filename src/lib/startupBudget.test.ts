import { describe, expect, it } from "vitest";
import { eagerGeneratorModules } from "../../scripts/startup-budget";

const generator = "/project/src/lib/loadwise/planEngine.ts";
function chunk(fileName: string, isEntry: boolean, imports: string[], modules: string[] = []) {
  return {
    type: "chunk" as const,
    fileName,
    isEntry,
    imports,
    modules: Object.fromEntries(modules.map((id) => [id, {}])),
  };
}
describe("startup import boundary", () => {
  it("finds a generator pulled in through shared chunks, including cyclic imports", () => {
    expect(
      eagerGeneratorModules({
        "entry.js": chunk("entry.js", true, ["shared.js"]),
        "shared.js": chunk("shared.js", false, ["entry.js", "engine.js"]),
        "engine.js": chunk("engine.js", false, [], [generator]),
      }),
    ).toEqual([generator]);
  });
  it("allows a separately loaded generator without making it a startup dependency", () => {
    expect(
      eagerGeneratorModules({
        "entry.js": chunk("entry.js", true, ["runtime.js"]),
        "runtime.js": chunk("runtime.js", false, []),
        "engine.js": chunk("engine.js", false, [], [generator]),
      }),
    ).toEqual([]);
  });
});
