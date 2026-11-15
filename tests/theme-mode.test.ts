import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nextThemeMode, parseThemeMode } from "../src/lib/theme-mode";

describe("parseThemeMode", () => {
  it("keeps a known mode", () => {
    assert.equal(parseThemeMode("light"), "light");
    assert.equal(parseThemeMode("dark"), "dark");
    assert.equal(parseThemeMode("system"), "system");
  });

  it("falls back to the device for a missing or unknown value", () => {
    assert.equal(parseThemeMode(undefined), "system");
    assert.equal(parseThemeMode(null), "system");
    assert.equal(parseThemeMode(""), "system");
    assert.equal(parseThemeMode("purple"), "system");
  });
});

describe("nextThemeMode", () => {
  it("cycles system, light, dark and back", () => {
    assert.equal(nextThemeMode("system"), "light");
    assert.equal(nextThemeMode("light"), "dark");
    assert.equal(nextThemeMode("dark"), "system");
  });
});
