# Reuse retained JIT guidance

> Markdown twin of [jit-guide-reuse-v1.html](../jit-guide-reuse-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

Default OFF. Requires JIT v2; affects only its guidance projection.

![Reuse original guide instead of another copy](jit-guide-reuse-v1/fig-1.svg)

## What changes

If identical text for the same interface is still retained, reuse its episode. The original anchor, source state, text and hash remain unchanged. The current state is separately recorded; the request receipt says reused. When its anchor leaves the window, a fresh guide can be inserted after the newest observation. Unknown interfaces continue to add no guide.

## Why

Turn 121 in the previous JIT run retained two identical 7981-character overworld guides. All guidance then totalled 20500 characters. Reuse avoids those copies without rewriting an earlier prefix just to save bytes.

## Limits and OFF

The guide may sit earlier than intervening guides for different interfaces; labels and latest-matching scope still apply. OFF reproduces original v2 episode insertion on scene re-entry. Full tools, stable core and game state are unchanged.
