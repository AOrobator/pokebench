# Viewer budget extension

User authorization 2026-10-25: reuse existing Extend dialog, choose additional time or turns; retain30m/1h, add2h/4h, add1000/2000 turns; display Astra's actual20000-turn limit without disturbing active gameplay.

One bounded feature: operator budget controls and faithful projection. No model prompts, tools, navigation or automatic gameplay changes. Operator-only control has no experiment treatment switch: unchanged until explicit operator request, same as existing time extension. No trainer-card redesign, timeline additions, new runs or gameplay restart. Original evaluation horizon retained separately from continuation.

- [ ] Tests for control application/refusal, projection, dialog and source capability.
- [ ] Implementation through existing control/event/viewer path, validated Astra override receipt.
- [ ] Targeted and full gates, independent review, headless browser proof, queued local landing and safe viewer refresh.

Active Astra pin cannot acquire source updates automatically. Its actual turn override is audited in its run sidecar; compatibility/capability must be explicit, never queue unsupported actions as successful. No inspector mutation as a viewer endpoint.
