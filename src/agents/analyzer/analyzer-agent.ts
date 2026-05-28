import { createAgentLogger, type OperationalLogger } from "../../shared/logger/index.js";
import type { VerifiedFinding } from "../verifier/verified-finding.js";
import { ComponentMisuseAnalysisService } from "./component-misuse-analysis.js";
import { FindingClusteringService } from "./finding-clustering.js";
import type { OperationalInsightsReport } from "./operational-insights-report.js";
import { PatternAnalysisService } from "./pattern-analysis.js";
import { RootCauseSummaryService } from "./root-cause-summary.js";
import { RouteClusteringService } from "./route-clustering.js";
import { TokenDriftAnalysisService } from "./token-drift-analysis.js";

export interface AnalyzerAgentDependencies {
  readonly findingClustering?: FindingClusteringService;
  readonly routeClustering?: RouteClusteringService;
  readonly tokenDriftAnalysis?: TokenDriftAnalysisService;
  readonly componentMisuseAnalysis?: ComponentMisuseAnalysisService;
  readonly patternAnalysis?: PatternAnalysisService;
  readonly rootCauseSummary?: RootCauseSummaryService;
  readonly logger?: OperationalLogger;
}

export class AnalyzerAgent {
  private readonly findingClustering: FindingClusteringService;
  private readonly routeClustering: RouteClusteringService;
  private readonly tokenDriftAnalysis: TokenDriftAnalysisService;
  private readonly componentMisuseAnalysis: ComponentMisuseAnalysisService;
  private readonly patternAnalysis: PatternAnalysisService;
  private readonly rootCauseSummary: RootCauseSummaryService;
  private readonly logger: OperationalLogger;

  constructor(private readonly dependencies: AnalyzerAgentDependencies = {}) {
    this.findingClustering = dependencies.findingClustering ?? new FindingClusteringService();
    this.routeClustering = dependencies.routeClustering ?? new RouteClusteringService();
    this.tokenDriftAnalysis = dependencies.tokenDriftAnalysis ?? new TokenDriftAnalysisService();
    this.componentMisuseAnalysis = dependencies.componentMisuseAnalysis ?? new ComponentMisuseAnalysisService();
    this.patternAnalysis = dependencies.patternAnalysis ?? new PatternAnalysisService();
    this.rootCauseSummary = dependencies.rootCauseSummary ?? new RootCauseSummaryService();
    this.logger = dependencies.logger ?? createAgentLogger("AnalyzerAgent");
  }

  analyze(findings: readonly VerifiedFinding[]): OperationalInsightsReport {
    const correlationId = `analyzer:${Date.now()}`;
    const route = findings[0]?.route;
    const trace = this.logger.start("operational.analysis", {
      correlationId,
      ...(route ? { route } : {}),
      metadata: {
        inputFindingCount: findings.length,
      },
    });

    try {
      const activeFindings = findings.filter((finding) => finding.status !== "rejected");
      const clusters = this.findingClustering.cluster(activeFindings);
      const routeClusters = this.routeClustering.cluster(activeFindings);
      const tokenDrift = this.tokenDriftAnalysis.analyze(activeFindings);
      const componentMisuse = this.componentMisuseAnalysis.analyze(activeFindings);
      const recurringPatterns = this.patternAnalysis.analyze({
        findings: activeFindings,
        routeClusters,
        tokenDrift,
      });
      const rootCauseSummaries = this.rootCauseSummary.summarize({
        findings: activeFindings,
        tokenDrift,
        componentMisuse,
      });

      this.logger.complete(trace, {
        findingCount: activeFindings.length,
        clusterCount: clusters.length,
        patternCount: recurringPatterns.length,
      });

      return {
        reportId: `operational-insights:${new Date().toISOString()}`,
        generatedAt: new Date().toISOString(),
        findingCount: activeFindings.length,
        clusters,
        routeClusters,
        recurringPatterns,
        tokenDrift,
        componentMisuse,
        rootCauseSummaries,
      };
    } catch (error) {
      this.logger.fail(trace, error);
      throw error;
    }
  }
}
