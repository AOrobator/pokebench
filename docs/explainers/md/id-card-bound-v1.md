# Bounded ID-card mentions

> Markdown twin of [id-card-bound-v1.html](../id-card-bound-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`id-card-bound-v1` · default OFF · requires people-id-cards-v1

## A shorter mention list

A person's ID card can repeat every earlier dialogue page that names them. This switch keeps the newest whole pages in that list, within 1,500 Unicode code points including each line’s indentation and the newlines between lines. It shows them in their usual order, oldest first.

**Full history**

Delivered pages that name this person, each once.

**Select backwards**

Keep a contiguous newest suffix of whole quoted lines.

**Show forwards**

Oldest first; count omitted earlier pages.

Flow: full history → newest-first selection → oldest-first display. The newest page always stays, even when that single line exceeds 1,500 code points. This is a list budget with that explicit exception, not a hard cap on the entire card.

## What stays the same

The name and where it came from, first seen or seen on, last conversation, battle text, and also-spoke note stay unchanged. The fingerprint still uses the full mention list, so clipping does not change when cards are shown again. The archive is unchanged.

OFF lists every mention as before. ON with no omitted pages is byte-identical to OFF.

## Exact output

Illustrative header when one page is omitted:

```
- Other pages that name them (each once, in order, whole; 1 earlier page is left out):
```

When dialogue-auto-advance-v1 provides get_dialogue, the shared dialogue record holds the omitted pages and the header can say:

```
- Other pages that name them (each once, in order, whole; 3 earlier pages are left out; get_dialogue finds them):
  turn 123 · ROUTE103 (map 0/18) · at 5,5 · PROF. BIRCH: "An illustrative whole page naming MAY."
```

That payload line is illustrative, not an extracted game quote. Omitted pages remain searchable through the existing tool; this switch adds no tool or game action.

## Switch and evaluation

people-id-cards-v1 is ON in both current arms. The separately approved activation makes this bound ON only in the bundle and OFF in control, so the arms intentionally differ in card size. No existing run’s header, prompts or configuration is rewritten, and no new run is launched by this change.

Unit tests cover whole lines, exact code-point boundaries, astral text, singular/plural counts, oversized newest pages, full-history fingerprints, actual dialogue recall, and the production playGameTools path. Recorded card replay compares OFF bytes against GLM0d5d, a702 and88ea. Gates, independent review and landing status are recorded in the feature worklog. Context-size evidence alone does not show better gameplay.

## Recorded card replay

Complete recordings, 566 cards, zero OFF mismatches; ON and OFF show cards on the same calls. The table measures full cards. Only the other-pages list is bounded, so last words and battle text can keep a card larger than 1,500 code points.

| Run | Cards | OFF mismatches | Largest OFF card → same card ON | Largest ON card |
|---|---|---|---|---|
| 0d5d | 247 | 0 | 5,646 → 5,434 | 5,434 |
| a702 | 165 | 0 | 2,929 → 2,929 | 2,929 |
| 88ea | 154 | 0 | 2,904 → 2,904 | 2,904 |

These are offline selection and byte-comparison results, not measured gameplay benefit. Source hashes, result sequences and full receipts remain in the feature’s ignored evidence folder and the specified analysis replay receipt.

<details>
<summary>Actual GLM 0d5d example: turn 1128, result event 138330</summary>

### OFF

```
ID card: MAY (sprite RIVAL_MAY_NORMAL), map object 28, at 34,54 on ROUTE110 (map 0/25)
- Name: MAY. The game first showed this name on turn 37.
- Seen on: PROF. BIRCH'S HOUSE 2F (map 1/3) from turn 35; ROUTE103 (map 0/18) from turn 94; OLDALE TOWN (map 0/10) from turn 106; PROF. BIRCH'S POKéMON LAB (map 1/4) from turn 124; RUSTBORO CITY (map 0/3) from turn 600; ROUTE110 (map 0/25) from turn 1128.
- Last spoke to you: turn 723, 1 page, whole:
  turn 723 · RUSTBORO CITY (map 0/3) · at 16,49 · MAY: "MAY: You just became a TRAINER,
AAAAA. I'm not going to lose!"
- Other pages that name them (each once, in order, whole):
  turn 37 · PROF. BIRCH'S HOUSE 2F (map 1/3) · at 5,5 · RIVAL_MAY_NORMAL (sprite kind, not a name): "Um… I'm MAY.
Glad to meet you!"
  turn 68 · PROF. BIRCH'S POKéMON LAB (map 1/4) · at 6,5 · PROF. BIRCH: "My kid, MAY, is also studying
POKéMON while helping me out."
  turn 68 · PROF. BIRCH'S POKéMON LAB (map 1/4) · at 6,5 · PROF. BIRCH: "AAAAA, don't you think it might be
a good idea to go see MAY?"
  turn 69 · PROF. BIRCH'S POKéMON LAB (map 1/4) · at 6,5 · PROF. BIRCH: "PROF. BIRCH: Great!
MAY should be happy, too."
  turn 69 · PROF. BIRCH'S POKéMON LAB (map 1/4) · at 6,5 · PROF. BIRCH: "Get MAY to teach you what it
means to be a TRAINER."
  turn 124 · PROF. BIRCH'S POKéMON LAB (map 1/4) · at 6,5 · PROF. BIRCH: "I heard you beat MAY on
your first try. That's excellent!"
  turn 124 · PROF. BIRCH'S POKéMON LAB (map 1/4) · at 6,5 · PROF. BIRCH: "MAY's been helping with my research
for a long time."
  turn 124 · PROF. BIRCH'S POKéMON LAB (map 1/4) · at 6,5 · PROF. BIRCH: "MAY has an extensive history as
a TRAINER already."
  turn 124 · PROF. BIRCH'S POKéMON LAB (map 1/4) · at 6,5 · PROF. BIRCH: "My kid, MAY, goes everywhere
with it."
  turn 124 · PROF. BIRCH'S POKéMON LAB (map 1/4) · at 6,5 · PROF. BIRCH: "Whenever my kid catches a rare POKéMON
and records its data in the POKéDEX,
why, MAY looks for me while I'm out
doing fieldwork, and shows me."
  turn 604 · RUSTBORO CITY (map 0/3) · at 16,53 · MAY: "Registered MAY
in the POKéNAV."
  turn 1080 · ROUTE110 (map 0/25) · at 10,85 · PROF. BIRCH: "And where might my MAY be?"
  turn 1080 · ROUTE110 (map 0/25) · at 10,85 · PROF. BIRCH: "Please keep an eye out for my MAY.
… … … … … …"
- Battles with you (the game's own battle text, in order, whole):
  turn 97 · ROUTE103 (map 0/18) · battle turn 1: "PKMN TRAINER MAY
would like to battle!"
  turn 97 · unknown location · battle turn 1: "PKMN TRAINER MAY sent
out TREECKO!"
  turn 101 · ROUTE103 (map 0/18) · battle turn 4: "Player defeated
PKMN TRAINER MAY!"
  turn 605 · RUSTBORO CITY (map 0/3) · battle turn 1: "PKMN TRAINER MAY
would like to battle!"
  turn 605 · unknown location · battle turn 1: "PKMN TRAINER MAY sent
out WINGULL!"
  turn 609 · RUSTBORO CITY (map 0/3) · battle turn 4: "PKMN TRAINER MAY is
about to use TREECKO."
  turn 610 · unknown location · battle turn 4: "PKMN TRAINER MAY sent
out TREECKO!"
  turn 705 · RUSTBORO CITY (map 0/3) · battle turn 1: "PKMN TRAINER MAY
would like to battle!"
  turn 705 · unknown location · battle turn 1: "PKMN TRAINER MAY sent
out WINGULL!"
  turn 707 · RUSTBORO CITY (map 0/3) · battle turn 2: "PKMN TRAINER MAY is
about to use TREECKO."
  turn 710 · unknown location · battle turn 2: "PKMN TRAINER MAY sent
out TREECKO!"
  turn 723 · RUSTBORO CITY (map 0/3) · battle turn 1: "PKMN TRAINER MAY
would like to battle!"
  turn 723 · unknown location · battle turn 1: "PKMN TRAINER MAY sent
out WINGULL!"
  turn 727 · RUSTBORO CITY (map 0/3) · battle turn 4: "PKMN TRAINER MAY is
about to use TREECKO."
  turn 730 · unknown location · battle turn 4: "PKMN TRAINER MAY sent
out TREECKO!"
```

### ON

```
ID card: MAY (sprite RIVAL_MAY_NORMAL), map object 28, at 34,54 on ROUTE110 (map 0/25)
- Name: MAY. The game first showed this name on turn 37.
- Seen on: PROF. BIRCH'S HOUSE 2F (map 1/3) from turn 35; ROUTE103 (map 0/18) from turn 94; OLDALE TOWN (map 0/10) from turn 106; PROF. BIRCH'S POKéMON LAB (map 1/4) from turn 124; RUSTBORO CITY (map 0/3) from turn 600; ROUTE110 (map 0/25) from turn 1128.
- Last spoke to you: turn 723, 1 page, whole:
  turn 723 · RUSTBORO CITY (map 0/3) · at 16,49 · MAY: "MAY: You just became a TRAINER,
AAAAA. I'm not going to lose!"
- Other pages that name them (each once, in order, whole; 2 earlier pages are left out; get_dialogue finds them):
  turn 68 · PROF. BIRCH'S POKéMON LAB (map 1/4) · at 6,5 · PROF. BIRCH: "AAAAA, don't you think it might be
a good idea to go see MAY?"
  turn 69 · PROF. BIRCH'S POKéMON LAB (map 1/4) · at 6,5 · PROF. BIRCH: "PROF. BIRCH: Great!
MAY should be happy, too."
  turn 69 · PROF. BIRCH'S POKéMON LAB (map 1/4) · at 6,5 · PROF. BIRCH: "Get MAY to teach you what it
means to be a TRAINER."
  turn 124 · PROF. BIRCH'S POKéMON LAB (map 1/4) · at 6,5 · PROF. BIRCH: "I heard you beat MAY on
your first try. That's excellent!"
  turn 124 · PROF. BIRCH'S POKéMON LAB (map 1/4) · at 6,5 · PROF. BIRCH: "MAY's been helping with my research
for a long time."
  turn 124 · PROF. BIRCH'S POKéMON LAB (map 1/4) · at 6,5 · PROF. BIRCH: "MAY has an extensive history as
a TRAINER already."
  turn 124 · PROF. BIRCH'S POKéMON LAB (map 1/4) · at 6,5 · PROF. BIRCH: "My kid, MAY, goes everywhere
with it."
  turn 124 · PROF. BIRCH'S POKéMON LAB (map 1/4) · at 6,5 · PROF. BIRCH: "Whenever my kid catches a rare POKéMON
and records its data in the POKéDEX,
why, MAY looks for me while I'm out
doing fieldwork, and shows me."
  turn 604 · RUSTBORO CITY (map 0/3) · at 16,53 · MAY: "Registered MAY
in the POKéNAV."
  turn 1080 · ROUTE110 (map 0/25) · at 10,85 · PROF. BIRCH: "And where might my MAY be?"
  turn 1080 · ROUTE110 (map 0/25) · at 10,85 · PROF. BIRCH: "Please keep an eye out for my MAY.
… … … … … …"
- Battles with you (the game's own battle text, in order, whole):
  turn 97 · ROUTE103 (map 0/18) · battle turn 1: "PKMN TRAINER MAY
would like to battle!"
  turn 97 · unknown location · battle turn 1: "PKMN TRAINER MAY sent
out TREECKO!"
  turn 101 · ROUTE103 (map 0/18) · battle turn 4: "Player defeated
PKMN TRAINER MAY!"
  turn 605 · RUSTBORO CITY (map 0/3) · battle turn 1: "PKMN TRAINER MAY
would like to battle!"
  turn 605 · unknown location · battle turn 1: "PKMN TRAINER MAY sent
out WINGULL!"
  turn 609 · RUSTBORO CITY (map 0/3) · battle turn 4: "PKMN TRAINER MAY is
about to use TREECKO."
  turn 610 · unknown location · battle turn 4: "PKMN TRAINER MAY sent
out TREECKO!"
  turn 705 · RUSTBORO CITY (map 0/3) · battle turn 1: "PKMN TRAINER MAY
would like to battle!"
  turn 705 · unknown location · battle turn 1: "PKMN TRAINER MAY sent
out WINGULL!"
  turn 707 · RUSTBORO CITY (map 0/3) · battle turn 2: "PKMN TRAINER MAY is
about to use TREECKO."
  turn 710 · unknown location · battle turn 2: "PKMN TRAINER MAY sent
out TREECKO!"
  turn 723 · RUSTBORO CITY (map 0/3) · battle turn 1: "PKMN TRAINER MAY
would like to battle!"
  turn 723 · unknown location · battle turn 1: "PKMN TRAINER MAY sent
out WINGULL!"
  turn 727 · RUSTBORO CITY (map 0/3) · battle turn 4: "PKMN TRAINER MAY is
about to use TREECKO."
  turn 730 · unknown location · battle turn 4: "PKMN TRAINER MAY sent
out TREECKO!"
```

</details>
