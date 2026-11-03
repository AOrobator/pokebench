import {REQUIRED_FRONTIER_MILESTONES} from "./milestones.js";
import {OPTIONAL_PROGRESS_NAMES,PROGRESS_CATALOG} from "./story-progress.js";

// The ranking topology. Two relations, because the ROM has two kinds of gate:
// requires - a script guard, field-move check or physical obstruction refuses the action, and
//            every edge carries the file that proves it. This is what "earned" and "blocked" mean.
// expects  - the route assumes it but nothing refuses it, so it may order a plan and never block one.
//            The sixth badge is the clean example: the league door checks it, but the Sootopolis gym does
//            not, and nothing else refuses the Rain Badge without it. (Badge eight is different: the
//            Waterfall climb to Ever Grande is enforced at src/field_control_avatar.c:455.)
export type ObjectiveRelation="requires"|"expects";

export interface ObjectiveEdge{
  readonly from:string;
  readonly to:string;
  readonly relation:ObjectiveRelation;
  readonly evidence:string;
}

const GAME_CLEAR="GAME_CLEAR_CONFIRMED";

export const OBJECTIVE_EDGES: readonly ObjectiveEdge[]=[
  {from:"HM_ROCK_SMASH_RECEIVED",to:"HM_STRENGTH_RECEIVED",relation:"requires",
    evidence:"data/maps/RusturfTunnel/map.json carries two OBJ_EVENT_GFX_BREAKABLE_ROCK; scripts.inc:47-58 gives HM04"},
  {from:"HM_ROCK_SMASH_RECEIVED",to:"ROUTE_111_NORTH",relation:"requires",
    evidence:"data/maps/Route111/map.json:222,235 - breakable rocks at (18,101)/(19,100); docs/findings/campaign-milestones.md:19"},
  {from:"DYNAMO_BADGE",to:"ROUTE_111_NORTH",relation:"requires",
    evidence:"data/scripts/field_move_scripts.inc:62 refuses Rock Smash without FLAG_BADGE03_GET"},
  {from:"LAVARIDGE_TOWN",to:"HEAT_BADGE",relation:"requires",
    evidence:"data/maps/LavaridgeTown_Gym_1F/scripts.inc:62 sets FLAG_BADGE04_GET inside Flannery's defeat script, so the badge is only obtainable in that gym; the gym door itself is open (no badge or story gate read)"},
  {from:"BALANCE_BADGE",to:"HM_SURF_RECEIVED",relation:"requires",
    evidence:"data/maps/PetalburgCity_WallysHouse/scripts.inc:15-17 gives Surf on VAR_PETALBURG_CITY_STATE == 4"},
  {from:"DEVON_SCOPE_RECEIVED",to:"FORTREE_GYM_OBSTRUCTION_CLEARED",relation:"requires",
    evidence:"data/maps/FortreeCity/scripts.inc:58 checkitem ITEM_DEVON_SCOPE gates the Kecleon scene that sets FLAG_KECLEON_FLED_FORTREE at :80; flags 285/295, docs/findings/campaign-milestones.md:74-75"},
  {from:"FORTREE_GYM_OBSTRUCTION_CLEARED",to:"FEATHER_BADGE",relation:"requires",
    evidence:"data/maps/FortreeCity/scripts.inc:56-59 gates the gym approach on checkitem ITEM_DEVON_SCOPE and :80 sets FLAG_KECLEON_FLED_FORTREE"},
  {from:"MIND_BADGE",to:"SPACE_CENTER_STORY_COMPLETE",relation:"requires",
    evidence:"data/maps/MossdeepCity_Gym/scripts.inc:79 sets VAR_MOSSDEEP_SPACE_CENTER_STATE=1 in Tate & Liza's post-battle script"},
  {from:"SPACE_CENTER_STORY_COMPLETE",to:"HM_DIVE_RECEIVED",relation:"requires",
    evidence:"data/maps/MossdeepCity_SpaceCenter_2F/scripts.inc:288 sets VAR_STEVENS_HOUSE_STATE=1; StevensHouse/scripts.inc:24-26 gives Dive"},
  {from:"HM_DIVE_RECEIVED",to:"SOOTOPOLIS_CITY",relation:"requires",
    evidence:"data/maps/Route128/map.json connection MAP_UNDERWATER_ROUTE128 type dive; Underwater_SootopolisCity warps into the city"},
  {from:"FEATHER_BADGE",to:"RAIN_BADGE",relation:"expects",
    evidence:"data/maps/SootopolisCity_Gym_1F/scripts.inc:80-86 gives the Rain Badge on beating Juan; the FLAG_BADGE06_GET branch there is the re-talk reminder, so the sixth badge is skipped, not required"},
  {from:"SOOTOPOLIS_CRISIS_RESOLVED",to:"HM_WATERFALL_RECEIVED",relation:"requires",
    evidence:"data/maps/SootopolisCity/scripts.inc:1252-1261 gives Waterfall on FLAG_SOOTOPOLIS_ARCHIE_MAXIE_LEAVE, before the gym opens"},
  {from:"BRAWLY_DEFEATED",to:"KNUCKLE_BADGE",relation:"requires",
    evidence:"data/maps/DewfordTown_Gym/scripts.inc:144-151 - DewfordTown_Gym_EventScript_BrawlyDefeated sets FLAG_BADGE02_GET"},
  {from:"DEVON_GOODS_RECOVERED",to:"DEWFORD_TOWN",relation:"requires",
    evidence:"data/maps/RusturfTunnel/scripts.inc:322-324 sets VAR_BRINEY_HOUSE_STATE=1 with the goods flag; Route104_MrBrineysHouse/scripts.inc:7 seats Briney only in that state"},
  {from:"HM_STRENGTH_RECEIVED",to:"MAGMA_HIDEOUT",relation:"requires",
    evidence:"data/maps/MagmaHideout_1F/map.json carries three OBJ_EVENT_GFX_PUSHABLE_BOULDER"},
  {from:"MAGMA_EMBLEM_RECEIVED",to:"MAGMA_HIDEOUT",relation:"requires",
    evidence:"data/maps/JaggedPass/scripts.inc:13 checkitem ITEM_MAGMA_EMBLEM opens the hideout entrance"},
  {from:"DYNAMO_BADGE",to:"HM_STRENGTH_RECEIVED",relation:"requires",
    evidence:"data/scripts/field_move_scripts.inc:62 refuses Rock Smash without FLAG_BADGE03_GET; :88 TryUpdateRusturfTunnelState (src/field_specials.c:1398-1414) opens the tunnel state that data/maps/RusturfTunnel/scripts.inc:7-8 runs to hand over HM04 at :56"},
  {from:"HEAT_BADGE",to:"MAGMA_HIDEOUT",relation:"requires",
    evidence:"data/scripts/field_move_scripts.inc:124 refuses Strength without FLAG_BADGE04_GET"},
  {from:"FEATHER_BADGE",to:"LEAGUE_ADMISSION_GRANTED",relation:"requires",
    evidence:"data/maps/EverGrandeCity_PokemonLeague_1F/scripts.inc:46-63 guards on FLAG_BADGE06_GET only"},
  {from:"MAGMA_HIDEOUT_STORY_COMPLETE",to:"SLATEPORT_HARBOR",relation:"requires",
    evidence:"data/maps/MagmaHideout_4F/scripts.inc:55-57 sets VAR_SLATEPORT_HARBOR_STATE=1; docs/findings/campaign-milestones.md:150-152"},
  {from:"HM_SURF_RECEIVED",to:"ROUTE_118_EAST_BANK_REACHED",relation:"requires",
    evidence:"src/field_control_avatar.c:450 refuses Surf without FLAG_BADGE05_GET; docs/findings/campaign-milestones.md:20 - the east bank cannot be earned from the western approach"},
  {from:"HM_SURF_RECEIVED",to:"MOSSDEEP_CITY",relation:"requires",
    evidence:"src/field_control_avatar.c:450 refuses Surf without FLAG_BADGE05_GET; the open-sea route itself has no script guard"},
  {from:"HM_WATERFALL_RECEIVED",to:"EVER_GRANDE_LANDING",relation:"requires",
    evidence:"src/field_control_avatar.c:455 requires FLAG_BADGE08_GET to use Waterfall"},
  {from:"RAIN_BADGE",to:"EVER_GRANDE_LANDING",relation:"requires",
    evidence:"src/field_control_avatar.c:455 - the climb above Ever Grande is a Waterfall use, so the eighth badge gates it"},
  {from:"RAIN_BADGE",to:"CHAMPION_ROOM_REACHED",relation:"expects",
    evidence:"the league door checks badge six only (EverGrandeCity_PokemonLeague_1F/scripts.inc:46-63), so the eighth badge is expected on the way to the champion rather than enforced by that door"},
  {from:"LEAGUE_ADMISSION_GRANTED",to:"ELITE_FOUR_CHALLENGE_ENTERED",relation:"expects",
    evidence:"story sequence from the admission script"},
  {from:"ELITE_FOUR_CHALLENGE_ENTERED",to:"ELITE_FOUR_SIDNEY_DEFEATED",relation:"expects",
    evidence:"story sequence"},
  {from:"ELITE_FOUR_SIDNEY_DEFEATED",to:"ELITE_FOUR_PHOEBE_DEFEATED",relation:"expects",
    evidence:"story sequence"},
  {from:"ELITE_FOUR_PHOEBE_DEFEATED",to:"ELITE_FOUR_GLACIA_DEFEATED",relation:"expects",
    evidence:"story sequence"},
  {from:"ELITE_FOUR_GLACIA_DEFEATED",to:"ELITE_FOUR_DRAKE_DEFEATED",relation:"expects",
    evidence:"story sequence"},
  {from:"ELITE_FOUR_DRAKE_DEFEATED",to:"CHAMPION_ROOM_REACHED",relation:"expects",
    evidence:"story sequence"},
  {from:"CHAMPION_ROOM_REACHED",to:"WALLACE_DEFEATED",relation:"expects",
    evidence:"story sequence"},
  {from:"WALLACE_DEFEATED",to:"HALL_OF_FAME_ENTERED",relation:"expects",
    evidence:"story sequence"},
  {from:"HALL_OF_FAME_ENTERED",to:GAME_CLEAR,relation:"expects",
    evidence:"story sequence"},
];

