# Gym door label in the bundle

Request: preserve GYM on the bundle's Gym doors; popup region names currently erase it.

Scope: new default-OFF `gym-door-label-v1`, bundle-only. Preserve the destination map's GYM suffix when exit-labels-v2/v3 would collapse it to its city. Both exit owners use one name function. No route, leader or badge advice. OFF retains prior bytes. Historical fixed definitions and active runs remain frozen.

Grounding: pret/pokeemerald PetalburgCity_Text_ThisIsGymSign and PetalburgCity_Text_GymSign explicitly identify GYM; RustboroCity and DewfordTown Gym signs do too. ROM map identity identifies the destination; no source-derived trainer or story names are exposed.

Plan: RED regression; registry/factory/name function; future bundle definitions; explainer and pending experiment; gates and independent cloud review before landing. No measured runs authorized here.

Implementation evidence: RED import failure before implementation; 11 focused Python checks GREEN, including real retained Petalburg state `dc5a-raw00010618` through rerender.read_state and render, with both exit-labels-v2 and v3. Removing the production rerender switch wiring causes both native cases to fail (2 failed / 9 passed); restored immediately. New switch transports through preset, server env and run receipt; omitted/default false. Native output changes PETALBURG CITY (map 8/1) to PETALBURG CITY GYM (map 8/1). Other names and same-map ownership unchanged.

Future bundle definitions: bundle-v-control, bundle-cook-1h, whole-map-cook-1h. Historical cook/pair definitions and running trials are unchanged. Registry tests receive mechanical count/index/default-off-list updates. Lint passes; full coverage/build checks underway. Claude standalone reviewer authentication unavailable; Cursor Claude equivalent will be used.

Principles Adherence (PB1–PB13): PB1 PASS native map identity; PB2 N/A no runs launched or filtered; PB3 N/A no speed claim; PB4 PASS separately recorded switch; PB5 PASS pending single-switch experiment, no benefit claim; PB6 N/A no context retention change; PB7 PASS uses existing observation/run receipt and immutable native fixture; PB8 N/A no model failure handling; PB9 PASS narrow user-authorized label fix, no goal/route inference; PB10 PASS unchanged floors/gates; PB11 PASS pinned vendor/map reader; PB12 PASS external ROM path only; PB13 PASS RED/GREEN and wiring mutation, review and landing pending.
