export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export const requiredString = (value: unknown, field: string, errors: string[]): void => {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${field} must be a non-empty string.`);
  }
};

export const validateSemverLike = (value: unknown, field: string, errors: string[]): void => {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value)) {
    errors.push(`${field} must be a semver-like version.`);
  }
};

export const validationResult = (errors: string[], warnings: string[] = []): ValidationResult => ({
  valid: errors.length === 0,
  errors,
  warnings
});
