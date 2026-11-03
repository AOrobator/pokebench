import {Type,type Static} from "typebox";
// moving-npc-intercept-v1: wire shapes of the game server's frame-owned patrol watch and step-in
// (env/pokebench_env/intercept.py). Both own the input queue for at most INTERCEPT_MAX_FRAMES.
export const INTERCEPT_MAX_FRAMES=240;
const Point=Type.Object({x:Type.Integer({minimum:0,maximum:255}),y:Type.Integer({minimum:0,maximum:255})},{additionalProperties:false});
const MapId=Type.Tuple([Type.Integer({minimum:0,maximum:255}),Type.Integer({minimum:0,maximum:255})]);
const Id=Type.String({minLength:1,maxLength:64,pattern:"^[a-zA-Z0-9-]+$"});
const Frames=Type.Integer({minimum:1,maximum:INTERCEPT_MAX_FRAMES});
const Target={target_local_id:Type.Integer({minimum:1,maximum:255}),target_slot:Type.Integer({minimum:0,maximum:15})};
export const WatchPlanSchema=Type.Object({id:Id,map_id:MapId,...Target,max_frames:Frames},{additionalProperties:false});
export type WatchPlan=Static<typeof WatchPlanSchema>;
export const PatrolStepSchema=Type.Object({from:Point,to:Point},{additionalProperties:false});
export type PatrolStep=Static<typeof PatrolStepSchema>;
export const WatchReceiptSchema=Type.Object({...WatchPlanSchema.properties,edges:Type.Array(PatrolStepSchema),frames:Type.Integer({minimum:0,maximum:INTERCEPT_MAX_FRAMES+1}),reason:Type.String(),stopped:Type.Boolean()},{additionalProperties:false});
export type WatchReceipt=Static<typeof WatchReceiptSchema>;
export const InterceptPlanSchema=Type.Object({id:Id,map_id:MapId,wait:Point,enter:Point,approach:Point,...Target,elevation:Type.Integer({minimum:1,maximum:14}),max_frames:Frames},{additionalProperties:false});
export type InterceptPlan=Static<typeof InterceptPlanSchema>;
export const InterceptReceiptSchema=Type.Object({...InterceptPlanSchema.properties,frames:Type.Integer({minimum:0,maximum:INTERCEPT_MAX_FRAMES+1}),phase:Type.String(),reason:Type.String(),stopped:Type.Boolean()},{additionalProperties:false});
export type InterceptReceipt=Static<typeof InterceptReceiptSchema>;
type Tile={readonly x:number;readonly y:number};
export const sameTile=(a:Tile,b:Tile):boolean=>a.x===b.x&&a.y===b.y;
/** Directions between cardinal neighbours, as the game's buttons name them. */
export function stepButton(from:Tile,to:Tile):"UP"|"DOWN"|"LEFT"|"RIGHT"|null {
 const dx=to.x-from.x,dy=to.y-from.y;
 return dx===0&&dy===-1?"UP":dx===0&&dy===1?"DOWN":dx===-1&&dy===0?"LEFT":dx===1&&dy===0?"RIGHT":null;
}
