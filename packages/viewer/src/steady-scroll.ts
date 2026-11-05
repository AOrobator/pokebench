// An auto-update can change what sits above the reader, so holding scrollTop is not enough: Safari has no
// scroll anchoring, and Chromium's loses its anchor when a redraw replaces the row. Rows that can be read
// carry data-keep and controls carry data-focus, with values that survive a redraw. See the steady-screen skill.
export interface Place { readonly key: string | null; readonly top: number; readonly focus: string | null }

const rows = (pane: HTMLElement): HTMLElement[] => [...pane.querySelectorAll<HTMLElement>("[data-keep]")];

export function readPlace(pane: HTMLElement, active: Element | null): Place {
  const edge = Math.max(pane.getBoundingClientRect().top, 0);
  const row = rows(pane).find(item => {
    const box = item.getBoundingClientRect();
    return box.height > 0 && box.bottom > edge && item.querySelector("[data-keep]") === null;
  });
  const control = active !== null && pane.contains(active) ? active.closest<HTMLElement>("[data-focus]") : null;
  return { key: row?.dataset.keep ?? null, top: row?.getBoundingClientRect().top ?? 0, focus: control?.dataset.focus ?? null };
}

export function returnToPlace(pane: HTMLElement, place: Place): void {
  const row = rows(pane).find(item => item.dataset.keep === place.key);
  // An unmoved row writes nothing, because writing scrollTop stops a touch scroll's momentum.
  const moved = row === undefined ? 0 : row.getBoundingClientRect().top - place.top;
  if (moved !== 0) pane.scrollTop += moved;
  if (place.focus !== null) [...pane.querySelectorAll<HTMLElement>("[data-focus]")].find(item => item.dataset.focus === place.focus)?.focus({ preventScroll: true });
}
