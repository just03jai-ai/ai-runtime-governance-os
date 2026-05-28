import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Page } from "playwright";
import type { ScreenshotEvidence } from "../contracts/evidence.js";
import type { ViewportContract } from "../contracts/execution.js";

export class ScreenshotService {
  async capture(page: Page, outputPath: string, viewport: ViewportContract): Promise<ScreenshotEvidence> {
    await mkdir(dirname(outputPath), { recursive: true });
    await page.screenshot({ path: outputPath, fullPage: true });

    return {
      path: outputPath,
      capturedAt: new Date().toISOString(),
      viewport: {
        width: viewport.width,
        height: viewport.height,
      },
    };
  }
}
