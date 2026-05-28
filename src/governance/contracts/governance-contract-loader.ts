import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GovernanceContract } from "./governance-contract.js";
import { governanceContractSetSchema } from "./governance-contract.schema.js";

export class GovernanceContractLoader {
  async loadFromDirectory(directoryPath: string): Promise<readonly GovernanceContract[]> {
    const entries = await readdir(directoryPath);
    const contractFiles = entries.filter((entry) => entry.endsWith(".contract.json")).sort();
    const contracts = await Promise.all(
      contractFiles.map(async (fileName) => JSON.parse(await readFile(join(directoryPath, fileName), "utf8"))),
    );

    return governanceContractSetSchema.parse(contracts);
  }
}
