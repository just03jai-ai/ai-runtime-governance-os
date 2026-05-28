export interface RouteMetadata {
  readonly targetUrl: string;
  readonly resolvedUrl: string;
  readonly title: string;
  readonly routeId?: string | undefined;
  readonly runLabel?: string | undefined;
}
