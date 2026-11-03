import type {RunEvent} from "./events.js";

export interface RouteStep {
  readonly objective: string;
  readonly area: string;
  readonly waypoint: string;
}

// keepingiticy's order, which is not the order the milestones happen to be listed in: the second badge is
// deferred past the third and fourth and collected at level 28, and Fortree's gym waits for Steven. Areas
// and waypoints are the run's own, from the commentary; the objective is the flag the step ends on.
export const ROUTE_PLAN: readonly RouteStep[] = [
  {objective:"STONE_BADGE",area:"Rustboro",waypoint:"Roxanne: Water Gun the two Geodude"},
  {objective:"DEVON_GOODS_RECOVERED",area:"Rusturf Tunnel",waypoint:"the Aqua grunt at the east end, then Peeko and the Devon president"},
  {objective:"STEVEN_LETTER_RECEIVED",area:"Devon Corporation",waypoint:"the president's letter for Steven"},
  {objective:"DEWFORD_TOWN",area:"Dewford",waypoint:"Mr. Briney's boat across, gym left alone"},
  {objective:"STEVEN_LETTER_DELIVERED",area:"Granite Cave",waypoint:"the dark run to Steven with no Flash, Escape Rope out"},
  {objective:"SLATEPORT_CITY",area:"Slateport",waypoint:"Soft Sand off the beach, the museum drop-off, two grunts"},
  {objective:"HM_ROCK_SMASH_RECEIVED",area:"Mauville",waypoint:"HM06 and the Mach Bike before the gym"},
  {objective:"DYNAMO_BADGE",area:"Mauville Gym",waypoint:"one switch on the left, then Wattson"},
  {objective:"HM_STRENGTH_RECEIVED",area:"Rusturf Tunnel",waypoint:"smash the rocks for HM04"},
  {objective:"MT_CHIMNEY_STORY_COMPLETE",area:"Mt. Chimney",waypoint:"cable car, the grunts, then Maxie with a Guard Spec before the switch-in"},
  {objective:"LAVARIDGE_TOWN",area:"Lavaridge",waypoint:"the herb shop and Go-Goggles before the gym"},
  {objective:"HEAT_BADGE",area:"Lavaridge Gym",waypoint:"a straight line to Flannery, gym trainers skipped"},
  {objective:"KNUCKLE_BADGE",area:"Dewford Gym",waypoint:"the deferred gym at level 28, no trainers on the way"},
  {objective:"BALANCE_BADGE",area:"Petalburg Gym",waypoint:"speed room, confusion room, strength room, then Norman"},
  {objective:"HM_SURF_RECEIVED",area:"Petalburg",waypoint:"HM03 from Wally's parents"},
  {objective:"DEVON_SCOPE_RECEIVED",area:"Fortree",waypoint:"run from the Kecleon and take the Devon Scope from Steven"},
  {objective:"FORTREE_GYM_OBSTRUCTION_CLEARED",area:"Fortree",waypoint:"the Devon Scope on the Kecleon"},
  {objective:"FEATHER_BADGE",area:"Fortree Gym",waypoint:"the double battle, then Winona"},
  {objective:"MAGMA_HIDEOUT_STORY_COMPLETE",area:"Magma Hideout",waypoint:"Strength boulders, Tabitha, then Maxie"},
  {objective:"AQUA_HIDEOUT_ESCAPE_COMPLETE",area:"Aqua Hideout",waypoint:"the floor-pad switches and Matt, submarine away"},
  {objective:"MIND_BADGE",area:"Mossdeep Gym",waypoint:"the switch puzzles, then Tate & Liza"},
  {objective:"SPACE_CENTER_STORY_COMPLETE",area:"Mossdeep Space Center",waypoint:"Maxie again with Guard Spec and X Special"},
  {objective:"HM_DIVE_RECEIVED",area:"Steven's house",waypoint:"HM08 over Mud Shot"},
  {objective:"SEAFLOOR_CAVERN",area:"Seafloor Cavern",waypoint:"dive, boulders, then Archie"},
  {objective:"CAVE_OF_ORIGIN_WALLACE_REACHED",area:"Cave of Origin",waypoint:"Wallace and the Sky Pillar plan"},
  {objective:"SKY_PILLAR_SUMMIT",area:"Sky Pillar",waypoint:"the bike all the way over the holes"},
  {objective:"SOOTOPOLIS_CRISIS_RESOLVED",area:"Sootopolis",waypoint:"the Groudon and Kyogre scene"},
  {objective:"HM_WATERFALL_RECEIVED",area:"Sootopolis",waypoint:"HM07 after the crisis"},
  {objective:"RAIN_BADGE",area:"Sootopolis Gym",waypoint:"the ice path on the first try, then Juan"},
  {objective:"VICTORY_ROAD",area:"Victory Road",waypoint:"boulders, surf and no Flash"},
  {objective:"GAME_CLEAR_CONFIRMED",area:"Ever Grande",waypoint:"the League with one Pokémon, then Wallace"},
];

// The bar the re-score used for a drought: a long stretch of turns with no story step in it.
export const OFF_PLAN_TURNS=200;

const STEP_AT=new Map(ROUTE_PLAN.map((step,index)=>[step.objective,index] as const));

export class RoutePlan {
  private readonly reached=new Set<string>();
  private turn=0;
  private since=0;
  observe(event:RunEvent):void {
    if(typeof event.turn==="number")this.turn=event.turn;
    if(event.type!=="milestone"||!STEP_AT.has(event.name)||this.reached.has(event.name))return;
    this.reached.add(event.name);
    this.since=this.turn;
  }
  completed():number {return this.reached.size;}
  next():RouteStep|null {return ROUTE_PLAN.find(step=>!this.reached.has(step.objective))??null;}
  // "step 12 of 29 in Dewford Gym; next waypoint: … (KNUCKLE_BADGE); off-plan since turn 1552"
  status():string|null {
    const step=this.next();
    if(step===null)return null;
    const late=this.turn-this.since>OFF_PLAN_TURNS;
    return `step ${String(this.completed()+1)} of ${String(ROUTE_PLAN.length)} in ${step.area}; next waypoint: ${step.waypoint} (${step.objective})${late?`; off-plan since turn ${String(this.since)}`:""}`;
  }
}
