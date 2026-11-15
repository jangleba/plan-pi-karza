import { expect, it } from "vitest";
import { glbEquivalent } from "../../../scripts/lib/glb-equivalence.mjs";
const glb = (color: number, binary = 123, name = "player") => {
  const json = Buffer.from(
    JSON.stringify({ materials: [{ name, color }], buffers: [{ byteLength: 4 }] }).padEnd(
      Math.ceil(
        JSON.stringify({ materials: [{ name, color }], buffers: [{ byteLength: 4 }] }).length / 4,
      ) * 4,
      " ",
    ),
  );
  const out = Buffer.alloc(20 + json.length + 12);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(json.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  json.copy(out, 20);
  out.writeUInt32LE(4, 20 + json.length);
  out.writeUInt32LE(0x004e4942, 24 + json.length);
  out.writeUInt32LE(binary, 28 + json.length);
  return out;
};
it("tolerates only harmless JSON numeric roundoff", () =>
  expect(glbEquivalent(glb(0.007298674840887162), glb(0.007298674840887161))).toBe(true));
it("rejects changed geometry/animation bytes, material values and names", () => {
  expect(glbEquivalent(glb(0.007), glb(0.007, 124))).toBe(false);
  expect(glbEquivalent(glb(0.007), glb(0.008))).toBe(false);
  expect(glbEquivalent(glb(0.007), glb(0.007, 123, "other"))).toBe(false);
  expect(glbEquivalent(Buffer.from("invalid"), glb(0.007))).toBe(false);
});
