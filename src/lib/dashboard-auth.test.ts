import { describe, it, expect } from "vitest";
import { computeSessionToken, isValidSession } from "./dashboard-auth";

describe("computeSessionToken", () => {
  it("returns a 64-char hex string", () => {
    const token = computeSessionToken("1234");
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic — same pin always gives same token", () => {
    expect(computeSessionToken("9999")).toBe(computeSessionToken("9999"));
  });

  it("produces different tokens for different PINs", () => {
    expect(computeSessionToken("1111")).not.toBe(computeSessionToken("2222"));
  });
});

describe("isValidSession", () => {
  it("returns true for a valid session token", () => {
    const pin = "1549";
    const token = computeSessionToken(pin);
    expect(isValidSession(token, pin)).toBe(true);
  });

  it("returns false when session is undefined", () => {
    expect(isValidSession(undefined, "1549")).toBe(false);
  });

  it("returns false when pin is undefined", () => {
    const token = computeSessionToken("1549");
    expect(isValidSession(token, undefined)).toBe(false);
  });

  it("returns false when both are undefined", () => {
    expect(isValidSession(undefined, undefined)).toBe(false);
  });

  it("returns false for a wrong token", () => {
    const token = computeSessionToken("wrong");
    expect(isValidSession(token, "1549")).toBe(false);
  });

  it("returns false for an empty string token", () => {
    expect(isValidSession("", "1549")).toBe(false);
  });

  it("returns false for a token of different length", () => {
    expect(isValidSession("abc", "1549")).toBe(false);
  });

  it("returns false for a non-hex token of same length as expected", () => {
    // 64 chars but not valid hex
    const badToken = "z".repeat(64);
    expect(isValidSession(badToken, "1549")).toBe(false);
  });
});
