export type OperationalDomain = "agents" | "runtime" | "governance" | "reports" | "shared";

export interface OperationalModuleDescriptor {
  readonly domain: OperationalDomain;
  readonly name: string;
  readonly owner: string;
  readonly status: "active" | "reserved";
}
