import { describe, it, expect } from "vitest";
import {
  ATTESTATION_TEMPLATES,
  ATTESTATION_TEMPLATE_IDS,
  getAttestationTemplate,
  getAttestationTemplatesForControl,
  getAttestationTemplatesByKind,
} from "./attestation-templates";
import {
  OUTSTANDING_CLOSE_PATHS,
  CUSTOMER_ATTESTED_INHERITED,
  OUTSTANDING_36_CONTROL_IDS,
} from "./outstanding-controls";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";

describe("attestation-templates", () => {
  it("loads 14 templates: 12 from the snapshot + 2 customer-attested-inherited", () => {
    expect(ATTESTATION_TEMPLATES.length).toBe(14);
    expect(new Set(ATTESTATION_TEMPLATE_IDS).size).toBe(14);
  });

  it("every attestationTemplateId referenced in the snapshot resolves to a template", () => {
    const referenced = new Set<string>();
    for (const id of OUTSTANDING_36_CONTROL_IDS) {
      const entry = OUTSTANDING_CLOSE_PATHS.get(id);
      if (entry?.attestationTemplateId) referenced.add(entry.attestationTemplateId);
    }
    for (const c of CUSTOMER_ATTESTED_INHERITED) {
      referenced.add(c.attestationTemplateId);
    }
    for (const tid of referenced) {
      expect(getAttestationTemplate(tid)).toBeDefined();
    }
  });

  it("every template has at least one condition and one linked control", () => {
    for (const t of ATTESTATION_TEMPLATES) {
      expect(t.conditions.length).toBeGreaterThan(0);
      expect(t.linkedControlIds.length).toBeGreaterThan(0);
      for (const cid of t.linkedControlIds) {
        expect(ALL_CONTROL_IDS).toContain(cid);
      }
    }
  });

  it("every template has a non-empty C3PAO examiner note (defensibility check)", () => {
    for (const t of ATTESTATION_TEMPLATES) {
      expect(t.c3paoExaminerNote.length).toBeGreaterThan(20);
    }
  });

  it("every template has a non-empty attestation statement (legal-grade content)", () => {
    for (const t of ATTESTATION_TEMPLATES) {
      // Statement should be meaningful, not boilerplate
      expect(t.attestationStatement.length).toBeGreaterThan(100);
      expect(t.attestationStatement.toLowerCase()).toContain("attest");
    }
  });

  it("every template has a fallback action so the customer knows what happens if conditions change", () => {
    for (const t of ATTESTATION_TEMPLATES) {
      expect(t.fallbackIfConditionFails.controlIds.length).toBeGreaterThan(0);
      expect(t.fallbackIfConditionFails.actionRequired.length).toBeGreaterThan(10);
      expect([
        "implemented",
        "partial",
        "not_applicable",
        "inherited",
      ]).toContain(t.fallbackIfConditionFails.fallbackDisposition);
    }
  });

  it("kind tally: 3 implemented + 9 N/A + 2 customer-attested-inherited", () => {
    expect(getAttestationTemplatesByKind("implemented_attestation").length).toBe(3);
    expect(getAttestationTemplatesByKind("na_attestation").length).toBe(9);
    expect(getAttestationTemplatesByKind("customer_attested_inherited").length).toBe(2);
  });

  it("controls 3.10.3 and 3.10.6 each have a customer-attested-inherited template", () => {
    const t1 = getAttestationTemplatesForControl("3.10.3");
    const t2 = getAttestationTemplatesForControl("3.10.6");
    expect(t1.length).toBe(1);
    expect(t2.length).toBe(1);
    expect(t1[0].kind).toBe("customer_attested_inherited");
    expect(t2[0].kind).toBe("customer_attested_inherited");
  });
});
