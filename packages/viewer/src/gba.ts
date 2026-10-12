import type { Button, Press } from "./model.js";

// The GBA runs at ~59.73 frames per second.
export const FRAME_MS = 1000 / 59.7275;

export function litButtons(presses: readonly Press[], nowMs: number): Set<Button> {
  const lit = new Set<Button>();
  for (const press of presses) {
    const step = (press.hold + press.release) * FRAME_MS;
    press.buttons.forEach((button, i) => {
      const start = press.ms + i * step;
      if (nowMs >= start && nowMs < start + press.hold * FRAME_MS) lit.add(button);
    });
  }
  return lit;
}

const GRILL = [0, 1, 2, 3, 4, 5]
  .flatMap((i) => [0, 1, 2].map((j) => `<circle cx="${String(452 + i * 10 - j * 4)}" cy="${String(236 + j * 11 + i * 2)}" r="2.4"/>`))
  .join("");

// Glacier GBA from the signed-off mockup (design 24); the screen is an <image>
// the app points at a frame or the live screen.
export function gbaSvg(): string {
  return `<svg class="gba" viewBox="0 0 560 310" role="img" aria-label="Glacier Game Boy Advance">
  <path data-btn="L" class="shoulder" d="M44 92 Q52 28 142 16 L176 16 L176 34 L120 40 Q76 48 62 96Z"/>
  <path data-btn="R" class="shoulder" d="M516 92 Q508 28 418 16 L384 16 L384 34 L440 40 Q484 48 498 96Z"/>
  <path class="shell" d="M140 26 H420 Q462 26 494 56 Q548 106 550 182 Q552 262 488 288 Q440 304 400 274 H160 Q120 304 72 288 Q8 262 10 182 Q12 106 66 56 Q98 26 140 26Z"/>
  <path class="shellhi" d="M150 34 H410 Q450 34 478 58 Q430 50 400 52 H160 Q130 50 82 58 Q110 34 150 34Z"/>
  <g class="guts"><path d="M40 210 H120 V250 H150"/><path d="M520 210 H440 V246 H410"/><path d="M60 130 Q90 120 110 140"/><path d="M500 130 Q470 118 455 135"/><circle cx="100" cy="262" r="6"/><circle cx="460" cy="262" r="6"/></g>
  <rect class="chip" x="190" y="252" width="60" height="16" rx="2"/><rect class="chip" x="310" y="252" width="44" height="16" rx="2"/>
  <rect class="bezel" x="150" y="44" width="260" height="196" rx="14"/>
  <rect class="bezel-in" x="162" y="56" width="236" height="160" rx="4"/>
  <circle class="led" cx="140" cy="100" r="4"/>
  <rect x="170" y="62" width="220" height="147" fill="#000"/>
  <image data-ui="screen" data-screen="" x="170" y="62" width="220" height="147" href="" preserveAspectRatio="none" style="image-rendering:pixelated"/>
  <text class="logo" x="280" y="233">POKEBENCH</text>
  <g>
    <rect class="dpad" x="88" y="148" width="28" height="80" rx="4"/>
    <rect class="dpad" x="62" y="174" width="80" height="28" rx="4"/>
    <rect data-btn="UP" class="dpad" x="88" y="148" width="28" height="27" rx="4"/>
    <rect data-btn="DOWN" class="dpad" x="88" y="201" width="28" height="27" rx="4"/>
    <rect data-btn="LEFT" class="dpad" x="62" y="174" width="27" height="28" rx="4"/>
    <rect data-btn="RIGHT" class="dpad" x="115" y="174" width="27" height="28" rx="4"/>
    <circle cx="102" cy="188" r="7" fill="#c7d6de"/>
  </g>
  <circle data-btn="B" class="btn" cx="448" cy="196" r="21"/>
  <circle data-btn="A" class="btn" cx="496" cy="166" r="21"/>
  <text class="lbl" x="448" y="200">B</text><text class="lbl" x="496" y="170">A</text>
  <rect data-btn="SELECT" class="pill" x="44" y="246" width="34" height="11" rx="5.5"/>
  <rect data-btn="START" class="pill" x="44" y="268" width="34" height="11" rx="5.5"/>
  <text class="lbl sm" x="104" y="255">SELECT</text><text class="lbl sm" x="100" y="277">START</text>
  <text class="lbl sm" x="94" y="38">L</text><text class="lbl sm" x="466" y="38">R</text>
  <g class="grill">${GRILL}</g>
</svg>`;
}
