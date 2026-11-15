/** Exporters can differ in the last float digit across Node/platform math implementations.
 * Binary geometry/skin/animation data must remain byte-identical; only JSON roundoff is tolerated. */
export function glbEquivalent(left, right) {
  try {
    const read = (bytes) => {
      const b = Buffer.from(bytes);
      if (
        b.readUInt32LE(0) !== 0x46546c67 ||
        b.readUInt32LE(4) !== 2 ||
        b.readUInt32LE(8) !== b.length ||
        b.readUInt32LE(16) !== 0x4e4f534a
      )
        throw new Error("Invalid GLB");
      const end = 20 + b.readUInt32LE(12);
      return { json: JSON.parse(b.subarray(20, end).toString()), binary: b.subarray(end) };
    };
    const equal = (a, b) => {
      if (a === b) return true;
      if (typeof a === "number" && typeof b === "number")
        return (
          Number.isFinite(a) &&
          Number.isFinite(b) &&
          Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b))
        );
      if (
        !a ||
        !b ||
        typeof a !== "object" ||
        typeof b !== "object" ||
        Array.isArray(a) !== Array.isArray(b)
      )
        return false;
      const ka = Object.keys(a).sort(),
        kb = Object.keys(b).sort();
      return (
        ka.length === kb.length && ka.every((key, i) => key === kb[i] && equal(a[key], b[key]))
      );
    };
    const a = read(left),
      b = read(right);
    return a.binary.equals(b.binary) && equal(a.json, b.json);
  } catch {
    return false;
  }
}
