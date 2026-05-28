import { z } from "zod";

const pipelineStageSchema = z.enum(["execution", "governance", "verification", "findings", "analysis"]);

const retryStageSchema = z.object({
  maxAttempts: z.number().int().min(1).max(5),
});

export const appConfigSchema = z.object({
  environment: z.enum(["local", "staging", "production", "test"]),
  routes: z
    .array(
      z.object({
        targetUrl: z.string().min(1),
        runLabel: z.string().min(1).optional(),
      }),
    )
    .min(1),
  execution: z.object({
    environment: z.enum(["local", "staging", "production"]),
    timeoutMs: z.number().int().positive(),
    viewport: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      deviceScaleFactor: z.number().positive().optional(),
    }),
  }),
  governance: z.object({
    minimumConfidence: z.number().min(0).max(1),
    criticalFailureThreshold: z.number().int().nonnegative(),
    warningFailureThreshold: z.number().int().nonnegative(),
  }),
  screenshots: z.object({
    enabled: z.boolean(),
    fullPage: z.boolean(),
    outputDirectory: z.string().min(1),
  }),
  accessibility: z.object({
    enabled: z.boolean(),
    requireAccessibleNames: z.boolean(),
    minimumContrastRatio: z.number().positive(),
  }),
  retry: z.object({
    stages: z.partialRecord(pipelineStageSchema, retryStageSchema),
  }),
  reports: z.object({
    outputDirectory: z.string().min(1),
    json: z.boolean(),
    html: z.boolean(),
  }),
});

export type AppConfigInput = z.input<typeof appConfigSchema>;
export type AppConfigOutput = z.output<typeof appConfigSchema>;
