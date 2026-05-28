#!/usr/bin/env node
import { ConfigLoader, type AppEnvironment } from "../config/index.js";
import { GovernanceContractLoader } from "../governance/contracts/governance-contract-loader.js";
import { FindingsReportEngine } from "../reports/findings/findings-report-engine.js";
import { VerifierAgent } from "../agents/verifier/verifier-agent.js";
import { flagValue, hasFlag, parseCliArgs } from "./args.js";
import {
  findLatestRuntimeEvidence,
  loadGovernanceFindings,
  loadRuntimeEvidence,
  loadVerifiedFindings,
  writeFindingsReportArtifacts,
} from "./artifacts.js";
import { createExecutionRequest, createRuntimePipeline, resolveContractsDirectory } from "./pipeline-factory.js";
import { printHeader, printKeyValues, printPipelineSummary, printReportSummary } from "./output.js";
import { selectRoute } from "./route-selection.js";
import { createCliLogger } from "./cli-logger.js";

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const [primary, secondary] = args.command;

  if (primary === "audit" || (primary === "run" && secondary === "audit")) {
    await runAudit(args);
    return;
  }

  if ((primary === "validate" && secondary === "contracts") || primary === "validate-contracts") {
    await validateContracts(args);
    return;
  }

  if (primary === "report" || (primary === "generate" && secondary === "report")) {
    await generateReport(args);
    return;
  }

  if ((primary === "verify" && secondary === "findings") || primary === "verify-findings") {
    await verifyFindings(args);
    return;
  }

  printUsage();
  process.exitCode = 1;
}

async function loadConfig(args: ReturnType<typeof parseCliArgs>) {
  const environment = flagValue(args, "env") as AppEnvironment | undefined;
  const configFilePath = flagValue(args, "config");
  return new ConfigLoader().load({
    ...(environment ? { environment } : {}),
    ...(configFilePath ? { configFilePath } : {}),
  });
}

async function runAudit(args: ReturnType<typeof parseCliArgs>): Promise<void> {
  const config = await loadConfig(args);
  const route = selectRoute(config, flagValue(args, "route"));
  const orchestrator = createRuntimePipeline(config, { verbose: hasFlag(args, "verbose") });

  printHeader("Audit Started");
  printKeyValues({
    environment: config.environment,
    route: route.targetUrl,
    contracts: resolveContractsDirectory(flagValue(args, "contracts")),
  });

  const result = await orchestrator.run({
    executionRequest: createExecutionRequest(config, route),
    contractsDirectory: resolveContractsDirectory(flagValue(args, "contracts")),
    retryPolicy: config.retry.stages,
  });

  const artifactPaths = await writeFindingsReportArtifacts({
    report: result.findingsReport,
    outputDirectory: flagValue(args, "out") ?? config.reports.outputDirectory,
    writeJson: config.reports.json,
    writeHtml: config.reports.html,
  });

  printPipelineSummary(result);
  printHeader("Generated Artifacts");
  for (const artifactPath of artifactPaths) {
    console.log(artifactPath);
  }
}

async function validateContracts(args: ReturnType<typeof parseCliArgs>): Promise<void> {
  const contractsDirectory = resolveContractsDirectory(flagValue(args, "contracts"));
  const contracts = await new GovernanceContractLoader().loadFromDirectory(contractsDirectory);

  printHeader("Contract Validation");
  printKeyValues({
    contractsDirectory,
    contractCount: contracts.length,
    status: "valid",
  });
}

async function generateReport(args: ReturnType<typeof parseCliArgs>): Promise<void> {
  const config = await loadConfig(args);
  const evidencePath =
    flagValue(args, "evidence") ??
    (hasFlag(args, "latest") ? await findLatestRuntimeEvidence(config.screenshots.outputDirectory) : undefined);

  const evidence = evidencePath ? await loadRuntimeEvidence(evidencePath) : undefined;
  const findingsPath = flagValue(args, "findings");
  const findings = findingsPath ? await loadVerifiedFindings(findingsPath) : [];
  const report = new FindingsReportEngine().generate({ findings, evidence });
  const artifactPaths = await writeFindingsReportArtifacts({
    report,
    outputDirectory: flagValue(args, "out") ?? config.reports.outputDirectory,
    writeJson: config.reports.json,
    writeHtml: config.reports.html,
  });

  printReportSummary(report);
  printHeader("Generated Artifacts");
  for (const artifactPath of artifactPaths) {
    console.log(artifactPath);
  }
}

async function verifyFindings(args: ReturnType<typeof parseCliArgs>): Promise<void> {
  const config = await loadConfig(args);
  const findingsPath = flagValue(args, "findings");

  if (!findingsPath) {
    throw new Error("verify findings requires --findings=<path>.");
  }

  const evidencePath =
    flagValue(args, "evidence") ??
    (hasFlag(args, "latest") ? await findLatestRuntimeEvidence(config.screenshots.outputDirectory) : undefined);
  const evidence = evidencePath ? await loadRuntimeEvidence(evidencePath) : undefined;
  const findings = await loadGovernanceFindings(findingsPath);
  const result = new VerifierAgent({ logger: createCliLogger("VerifierAgent", hasFlag(args, "verbose")) }).verify({
    findings,
    evidence,
    confidenceThreshold: config.governance.minimumConfidence,
  });

  printHeader("Verification Summary");
  printKeyValues({
    inputFindings: findings.length,
    outputFindings: result.findings.length,
    verified: result.score.verifiedCount,
    needsReview: result.score.needsReviewCount,
    rejected: result.score.rejectedCount,
  });
}

function printUsage(): void {
  printHeader("AI Runtime Governance OS CLI");
  console.log("npm run audit --route=/checkout");
  console.log("npm run audit --env=staging");
  console.log("npm run report --latest");
  console.log("npm run cli -- run audit --route=/checkout --verbose");
  console.log("npm run cli -- validate contracts");
  console.log("npm run cli -- verify findings --findings=artifacts/findings.json --latest");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`CLI failed: ${message}`);
  process.exitCode = 1;
});
