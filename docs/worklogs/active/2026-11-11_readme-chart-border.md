# README chart border: even outer band, no page strip

## Goal

The operator (2026-11-11): "why is the right border so large? looks weird and uneven compared to the other borders". At 2x, both chart PNGs have a 72 px dark band on the right against 20 px on the left and top, and a 2 px cream strip under the bottom band.

## Cause

- `.card` is a block, so it is 1364 CSS px wide (the 1400 px viewport minus margins). `.in` is only 1318 px wide (1240 px of content + padding + border), which leaves 26 px extra on the right, or 72 px at 2x.
- The card is 1103.31 px tall (964.44 px on the money page) because of fractional line heights (15 px × 1.45, 13.5 px × 1.45 and the h1's normal line height). The element screenshot rounds the box up, so it captures about 0.7 px of page background.

## Plan

- [ ] `.card{width:fit-content}`; whole-pixel line heights for h1 (36 px), p (22 px) and .note (20 px).
- [ ] Rebuild with `just readme-charts html`; measure all four outer bands in both PNGs (expect 20 px each at 2x) and confirm there is no cream strip.

## Log

- 2026-11-11 5:25 PM: RED. test_card_hugs_the_chart_at_whole_pixel_heights fails.
