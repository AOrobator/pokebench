// Boots the Reports page: the list and card, or with ?open=<slug> the report itself under the viewer's bar.
import { loadCardArt } from "./card-dom.js";
import { detailHtml, listHtml, openedHtml, parseReportList } from "./reports-view.js";

export interface ReportsDeps { readonly search: string; readonly hash: string; fetchJson(url: string): Promise<unknown> }

export async function mountReports(doc: Document, deps: ReportsDeps): Promise<void> {
  const part = (name: string): HTMLElement => {
    const el = doc.querySelector<HTMLElement>(`[data-rp="${name}"]`);
    if (el === null) throw new Error(`reports page is missing [data-rp="${name}"]`);
    return el;
  };
  const entries = parseReportList(await deps.fetchJson("/api/reports"));
  const open = new URLSearchParams(deps.search).get("open");
  part("index").hidden = open !== null;
  part("open").hidden = open === null;
  if (open !== null) { part("open").innerHTML = openedHtml(entries, open); return; }
  const art = (await loadCardArt((url) => deps.fetchJson(url)))?.art ?? null;
  const wanted = decodeURIComponent(deps.hash.replace(/^#/, ""));
  const show = (slug: string): void => {
    const i = Math.max(0, entries.findIndex(r => r.slug === slug)), entry = entries[i];
    part("list").innerHTML = listHtml(entries, entry?.slug ?? "");
    part("detail").innerHTML = entry === undefined ? '<p class="rp-empty">No reports yet. The run-analysis skill writes them to runs/reports/run-analysis/.</p>' : detailHtml(entry, entries.length - i, art);
  };
  show(wanted);
  part("list").addEventListener("click", (event) => {
    const row = (event.target as Element).closest<HTMLElement>("[data-report]");
    if (row === null) return;
    event.preventDefault();
    show(row.dataset.report ?? "");
    doc.defaultView?.history.replaceState(null, "", `#${row.dataset.report ?? ""}`);
    doc.querySelector<HTMLElement>(`[data-report="${CSS.escape(row.dataset.report ?? "")}"]`)?.focus();
  });
}

export function bootReports(win: Window): Promise<void> {
  return mountReports(win.document, {
    search: win.location.search, hash: win.location.hash,
    fetchJson: async (url) => { const response = await win.fetch(url); if (!response.ok) throw new Error(`GET ${url} returned HTTP ${String(response.status)}`); return response.json() as Promise<unknown>; },
  });
}
