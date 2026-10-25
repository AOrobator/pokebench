import type {ProgressDefinition} from "./story-progress.js";

// pret/pokeemerald 731ad5bf, US Emerald f3ae0881; predicates/writers in docs/findings/campaign-milestones.md.
export const CAMPAIGN_ADDITIONS:readonly (ProgressDefinition & {readonly anchor:string|null})[] = [
  {
    "name": "ROUTE_106",
    "label": "Route 106",
    "map": [
      0,
      21
    ],
    "settled": true,
    "anchor": "GRANITE_CAVE"
  },
  {
    "name": "GRANITE_CAVE_B1F",
    "label": "Granite Cave B1F",
    "map": [
      24,
      8
    ],
    "settled": false,
    "anchor": "STEVEN_REACHED"
  },
  {
    "name": "GRANITE_CAVE_B2F",
    "label": "Granite Cave B2F",
    "map": [
      24,
      9
    ],
    "settled": false,
    "anchor": "STEVEN_REACHED"
  },
  {
    "name": "ROUTE_109_BEACH_REACHED",
    "label": "Slateport beach reached",
    "map": [
      0,
      24
    ],
    "settled": true,
    "anchor": "SLATEPORT_CITY",
    "land": true,
    "bounds": [
      0,
      0,
      39,
      25
    ]
  },
  {
    "name": "HM_ROCK_SMASH_RECEIVED",
    "label": "Rock Smash received",
    "flag": 107,
    "anchor": "LAVARIDGE_GYM_ENTERED"
  },
  {
    "name": "RUSTURF_TUNNEL_OPENED",
    "label": "Rusturf Tunnel opened",
    "flag": 199,
    "anchor": "LAVARIDGE_GYM_ENTERED"
  },
  {
    "name": "HM_STRENGTH_RECEIVED",
    "label": "Strength received",
    "flag": 106,
    "anchor": "LAVARIDGE_GYM_ENTERED"
  },
  {
    "name": "ROUTE_111_NORTH",
    "label": "Route 111 beyond the rocks",
    "map": [
      0,
      26
    ],
    "settled": true,
    "anchor": "LAVARIDGE_GYM_ENTERED",
    "land": true,
    "bounds": [
      0,
      0,
      39,
      99
    ]
  },
  {
    "name": "ROUTE_112",
    "label": "Route 112",
    "map": [
      0,
      27
    ],
    "settled": true,
    "anchor": "LAVARIDGE_GYM_ENTERED"
  },
  {
    "name": "FIERY_PATH",
    "label": "Fiery Path",
    "map": [
      24,
      14
    ],
    "settled": false,
    "anchor": "LAVARIDGE_GYM_ENTERED"
  },
  {
    "name": "ROUTE_113",
    "label": "Route 113",
    "map": [
      0,
      28
    ],
    "settled": true,
    "anchor": "LAVARIDGE_GYM_ENTERED"
  },
  {
    "name": "FALLARBOR_TOWN",
    "label": "Fallarbor",
    "map": [
      0,
      13
    ],
    "settled": true,
    "anchor": "LAVARIDGE_GYM_ENTERED"
  },
  {
    "name": "ROUTE_114",
    "label": "Route 114",
    "map": [
      0,
      29
    ],
    "settled": true,
    "anchor": "LAVARIDGE_GYM_ENTERED"
  },
  {
    "name": "METEOR_FALLS",
    "label": "Meteor Falls",
    "map": [
      24,
      0
    ],
    "settled": false,
    "anchor": "LAVARIDGE_GYM_ENTERED"
  },
  {
    "name": "METEOR_FALLS_CONFRONTATION_RESOLVED",
    "label": "Meteor Falls confrontation resolved",
    "flag": 207,
    "anchor": "LAVARIDGE_GYM_ENTERED"
  },
  {
    "name": "MT_CHIMNEY",
    "label": "Mt. Chimney summit",
    "map": [
      24,
      12
    ],
    "settled": false,
    "anchor": "LAVARIDGE_GYM_ENTERED"
  },
  {
    "name": "MT_CHIMNEY_MAXIE_DEFEATED",
    "label": "Mt. Chimney Maxie defeated",
    "flag": 1882,
    "anchor": "LAVARIDGE_GYM_ENTERED"
  },
  {
    "name": "MT_CHIMNEY_STORY_COMPLETE",
    "label": "Mt. Chimney story complete",
    "flag": 139,
    "anchor": "LAVARIDGE_GYM_ENTERED"
  },
  {
    "name": "JAGGED_PASS",
    "label": "Jagged Pass",
    "map": [
      24,
      13
    ],
    "settled": false,
    "anchor": "LAVARIDGE_GYM_ENTERED"
  },
  {
    "name": "LAVARIDGE_TOWN",
    "label": "Lavaridge",
    "map": [
      0,
      12
    ],
    "settled": true,
    "anchor": "LAVARIDGE_GYM_ENTERED"
  },
  {
    "name": "HM_SURF_RECEIVED",
    "label": "Surf received",
    "flag": 122,
    "anchor": "FORTREE_GYM_ENTERED"
  },
  {
    "name": "ROUTE_118_EAST_BANK_REACHED",
    "label": "Route 118 east bank",
    "map": [
      0,
      33
    ],
    "settled": true,
    "anchor": "FORTREE_GYM_ENTERED",
    "land": true,
    "bounds": [
      39,
      0,
      69,
      19
    ]
  },
  {
    "name": "ROUTE_118_STEVEN_SCENE_COMPLETE",
    "label": "Route 118 Steven encounter complete",
    "variable": 16497,
    "values": [
      1
    ],
    "maximum": 1,
    "anchor": "FORTREE_GYM_ENTERED"
  },
  {
    "name": "ROUTE_119",
    "label": "Route 119",
    "map": [
      0,
      34
    ],
    "settled": true,
    "anchor": "FORTREE_GYM_ENTERED"
  },
  {
    "name": "WEATHER_INSTITUTE_ENTERED",
    "label": "Weather Institute",
    "map": [
      32,
      0
    ],
    "settled": false,
    "anchor": "FORTREE_GYM_ENTERED"
  },
  {
    "name": "WEATHER_INSTITUTE_SHELLY_DEFEATED",
    "label": "Weather Institute Shelly defeated",
    "flag": 1312,
    "anchor": "FORTREE_GYM_ENTERED"
  },
  {
    "name": "WEATHER_INSTITUTE_AQUA_WITHDRAWN",
    "label": "Weather Institute Aqua withdrawal",
    "variable": 16563,
    "values": [
      1,
      2
    ],
    "maximum": 2,
    "anchor": "FORTREE_GYM_ENTERED"
  },
  {
    "name": "ROUTE_119_RIVAL_DEFEATED",
    "label": "Route 119 rival defeated",
    "anyFlags": [
      1802,
      1805,
      1808,
      1811,
      1814,
      1817
    ],
    "anchor": "FORTREE_GYM_ENTERED"
  },
  {
    "name": "ROUTE_119_RIVAL_SCENE_COMPLETE",
    "label": "Route 119 rival departure",
    "variable": 16498,
    "values": [
      1
    ],
    "maximum": 1,
    "anchor": "FORTREE_GYM_ENTERED"
  },
  {
    "name": "FORTREE_CITY",
    "label": "Fortree",
    "map": [
      0,
      4
    ],
    "settled": true,
    "anchor": "FORTREE_GYM_ENTERED"
  },
  {
    "name": "ROUTE_120",
    "label": "Route 120",
    "map": [
      0,
      35
    ],
    "settled": true,
    "anchor": "FORTREE_GYM_ENTERED"
  },
  {
    "name": "DEVON_SCOPE_RECEIVED",
    "label": "Devon Scope received",
    "flag": 285,
    "anchor": "FORTREE_GYM_ENTERED"
  },
  {
    "name": "FORTREE_GYM_OBSTRUCTION_CLEARED",
    "label": "Fortree Gym obstruction cleared",
    "flag": 295,
    "anchor": "FORTREE_GYM_ENTERED"
  },
  {
    "name": "ROUTE_121",
    "label": "Route 121",
    "map": [
      0,
      36
    ],
    "settled": true,
    "anchor": "MOSSDEEP_GYM_ENTERED"
  },
  {
    "name": "LILYCOVE_CITY",
    "label": "Lilycove",
    "map": [
      0,
      5
    ],
    "settled": true,
    "anchor": "MOSSDEEP_GYM_ENTERED"
  },
  {
    "name": "ROUTE_122",
    "label": "Route 122",
    "map": [
      0,
      37
    ],
    "settled": true,
    "anchor": "MOSSDEEP_GYM_ENTERED"
  },
  {
    "name": "MT_PYRE",
    "label": "Mt. Pyre",
    "map": [
      24,
      15
    ],
    "settled": false,
    "anchor": "MOSSDEEP_GYM_ENTERED"
  },
  {
    "name": "MT_PYRE_SUMMIT",
    "label": "Mt. Pyre summit",
    "map": [
      24,
      22
    ],
    "settled": false,
    "anchor": "MOSSDEEP_GYM_ENTERED"
  },
  {
    "name": "MAGMA_EMBLEM_RECEIVED",
    "label": "Magma Emblem received",
    "flag": 212,
    "anchor": "MOSSDEEP_GYM_ENTERED"
  },
  {
    "name": "MAGMA_HIDEOUT",
    "label": "Magma Hideout",
    "map": [
      24,
      86
    ],
    "settled": false,
    "anchor": "MOSSDEEP_GYM_ENTERED"
  },
  {
    "name": "MAGMA_HIDEOUT_MAXIE_CHAMBER",
    "label": "Magma Hideout Maxie chamber",
    "map": [
      24,
      91
    ],
    "settled": false,
    "anchor": "MOSSDEEP_GYM_ENTERED"
  },
  {
    "name": "MAGMA_HIDEOUT_MAXIE_DEFEATED",
    "label": "Magma Hideout Maxie defeated",
    "flag": 1881,
    "anchor": "MOSSDEEP_GYM_ENTERED"
  },
  {
    "name": "MAGMA_HIDEOUT_STORY_COMPLETE",
    "label": "Magma Hideout story complete",
    "flag": 111,
    "anchor": "MOSSDEEP_GYM_ENTERED"
  },
  {
    "name": "SLATEPORT_HARBOR",
    "prerequisites": ["MAGMA_HIDEOUT_STORY_COMPLETE"],
    "label": "Slateport Harbor",
    "map": [
      9,
      9
    ],
    "settled": false,
    "anchor": "MOSSDEEP_GYM_ENTERED"
  },
  {
    "name": "SLATEPORT_SUBMARINE_THEFT_WITNESSED",
    "label": "Slateport submarine theft witnessed",
    "flag": 97,
    "anchor": "MOSSDEEP_GYM_ENTERED"
  },
  {
    "name": "AQUA_HIDEOUT_ACCESS_OPENED",
    "label": "Aqua Hideout entrance unblocked",
    "allFlags": [
      821,
      822
    ],
    "anchor": "MOSSDEEP_GYM_ENTERED"
  },
  {
    "name": "AQUA_HIDEOUT",
    "label": "Aqua Hideout",
    "map": [
      24,
      23
    ],
    "settled": false,
    "anchor": "MOSSDEEP_GYM_ENTERED"
  },
  {
    "name": "AQUA_HIDEOUT_SUBMARINE_CHAMBER",
    "label": "Aqua Hideout submarine level",
    "map": [
      24,
      25
    ],
    "settled": false,
    "anchor": "MOSSDEEP_GYM_ENTERED"
  },
  {
    "name": "AQUA_HIDEOUT_MATT_DEFEATED",
    "label": "Aqua Hideout Matt defeated",
    "flag": 1310,
    "anchor": "MOSSDEEP_GYM_ENTERED"
  },
  {
    "name": "AQUA_HIDEOUT_ESCAPE_COMPLETE",
    "label": "Aqua Hideout submarine escape complete",
    "flag": 112,
    "anchor": "MOSSDEEP_GYM_ENTERED"
  },
  {
    "name": "ROUTE_124",
    "label": "Route 124",
    "map": [
      0,
      39
    ],
    "settled": true,
    "anchor": "MOSSDEEP_GYM_ENTERED"
  },
  {
    "name": "MOSSDEEP_CITY",
    "label": "Mossdeep",
    "map": [
      0,
      6
    ],
    "settled": true,
    "anchor": "MOSSDEEP_GYM_ENTERED"
  },
  {
    "name": "SPACE_CENTER_OCCUPATION_ENTERED",
    "label": "Occupied Space Center entered",
    "map": [
      14,
      9
    ],
    "settled": false,
    "anchor": "SOOTOPOLIS_GYM_ENTERED",
    "requireVariable": 16543,
    "requireValues": [
      1,
      2
    ],
    "requireMaximum": 3
  },
  {
    "name": "SPACE_CENTER_BATTLE_WON",
    "label": "Space Center battle won",
    "variable": 16543,
    "values": [
      3
    ],
    "maximum": 3,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "SPACE_CENTER_STORY_COMPLETE",
    "label": "Space Center occupation ended",
    "variable": 16543,
    "values": [
      3
    ],
    "maximum": 3,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "HM_DIVE_RECEIVED",
    "label": "Dive received",
    "flag": 123,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "ROUTE_127",
    "label": "Route 127",
    "map": [
      0,
      42
    ],
    "settled": true,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "ROUTE_128",
    "label": "Route 128",
    "map": [
      0,
      43
    ],
    "settled": true,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "SEAFLOOR_UNDERWATER_ENTRANCE",
    "label": "Seafloor Cavern underwater entrance",
    "map": [
      24,
      26
    ],
    "settled": false,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "SEAFLOOR_CAVERN",
    "label": "Seafloor Cavern",
    "map": [
      24,
      27
    ],
    "settled": false,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "SEAFLOOR_ARCHIE_CHAMBER",
    "label": "Seafloor Cavern Archie chamber",
    "map": [
      24,
      36
    ],
    "settled": false,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "SEAFLOOR_ARCHIE_DEFEATED",
    "label": "Seafloor Cavern Archie defeated",
    "flag": 1314,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "SEAFLOOR_KYOGRE_RELEASE_CONFIRMED",
    "label": "Seafloor Cavern Kyogre release",
    "flag": 129,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "ROUTE_126",
    "label": "Route 126",
    "map": [
      0,
      41
    ],
    "settled": true,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "SOOTOPOLIS_CITY",
    "label": "Sootopolis",
    "map": [
      0,
      7
    ],
    "settled": true,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "CAVE_OF_ORIGIN",
    "label": "Cave of Origin",
    "map": [
      24,
      37
    ],
    "settled": false,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "CAVE_OF_ORIGIN_WALLACE_REACHED",
    "label": "Cave of Origin Wallace chamber",
    "map": [
      24,
      42
    ],
    "settled": false,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "WALLACE_SKY_PILLAR_DISCUSSION_COMPLETE",
    "label": "Wallace Sky Pillar discussion complete",
    "flag": 311,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "ROUTE_129",
    "label": "Route 129",
    "map": [
      0,
      44
    ],
    "settled": true,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "ROUTE_130",
    "label": "Route 130",
    "map": [
      0,
      45
    ],
    "settled": true,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "ROUTE_131",
    "label": "Route 131",
    "map": [
      0,
      46
    ],
    "settled": true,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "SKY_PILLAR_OPENED",
    "label": "Sky Pillar opened",
    "variable": 16478,
    "values": [
      4,
      5,
      6
    ],
    "maximum": 6,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "SKY_PILLAR",
    "label": "Sky Pillar",
    "map": [
      24,
      79
    ],
    "settled": false,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "SKY_PILLAR_SUMMIT",
    "label": "Sky Pillar summit",
    "map": [
      24,
      85
    ],
    "settled": false,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "RAYQUAZA_AWAKENED",
    "label": "Rayquaza awakened",
    "variable": 16478,
    "values": [
      5,
      6
    ],
    "maximum": 6,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "SOOTOPOLIS_CRISIS_RESOLVED",
    "label": "Sootopolis crisis resolved",
    "variable": 16586,
    "values": [
      2,
      3
    ],
    "maximum": 3,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "HM_WATERFALL_RECEIVED",
    "label": "Waterfall received",
    "flag": 312,
    "anchor": "SOOTOPOLIS_GYM_ENTERED"
  },
  {
    "name": "EVER_GRANDE_LANDING",
    "label": "Ever Grande landing above waterfall",
    "map": [
      0,
      8
    ],
    "settled": true,
    "anchor": null,
    "land": true,
    "bounds": [
      0,
      40,
      39,
      57
    ]
  },
  {
    "name": "VICTORY_ROAD",
    "label": "Victory Road",
    "map": [
      24,
      43
    ],
    "settled": false,
    "anchor": null
  },
  {
    "name": "VICTORY_ROAD_B1F",
    "label": "Victory Road B1F",
    "map": [
      24,
      44
    ],
    "settled": false,
    "anchor": null
  },
  {
    "name": "VICTORY_ROAD_B2F",
    "label": "Victory Road B2F",
    "map": [
      24,
      45
    ],
    "settled": false,
    "anchor": null
  },
  {
    "name": "VICTORY_ROAD_WALLY_DEFEATED",
    "label": "Victory Road Wally defeated",
    "flag": 126,
    "anchor": null
  },
  {
    "name": "EVER_GRANDE_NORTH_REACHED",
    "label": "Ever Grande northern approach",
    "map": [
      0,
      8
    ],
    "settled": true,
    "anchor": null,
    "land": true,
    "bounds": [
      0,
      0,
      39,
      27
    ]
  },
  {
    "name": "POKEMON_LEAGUE_REACHED",
    "label": "Pok\u00e9mon League lobby",
    "map": [
      16,
      10
    ],
    "settled": false,
    "anchor": null
  },
  {
    "name": "LEAGUE_ADMISSION_GRANTED",
    "label": "League admission granted",
    "flag": 263,
    "anchor": null
  },
  {
    "name": "ELITE_FOUR_CHALLENGE_ENTERED",
    "label": "Elite Four challenge entered",
    "map": [
      16,
      0
    ],
    "settled": false,
    "anchor": null
  },
  {
    "name": "ELITE_FOUR_SIDNEY_DEFEATED",
    "label": "Sidney defeated",
    "flag": 1275,
    "anchor": null
  },
  {
    "name": "ELITE_FOUR_PHOEBE_DEFEATED",
    "label": "Phoebe defeated",
    "flag": 1276,
    "anchor": null
  },
  {
    "name": "ELITE_FOUR_GLACIA_DEFEATED",
    "label": "Glacia defeated",
    "flag": 1277,
    "anchor": null
  },
  {
    "name": "ELITE_FOUR_DRAKE_DEFEATED",
    "label": "Drake defeated",
    "flag": 1278,
    "anchor": null
  },
  {
    "name": "CHAMPION_ROOM_REACHED",
    "label": "Champion room reached",
    "map": [
      16,
      4
    ],
    "settled": false,
    "anchor": null
  },
  {
    "name": "WALLACE_DEFEATED",
    "label": "Champion Wallace defeated",
    "flag": 1615,
    "anchor": null
  },
  {
    "name": "HALL_OF_FAME_ENTERED",
    "label": "Hall of Fame entered",
    "map": [
      16,
      11
    ],
    "settled": false,
    "anchor": null
  },
  {
    "name": "GAME_CLEAR_CONFIRMED",
    "label": "Game clear confirmed",
    "flag": 2148,
    "anchor": null
  },
  {
    "name": "HM_CUT_RECEIVED",
    "label": "Cut received",
    "flag": 137,
    "anchor": null,
    "optional": true
  },
  {
    "name": "HM_FLASH_RECEIVED",
    "label": "Flash received",
    "flag": 109,
    "anchor": null,
    "optional": true
  },
  {
    "name": "HM_FLY_RECEIVED",
    "label": "Fly received",
    "flag": 110,
    "anchor": null,
    "optional": true
  },
  {
    "name": "BICYCLE_RECEIVED",
    "label": "Bicycle received",
    "flag": 90,
    "anchor": null,
    "optional": true
  },
  {
    "name": "GO_GOGGLES_RECEIVED",
    "label": "Go-Goggles received",
    "flag": 221,
    "anchor": null,
    "optional": true
  },
  {
    "name": "CASTFORM_RECEIVED",
    "label": "Castform received",
    "flag": 151,
    "anchor": null,
    "optional": true
  },
  {
    "name": "METEORITE_RECEIVED",
    "label": "Meteorite received",
    "flag": 115,
    "anchor": null,
    "optional": true
  },
  {
    "name": "EXP_SHARE_RECEIVED",
    "label": "Exp. Share received",
    "flag": 272,
    "anchor": null,
    "optional": true
  }
];

export function campaignCatalog(base:readonly ProgressDefinition[]):readonly ProgressDefinition[] {
 return [...base.flatMap(m=>[...CAMPAIGN_ADDITIONS.filter(n=>n.anchor===m.name),m]),...CAMPAIGN_ADDITIONS.filter(m=>m.anchor===null)];
}
