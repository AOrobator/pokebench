// The trainer-card row: the opened older run first, then every live run, so a live run never loses its card.
export function cardRow<T extends { readonly runId: string }>(opened: T | null, live: readonly T[]): T[] {
  return opened === null ? [...live] : [opened, ...live.filter(card => card.runId !== opened.runId)];
}
