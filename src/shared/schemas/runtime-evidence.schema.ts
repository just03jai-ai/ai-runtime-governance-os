import { z } from "zod";

export const runtimeEvidenceSchemaVersion = "runtime-evidence/v1" as const;

const isoTimestampSchema = z.string().datetime({ offset: true });

const severitySchema = z.enum(["info", "warning", "critical"]);

const boundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

const telemetryMetadataSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

// Future agents need a normalized evidence contract so they can compare runs,
// validate policies, and produce findings without depending on source-specific
// Playwright objects or raw artifact layouts.
export const runtimeEvidenceSchema = z.object({
  schemaVersion: z.literal(runtimeEvidenceSchemaVersion),
  execution: z.object({
    runId: z.string().min(1),
    schemaVersion: z.literal(runtimeEvidenceSchemaVersion),
    environment: z.enum(["local", "staging", "production"]),
    executor: z.literal("execution-agent"),
    status: z.enum(["passed", "failed"]),
    durationMs: z.number().nonnegative().optional(),
  }),
  route: z.object({
    targetUrl: z.string().min(1),
    resolvedUrl: z.string().min(1),
    title: z.string(),
    routeId: z.string().min(1).optional(),
    runLabel: z.string().min(1).optional(),
  }),
  timestamps: z.object({
    startedAt: isoTimestampSchema,
    capturedAt: isoTimestampSchema,
    completedAt: isoTimestampSchema.optional(),
  }),
  domSnapshot: z.object({
    capturedAt: isoTimestampSchema,
    elementCount: z.number().int().nonnegative(),
    interactiveElementCount: z.number().int().nonnegative(),
    extractionStrategy: z.literal("playwright-dom"),
  }),
  componentInventory: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      tagName: z.string().min(1),
      role: z.string().nullable(),
      label: z.string(),
      selectorHint: z.string().min(1),
      attributes: z.record(z.string(), z.string()).optional(),
      visible: z.boolean(),
      boundingBox: boundingBoxSchema.optional(),
      source: z.literal("dom"),
    }),
  ),
  designTokens: z.array(
    z.object({
      name: z.string().min(1),
      value: z.string(),
      category: z.enum(["color", "typography", "spacing", "radius", "shadow", "unknown"]),
      source: z.enum(["computed-style", "css-variable", "design-system"]),
    }),
  ),
  accessibilityFindings: z.array(
    z.object({
      id: z.string().min(1),
      ruleId: z.string().min(1),
      severity: severitySchema,
      message: z.string(),
      selectorHint: z.string().min(1).optional(),
      deterministic: z.literal(true),
    }),
  ),
  screenshots: z.array(
    z.object({
      id: z.string().min(1),
      path: z.string().min(1),
      capturedAt: isoTimestampSchema,
      viewport: z.object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      }),
      fullPage: z.boolean(),
    }),
  ),
  telemetry: z.array(
    z.object({
      eventId: z.string().min(1),
      type: z.string().min(1),
      timestamp: isoTimestampSchema,
      durationMs: z.number().nonnegative().optional(),
      metadata: telemetryMetadataSchema.optional(),
    }),
  ),
  governanceViolations: z.array(
    z.object({
      id: z.string().min(1),
      policyId: z.string().min(1),
      severity: severitySchema,
      title: z.string(),
      description: z.string(),
      selectorHint: z.string().min(1).optional(),
      deterministic: z.literal(true),
    }),
  ),
  confidence: z.object({
    score: z.number().min(0).max(1),
    basis: z.literal("runtime-observation"),
    notes: z.array(z.string()).optional(),
  }),
});

export type RuntimeEvidenceSchemaInput = z.input<typeof runtimeEvidenceSchema>;
export type RuntimeEvidenceSchemaOutput = z.output<typeof runtimeEvidenceSchema>;
