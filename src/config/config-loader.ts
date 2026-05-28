import { readFile } from "node:fs/promises";
import type { AppConfig } from "./app-config.js";
import { appConfigSchema } from "./app-config.schema.js";
import { ConfigValidationError } from "./config-validation-error.js";
import { defaultConfig } from "./default-config.js";
import { environmentOverrides } from "./environment-overrides.js";
import { mergeConfig, type DeepPartial } from "./merge-config.js";

export interface ConfigLoaderOptions {
  readonly environment?: AppConfig["environment"];
  readonly overrides?: DeepPartial<AppConfig>;
  readonly configFilePath?: string;
}

export class ConfigLoader {
  async load(options: ConfigLoaderOptions = {}): Promise<AppConfig> {
    const environment = options.environment ?? defaultConfig.environment;
    const environmentConfig = environmentOverrides[environment] ?? {};
    const fileConfig = options.configFilePath ? await this.loadConfigFile(options.configFilePath) : {};
    const merged = mergeConfig(mergeConfig(mergeConfig(defaultConfig, environmentConfig), fileConfig), options.overrides);
    const parsed = appConfigSchema.safeParse(merged);

    if (!parsed.success) {
      throw new ConfigValidationError(parsed.error.issues);
    }

    return parsed.data;
  }

  private async loadConfigFile(configFilePath: string): Promise<DeepPartial<AppConfig>> {
    return JSON.parse(await readFile(configFilePath, "utf8")) as DeepPartial<AppConfig>;
  }
}
