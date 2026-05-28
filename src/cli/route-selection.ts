import type { AppConfig, RouteConfig } from "../config/app-config.js";

export function selectRoute(config: AppConfig, routeSelector?: string): RouteConfig {
  if (!routeSelector) {
    const route = config.routes[0];

    if (!route) {
      throw new Error("No routes are configured.");
    }

    return route;
  }

  const exactMatch = config.routes.find(
    (route) => route.targetUrl === routeSelector || route.runLabel === routeSelector || new URL(route.targetUrl).pathname === routeSelector,
  );

  if (exactMatch) {
    return exactMatch;
  }

  if (routeSelector.startsWith("/")) {
    const baseRoute = config.routes[0];

    if (!baseRoute) {
      throw new Error("A relative route was provided, but no base route is configured.");
    }

    const baseUrl = new URL(baseRoute.targetUrl);
    baseUrl.pathname = routeSelector;
    baseUrl.search = "";
    baseUrl.hash = "";

    return {
      targetUrl: baseUrl.toString(),
      runLabel: routeSelector,
    };
  }

  return {
    targetUrl: routeSelector,
    runLabel: routeSelector,
  };
}
