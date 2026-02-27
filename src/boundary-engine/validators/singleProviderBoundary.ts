import { ValidationError } from "../types";

/**
 * Enforces ONE CLOUD PER BOUNDARY: boundary must have a single provider (non-empty string)
 * and must NOT contain multi-provider shapes (providers, provider_configs, clouds arrays).
 */
export function validateSingleProviderBoundary(boundaryInput: unknown): void {
  if (boundaryInput === null || typeof boundaryInput !== "object") {
    throw new ValidationError({
      code: "INVALID_BOUNDARY_PROVIDER",
      message: "Boundary input must be an object with a non-empty provider string.",
      details: { received: boundaryInput },
    });
  }

  const raw = boundaryInput as Record<string, unknown>;

  if (Array.isArray(raw.providers)) {
    throw new ValidationError({
      code: "MULTI_PROVIDER_BOUNDARY_NOT_ALLOWED",
      message: "Multi-provider boundary is not allowed; do not use 'providers' array.",
      details: { field: "providers" },
    });
  }
  if (Array.isArray(raw.provider_configs)) {
    throw new ValidationError({
      code: "MULTI_PROVIDER_BOUNDARY_NOT_ALLOWED",
      message: "Multi-provider boundary is not allowed; do not use 'provider_configs' array.",
      details: { field: "provider_configs" },
    });
  }
  if (Array.isArray(raw.clouds)) {
    throw new ValidationError({
      code: "MULTI_PROVIDER_BOUNDARY_NOT_ALLOWED",
      message: "Multi-provider boundary is not allowed; do not use 'clouds' array.",
      details: { field: "clouds" },
    });
  }

  const provider = raw.provider;
  if (typeof provider !== "string" || provider.trim() === "") {
    throw new ValidationError({
      code: "INVALID_BOUNDARY_PROVIDER",
      message: "Boundary must have a non-empty string 'provider' (e.g. Azure).",
      details: { received: provider },
    });
  }
}
