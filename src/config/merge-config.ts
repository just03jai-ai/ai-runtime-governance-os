export type DeepPartial<T> = {
  readonly [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export function mergeConfig<T extends object>(base: T, override: DeepPartial<T> = {}): T {
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };

  for (const [key, overrideValue] of Object.entries(override)) {
    if (overrideValue === undefined) {
      continue;
    }

    const baseValue = result[key];
    const shouldMerge =
      isPlainObject(baseValue) && isPlainObject(overrideValue) && !Array.isArray(baseValue) && !Array.isArray(overrideValue);

    result[key] = shouldMerge
      ? mergeConfig(baseValue as Record<string, unknown>, overrideValue as Record<string, unknown>)
      : overrideValue;
  }

  return result as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
