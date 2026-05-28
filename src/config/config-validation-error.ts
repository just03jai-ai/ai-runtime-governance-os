import type { ZodIssue } from "zod";

export class ConfigValidationError extends Error {
  constructor(readonly issues: readonly ZodIssue[]) {
    super(`Invalid AI Runtime Governance OS configuration: ${issues.map((issue) => issue.message).join("; ")}`);
    this.name = "ConfigValidationError";
  }
}
