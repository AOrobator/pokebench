// unfinished-activity-v1 (RED stub).
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import type {Place} from "./story-destinations.js";

export const UNFINISHED_HEADER="Unfinished activity (what you did and what the game recorded; it is not an order or a route):";
export class UnfinishedActivity {
 constructor(private readonly features:FeatureSet){}
 observe(_event:RunEvent):void {}
 block(_state:GameStateSnapshot,_places:readonly Place[]|null):string|null {return null;}
 changes():readonly {readonly change:string}[] {return [];}
}
