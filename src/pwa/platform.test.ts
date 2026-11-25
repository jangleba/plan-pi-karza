import { describe, expect, it } from "vitest";
import { installContext, installSteps, launchTarget, stripLaunchParams } from "./platform";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Instagram 356.0.0.31.89",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  androidFb: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/489.0.0.0;]",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

describe("rozpoznanie sposobu instalacji", () => {
  it("rozpoznaje iPhone (Safari / inna przeglądarka / przeglądarka w aplikacji), iPada, Androida i komputer", () => {
    const c = (userAgent: string, o: Partial<{ standalone: boolean; canPrompt: boolean; maxTouchPoints: number }> = {}) => installContext({ userAgent, standalone: false, canPrompt: false, ...o });
    expect(c(UA.iphoneSafari)).toBe("ios-safari");
    expect(c(UA.iphoneChrome)).toBe("ios-other");
    expect(c(UA.iphoneInstagram)).toBe("in-app");
    expect(c(UA.ipad, { maxTouchPoints: 5 })).toBe("ios-safari");
    expect(c(UA.ipad, { maxTouchPoints: 0 })).toBe("desktop");
    expect(c(UA.android, { canPrompt: true })).toBe("android-prompt");
    expect(c(UA.android)).toBe("android-manual");
    expect(c(UA.androidFb)).toBe("in-app");
    expect(c(UA.mac)).toBe("desktop");
    expect(c(UA.iphoneSafari, { standalone: true })).toBe("installed");
  });
  it("każdy kontekst poza zainstalowanym ma instrukcję", () => {
    for (const k of ["ios-safari", "ios-other", "in-app", "android-prompt", "android-manual", "desktop"] as const) expect(installSteps(k).length).toBeGreaterThan(1);
    expect(installSteps("ios-safari").join(" ")).toMatch(/Do ekranu początkowego/);
  });
});

describe("cel uruchomienia", () => {
  it("ikona prowadzi na „Dziś”, powiadomienie na właściwe miejsce; obce wartości są ignorowane", () => {
    expect(launchTarget("?source=pwa")).toBe("today");
    expect(launchTarget("?open=message&id=abc")).toBe("message");
    expect(launchTarget("?open=workout")).toBe("workout");
    expect(launchTarget("?open=javascript:alert(1)")).toBeNull();
    expect(launchTarget("?invite=x")).toBeNull();
  });
  it("po odczycie parametry uruchomienia znikają z adresu, inne (np. zaproszenie) zostają", () => {
    expect(stripLaunchParams("https://b.app/?source=pwa")).toBe("/");
    expect(stripLaunchParams("https://b.app/?open=message&invite=x#k")).toBe("/?invite=x#k");
  });
});
