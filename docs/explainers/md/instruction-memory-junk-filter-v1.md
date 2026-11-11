# Instruction memory junk filter

> Markdown twin of [instruction-memory-junk-filter-v1.html](../instruction-memory-junk-filter-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`instruction-memory-junk-filter-v1` · default OFF · requires the existing instruction memory cap · candidate under verification

## Leave room for leads

The existing cap limits instruction memory to 16,000 Unicode code points. This switch first filters whole episodes of boilerplate and generic chatter, letting that same cap fill its room with other episodes. It never shortens a quote or chooses the player's route. Original recordings remain intact.

**Archive**<br>
Whole delivered dialogue episodes

**Protect**<br>
Keep the current story anchor and useful leads

**Filter**<br>
Apply source-backed R1–R6

**Fill**<br>
Existing cap selects within 16,000 code points

Arrow order: archive → protected anchor → filtering → existing cap. A repeated older copy remains eligible if its newer representative misses the cap; this fallback adds only when room remains and does not displace cap priorities.

## The six rules

| Rule | Whole episode dropped when… |
|---|---|
| R1 | All pages are pret service/system text, or the whole episode belongs to a Pokémon Center 2F map. |
| R2 | All pages are berry-tree text or berry-tree sprite pages, allowing receipt pages. |
| R3 | All pages come from signs/objects and name no unvisited place, unmet story person or held key item. The Cutter's House sign stays. |
| R4 | Every non-receipt page has the same speaker and exact text in a newer surviving episode. A cap miss cannot erase an older fitting copy. |
| R5 | All non-receipt pages belong to the faced trainer template on each page's own native map/state, beaten or not. |
| R6 | All pages are faced non-story NPC chatter with no named lead, and either every page is approved FLAVOR, or all are unlabelled and no useful v4 signal fires. |

A hint or useful page keeps its whole exchange. Mixed episodes stay. The existing native completion rules still run first; this filter never newly removes the current story anchor.

## Your keep/drop decisions

| Observed text or source | Decision |
|---|---|
| `RustboroCity_Text_CuttersHouse`: CUTTER'S HOUSE | Keep the sign's HM01 lead. |
| `Route110_Text_WhichShouldIChoose`: “Make a beeline for MAUVILLE on CYCLING ROAD…” | Keep as a progression hint. |
| `MauvilleCity_House1_Text_ImRockSmashDudeTakeThis` and `_ExplainRockSmash` | Keep until the existing native flag 0x6B says HM06 was received. Unknown flag: keep. |
| `Route104_Text_ThrowBallAtWeakenedPokemon`: weaken-first catching tip | Drop as approved generic tutorial advice, using the source label. |
| `PetalburgCity_Text_FullPartyExplanation`: storage-box tip | Drop as approved generic tutorial advice, using the source label. |

## What changes in the model input

Recorded examples: a702 turn333 contains both pages of the weaken-first tip; turn309 contains both storage-box pages. With the filter eligible, each complete episode can leave the selected instruction memory. The delivered conversation and original event log are untouched. The Cycling Road camper at GLM0d5d turn1076 remains a source-backed lead.

```
Before: selected whole service/tip episodes consume cap space.
After: those whole episodes are left out; the existing cap can select other episodes.
Both: exact retained text, original result/dialogue/state references, same cap.
```

Selection audit shape (illustrative, not a measured run outcome):

```
{"result":13389,"step":"junk","rule":"R6","kept":false}
```

The existing ledger-context event records the exact memory delivered. Its omission count includes filtered episodes. There is no new tool, automatic action, goal ledger or timeline mark.

## Source and bounds

Data comes from clean pret/pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`. The 1,442 approved label rows retain only text_label, map, category and pret text. Walkthrough reasons and URLs never enter the rule data or model input. Whole-page matching understands pret page/line controls and placeholders.

Useful-signal names are extracted from pret; curated phrase selectors are emitted only if attested in its text. Six unattested proposals were excluded: “by boat”, “past this”, “you'll want”, “to get past”, “bridge”, and “station”. Their replay effect is audited separately. Static patterns compile once; no unbounded matching cache is added.

Rock Smash uses the existing `HM_ROCK_SMASH_RECEIVED` definition and coherent story-progress bitmap, not a new reader, bag-name guess or copied flag decoder.

## OFF and verification

OFF reproduces the incumbent cap and instruction memory. This feature starts OFF when omitted and depends on `instruction-memory-cap-v1`. Current recipe activation, gameplay and GPU probes remain outside this change. Default-OFF landing follows the approved review and landing-board process.

Targeted tests cover rules and near misses, the operator decisions, every individually rendered approved hint/useful label, the story anchor, cap refill, older-copy fallback, exact OFF selection and the production observed-memory factory. Lint, build, full coverage, vendor and protected card checks pass. Seven replay cuts in two forms preserve switch-OFF output exactly; six match recorded memory, while GLM has no recorded ledger and uses an end-of-turn boundary. Every ON block fits the cap; the six excluded phrases change zero replay decisions. Independent review is pending. Context-size changes are not a gameplay-benefit claim.