// A milestone that is only "the player was standing here" (a map visit with no flag behind it) is not
// evidence a checkpoint start can carry: a save-state launch reports what is true at that moment and the
// visits along the way are lost. Gates on those still rank, but they do not decide what a run has earned.
export const LOCATION_ONLY_OBJECTIVES:ReadonlySet<string>=new Set(PROGRESS_CATALOG
  .filter(definition=>definition.map!==undefined&&definition.flag===undefined&&definition.anyFlags===undefined&&definition.allFlags===undefined&&definition.variable===undefined)
  .map(definition=>definition.name));

const KNOWN=new Set<string>([...REQUIRED_FRONTIER_MILESTONES,...PROGRESS_CATALOG.map(definition=>definition.name)]);
export const OBJECTIVE_NODES: readonly string[]=[...KNOWN].sort();

const requiresParents=new Map<string,string[]>();
const planParents=new Map<string,string[]>();
const link=(index:Map<string,string[]>,from:string,to:string):void=>{
  const parents=index.get(to);
  if(parents===undefined)index.set(to,[from]);
  else if(!parents.includes(from))parents.push(from);
};
// A location-only parent is a place, not a gate. It still ranks (the edge stays in OBJECTIVE_EDGES), but it
// never decides what a run has earned, how deep it is, or what blocks it: a save-state start cannot report
// the visits before it, and the flag behind the visit proves it anyway.
// The plan index keeps every edge, so a chain that runs through a place stays connected; the earning index
// drops location-only parents, because a save-state start cannot report the visits before it and the flag
// behind the visit proves it anyway.
for(const edge of OBJECTIVE_EDGES){
  link(planParents,edge.from,edge.to);
  if(edge.relation==="requires"&&!LOCATION_ONLY_OBJECTIVES.has(edge.from))link(requiresParents,edge.from,edge.to);
}

