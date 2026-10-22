import type { Button, Press, RunView } from "./model.js";

// The GBA runs at ~59.73 frames per second.
export const FRAME_MS = 1000 / 59.7275;

const BUTTONS: readonly Button[] = ["A", "B", "START", "SELECT", "UP", "DOWN", "LEFT", "RIGHT", "L", "R"];

export function litButtons(presses: readonly Press[], nowMs: number, nativeActions: readonly RunView["nativeActions"][number][] = []): Set<Button> {
  const lit = new Set<Button>();
  const native = nativeActions.filter(action => action.kind === "native_input");
  let cursor = 0;
  for (const [index, press] of presses.entries()) {
    const nextSeq = presses[index + 1]?.seq ?? Infinity;
    while (cursor < native.length && (native[cursor]?.seq ?? Infinity) <= press.seq) cursor++;
    const first = cursor;
    while (cursor < native.length && (native[cursor]?.seq ?? Infinity) < nextSeq) cursor++;
    if (press.endMs === undefined && cursor > first) {
      for (let i = first; i + 1 < cursor; i++) {
        const input = native[i];
        const next = native[i + 1];
        if (input === undefined || next === undefined || nowMs < input.server_timestamp * 1000 || nowMs >= next.server_timestamp * 1000) continue;
        const raw = input.details["buttons"];
        if (Array.isArray(raw)) for (const button of BUTTONS) if (raw.includes(button)) lit.add(button);
      }
      continue;
    }
    const step = (press.hold + press.release) * FRAME_MS;
    press.buttons.forEach((button, i) => {
      const start = press.ms + i * step;
      if (nowMs >= start && nowMs < start + press.hold * FRAME_MS) {
        lit.add(button);
        if (press.automaticRunning === true && ["UP", "DOWN", "LEFT", "RIGHT"].includes(button)) lit.add("B");
      }
    });
  }
  return lit;
}

const GRILL = [0, 1, 2, 3, 4, 5]
  .flatMap((i) => [0, 1, 2].map((j) => `<circle cx="${String(555 + i * 9 - j * 3)}" cy="${String(239 + j * 10 + i * 3)}" r="2.3"/>`))
  .join("");

