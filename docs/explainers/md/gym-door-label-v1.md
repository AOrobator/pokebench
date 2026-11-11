# Keep GYM on the door

> Markdown twin of [gym-door-label-v1.html](../gym-door-label-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

The location popup names the city for both the city and its Gym. This switch preserves the building kind on the Gym entrance.

## OFF

City door → popup city

`PETALBURG CITY (map 8/1)`

## ON

City door → popup city + GYM

`PETALBURG CITY GYM (map 8/1)`

Illustrative output, verified with retained Petalburg RAM. Both exit-labels-v2 and exit-labels-v3 receive the same name, including arrival descriptions. Same-map doors keep “this map.” Other buildings retain their existing names.

## Grounding

The destination map table identifies the Gym. PetalburgCity_Text_ThisIsGymSign says “This is the GYM's sign.” PetalburgCity_Text_GymSign names PETALBURG CITY POKéMON GYM. No leader, badge, objective or route is added.

## Scope

`gym-door-label-v1` defaults OFF and requires exit-labels-v2. Future bundle-v-control and bundle-v-control-2h presets enable it in both control and bundle arms. Other recipes keep their existing settings. No measured benefit claimed.