const ancestorsIn=(index:ReadonlyMap<string,string[]>,name:string):ReadonlySet<string>=>{
  const seen=new Set<string>();
  const walk=(child:string):void=>{
    for(const parent of index.get(child)??[]){
      if(seen.has(parent))continue;
      seen.add(parent);
      walk(parent);
    }
  };
  walk(name);
  return seen;
};

const countable=(name:string):boolean=>KNOWN.has(name)&&!OPTIONAL_PROGRESS_NAMES.has(name);

const all = (names:Iterable<string>, test:(name:string)=>boolean):boolean=>{
  for(const name of names)if(!test(name))return false;
  return true;
};

// Earned objectives: reached, and every hard prerequisite reached too. Ignores the order they
// arrived in, which is what makes a deferred badge count the same as an early one.
export function objectiveDepth(reached:ReadonlySet<string>):number{
  let depth=0;
  for(const name of reached){
    if(!countable(name))continue;
    if(all(ancestorsIn(requiresParents,name),ancestor=>reached.has(ancestor)))depth+=1;
  }
  return depth;
}

// What may be attempted next: unearned objectives whose hard prerequisites are all reached.
export function enabledObjectives(reached:ReadonlySet<string>):readonly string[]{
  const enabled:string[]=[];
  for(const name of OBJECTIVE_NODES){
    if(reached.has(name)||!countable(name))continue;
    if(all(ancestorsIn(requiresParents,name),ancestor=>reached.has(ancestor)))enabled.push(name);
  }
  return enabled;
}

// Hard prerequisites still missing. This is what the supervisor may name as the blocker.
export function blockingPrerequisites(name:string,reached:ReadonlySet<string>):readonly string[]{
  if(!KNOWN.has(name))return [];
  return [...ancestorsIn(requiresParents,name)].filter(ancestor=>!reached.has(ancestor)).sort();
}

// Everything the plan still needs, hard or expected, and the number a run is measured against.
export function unmetPrerequisites(name:string,reached:ReadonlySet<string>):readonly string[]{
  if(!KNOWN.has(name))return [];
  return [...ancestorsIn(planParents,name)].filter(ancestor=>!reached.has(ancestor)).sort();
}

export function remainingToClear(reached:ReadonlySet<string>):number{
  const needed=[...unmetPrerequisites(GAME_CLEAR,reached),GAME_CLEAR];
  return needed.filter(name=>countable(name)&&!reached.has(name)).length;
}
