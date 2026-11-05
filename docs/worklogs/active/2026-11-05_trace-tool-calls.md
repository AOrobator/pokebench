# Tool calls in the thinking panel

The operator, 2026-11-05: the agent trace is not only for thinking; navigation and other tool calls must sit with the thoughts.

Finding: recordings and the Full Trace page are complete (DeepSeek 3332: 63 of 63 calls). The side panel beside the game showed 0 calls whenever PokéNav was on another page, 7 of 63 otherwise, because the newest history page is 64 raw events, about 90% streaming deltas, and older pages were fetched only to fill a visible Full Trace list. On phones the list was 48px tall and titles clipped to "Th...".

- [x] Older live history pages scan 16x further and drop assistant_delta and state, which the trace never shows
- [x] The side panel requests pages until it has its 30 turns, whatever PokéNav shows
- [x] Phone list gets room; tool names wrap in both lists
- [x] Review fix: the answer parser accepts 256-event older pages
- [ ] Gates, reviews, landing, live proof
