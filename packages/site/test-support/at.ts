// Indexing helpers for tests: fail loudly instead of asserting non-null.

export function at<T>(xs: readonly T[], i: number): T {
  const x = xs[i];
  if (x === undefined) throw new Error(`no item ${String(i)}`);
  return x;
}

export function rec(list: unknown, i: number): Record<string, unknown> {
  if (!Array.isArray(list)) throw new Error("not a list");
  const x: unknown = list[i];
  if (typeof x !== "object" || x === null) throw new Error(`item ${String(i)} is not an object`);
  return x as Record<string, unknown>;
}

export function find<T>(xs: readonly T[], test: (x: T) => boolean): T {
  const x = xs.find(test);
  if (x === undefined) throw new Error("not found");
  return x;
}
