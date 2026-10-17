// The trainer cards' page plumbing, shared by the viewer header and the comparisons page: loading the
// ROM art, keeping a row of cards in step without restarting their animations, and the per-second fill.
import { paintGameText, parseGameFont, type GameFont, type GlyphPixels, type GlyphSheet } from "./game-font.js";
import { clockParts, parseCardArt, type CardArt, type CardInput } from "./trainer-card.js";

export interface LoadedArt { readonly art: CardArt; readonly font: GameFont | null; readonly glyphs: GlyphSheet | null }

// Null when the art was never built (`just trainer-card-art`); the page then keeps its older look. A font or
// glyph sheet that fails to load leaves the cards with plain text.
export async function loadCardArt(fetchJson: (url: string) => Promise<unknown>, loadGlyphSheet?: (url: string) => Promise<GlyphSheet | null>): Promise<LoadedArt | null> {
  let art: CardArt | null;
  try { art = parseCardArt(await fetchJson("/sprites/manifest.json")); } catch { return null; }
  if (art === null) return null;
  try {
    const font = parseGameFont(await fetchJson("/sprites/font/glyphs.json"));
    return { art, font, glyphs: font === null ? null : (await loadGlyphSheet?.("/sprites/font/glyphs.png")) ?? null };
  } catch {
    return { art, font: null, glyphs: null };
  }
}

// One element per card (the card, or a wrapper holding it); an element is replaced only when its own markup
// changes, so the others keep their animations and stay put under the pointer, and a focused card that is
// redrawn keeps keyboard focus.
export function syncCards(row: Element, htmls: readonly string[], memo: WeakMap<Element, string>): void {
  const kept = Array.from(row.children), doc = row.ownerDocument;
  htmls.forEach((html, i) => {
    const current = kept[i];
    if (current !== undefined && memo.get(current) === html) return;
    const holder = doc.createElement("div");
    holder.innerHTML = html;
    const next = holder.firstElementChild;
    if (next === null) return;
    memo.set(next, html);
    const active = doc.activeElement, focused = current !== undefined && active !== null && current.contains(active) ? active.closest<HTMLElement>("[data-watch]")?.dataset.watch : undefined;
    if (current === undefined) row.append(next); else current.replaceWith(next);
    if (focused !== undefined) (next.matches(`[data-watch="${CSS.escape(focused)}"]`) ? next : next.querySelector(`[data-watch="${CSS.escape(focused)}"]`))?.closest<HTMLElement>("[data-watch]")?.focus();
  });
  for (const extra of kept.slice(htmls.length)) extra.remove();
}

// Paints the game-font text of newly drawn cards and fills each card's clock and time bar in place.
export function fillCards(roots: readonly ParentNode[], inputs: readonly CardInput[], loaded: LoadedArt | null, draw: (canvas: HTMLCanvasElement, pixels: GlyphPixels) => void): void {
  for (const root of roots) {
    if (loaded?.font != null && loaded.glyphs !== null) paintGameText(root, loaded.font, loaded.glyphs, draw);
    for (const element of root.querySelectorAll<HTMLElement>(".tc[data-watch]")) {
      const input = inputs.find((c) => c.runId === element.dataset.watch);
      if (input === undefined) continue;
      const parts = clockParts(input.facts, element.classList.contains("tc-wide") ? "wide" : "mini");
      const clock = element.querySelector<HTMLElement>("[data-clock]"), bar = element.querySelector<HTMLElement>("[data-time-bar]");
      if (clock !== null && clock.textContent !== parts.text) clock.textContent = parts.text;
      if (bar !== null) bar.style.width = parts.width;
    }
  }
}

// The browser's glyph sheet loader and canvas painter, for the pages' boot functions.
export function browserGlyphSheet(doc: Document): (url: string) => Promise<GlyphSheet | null> {
  return (url) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = doc.createElement("canvas");
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (context === null) { resolve(null); return; }
      context.drawImage(image, 0, 0);
      resolve(context.getImageData(0, 0, canvas.width, canvas.height));
    };
    image.onerror = () => { resolve(null); };
    image.src = url;
  });
}
export function drawGlyphs(canvas: HTMLCanvasElement, pixels: GlyphPixels): void {
  canvas.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0);
}
