import { describe, expect, test } from "bun:test";
import { parseFormBoolean } from "../src/parseBool";

describe("parseFormBoolean", () => {
  test("multipart false string is false", () => {
    expect(parseFormBoolean("false", false)).toBe(false);
    expect(parseFormBoolean("False", false)).toBe(false);
    expect(parseFormBoolean("0", false)).toBe(false);
  });

  test("multipart true string is true", () => {
    expect(parseFormBoolean("true", false)).toBe(true);
    expect(parseFormBoolean("1", false)).toBe(true);
  });

  test("Boolean() would be wrong for false string", () => {
    expect(Boolean("false")).toBe(true);
    expect(parseFormBoolean("false", false)).toBe(false);
  });

  test("default when missing", () => {
    expect(parseFormBoolean(undefined, false)).toBe(false);
    expect(parseFormBoolean(undefined, true)).toBe(true);
  });
});
