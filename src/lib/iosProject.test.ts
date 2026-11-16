import { describe, expect, it } from "vitest";
import {
  configureIosAppEntitlements,
  validateIosAppIdentity,
} from "../../scripts/lib/ios-project.mjs";

const appConfiguration = (name: string, bundle: string, entitlements = "") => `
  ${name} /* ${name} */ = {
    isa = XCBuildConfiguration;
    buildSettings = {
      INFOPLIST_FILE = App/Info.plist;
      PRODUCT_BUNDLE_IDENTIFIER = ${bundle};
      ${entitlements}
    };
    name = ${name};
  };`;
const project = (debugBundle = "pl.ballwise.test", releaseBundle = debugBundle) =>
  appConfiguration("Debug", debugBundle, "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;") +
  appConfiguration("Release", releaseBundle) +
  `
  Tests = {
    buildSettings = {
      INFOPLIST_FILE = Tests/Info.plist;
      PRODUCT_BUNDLE_IDENTIFIER = pl.ballwise.tests;
    };
  };`;

describe("iOS setup existing Xcode target", () => {
  it("rejects a different product identity in either Debug or Release before sync", () => {
    for (const source of [project("pl.other.app"), project("pl.ballwise.test", "pl.other.app")])
      expect(() => validateIosAppIdentity(source, "pl.ballwise.test")).toThrow("Bundle Identifier");
  });

  it("attaches Associated Domains entitlements to Release even when Debug already has them", () => {
    const source = project();
    const result = configureIosAppEntitlements(source, "pl.ballwise.test");
    expect(result.match(/CODE_SIGN_ENTITLEMENTS = App\/App.entitlements;/g)).toHaveLength(2);
    expect(result.slice(result.indexOf("Tests ="))).toBe(source.slice(source.indexOf("Tests =")));
    expect(configureIosAppEntitlements(result, "pl.ballwise.test")).toBe(result);
  });

  it("preserves a quoted existing setting without adding a duplicate", () => {
    const source = appConfiguration(
      "Release",
      '"pl.ballwise.test"',
      'CODE_SIGN_ENTITLEMENTS = "App/App.entitlements";',
    );
    expect(configureIosAppEntitlements(source, "pl.ballwise.test")).toBe(source);
  });

  it("requires review for a custom entitlement file instead of replacing it", () => {
    const source = appConfiguration(
      "Release",
      "pl.ballwise.test",
      "CODE_SIGN_ENTITLEMENTS = App/Custom.entitlements;",
    );
    expect(() => configureIosAppEntitlements(source, "pl.ballwise.test")).toThrow(
      "innego pliku entitlements",
    );
  });

  it("rejects an unrecognized app project instead of claiming that setup succeeded", () => {
    expect(() => configureIosAppEntitlements("{ unrelated = YES; }", "pl.ballwise.test")).toThrow(
      "Nie rozpoznano",
    );
  });
});
