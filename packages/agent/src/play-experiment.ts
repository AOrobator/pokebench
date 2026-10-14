import {Type,type Static} from "typebox";
import {Value} from "typebox/value";

export const ExperimentLabelSchema=Type.Object({
 id:Type.String({minLength:1,maxLength:100}),
 arm:Type.String({minLength:1,maxLength:60}),
 trial:Type.Integer({minimum:1}),
 of:Type.Integer({minimum:1}),
},{additionalProperties:false});
export type ExperimentLabel=Static<typeof ExperimentLabelSchema>;

// The experiment, arm and trial a launcher assigns to this run, so the viewer can always name it.
export function experimentFromEnv(env:NodeJS.ProcessEnv):ExperimentLabel|null {
 const raw=env["POKEBENCH_EXPERIMENT"];
 if(raw===undefined||raw==="")return null;
 let value:unknown;
 try{value=JSON.parse(raw);}catch{throw new Error("POKEBENCH_EXPERIMENT must be JSON {id, arm, trial, of}");}
 if(!Value.Check(ExperimentLabelSchema,value)||value.trial>value.of)throw new Error("POKEBENCH_EXPERIMENT must be {id, arm, trial, of} with 1 ≤ trial ≤ of");
 return value;
}
