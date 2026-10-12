import { Type } from "typebox";
import { Value } from "typebox/value";

export class MilestoneError extends Error {
  override readonly name = "MilestoneError";
}

export interface SeenMilestone {
  readonly name: string;
  readonly serverTimestamp: number;
}

export interface MilestoneSource {
  poll(): Promise<SeenMilestone[]>;
}

const Payload = Type.Object({
  milestones: Type.Array(
    Type.Object({
      name: Type.String({ minLength: 1 }),
      completed: Type.Boolean(),
      timestamp: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
    }),
  ),
});

export class MilestoneWatcher implements MilestoneSource {
  private readonly seen = new Set<string>();

  constructor(
    private readonly gameServerUrl: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async poll(): Promise<SeenMilestone[]> {
    const url = `${this.gameServerUrl}/milestones`;
    const response = await this.fetchFn(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new MilestoneError(`GET ${url} returned HTTP ${String(response.status)}`);
    const body: unknown = await response.json();
    if (!Value.Check(Payload, body)) throw new MilestoneError(`malformed ${url} payload`);
    const fresh: SeenMilestone[] = [];
    for (const entry of body.milestones) {
      if (!entry.completed || this.seen.has(entry.name)) continue;
      if (typeof entry.timestamp !== "number") {
        throw new MilestoneError(`${url}: completed milestone ${entry.name} has no timestamp`);
      }
      fresh.push({ name: entry.name, serverTimestamp: entry.timestamp });
    }
    for (const milestone of fresh) this.seen.add(milestone.name);
    return fresh.sort((a, b) => a.serverTimestamp - b.serverTimestamp);
  }
}
