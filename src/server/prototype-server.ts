import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { ConfigLoader } from "../config/config-loader.js";
import { createExecutionRequest, createRuntimePipeline, resolveContractsDirectory } from "../cli/pipeline-factory.js";
import { OperationalDashboardGenerator } from "../reports/dashboard/operational-dashboard-generator.js";

const port = Number(process.env.PORT ?? 3000);
const projectRoot = process.cwd();
const prototypeRoot = resolve(projectRoot, "prototype");
const artifactsRoot = resolve(projectRoot, "artifacts");

const mimeTypes: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

let auditInProgress = false;

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/api/audit") {
      await handleAudit(request, response);
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      await serveStatic(request, response);
      return;
    }

    sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, 500, { error: message });
  }
});

server.listen(port, () => {
  console.log(`Prototype server running at http://localhost:${port}`);
});

async function handleAudit(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (auditInProgress) {
    sendJson(response, 409, { error: "An audit is already running. Wait for it to finish before starting another." });
    return;
  }

  auditInProgress = true;

  try {
    const body = await readRequestBody(request);
    const payload = JSON.parse(body) as { url?: string };
    const targetUrl = normalizeTargetUrl(payload.url ?? "");
    const config = await new ConfigLoader().load();
    const pipeline = createRuntimePipeline(config, { verbose: false });
    const result = await pipeline.run({
      executionRequest: createExecutionRequest(config, {
        targetUrl,
        runLabel: targetUrl,
      }),
      contractsDirectory: resolveContractsDirectory(),
      retryPolicy: config.retry.stages,
    });
    const dashboardPath = await new OperationalDashboardGenerator(undefined, {
      outputDirectory: "prototype/dashboard",
    }).generate({
      findings: result.verifiedFindings,
      insights: result.operationalInsights,
      screenshots: result.runtimeEvidence.screenshots.map((screenshot) => ({
        ...screenshot,
        path: screenshot.path.startsWith("/") ? screenshot.path : `/${screenshot.path}`,
      })),
      executionMetrics: result.metrics,
      generatedAt: new Date().toISOString(),
    });

    sendJson(response, 200, {
      runId: result.runtimeEvidence.execution.runId,
      route: result.runtimeEvidence.route.resolvedUrl,
      status: result.runtimeEvidence.execution.status,
      governanceScore: result.findingsReport.governanceScore.score,
      governanceFindings: result.governanceFindings.length,
      verifiedFindings: result.verifiedFindings.length,
      dashboardUrl: "/dashboard/",
      dashboardPath,
      evidenceDirectory: result.runtimeEvidence.execution.runId,
      stages: result.metrics.map((metric) => ({
        stage: metric.stage,
        status: metric.status,
        durationMs: metric.durationMs,
      })),
    });
  } finally {
    auditInProgress = false;
  }
}

async function serveStatic(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const requestUrl = new URL(request.url ?? "/", `http://localhost:${port}`);
  const staticPath = resolveStaticPath(requestUrl.pathname);

  try {
    const fileStat = await stat(staticPath);
    const filePath = fileStat.isDirectory() ? join(staticPath, "index.html") : staticPath;
    const content = await readFile(filePath);
    response.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });

    if (request.method !== "HEAD") {
      response.end(content);
      return;
    }

    response.end();
  } catch {
    sendJson(response, 404, { error: "Not found." });
  }
}

function resolveStaticPath(pathname: string): string {
  const decodedPath = decodeURIComponent(pathname);

  if (decodedPath.startsWith("/artifacts/")) {
    const artifactPath = resolve(projectRoot, normalize(decodedPath.slice(1)));
    assertInsideRoot(artifactPath, artifactsRoot);
    return artifactPath;
  }

  const relativePath = decodedPath === "/" ? "index.html" : normalize(decodedPath.replace(/^\/+/, ""));
  const filePath = resolve(prototypeRoot, relativePath);
  assertInsideRoot(filePath, prototypeRoot);
  return filePath;
}

function assertInsideRoot(filePath: string, root: string): void {
  if (!filePath.startsWith(root)) {
    throw new Error("Refusing to serve path outside the allowed directory.");
  }
}

function normalizeTargetUrl(rawUrl: string): string {
  const trimmedUrl = rawUrl.trim();

  if (!trimmedUrl) {
    throw new Error("Enter a URL to audit.");
  }

  if (trimmedUrl.startsWith("data:")) {
    return trimmedUrl;
  }

  try {
    const parsedUrl = new URL(trimmedUrl);

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error("Only http and https URLs are supported.");
    }

    return parsedUrl.toString();
  } catch {
    return new URL(`https://${trimmedUrl}`).toString();
  }
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > 16_384) {
      throw new Error("Request body is too large.");
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}
