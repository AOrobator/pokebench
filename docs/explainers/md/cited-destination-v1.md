Harness switch · guidance · `cited-destination-v1` · needs `bounded-navigation-v1` · off by default · bundle arm only

# Cited destination

> Markdown twin of [cited-destination-v1.html](../cited-destination-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

Runs invent exits: e046 wrote "Oldale's east exit to Petalburg" (s18744) and "Route 103's north exit to Rustboro" (s17437) when no such line was ever shown. Qwen is most reliable at filling tool arguments, so navigate_to now asks for the line behind each destination, quoted, and the harness checks it against what the game showed. No new tool.

## The schema

```
{
  "type": "object",
  "required": ["x", "y", "map_id", "because"],
  "properties": {
    "x": {"type": "integer", "minimum": 0},
    "y": {"type": "integer", "minimum": 0},
    "map_id": [group, number],
    "walking": {"type": "boolean"},
    "because": {"type": "string", "minLength": 1, "description": "Required. Quote, word for word, what the game showed you that makes this the place to go: …"}
  },
  "additionalProperties": false
}
```

The rest of navigate_to is unchanged; the walk never sees `because`. With `full-map-navigation-v1` the description says "a readout line that shows the destination on this map"; with `exit-reachability-v1` it adds: "An exit the readout says cannot be reached on foot from where you stand is not a reason to walk to it." The system prompt gains one rule saying the same.

## The check

![Checking because against shown results](cited-destination-v1/fig-1.svg)

*Case, curly quotes, line breaks and runs of spaces are ignored; only results the model was shown before the call count, never an error result. Every check is recorded as a `destination_citation` event (Activity History; no timeline mark).*

Found, on the recorded 4caa T272 result: `because: "“Well, it’s time to head back to the lab.”"` matches MAY's page, which the result printed across a line break ("head back to / the LAB."). The result is unchanged. Not found:

```
Because: "the LAB is in RUSTBORO CITY" is not in anything the game has shown you this run (results, readouts and dialogue). navigate_to walked anyway; nothing the game showed you supports this destination as you quoted it.
```

## Status

- Tests on the 4caa recording, the production factory (schema, whole-map and exit-reach text) and the recorder events.
- Registered as a pending experiment (`experiments/cited-destination.json`), bundle arm only; not queued, not measured.
