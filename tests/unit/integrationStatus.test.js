import { describe, it, expect } from "vitest";
import { INTEGRATIONS, envStatus, stateFor, STATE_LABELS, STATE_BADGE_STATUS } from "@/lib/integrationStatus";

function find(key) {
  return INTEGRATIONS.find((i) => i.key === key);
}

describe("envStatus", () => {
  it("is not configured when nothing is set", () => {
    const r = envStatus(find("storage"), {});
    expect(r.configured).toBe(false);
    expect(r.missing).toHaveLength(4);
  });

  it("needs every variable when the mode is all", () => {
    const partial = envStatus(find("storage"), { STORAGE_ENDPOINT: "x", STORAGE_BUCKET: "y" });
    expect(partial.configured).toBe(false);
    expect(partial.missing).toEqual(["STORAGE_ACCESS_KEY_ID", "STORAGE_SECRET_ACCESS_KEY"]);
    const full = envStatus(find("storage"), {
      STORAGE_ENDPOINT: "a",
      STORAGE_ACCESS_KEY_ID: "b",
      STORAGE_SECRET_ACCESS_KEY: "c",
      STORAGE_BUCKET: "d",
    });
    expect(full).toEqual({ configured: true, missing: [] });
  });

  it("needs only one variable when the mode is any", () => {
    expect(envStatus(find("maps"), { MAPBOX_ACCESS_TOKEN: "token" }).configured).toBe(true);
    expect(envStatus(find("maps"), {}).configured).toBe(false);
  });

  it("treats empty and blank values as missing", () => {
    expect(envStatus(find("email"), { EMAIL_PROVIDER_API_KEY: "" }).configured).toBe(false);
    expect(envStatus(find("email"), { EMAIL_PROVIDER_API_KEY: "   " }).configured).toBe(false);
  });

  it("rejects a session secret that is too short", () => {
    expect(envStatus(find("auth"), { AUTH_SECRET: "short" }).configured).toBe(false);
    expect(envStatus(find("auth"), { AUTH_SECRET: "x".repeat(32) }).configured).toBe(true);
  });

  it("never returns the value of a variable", () => {
    const secret = "super-secret-value-1234567890-abcdefghij";
    const r = envStatus(find("auth"), { AUTH_SECRET: secret });
    expect(JSON.stringify(r).includes(secret)).toBe(false);
  });
});

describe("stateFor", () => {
  it("says connected only for a database whose live check passed", () => {
    expect(stateFor(find("database"), {}, { ok: true })).toBe("CONNECTED");
    expect(stateFor(find("database"), { MONGODB_URI: "set" }, { ok: false })).toBe("FAILED");
    expect(stateFor(find("database"), { MONGODB_URI: "set" }, undefined)).toBe("FAILED");
  });

  it("never says connected for an integration that has no health check", () => {
    ["auth", "maps", "storage", "email", "sms"].forEach((key) => {
      const full = {};
      find(key).env.forEach((n) => {
        full[n] = "x".repeat(40);
      });
      expect(stateFor(find(key), full, { ok: true })).toBe("CONFIGURED");
      expect(stateFor(find(key), {}, { ok: true })).toBe("NOT_CONFIGURED");
    });
  });

  it("has a label and a badge colour for every state", () => {
    ["CONNECTED", "CONFIGURED", "NOT_CONFIGURED", "FAILED"].forEach((s) => {
      expect(STATE_LABELS[s]).toBeTruthy();
      expect(STATE_BADGE_STATUS[s]).toBeTruthy();
    });
  });

  it("marks only the database and sign-in sessions as required", () => {
    expect(INTEGRATIONS.filter((i) => i.required).map((i) => i.key)).toEqual(["database", "auth"]);
  });
});
