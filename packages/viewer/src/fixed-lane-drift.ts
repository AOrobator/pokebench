// What a lane recipe inherited since its last recorded run, for `fixed-run check`.
import {Type} from "typebox";
import {Value} from "typebox/value";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
import {featuresSha256} from "@pokebench/agent/run-evaluation";
import {armPreset,FixedDesignError,isFeatureOverlay,type FixedArm,type FixedDefinition} from "./fixed-design.js";
import {parseFixedLedger,type FixedLaunchEntry} from "./fixed-ledger.js";

type Features=Readonly<Record<string,boolean>>;
export interface LaneRunReads {
 readonly recipeText:(id:string)=>string;
 readonly definitionIds:()=>readonly string[];
 readonly definitionText:(id:string)=>string;
 readonly ledgerText:(id:string)=>string|null;
 readonly runStartLine:(run:string)=>string|null;
}
export interface RecordedLaneRun {readonly experiment:string;readonly run:string;readonly at:string;readonly arm:FixedArm;readonly features:Features}

const RecordedStart=Type.Object({type:Type.Literal("run_start"),evaluation:Type.Object({features:Type.Record(Type.String(),Type.Boolean())})});
const SourceRecipe=Type.Object({featureRecipe:Type.String()});
function json(text:string):unknown {
 try{return JSON.parse(text);}catch{return null;}
}
function recordedFeatures(line:string|null):Features|null {
 const value=line===null?null:json(line);
 return Value.Check(RecordedStart,value)?value.evaluation.features:null;
}

export function lastLaneRun(recipeId:string,reads:LaneRunReads):RecordedLaneRun|null {
 const launches:{experiment:string;entry:FixedLaunchEntry}[]=[];
 for(const experiment of reads.definitionIds()){
  const source=json(reads.definitionText(experiment));
  if(!Value.Check(SourceRecipe,source)||source.featureRecipe!==recipeId)continue;
  const {entries,problems}=parseFixedLedger(reads.ledgerText(experiment)??"");
  if(problems.length>0)throw new FixedDesignError(`${experiment} ledger:${problems[0]??""}`);
  for(const entry of entries)if(entry.kind==="launch")launches.push({experiment,entry});
 }
 launches.sort((a,b)=>b.entry.at.localeCompare(a.entry.at));
 for(const {experiment,entry} of launches){
  const features=recordedFeatures(reads.runStartLine(entry.run));
  if(features!==null)return {experiment,run:entry.run,at:entry.at,arm:entry.arm,features};
 }
 return null;
}

function changes(before:Features,after:Features):string[] {
 const shown=(value:boolean|undefined):string=>value===undefined?"unset":String(value);
 return [...new Set([...Object.keys(before),...Object.keys(after)])].sort().filter(id=>before[id]!==after[id]).map(id=>`${id} ${shown(before[id])} -> ${shown(after[id])}`);
}

export function laneDriftLines(recipeId:string,recorded:RecordedLaneRun|null,now:(arm:FixedArm)=>Features):string[] {
 const arm=recorded?.arm??"bundle",features=now(arm);
 const head=`lane recipe ${recipeId}: resolved ${arm} features sha256 ${featuresSha256(features)}`;
 if(recorded===null)return [`${head}; no recorded run`];
 const changed=changes(recorded.features,features);
 return [
  `${head}; last recorded run ${recorded.run} (${recorded.experiment}, ${recorded.at}) sha256 ${featuresSha256(recorded.features)}`,
  changed.length===0?"no switches changed since that run":`switches changed since that run: ${changed.join(", ")}`,
 ];
}

export function laneDriftReport(def:FixedDefinition,recipeId:string|null,reads:LaneRunReads):string[] {
 if(recipeId===null||!isFeatureOverlay(reads.recipeText(recipeId)))return [];
 const now=(arm:FixedArm):Features=>presetFeatures(parsePlayPreset(armPreset(def,def.phases[0]?.id??"",arm)));
 return laneDriftLines(recipeId,lastLaneRun(recipeId,reads),now);
}
