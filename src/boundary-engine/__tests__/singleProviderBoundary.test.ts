import { describe, it, expect } from "vitest";
import { validateSingleProviderBoundary, ValidationError } from "../index";

describe("validateSingleProviderBoundary", () => {
  it("allows standard BoundaryInput with provider string", () => {
    expect(() =>
      validateSingleProviderBoundary({
        provider: "Azure",
        environment: "Government",
        hosting_model: "iaas",
        services_enabled: {},
        gate_answers: {},
      })
    ).not.toThrow();

    expect(() =>
      validateSingleProviderBoundary({
        provider: "Microsoft Azure",
        environment: "Commercial",
        hosting_model: "IaaS",
        services_enabled: { compute_vm: true },
        gate_answers: {},
      })
    ).not.toThrow();
  });

  it("rejects boundaryInput.providers = [] with MULTI_PROVIDER_BOUNDARY_NOT_ALLOWED", () => {
    expect(() =>
      validateSingleProviderBoundary({
        provider: "Azure",
        providers: [],
        environment: "Government",
        hosting_model: "iaas",
        services_enabled: {},
        gate_answers: {},
      })
    ).toThrow(ValidationError);

    try {
      validateSingleProviderBoundary({
        provider: "Azure",
        providers: [],
        environment: "Government",
        hosting_model: "iaas",
        services_enabled: {},
        gate_answers: {},
      });
    } catch (e) {
      expect((e as ValidationError).code).toBe("MULTI_PROVIDER_BOUNDARY_NOT_ALLOWED");
      expect((e as ValidationError).details).toMatchObject({ field: "providers" });
    }
  });

  it("rejects boundaryInput.provider_configs = [] with MULTI_PROVIDER_BOUNDARY_NOT_ALLOWED", () => {
    expect(() =>
      validateSingleProviderBoundary({
        provider: "Azure",
        provider_configs: [],
        environment: "Government",
        hosting_model: "iaas",
        services_enabled: {},
        gate_answers: {},
      })
    ).toThrow(ValidationError);

    try {
      validateSingleProviderBoundary({
        provider: "Azure",
        provider_configs: [],
        environment: "Government",
        hosting_model: "iaas",
        services_enabled: {},
        gate_answers: {},
      });
    } catch (e) {
      expect((e as ValidationError).code).toBe("MULTI_PROVIDER_BOUNDARY_NOT_ALLOWED");
      expect((e as ValidationError).details).toMatchObject({ field: "provider_configs" });
    }
  });

  it("rejects boundaryInput.clouds = [] with MULTI_PROVIDER_BOUNDARY_NOT_ALLOWED", () => {
    expect(() =>
      validateSingleProviderBoundary({
        provider: "Azure",
        clouds: [],
        environment: "Government",
        hosting_model: "iaas",
        services_enabled: {},
        gate_answers: {},
      })
    ).toThrow(ValidationError);

    try {
      validateSingleProviderBoundary({
        provider: "Azure",
        clouds: [],
        environment: "Government",
        hosting_model: "iaas",
        services_enabled: {},
        gate_answers: {},
      });
    } catch (e) {
      expect((e as ValidationError).code).toBe("MULTI_PROVIDER_BOUNDARY_NOT_ALLOWED");
      expect((e as ValidationError).details).toMatchObject({ field: "clouds" });
    }
  });

  it("rejects missing provider with ValidationError code INVALID_BOUNDARY_PROVIDER", () => {
    expect(() =>
      validateSingleProviderBoundary({
        environment: "Government",
        hosting_model: "iaas",
        services_enabled: {},
        gate_answers: {},
      })
    ).toThrow(ValidationError);

    try {
      validateSingleProviderBoundary({
        environment: "Government",
        hosting_model: "iaas",
        services_enabled: {},
        gate_answers: {},
      });
    } catch (e) {
      expect((e as ValidationError).code).toBe("INVALID_BOUNDARY_PROVIDER");
    }
  });

  it("rejects empty string provider with INVALID_BOUNDARY_PROVIDER", () => {
    expect(() =>
      validateSingleProviderBoundary({
        provider: "",
        environment: "Government",
        hosting_model: "iaas",
        services_enabled: {},
        gate_answers: {},
      })
    ).toThrow(ValidationError);

    try {
      validateSingleProviderBoundary({
        provider: "   ",
        environment: "Government",
        hosting_model: "iaas",
        services_enabled: {},
        gate_answers: {},
      });
    } catch (e) {
      expect((e as ValidationError).code).toBe("INVALID_BOUNDARY_PROVIDER");
    }
  });
});
