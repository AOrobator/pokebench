// The PokéNav ★ NEXT RUN page: edits the draft for the next run, shows strict
// per-feature history for it, and queues it behind the live run.
import type { FeatureInfo, SwitchableFeature } from "@pokebench/agent/features";
import { THINKING_LEVELS, TARGETS, differenceCount, queueText, switchboard, type HistoryMap, type LocalModel, type NextRunDraft, type QueueStatus } from "./controls.js";
import { esc, num } from "./format.js";
import type { RunView } from "./model.js";

export interface PanelDeps {
  fetchJson(url: string): Promise<unknown>;
  sendJson(method: "POST" | "PUT", url: string, body: unknown): Promise<unknown>;
  problem(text: string): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function features(value: unknown): FeatureInfo[] {
  if (!isRecord(value) || !Array.isArray(value["features"])) throw new Error("malformed /api/features payload");
  const list: unknown[] = value["features"];
  if (!list.every((f) => isRecord(f) && typeof f["id"] === "string" && typeof f["title"] === "string" && typeof f["description"] === "string" && typeof f["group"] === "string" && typeof f["switchable"] === "boolean" && (f["needs"] === null || typeof f["needs"] === "string"))) throw new Error("malformed feature");
  return list as FeatureInfo[];
}

function draftOf(value: unknown): NextRunDraft {
  const draft = isRecord(value) ? value["draft"] : null;
  if (!isRecord(draft) || typeof draft["model"] !== "string" || !isRecord(draft["features"])) throw new Error("malformed next-run payload");
  return draft as unknown as NextRunDraft;
}

function queueOf(value: unknown): QueueStatus {
  const queue = isRecord(value) ? value["queue"] : null;
  if (!isRecord(queue) || typeof queue["state"] !== "string") throw new Error("malformed queue status");
  return queue as unknown as QueueStatus;
}

function modelsOf(value: unknown): LocalModel[] {
  const models = isRecord(value) ? value["models"] : null;
  if (!Array.isArray(models) || !models.every((m) => isRecord(m) && typeof m["id"] === "string")) throw new Error("malformed models payload");
  return models as LocalModel[];
}

export class NextRunPanel {
  registry: FeatureInfo[] = [];
  draft: NextRunDraft | null = null;
  models: LocalModel[] = [];
  modelsProblem: string | null = null;
  history: HistoryMap = {};
  queue: QueueStatus = { state: "idle" };
  readonly expanded = new Set<string>();
  private live: ReadonlySet<string> | null = null;
  private liveView: RunView | null = null;
  private saving = 0;

  constructor(private readonly doc: Document, private readonly deps: PanelDeps) {}

  private ui(name: string): HTMLElement {
    const element = this.doc.querySelector<HTMLElement>(`[data-ui="${name}"]`);
    if (element === null) throw new Error(`page is missing [data-ui="${name}"]`);
    return element;
  }

  async load(): Promise<void> {
    try {
      this.registry = features(await this.deps.fetchJson("/api/features"));
      const next = await this.deps.fetchJson("/api/next-run");
      this.draft = draftOf(next);
      this.queue = queueOf(next);
    } catch (error) {
      this.deps.problem(`next run: ${String(error)}`);
      return;
    }
    try {
      this.models = modelsOf(await this.deps.fetchJson("/api/models"));
      this.modelsProblem = null;
    } catch (error) {
      this.modelsProblem = String(error);
    }
    await this.refreshHistory();
    this.wire();
    this.render();
  }

  private async refreshHistory(): Promise<void> {
    try {
      const value = await this.deps.fetchJson("/api/features/history");
      if (!isRecord(value)) throw new Error("malformed history payload");
      this.history = value;
    } catch (error) {
      this.deps.problem(`feature history: ${String(error)}`);
    }
  }

  // The live run keeps its own features; the switchboard flags differences.
  setLive(view: RunView | null): void {
    const start = view?.start ?? null;
    const live = start === null || view?.end !== null ? null : new Set(start.harness_features);
    const changed = (live === null) !== (this.live === null) || (live !== null && this.live !== null && [...live].some((f) => !this.live?.has(f)));
    this.live = live;
    this.liveView = view;
    if (changed) this.render();
  }

  private async save(draft: NextRunDraft): Promise<void> {
    this.draft = draft;
    this.render();
    const request = ++this.saving;
    try {
      const reply = await this.deps.sendJson("PUT", "/api/next-run", draft);
      if (request !== this.saving) return;
      this.draft = draftOf(reply);
      this.queue = queueOf(reply);
      await this.refreshHistory();
    } catch (error) {
      this.deps.problem(`save next run: ${String(error)}`);
    }
    this.render();
  }

