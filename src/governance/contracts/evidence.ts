export interface ScreenshotEvidence {
  readonly path: string;
  readonly capturedAt: string;
  readonly viewport: {
    readonly width: number;
    readonly height: number;
  };
}
