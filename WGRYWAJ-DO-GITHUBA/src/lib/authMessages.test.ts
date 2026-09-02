import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./authMessages";

describe("authErrorMessage", () => {
  it("tłumaczy typowe błędy logowania", () => {
    expect(authErrorMessage("Invalid login credentials", "login")).toBe(
      "Nieprawidłowy e-mail lub hasło.",
    );
    expect(authErrorMessage("Email not confirmed", "login")).toContain("potwierdź adres e-mail");
  });

  it("tłumaczy typowe błędy rejestracji", () => {
    expect(authErrorMessage("User already registered", "register")).toContain("już istnieje");
    expect(authErrorMessage("Password should be at least 6 characters", "register")).toContain(
      "co najmniej 6 znaków",
    );
  });

  it("nie pokazuje użytkownikowi nieznanego komunikatu dostawcy", () => {
    const raw = "Unexpected provider implementation detail";

    expect(authErrorMessage(raw, "login")).not.toContain(raw);
    expect(authErrorMessage(raw, "register")).not.toContain(raw);
  });
});
