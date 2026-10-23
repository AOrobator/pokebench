import type {GameStateSnapshot} from "./game-state.js";
export const STORY_PROGRESS_FEATURE = "all-gym-story-milestones-v1";
export interface ProgressDefinition { readonly name:string; readonly label:string; readonly flag?:number; readonly anyFlags?:readonly number[]; readonly map?:readonly number[]; readonly requiresBadge?:string; readonly field?:"letter"|"rustboro_stage"|"devon_stage"; readonly values?:readonly number[] }
// pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881; exact US ROM f3ae0881.
// Completion writers and address proof: docs/findings/all-gym-story-milestones.md.
export const PROGRESS_CATALOG:readonly ProgressDefinition[] = [
  {
    "name": "ROUTE_116",
    "label": "Route 116",
    "map": [
      0,
      31
    ]
  },
  {
    "name": "RUSTURF_TUNNEL",
    "label": "Rusturf Tunnel",
    "map": [
      24,
      4
    ]
  },
  {
    "name": "RUSTURF_AQUA_GRUNT_DEFEATED",
    "label": "Rusturf Aqua grunt defeated",
    "flag": 1296
  },
  {
    "name": "DEVON_GOODS_RECOVERED",
    "label": "Devon Goods recovered / Peeko rescued",
    "flag": 143
  },
  {
    "name": "DEVON_GOODS_RETURN_REPORTED",
    "label": "Reported recovery to Devon employee",
    "flag": 144
  },
  {
    "name": "DEVON_CORPORATION",
    "label": "Devon Corporation",
    "map": [
      11,
      2
    ]
  },
  {
    "name": "STEVEN_LETTER_RECEIVED",
    "label": "Steven’s letter received",
    "field": "letter"
  },
  {
    "name": "POKENAV_RECEIVED",
    "label": "PokéNav received",
    "flag": 188
  },
  {
    "name": "DEVON_PRESIDENT_SCENE_COMPLETE",
    "label": "Devon president scene complete",
    "field": "devon_stage",
    "values": [
      1
    ]
  },
  {
    "name": "MATCH_CALL_UNLOCKED",
    "label": "Match Call unlocked",
    "flag": 303
  },
  {
    "name": "MATCH_CALL_TUTORIAL_COMPLETE",
    "label": "Match Call tutorial complete",
    "field": "rustboro_stage",
    "values": [
      7,
      8
    ]
  },
  {
    "name": "DEWFORD_TOWN",
    "label": "Dewford",
    "map": [
      0,
      11
    ]
  },
  {
    "name": "DEWFORD_GYM_ENTERED",
    "label": "Dewford Gym entry",
    "map": [
      3,
      3
    ]
  },
  {
    "name": "BRAWLY_DEFEATED",
    "label": "Brawly defeated",
    "flag": 1546
  },
  {
    "name": "DEWFORD_GYM_COMPLETE",
    "label": "Dewford Gym complete",
    "flag": 1265
  },
  {
    "name": "KNUCKLE_BADGE",
    "label": "Knuckle Badge",
    "flag": 2152
  },
  {
    "name": "BULK_UP_RECEIVED",
    "label": "Bulk Up received",
    "flag": 166
  },
  {
    "name": "GRANITE_CAVE",
    "label": "Granite Cave",
    "map": [
      24,
      7
    ]
  },
  {
    "name": "STEVEN_REACHED",
    "label": "Steven’s cave room",
    "map": [
      24,
      10
    ]
  },
  {
    "name": "STEVEN_LETTER_DELIVERED",
    "label": "Letter delivered to Steven",
    "flag": 189
  },
  {
    "name": "STEVEN_REGISTERED",
    "label": "Steven registered in PokéNav",
    "flag": 305
  },
  {
    "name": "SLATEPORT_CITY",
    "label": "Slateport",
    "map": [
      0,
      1
    ]
  },
  {
    "name": "STERN_SHIPYARD_ENTERED",
    "label": "Stern’s shipyard",
    "map": [
      9,
      0
    ]
  },
  {
    "name": "OCEANIC_MUSEUM_ENTERED",
    "label": "Oceanic Museum",
    "map": [
      9,
      7
    ]
  },
  {
    "name": "STERN_MUSEUM_REACHED",
    "label": "Stern at Oceanic Museum",
    "map": [
      9,
      8
    ]
  },
  {
    "name": "MUSEUM_AQUA_GRUNT_1_DEFEATED",
    "label": "Museum Aqua grunt 1 defeated",
    "flag": 1300
  },
  {
    "name": "MUSEUM_AQUA_GRUNT_2_DEFEATED",
    "label": "Museum Aqua grunt 2 defeated",
    "flag": 1301
  },
  {
    "name": "DEVON_GOODS_DELIVERED",
    "label": "Devon Goods delivered to Stern",
    "flag": 149
  },
  {
    "name": "ROUTE_110",
    "label": "Route 110",
    "map": [
      0,
      25
    ]
  },
  {
    "name": "ROUTE_110_RIVAL_DEFEATED",
    "label": "Route 110 rival defeated",
    "anyFlags": [
      1801,
      1804,
      1807,
      1810,
      1813,
      1816
    ]
  },
  {
    "name": "MAUVILLE_CITY",
    "label": "Mauville",
    "map": [
      0,
      2
    ]
  },
  {
    "name": "MAUVILLE_WALLY_DEFEATED",
    "label": "Mauville Wally scene complete",
    "flag": 190
  },
  {
    "name": "MAUVILLE_GYM_ENTERED",
    "label": "Mauville Gym entry",
    "map": [
      10,
      0
    ]
  },
  {
    "name": "WATTSON_DEFEATED",
    "label": "Wattson defeated",
    "flag": 1547
  },
  {
    "name": "MAUVILLE_GYM_COMPLETE",
    "label": "Mauville Gym complete",
    "flag": 1266
  },
  {
    "name": "DYNAMO_BADGE",
    "label": "Dynamo Badge",
    "flag": 2153
  },
  {
    "name": "SHOCK_WAVE_RECEIVED",
    "label": "Shock Wave received",
    "flag": 167
  },
  {
    "name": "LAVARIDGE_GYM_ENTERED",
    "label": "Lavaridge Gym entry",
    "map": [
      4,
      1
    ]
  },
  {
    "name": "FLANNERY_DEFEATED",
    "label": "Flannery defeated",
    "flag": 1548
  },
  {
    "name": "LAVARIDGE_GYM_COMPLETE",
    "label": "Lavaridge Gym complete",
    "flag": 1267
  },
  {
    "name": "HEAT_BADGE",
    "label": "Heat Badge",
    "flag": 2154
  },
  {
    "name": "OVERHEAT_RECEIVED",
    "label": "Overheat received",
    "flag": 168
  },
  {
    "name": "PETALBURG_GYM_ENTERED",
    "label": "Petalburg Gym return",
    "map": [
      8,
      1
    ],
    "requiresBadge": "HEAT"
  },
  {
    "name": "NORMAN_DEFEATED",
    "label": "Norman defeated",
    "flag": 1549
  },
  {
    "name": "PETALBURG_GYM_COMPLETE",
    "label": "Petalburg Gym complete",
    "flag": 1268
  },
  {
    "name": "BALANCE_BADGE",
    "label": "Balance Badge",
    "flag": 2155
  },
  {
    "name": "FACADE_RECEIVED",
    "label": "Facade received",
    "flag": 169
  },
  {
    "name": "FORTREE_GYM_ENTERED",
    "label": "Fortree Gym entry",
    "map": [
      12,
      1
    ]
  },
  {
    "name": "WINONA_DEFEATED",
    "label": "Winona defeated",
    "flag": 1550
  },
  {
    "name": "FORTREE_GYM_COMPLETE",
    "label": "Fortree Gym complete",
    "flag": 1269
  },
  {
    "name": "FEATHER_BADGE",
    "label": "Feather Badge",
    "flag": 2156
  },
  {
    "name": "AERIAL_ACE_RECEIVED",
    "label": "Aerial Ace received",
    "flag": 170
  },
  {
    "name": "MOSSDEEP_GYM_ENTERED",
    "label": "Mossdeep Gym entry",
    "map": [
      14,
      0
    ]
  },
  {
    "name": "TATE_AND_LIZA_DEFEATED",
    "label": "Tate And Liza defeated",
    "flag": 1551
  },
  {
    "name": "MOSSDEEP_GYM_COMPLETE",
    "label": "Mossdeep Gym complete",
    "flag": 1270
  },
  {
    "name": "MIND_BADGE",
    "label": "Mind Badge",
    "flag": 2157
  },
  {
    "name": "CALM_MIND_RECEIVED",
    "label": "Calm Mind received",
    "flag": 171
  },
  {
    "name": "SOOTOPOLIS_GYM_ENTERED",
    "label": "Sootopolis Gym entry",
    "map": [
      15,
      0
    ]
  },
  {
    "name": "JUAN_DEFEATED",
    "label": "Juan defeated",
    "flag": 1552
  },
  {
    "name": "SOOTOPOLIS_GYM_COMPLETE",
    "label": "Sootopolis Gym complete",
    "flag": 1271
  },
  {
    "name": "RAIN_BADGE",
    "label": "Rain Badge",
    "flag": 2158
  },
  {
    "name": "WATER_PULSE_RECEIVED",
    "label": "Water Pulse received",
    "flag": 172
  }
];
export const EXTENDED_PROGRESS_NAMES:ReadonlySet<string> = new Set(PROGRESS_CATALOG.map(m=>m.name).filter(n=>n!=="ROUTE_116"&&n!=="RUSTURF_TUNNEL"));
export function progressReached(name:string,state:GameStateSnapshot):boolean|null {
 if(!state.started||state.screen==="field_transition"||state.screen==="unknown")return null;
 const m=PROGRESS_CATALOG.find(m=>m.name===name);if(m===undefined)return null;
 if(m.map!==undefined) {
  if(state.map_id===null)return null;
  if(m.requiresBadge!==undefined&&!state.badges.includes(m.requiresBadge))return false;
  return state.map_id[0]===m.map[0]&&state.map_id[1]===m.map[1];
 }
 const p=state.story_progress;if(p==null)return null;
 const flag=(n:number):boolean=>(Number.parseInt(p.flags.slice(2*(n>>3),2*(n>>3)+2),16)&(1<<(n&7)))!==0;
 if(m.flag!==undefined)return flag(m.flag);
 if(m.anyFlags!==undefined)return m.anyFlags.some(flag);
 if(m.field===undefined)return null;
 const value=p[m.field];return value===null?null:typeof value==="boolean"?value:(m.values??[]).includes(value);
}
