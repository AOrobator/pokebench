Harness switch · observation · `input-cuts-v1` · needs nothing · bundle arm only · off by default

# Input cuts

> Markdown twin of [input-cuts-v1.html](../input-cuts-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

Four lines in a result repeat something that same result already shows. With the switch on, each of those repeats is left out. The check, the walk, and the earlier quotes stay.

## The same result, twice

![Four repeats and what replaces each](input-cuts-v1/fig-1.svg)

*One result. Off prints the quote, the miss, the goal, and “has not spoken” on top of text that already says those things. On keeps one copy of each.*

## What changes

| Cut | Off | On |
|---|---|---|
| Conversation ledger | Quotes this call’s pages under “Latest conversation with a person”, and a room’s last-heard line quotes them too. | Those lines say `this result's dialogue list`. A line from an earlier turn stays quoted. |
| Cited destination | A quote the game has not shown starts the navigate_to result with the Because line. The walk still runs. | That Because line is not added. The `destination_citation` event is still recorded, with text null. A quote under two words is still said. |
| Story goal | The harness-trust header prints the Story goal, and the story-destinations block in the same result prints it again. | When this result already contains `Latest story line naming a place` and the goal’s quote, the header leaves the Story goal line out. The rest of the header stays. If the destinations block is absent, the header keeps the goal. |
| ID card | A person whose lines are in this result can still get “Has not spoken to you in this run.” and a summary that says they have not spoken. | That sentence is left out. The card still says they also spoke during this call. The summary says they spoke during this call. |

## Where it is wired

`playGameTools` passes `silenceMiss` into cited destination and `goalOnce` into harness trust when `input-cuts-v1` is on. The conversation ledger and the ID cards read the same flag from the feature set they already receive. Off, those flags are false and the text is the previous text.

The switch is in the bundle arm of `bundle-v-control`. The base preset leaves it false. A pending experiment, `experiments/input-cuts-v1.json`, is registered and not queued.
