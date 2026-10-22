// A served report runs sandboxed in an opaque origin, so the viewer page around it cannot read how far down it
// is. The viewer appends this probe to every report page it serves; it posts that fraction (0 at the top, 1 at
// the bottom or when the report fits) to the parent. It is sent as source text, so it must use nothing outside
// itself.
export function reportScrollProbe(win: Window & { readonly ResizeObserver: typeof ResizeObserver }): void {
  const root = win.document.documentElement;
  const post = (): void => {
    const max = root.scrollHeight - win.innerHeight;
    win.parent.postMessage({ pokebenchReportScroll: max <= 0 ? 1 : Math.min(1, Math.max(0, win.scrollY / max)) }, "*");
  };
  win.addEventListener("scroll", post, { passive: true });
  win.addEventListener("resize", post);
  win.addEventListener("load", post);
  new win.ResizeObserver(post).observe(root);
  post();
}

export const REPORT_SCROLL_SCRIPT = `<script>(${reportScrollProbe.toString()})(window);</script>`;
