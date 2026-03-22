export function getValueByPath<T>(input: unknown, path: string): T {
  const segments = normalizePath(path);
  let current: unknown = input;

  for (const segment of segments) {
    if (typeof current !== 'object' || current === null || !(segment in current)) {
      throw new Error(`Config path not found: ${path}`);
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current as T;
}

export function setValueByPath<T extends object>(
  input: T,
  path: string,
  value: unknown,
): T {
  const segments = normalizePath(path);
  const clone = structuredClone(input) as Record<string, unknown>;
  let current: Record<string, unknown> = clone;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!segment) {
      throw new Error(`Config path not found: ${path}`);
    }

    const next = current[segment];
    if (typeof next !== 'object' || next === null) {
      throw new Error(`Config path not found: ${path}`);
    }

    current = next as Record<string, unknown>;
  }

  const lastSegment = segments.at(-1);
  if (!lastSegment) {
    throw new Error(`Config path not found: ${path}`);
  }

  current[lastSegment] = value;
  return clone as T;
}

export function mergeConfig<T>(base: T, patch: Partial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return structuredClone(patch as T);
  }

  const result: Record<string, unknown> = structuredClone(base as Record<string, unknown>);

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }

    const current = result[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      result[key] = mergeConfig(current, value);
      continue;
    }

    result[key] = value;
  }

  return result as T;
}

function normalizePath(path: string): string[] {
  const segments = path.split('.').map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) {
    throw new Error('Config path is required');
  }
  return segments;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
