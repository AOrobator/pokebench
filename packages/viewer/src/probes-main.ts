// Boots the probes page: the probe and case the hash names, clicks that change the view, and a refresh every few
// seconds while any lane of the probe is still running.
import { defaultGroup, hashOf, keepGroup, pageHtml, parseHash, parseProbe, parseProbeList, type ViewState } from "./probes-view.js";
import type { ProbeDetail, ProbeSummary } from "./probes.js";

export const REFRESH_MS = 5000;

export interface ProbesDeps {
  readonly hash: string;
  readonly phone: boolean;
  now(): number;
  fetchJson(url: string): Promise<unknown>;
  every(tick: () => Promise<void>, ms: number): () => void;
  setHash(hash: string): void;
}

export async function mountProbes(doc: Document, deps: ProbesDeps): Promise<void> {
  const app = doc.querySelector<HTMLElement>('[data-pr="app"]');
  if (app === null) throw new Error('probes page is missing [data-pr="app"]');
  const list: ProbeSummary[] = parseProbeList(await deps.fetchJson("/api/probes"));
  if (list.length === 0) {
    app.innerHTML = '<section class="box"><p class="pr-note">No probes yet. A probe shows here once runs/probes/ names it: a folder with manifest.json and one folder per lane, or a pointer file &lt;id&gt;.json.</p></section>';
    return;
  }
  const load = async (id: string): Promise<ProbeDetail> => parseProbe(await deps.fetchJson(`/api/probes/${encodeURIComponent(id)}`));
  const wanted = parseHash(deps.hash);
  let detail = await load(list.find((p) => p.id === wanted.probe)?.id ?? list[0]?.id ?? "");
  const fresh = (p: ProbeDetail, caseId: string | null): ViewState => ({
    probe: p.id, group: defaultGroup(p), caseId: p.cases.find((c) => c.id === caseId)?.id ?? p.cases[0]?.id ?? "", sample: null, blind: false, plot: false,
  });
  let state = fresh(detail, wanted.caseId);
  const render = (refresh = false): void => {
    const dialog = refresh ? app.querySelector<HTMLElement>(".pr-dialog") : null;
    const top = dialog?.scrollTop ?? 0, left = dialog?.scrollLeft ?? 0;
    const problemsOpen = refresh && app.querySelector<HTMLDetailsElement>(".pr-problems")?.open === true;
    const active = refresh && app.contains(doc.activeElement) ? doc.activeElement : null;
    const key = ["data-probe", "data-group", "data-blind", "data-sample", "data-case"].find(name => active?.hasAttribute(name));
    const focus = key === undefined ? [".pr-problems > summary", ".pr-more > summary"].find(selector => active?.matches(selector)) ?? null : `[${key}="${CSS.escape(active?.getAttribute(key) ?? "")}"]`;
    const scroller = refresh ? doc.scrollingElement : null, pageTop = scroller?.scrollTop ?? 0;
    const anchor = pageTop === 0 ? undefined : [".pr-dialog", ".pr-more", ".pr-main", ".pr-scene", ".pr-slots"].find(selector => {
      const rect = app.querySelector(selector)?.getBoundingClientRect();
      return rect !== undefined && rect.bottom > 0 && rect.top < (doc.defaultView?.innerHeight ?? 0);
    });
    const offset = anchor === undefined ? 0 : app.querySelector(anchor)?.getBoundingClientRect().top ?? 0;
    app.innerHTML = pageHtml(detail, state, deps.now(), deps.phone, list);
    if (!refresh) return;
    const nextDialog = app.querySelector<HTMLElement>(".pr-dialog"), problems = app.querySelector<HTMLDetailsElement>(".pr-problems");
    if (nextDialog !== null) { nextDialog.scrollTop = top; nextDialog.scrollLeft = left; }
    if (problems !== null) problems.open = problemsOpen;
    if (focus !== null) app.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
    if (scroller !== null) {
      const nextAnchor = anchor === undefined ? null : app.querySelector(anchor);
      scroller.scrollTop = nextAnchor === null ? pageTop : nextAnchor.getBoundingClientRect().top + scroller.scrollTop - offset;
    }
  };
  let stop: (() => void) | null = null, busy = false;
  const sync = (): void => {
    const live = detail.lanes.some((l) => l.state === "running");
    if (live && stop === null) {
      stop = deps.every(async () => {
        if (busy) return;
        busy = true;
        const id = state.probe;
        try {
          const next = await load(id);
          // A probe switch while this refresh was in flight wins over the older probe's reply.
          if (id === state.probe) { state = { ...state, group: keepGroup(detail, next, state.group) }; detail = next; render(true); sync(); }
        } finally { busy = false; }
      }, REFRESH_MS);
    } else if (!live && stop !== null) { stop(); stop = null; }
  };
  render();
  sync();
  app.addEventListener("click", (event) => {
    const target = event.target as Element;
    const summary = target.closest("details.pr-more > summary");
    const hit = target.closest("[data-group],[data-blind],[data-sample],[data-case]");
    if (summary !== null) { event.preventDefault(); state = { ...state, plot: !state.plot }; render(); return; }
    if (hit === null) return;
    const group = hit.getAttribute("data-group"), sample = hit.getAttribute("data-sample"), caseId = hit.getAttribute("data-case");
    if (group !== null) state = { ...state, group, sample: null };
    else if (hit.hasAttribute("data-blind")) state = { ...state, blind: !state.blind };
    else if (sample !== null) state = { ...state, sample };
    else if (caseId !== null) { state = { ...state, caseId, sample: null }; deps.setHash(hashOf(state.probe, caseId)); }
    render();
  });
  app.addEventListener("change", (event) => {
    const select = (event.target as Element).closest<HTMLSelectElement>("select[data-probe]");
    if (select === null) return;
    void load(select.value).then((p) => {
      detail = p; state = fresh(p, null); stop?.(); stop = null;
      deps.setHash(hashOf(p.id, state.caseId)); render(); sync();
    });
  });
}

export function bootProbes(win: Window): Promise<void> {
  return mountProbes(win.document, {
    hash: win.location.hash, phone: win.document.documentElement.hasAttribute("data-phone"), now: () => Date.now(),
    fetchJson: async (url) => { const response = await win.fetch(url); if (!response.ok) throw new Error(`GET ${url} returned HTTP ${String(response.status)}`); return response.json() as Promise<unknown>; },
    every: (tick, ms) => { const timer = win.setInterval(() => { void tick(); }, ms); return () => { win.clearInterval(timer); }; },
    setHash: (hash) => { win.history.replaceState(null, "", hash); },
  });
}
