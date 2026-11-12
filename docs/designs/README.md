# designs

This folder holds design documents for how PokeBench measures and compares runs: the contracts and protocols written before the code or the experiment they describe.

Each document fixes inputs, rules and limits in advance, so a later result can be checked against what was decided beforehand. They describe measurement and comparison, not changes to what the model sees. Each records its status and date at the top; the code or worklog it names is the authority where they differ.

## Files

- [naming-comparison-protocol.md](naming-comparison-protocol.md): the protocol for an exploratory comparison of loop guards on the opening naming screen. It fixes the lanes, trials per arm, the native milestone that ends a trial, the time budget, the decision rule and how evidence is kept.
- [patch-results-contract.md](patch-results-contract.md): the contract for the passive patch-results module (`packages/agent/src/patch-results.ts`), which compares an incumbent and a candidate configuration that differ in exactly one feature switch. It covers inputs, which trials qualify, and how to read the output. The module does no I/O.
- [objective-graph-v1.md](objective-graph-v1.md): a draft design for ranking progress by a graph of prerequisites rather than by the order of the milestone catalog, since the game allows several objectives (such as some badges) to be done out of order. Measurement only, with no feature switch.
- [objective-graph-v1.edges.json](objective-graph-v1.edges.json): the edges of that graph. The `edges` array is generated from `packages/agent/src/objective-graph.ts`; the `dropped`, `open` and `closed` lists are design history kept by hand.

The measured result of the objective graph against recorded runs is in [../findings/objective-graph-rescore.md](../findings/objective-graph-rescore.md).
