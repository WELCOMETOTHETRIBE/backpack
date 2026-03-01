import { describe, it, expect } from "vitest";
import {
  getFreshnessDaysForLayer,
  computeFreshnessStatus,
} from "./freshnessPolicy";

describe("freshnessPolicy", () => {
  describe("getFreshnessDaysForLayer", () => {
    it("returns number for known layer", () => {
      expect(getFreshnessDaysForLayer("Identity/MFA")).toBe(30);
      expect(getFreshnessDaysForLayer("Crypto/Key-Mgmt")).toBe(180);
      expect(getFreshnessDaysForLayer("GuestOS/Hardening")).toBe(90);
    });

    it("returns null for unknown layer", () => {
      expect(getFreshnessDaysForLayer("Unknown/Layer")).toBeNull();
    });

    it("returns null for null or empty", () => {
      expect(getFreshnessDaysForLayer(null)).toBeNull();
      expect(getFreshnessDaysForLayer("")).toBeNull();
    });
  });

  describe("computeFreshnessStatus", () => {
    it("returns unknown when no policy for layer", () => {
      const r = computeFreshnessStatus("2025-01-01T00:00:00Z", "Unknown/Layer");
      expect(r.status).toBe("unknown");
      expect(r.freshness_days).toBeNull();
      expect(r.freshness_cutoff_utc).toBeNull();
    });

    it("returns fresh when within days", () => {
      const now = new Date("2025-02-01T00:00:00Z");
      const created = "2025-01-15T00:00:00Z"; // 17 days ago
      const r = computeFreshnessStatus(created, "Identity/MFA", now);
      expect(r.status).toBe("fresh");
      expect(r.freshness_days).toBe(30);
      expect(r.freshness_cutoff_utc).not.toBeNull();
    });

    it("returns stale when past days", () => {
      const now = new Date("2025-03-01T00:00:00Z");
      const created = "2025-01-01T00:00:00Z"; // 59 days ago
      const r = computeFreshnessStatus(created, "Identity/MFA", now);
      expect(r.status).toBe("stale");
      expect(r.freshness_days).toBe(30);
      expect(r.freshness_cutoff_utc).not.toBeNull();
    });

    it("boundary: exactly at cutoff is fresh", () => {
      const created = "2025-01-01T00:00:00Z";
      const now = new Date("2025-01-31T00:00:00Z"); // 30 days later
      const r = computeFreshnessStatus(created, "Identity/MFA", now);
      expect(r.status).toBe("fresh");
    });

    it("boundary: one day past cutoff is stale", () => {
      const created = "2025-01-01T00:00:00Z";
      const now = new Date("2025-02-01T00:00:00Z"); // 31 days later
      const r = computeFreshnessStatus(created, "Identity/MFA", now);
      expect(r.status).toBe("stale");
    });
  });
});
