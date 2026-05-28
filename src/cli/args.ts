export interface ParsedCliArgs {
  readonly command: readonly string[];
  readonly flags: Readonly<Record<string, string | boolean>>;
}

const npmConfigFlagNames = [
  "config",
  "contracts",
  "env",
  "evidence",
  "findings",
  "latest",
  "out",
  "route",
  "verbose",
];

export function parseCliArgs(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): ParsedCliArgs {
  const command: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token) {
      continue;
    }

    if (!token.startsWith("--")) {
      command.push(token);
      continue;
    }

    const flag = token.slice(2);
    const [name = "", inlineValue] = flag.split("=", 2);
    const nextToken = argv[index + 1];

    if (!name) {
      continue;
    }

    if (inlineValue !== undefined) {
      flags[name] = inlineValue;
      continue;
    }

    if (nextToken && !nextToken.startsWith("--")) {
      flags[name] = nextToken;
      index += 1;
      continue;
    }

    flags[name] = true;
  }

  for (const name of npmConfigFlagNames) {
    const envValue = env[`npm_config_${name.replaceAll("-", "_")}`];

    if (flags[name] === undefined && envValue !== undefined) {
      flags[name] = envValue === "true" ? true : envValue;
    }
  }

  return {
    command,
    flags,
  };
}

export function flagValue(args: ParsedCliArgs, name: string): string | undefined {
  const value = args.flags[name];
  return typeof value === "string" ? value : undefined;
}

export function hasFlag(args: ParsedCliArgs, name: string): boolean {
  return args.flags[name] === true || args.flags[name] === "true";
}
