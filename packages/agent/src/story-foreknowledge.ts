// no-story-foreknowledge-v1: stub for the RED commit.
import type {RunEvent} from "./events.js";

export type Shows=(name:string)=>boolean;
export class ShownStoryNames {
 observe(_event:RunEvent):void {}
 shows(_name:string,_callId:string|null=null):boolean {return false;}
}
export function shownCast(text:string,_shows:Shows):string {return text;}