  private change(edit: (draft: NextRunDraft) => NextRunDraft): void {
    if (this.draft === null) return;
    void this.save(edit(structuredClone(this.draft)));
  }

  // Turning a feature on also turns on what it needs; turning one off turns
  // off what depends on it, so the draft never breaks a dependency.
  toggle(id: SwitchableFeature, on: boolean): void {
    this.change((draft) => {
      const set = (feature: SwitchableFeature, value: boolean): void => {
        draft.features[feature] = value;
        const info = this.registry.find((f) => f.id === feature);
        if (value && info?.needs != null) set(info.needs, true);
        if (!value) for (const dependent of this.registry.filter((f) => f.needs === feature)) if (draft.features[dependent.id as SwitchableFeature]) set(dependent.id as SwitchableFeature, false);
      };
      set(id, on);
      return draft;
    });
  }

  copyLive(): void {
    const start = this.liveView?.start;
    if (start === undefined || start === null) return;
    this.change((draft) => ({
      ...draft,
      model: start.model.id,
      thinking: start.sampling.thinking_level as NextRunDraft["thinking"],
      maxTokens: start.sampling.max_tokens,
      maxTurns: start.budgets.max_turns ?? draft.maxTurns,
      maxWallMs: start.budgets.max_wall_ms ?? draft.maxWallMs,
      failureLimit: start.evaluation?.failure_limit ?? draft.failureLimit,
      target: start.evaluation?.target ?? null,
      features: Object.fromEntries(this.registry.filter((f) => f.switchable).map((f) => [f.id, start.harness_features.includes(f.id)])) as Record<SwitchableFeature, boolean>,
    }));
  }

  reset(): void {
    this.change((draft) => ({ ...draft, thinking: "medium", maxTurns: 300, maxWallMs: 30 * 60_000, failureLimit: 3, maxTokens: 4096, target: null, features: Object.fromEntries(this.registry.filter((f) => f.switchable).map((f) => [f.id, true])) as Record<SwitchableFeature, boolean> }));
  }

  async queueRun(): Promise<void> {
    if (this.draft === null) return;
    try {
      this.queue = queueOf(await this.deps.sendJson("POST", "/api/next-run/queue", this.draft));
    } catch (error) {
      this.deps.problem(`queue: ${String(error)}`);
    }
    this.render();
  }

  async cancel(): Promise<void> {
    try {
      this.queue = queueOf(await this.deps.sendJson("POST", "/api/next-run/cancel", {}));
    } catch (error) {
      this.deps.problem(`cancel: ${String(error)}`);
    }
    this.render();
  }

  async poll(): Promise<void> {
    if (this.draft === null) return;
    try {
      this.queue = queueOf(await this.deps.fetchJson("/api/next-run"));
    } catch (error) {
      this.deps.problem(`queue status: ${String(error)}`);
    }
    this.render();
  }

