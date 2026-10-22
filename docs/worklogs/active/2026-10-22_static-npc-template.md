# Generic static NPC template approaches

Approved remaining M3 packet, fresh isolated branch from 5bd517393. No foreground UI, services, GPU or gameplay actions. New static-npc-template-approach-v1 default/control OFF, bundle ON; no experiment launch.

## Contract
Expose an optional typed current-map native template list only when enabled. Include unloaded, hide-flag-clear, scripted templates with stationary movement NONE or FACE_UP/DOWN/LEFT/RIGHT; exclude trainerType and recognized trainerbattle scripts, moving/unknown types, invalid coordinates/elevation/flags/pointers and duplicate identities. Static movement describes its native idle movement, never a promise against script relocation or live presence. Bind to current save map and canonical map-event identity/count. The model supplies the local ID. Checked navigation approaches an adjacent tile at matching elevation and yields fresh state without facing/A, activation, auto-talk or a battle. Evidence disappearance, change, loading, map/interface changes and existing sight/hazard checks stop the approach. Preserve existing trainer-template treatment and exact OFF text/state/tool contracts.

## Grounding
pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, clean reference. ObjectEventTemplate offsets in include/global.fieldmap.h; TrySpawnObjectEvents uses current map's event count and hide flags. MovementType_None has an empty native callback; FACE directions call MovementType_FaceDirection without walking. Scripts may still relocate these objects; all wording remains qualified.

## Gates
RED/GREEN, production wiring deletion, typed schema, pending blocked definition, six bundle mappings, prompt/tool docs, explainer and headless-only proof. Parent owns cumulative review/landing. No benefit claim from correctness tests.

## RED
Added independent reader/source-guard and production read_state/state_json/render OFF parity tests before module implementation. No service or gameplay execution.
