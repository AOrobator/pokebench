// Emerald's own text, drawn from the ROM's font sheet (runs/sprites/trainer-card-v1/font, built by
// `just trainer-card-art`): each glyph is a 16x16 cell whose red pixels are the stroke and green
// pixels its shadow, recoloured per use and shown at the card's scale.
export interface GameFont { readonly widths: readonly number[]; readonly cmap: Readonly<Record<string, number>> }
export interface GlyphSheet { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray }
export interface GlyphPixels { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray }
type Rgb = readonly [number, number, number];

const CELL = 16, HEIGHT = 14, GLYPHS = 512;
// Text colour and shadow per use; null shadow draws none.
export const GAME_TEXT: Readonly<Record<string, { readonly fg: Rgb; readonly shadow: Rgb | null }>> = {
  tab: { fg: [24, 48, 96], shadow: null },
  white: { fg: [248, 248, 248], shadow: [80, 80, 88] },
  badge: { fg: [80, 56, 0], shadow: null },
  // POKéMON PARTY page: party-slot text (party_menu.c sFontColorTable[0]) and the summary screen's
  // sTextColors on palette 6, its OT colors, and the PP states on gPPTextPalette.
  "pv-slot": { fg: [255, 255, 255], shadow: [115, 115, 115] },
  "pv-white": { fg: [255, 255, 255], shadow: [98, 98, 98] },
  "pv-dark": { fg: [0, 0, 0], shadow: [213, 213, 205] },
  "pv-red": { fg: [230, 8, 8], shadow: [255, 189, 115] },
  "pv-male": { fg: [65, 205, 255], shadow: [0, 139, 189] },
  "pv-female": { fg: [255, 156, 148], shadow: [189, 90, 82] },
  "pv-ot": { fg: [139, 246, 255], shadow: [24, 164, 213] },
  "pv-ot-f": { fg: [255, 189, 180], shadow: [213, 115, 106] },
  "pv-pp0": { fg: [213, 197, 0], shadow: [255, 246, 139] },
  "pv-pp1": { fg: [255, 131, 0], shadow: [255, 238, 115] },
  "pv-pp2": { fg: [230, 24, 0], shadow: [246, 222, 156] },
  "pv-pp3": { fg: [74, 74, 74], shadow: [222, 222, 222] },
};

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const glyph = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v < GLYPHS;

export function parseGameFont(value: unknown): GameFont | null {
  if (!record(value) || !Array.isArray(value.widths) || value.widths.length !== GLYPHS || !record(value.cmap)) return null;
  const widths = value.widths as unknown[];
  if (!widths.every(w => typeof w === "number" && Number.isSafeInteger(w) && w >= 0 && w <= CELL)) return null;
  const cmap = value.cmap;
  if (!Object.entries(cmap).every(([ch, code]) => Array.from(ch).length === 1 && glyph(code))) return null;
  return { widths: widths as number[], cmap: cmap as Record<string, number> };
}

// bold widens every stroke pixel to the right by that many pixels; unknown characters draw as glyph 0.
export function glyphPixels(font: GameFont, sheet: GlyphSheet, text: string, fg: Rgb, shadow: Rgb | null, bold: number): GlyphPixels {
  const codes = Array.from(text, ch => font.cmap[ch] ?? 0), advance = (code: number): number => (font.widths[code] ?? 0) + bold;
  const width = codes.reduce((sum, code) => sum + advance(code), 0) + 2, data = new Uint8ClampedArray(width * HEIGHT * 4);
  const put = (x: number, y: number, rgb: Rgb, over: boolean): void => {
    const i = (y * width + x) * 4;
    if (!over && data[i + 3] !== 0) return;
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
  };
  let left = 0;
  for (const code of codes) {
    const gx = (code % CELL) * CELL, gy = Math.floor(code / CELL) * CELL;
    for (let y = 1; y <= HEIGHT; y++) for (let x = 0; x < (font.widths[code] ?? 0); x++) {
      const si = ((gy + y) * sheet.width + gx + x) * 4;
      if (si + 3 >= sheet.data.length || sheet.data[si + 3] === 0) continue;
      const stroke = (sheet.data[si] ?? 0) > 128, colour = stroke ? fg : (sheet.data[si + 1] ?? 0) > 128 ? shadow : null;
      if (colour === null) continue;
      for (let d = 0; d <= bold; d++) put(left + x + d, y - 1, colour, stroke);
    }
    left += advance(code);
  }
  return { width, height: HEIGHT, data };
}

// Fills every unpainted [data-gt] placeholder under root (or those matching `only`) with a canvas of its text; the text itself
// stays in the span for screen readers and copy. draw puts the pixels on the canvas (injected for tests).
export function paintGameText(root: ParentNode, font: GameFont, sheet: GlyphSheet, draw: (canvas: HTMLCanvasElement, pixels: GlyphPixels) => void, only = "[data-gt]"): void {
  for (const span of root.querySelectorAll<HTMLElement>(`${only}:not([data-painted])`)) {
    const colours = GAME_TEXT[span.dataset.c ?? ""];
    if (colours === undefined) continue;
    const pixels = glyphPixels(font, sheet, span.dataset.gt ?? "", colours.fg, colours.shadow, Number(span.dataset.b ?? "0") || 0);
    const canvas = span.ownerDocument.createElement("canvas"), height = Number(span.dataset.h ?? String(HEIGHT)) || HEIGHT;
    canvas.width = pixels.width; canvas.height = pixels.height; canvas.className = "gt"; canvas.setAttribute("aria-hidden", "true");
    canvas.style.height = `calc(var(--u) * ${String(height)})`; canvas.style.width = `calc(var(--u) * ${String((pixels.width * height) / HEIGHT)})`;
    draw(canvas, pixels);
    span.dataset.painted = "1";
    span.append(canvas);
  }
}