// The live/replay image and button hooks remain independent of the shell artwork.
export function gbaSvg(): string {
  return `<svg class="gba" viewBox="0 0 680 360" role="img" aria-label="Glacier Game Boy Advance">
  <defs>
    <linearGradient id="gba-shell" x2=".25" y2="1">
      <stop stop-color="#e0f5fc"/><stop offset=".35" stop-color="#b7dce9"/><stop offset=".7" stop-color="#a3cbdc"/><stop offset="1" stop-color="#88b5cd"/>
    </linearGradient>
    <linearGradient id="gba-edge" x2="0" y2="1">
      <stop stop-color="#a1cddd"/><stop offset="1" stop-color="#557d9e"/>
    </linearGradient>
    <linearGradient id="gba-button" x2=".3" y2="1">
      <stop stop-color="#f2f2f5"/><stop offset=".45" stop-color="#d9dce5"/><stop offset="1" stop-color="#9ba2b6"/>
    </linearGradient>
    <linearGradient id="gba-lens" x2=".5" y2="1">
      <stop stop-color="#4c5060"/><stop offset=".55" stop-color="#303440"/><stop offset="1" stop-color="#212630"/>
    </linearGradient>
    <linearGradient id="gba-shoulder" x2="0" y2="1">
      <stop stop-color="#f5f6fa"/><stop offset="1" stop-color="#a7b8cc"/>
    </linearGradient>
    <radialGradient id="gba-glow"><stop stop-color="#b5ff9a"/><stop offset="1" stop-color="#40b548"/></radialGradient>
  </defs>
  <path data-btn="L" class="shoulder" d="M48 88 Q60 42 111 25 Q137 20 167 24 L168 42 Q104 43 65 93Z"/>
  <path data-btn="R" class="shoulder" d="M632 88 Q620 42 569 25 Q543 20 513 24 L512 42 Q576 43 615 93Z"/>
  <path class="shell-edge" d="M167 35 Q340 24 513 35 Q603 36 636 99 Q664 148 663 219 Q662 285 613 315 Q590 330 551 329 Q474 313 340 317 Q206 313 129 329 Q90 330 67 315 Q18 285 17 219 Q16 148 44 99 Q77 36 167 35Z"/>
  <path class="shell" d="M166 31 Q340 20 514 31 Q597 32 630 94 Q657 143 657 212 Q656 278 609 307 Q587 321 550 320 Q474 305 340 309 Q206 305 130 320 Q93 321 71 307 Q24 278 23 212 Q23 143 50 94 Q83 32 166 31Z"/>
  <path class="shell-seam" d="M38 233 Q39 284 78 303 Q100 315 130 310 Q220 297 340 300 Q460 297 550 310 Q580 315 602 303 Q641 284 642 233"/>
  <path class="shell-highlight" d="M38 152 Q43 84 96 53 Q124 37 174 38 Q340 28 506 38 Q556 37 584 53 Q637 84 642 152"/>
  <g class="guts">
    <path d="M54 207 H137 V283 H160 M626 192 H537 V287 H515 M63 116 H141 V77 H161 M523 69 H554 V95 H604"/>
    <path d="M153 299 H219 V289 H259 M421 290 H469 V298 H518"/>
    <circle cx="78" cy="286" r="9"/><circle cx="78" cy="286" r="4"/>
    <circle cx="613" cy="213" r="9"/><circle cx="613" cy="213" r="4"/>
  </g>
  <rect class="chip" x="270" y="297" width="45" height="8" rx="2"/>
  <rect class="chip" x="367" y="297" width="33" height="8" rx="2"/>
  <path class="bezel-seat" d="M189 45 H491 Q510 45 510 66 L507 279 Q506 298 486 302 Q340 316 194 302 Q174 298 173 279 L170 66 Q170 45 189 45Z"/>
  <path class="bezel" d="M190 49 H490 Q506 49 506 66 L503 277 Q502 294 485 298 Q340 312 195 298 Q178 294 177 277 L174 66 Q174 49 190 49Z"/>
  <path class="lens-highlight" d="M187 59 Q340 55 493 59"/>
  <rect class="bezel-in" x="190" y="70" width="300" height="204" rx="3"/>
  <rect x="196" y="76" width="288" height="192" fill="#080e12"/>
  <image data-ui="screen" data-screen="" x="196" y="76" width="288" height="192" href="" preserveAspectRatio="xMidYMid meet" style="image-rendering:pixelated"/>
  <svg data-ui="screen-overlay" x="196" y="76" width="288" height="192" viewBox="0 0 288 192" overflow="hidden"></svg>
  <text class="console-logo" x="340" y="290">POKE BENCH</text>
  <circle class="led-seat" cx="533" cy="91" r="5.8"/>
  <circle class="led" cx="533" cy="90" r="3.7"/>
  <text class="lbl sm power" x="558" y="93">POWER</text>
  <circle class="control-well" cx="102" cy="155" r="49"/>
  <path class="control-shadow" d="M89 113 H115 V142 H144 V168 H115 V197 H89 V168 H60 V142 H89Z"/>
  <path class="dpad" d="M91 111 Q89 111 89 113 V140 H62 Q60 140 60 142 V164 Q60 166 62 166 H89 V193 Q89 195 91 195 H113 Q115 195 115 193 V166 H142 Q144 166 144 164 V142 Q144 140 142 140 H115 V113 Q115 111 113 111Z"/>
  <path data-btn="UP" class="dpad-hit" d="M90 112 H114 V141 L102 153 L90 141Z"/>
  <path data-btn="DOWN" class="dpad-hit" d="M90 194 H114 V165 L102 153 L90 165Z"/>
  <path data-btn="LEFT" class="dpad-hit" d="M61 141 V165 H90 L102 153 L90 141Z"/>
  <path data-btn="RIGHT" class="dpad-hit" d="M143 141 V165 H114 L102 153 L114 141Z"/>
  <g class="dpad-marks"><path d="M97 129 L102 123 L107 129 M97 177 L102 183 L107 177 M78 148 L72 153 L78 158 M126 148 L132 153 L126 158"/></g>
  <circle class="dpad-center" cx="102" cy="153" r="8"/>
  <g transform="rotate(-26 579 151)">
    <rect class="control-well" x="529" y="123" width="100" height="56" rx="28"/>
  </g>
  <circle class="control-shadow" cx="551" cy="170" r="22"/>
  <circle class="control-shadow" cx="607" cy="143" r="22"/>
  <circle data-btn="B" class="btn" cx="551" cy="167" r="21"/>
  <circle data-btn="A" class="btn" cx="607" cy="140" r="21"/>
  <text class="lbl button-letter" x="551" y="173">B</text><text class="lbl button-letter" x="607" y="146">A</text>
  <g transform="rotate(-18 108 250)">
    <rect class="control-shadow" x="90" y="245" width="35" height="13" rx="6.5"/>
    <rect data-btn="SELECT" class="pill" x="91" y="243" width="33" height="11" rx="5.5"/>
  </g>
  <g transform="rotate(-18 108 281)">
    <rect class="control-shadow" x="90" y="276" width="35" height="13" rx="6.5"/>
    <rect data-btn="START" class="pill" x="91" y="274" width="33" height="11" rx="5.5"/>
  </g>
  <text class="lbl sm" x="110" y="234" transform="rotate(-18 110 234)">SELECT</text>
  <text class="lbl sm" x="110" y="266" transform="rotate(-18 110 266)">START</text>
  <text class="lbl shoulder-letter" x="90" y="45" transform="rotate(-28 90 42)">L</text><text class="lbl shoulder-letter" x="590" y="45" transform="rotate(28 590 42)">R</text>
  <g class="grill">${GRILL}</g>
</svg>`;
}
