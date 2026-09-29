import { afterEach, describe, expect, it, vi } from "vitest";
import { addIsoDays } from "./isoDate";

afterEach(() => vi.unstubAllEnvs());

describe("ISO calendar offsets", () => {
  it.each(["UTC", "Europe/Warsaw", "America/New_York", "Pacific/Auckland"])(
    "preserves calendar arithmetic in %s",
    (timezone) => {
      vi.stubEnv("TZ", timezone);
      expect(addIsoDays("2026-12-31", 1)).toBe("2027-01-01");
      expect(addIsoDays("2026-01-01", -1)).toBe("2025-12-31");
      expect(addIsoDays("2024-02-28", 1)).toBe("2024-02-29");
      expect(addIsoDays("2024-03-01", -1)).toBe("2024-02-29");
      expect(addIsoDays("2026-02-28", 1)).toBe("2026-03-01");
      expect(addIsoDays("2026-03-28", 2)).toBe("2026-03-30");
      expect(addIsoDays("2026-10-24", 2)).toBe("2026-10-26");
      expect(addIsoDays("2026-09-29", 0)).toBe("2026-09-29");
    },
  );
});