  private wire(): void {
    this.ui("switchboard").addEventListener("change", (event) => {
      const input = event.target as HTMLInputElement;
      const id = input.dataset.feature;
      if (id !== undefined) this.toggle(id as SwitchableFeature, input.checked);
    });
    this.ui("switchboard").addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>("[data-expand]");
      const id = button?.dataset.expand;
      if (id === undefined) return;
      if (this.expanded.has(id)) this.expanded.delete(id);
      else this.expanded.add(id);
      this.render();
    });
    this.ui("next-thinking").addEventListener("click", (event) => {
      const level = (event.target as HTMLElement).closest<HTMLElement>("[data-level]")?.dataset.level;
      if (level !== undefined) this.change((draft) => ({ ...draft, thinking: level as NextRunDraft["thinking"] }));
    });
    this.ui("next-model").addEventListener("change", (event) => {
      const model = (event.target as HTMLSelectElement).value;
      this.change((draft) => ({ ...draft, model }));
    });
    this.ui("next-target").addEventListener("change", (event) => {
      const target = (event.target as HTMLSelectElement).value;
      this.change((draft) => ({ ...draft, target: target === "" ? null : target }));
    });
    const number = (name: string, apply: (draft: NextRunDraft, value: number) => NextRunDraft): void => {
      this.ui(name).addEventListener("change", (event) => {
        const value = Number((event.target as HTMLInputElement).value);
        if (Number.isInteger(value) && value > 0) this.change((draft) => apply(draft, value));
        else this.render();
      });
    };
    number("next-max-turns", (draft, maxTurns) => ({ ...draft, maxTurns }));
    number("next-time-cap", (draft, minutes) => ({ ...draft, maxWallMs: minutes * 60_000 }));
    number("next-failures", (draft, failureLimit) => ({ ...draft, failureLimit }));
    number("next-max-tokens", (draft, maxTokens) => ({ ...draft, maxTokens }));
    this.ui("next-copy").addEventListener("click", () => { this.copyLive(); });
    this.ui("next-reset").addEventListener("click", () => { this.reset(); });
    this.ui("next-queue").addEventListener("click", () => { void this.queueRun(); });
    this.ui("next-cancel").addEventListener("click", () => { void this.cancel(); });
  }

  private setHtml(name: string, html: string): void {
    const element = this.ui(name);
    if (element.innerHTML !== html) element.innerHTML = html;
  }

  render(): void {
    const draft = this.draft;
    if (draft === null) return;
    const differs = differenceCount(this.registry, draft, this.live);
    this.setHtml("next-note", `<span>You're editing the NEXT run.${this.live === null ? " No run is live right now." : ` The live run keeps the features it started with. ${String(differs)} switch${differs === 1 ? "" : "es"} differ${differs === 1 ? "s" : ""} from it.`}</span>`);
    const models = this.models.some((m) => m.id === draft.model) || draft.model === "" ? this.models : [...this.models, { id: draft.model, status: "not served now", vision: false, contextWindow: null }];
    const select = this.ui("next-model") as HTMLSelectElement;
    const options = `<option value=""${draft.model === "" ? " selected" : ""}>choose a local model</option>${models.map((m) => `<option value="${esc(m.id)}"${m.id === draft.model ? " selected" : ""}>${esc(m.id)}${m.vision ? "" : " (no vision)"}</option>`).join("")}`;
    if (select.innerHTML !== options) select.innerHTML = options;
    select.value = draft.model;
    const chosen = models.find((m) => m.id === draft.model);
    this.setHtml("next-model-info", this.modelsProblem !== null ? `<dt>MODELS</dt><dd class="warn">${esc(this.modelsProblem)}</dd>` : `<dt>SERVED BY</dt><dd>llama-server · 127.0.0.1</dd><dt>STATUS</dt><dd>${esc(chosen?.status ?? "—")}</dd><dt>CONTEXT</dt><dd>${chosen?.contextWindow == null ? "—" : num(chosen.contextWindow)}</dd>`);
    this.setHtml("next-thinking", THINKING_LEVELS.map((level) => `<button type="button" role="radio" aria-checked="${String(level === draft.thinking)}" data-level="${level}" class="${level === draft.thinking ? "on" : ""}">${level.toUpperCase()}</button>`).join(""));
    const values: [string, number][] = [["next-max-turns", draft.maxTurns], ["next-time-cap", Math.round(draft.maxWallMs / 60_000)], ["next-failures", draft.failureLimit], ["next-max-tokens", draft.maxTokens]];
    for (const [name, value] of values) {
      const input = this.ui(name) as HTMLInputElement;
      if (this.doc.activeElement !== input) input.value = String(value);
    }
    const target = this.ui("next-target") as HTMLSelectElement;
    const targets = `<option value=""${draft.target === null ? " selected" : ""}>NONE (play to budget)</option>${TARGETS.map((t) => `<option value="${t}"${t === draft.target ? " selected" : ""}>${t}</option>`).join("")}`;
    if (target.innerHTML !== targets) target.innerHTML = targets;
    target.value = draft.target ?? "";
    const locked = this.queue.state === "queued" || this.queue.state === "launching";
    this.setHtml("switchboard", switchboard({ features: this.registry, draft, live: this.live, history: this.history, expanded: this.expanded, locked }));
    // The queued run launches with the settings it was queued with: editing is
    // locked until it is cancelled or has launched.
    for (const input of this.doc.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('.next-left input, .next-left select, .next-left [data-level], [data-ui="next-copy"], [data-ui="next-reset"]')) input.disabled = locked;
    if (locked) this.setHtml("next-note", "<span>The queued run will use these settings. Cancel it to edit the next run.</span>");
    this.ui("next-queue-status").innerHTML = queueText(this.queue);
    const queueButton = this.ui("next-queue") as HTMLButtonElement;
    queueButton.disabled = draft.model === "" || this.queue.state === "queued" || this.queue.state === "launching" || this.queue.state === "running";
    queueButton.textContent = this.live === null ? "▶ START NEXT RUN" : "▶ START WHEN LIVE RUN ENDS";
    this.ui("next-cancel").hidden = this.queue.state !== "queued";
  }
}
