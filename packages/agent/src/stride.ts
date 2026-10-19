import {Type,type Static} from "typebox";
import {Value} from "typebox/value";
import type {AgentToolResult} from "@mariozechner/pi-agent-core";
export const STRIDE_MAX_TILES=8;
export const STRIDE_MAX_FRAMES=224;
const Point=Type.Object({x:Type.Integer({minimum:0,maximum:255}),y:Type.Integer({minimum:0,maximum:255})},{additionalProperties:false});
export const StridePlanSchema=Type.Object({id:Type.String({minLength:1,maxLength:64}),map_id:Type.Tuple([Type.Integer({minimum:0,maximum:255}),Type.Integer({minimum:0,maximum:255})]),origin:Point,path:Type.Array(Point,{minItems:1,maxItems:STRIDE_MAX_TILES}),elevation:Type.Integer({minimum:1,maximum:14})},{additionalProperties:false});
export type StridePlan=Static<typeof StridePlanSchema>;
export type StrideCorridor=Omit<StridePlan,"id">;
export const StrideReceiptSchema=Type.Object({...StridePlanSchema.properties,automatic_running:Type.Boolean(),completed:Type.Integer({minimum:0,maximum:STRIDE_MAX_TILES}),frames:Type.Integer({minimum:0,maximum:STRIDE_MAX_FRAMES}),reason:Type.String(),stopped:Type.Boolean()},{additionalProperties:false});
export type StrideReceipt=Static<typeof StrideReceiptSchema>;
export function resultStride(result:AgentToolResult<unknown>):StrideReceipt|null {
 const details=result.details;
 return typeof details==="object"&&details!==null&&"stride" in details&&Value.Check(StrideReceiptSchema,details.stride)?details.stride:null;
}
