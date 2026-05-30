import { readFile } from "node:fs/promises";
import type { DesignSystemRegistry } from "./design-system-registry.js";
import { designSystemRegistrySchema } from "./design-system-registry.schema.js";

export class DesignSystemRegistryLoader {
  async loadFromFile(filePath: string): Promise<DesignSystemRegistry> {
    return designSystemRegistrySchema.parse(JSON.parse(await readFile(filePath, "utf8"))) as DesignSystemRegistry;
  }
}
