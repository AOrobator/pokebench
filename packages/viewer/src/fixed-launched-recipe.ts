// Once an experiment has launched, its recipe is what it launched: a later change to the base
// must not reach a resumed runner, a replacement trial or the classification of a recorded run.
import {createHash} from "node:crypto";
import {Type} from "typebox";
import {Value} from "typebox/value";
import {FeatureRecipeSchema,FixedDesignError,type FeatureRecipe} from "./fixed-design.js";
import {parseFixedLedger,type FixedLaunchEntry} from "./fixed-ledger.js";

export interface LaunchedRecipeReads {
 readonly ledgerText:()=>string|null;
 readonly frozenText:()=>string|null;
 readonly presetText:(name:string)=>string|null;
}
type Features=Readonly<Record<string,boolean>>;
const SourceRom=Type.Object({romSha1:Type.String()});
const PresetFeatures=Type.Object({features:Type.Record(Type.String(),Type.Boolean())});

function launches(reads:LaunchedRecipeReads):FixedLaunchEntry[] {
 const {entries,problems}=parseFixedLedger(reads.ledgerText()??"");
 if(problems.length>0)throw new FixedDesignError(`experiment ledger:${problems[0]??""}`);
 return entries.filter(entry=>entry.kind==="launch");
}
function presetFeatures(name:string,reads:LaunchedRecipeReads):{text:string;features:Features} {
 const text=reads.presetText(name);
 if(text===null)throw new FixedDesignError(`cannot derive the launched recipe: ${name} is missing`);
 const value:unknown=JSON.parse(text);
 if(!Value.Check(PresetFeatures,value))throw new FixedDesignError(`cannot derive the launched recipe: ${name} is not a preset`);
 return {text,features:value.features};
}
// A preset holds resolved values, not which list a flag came from, so every flag equal in both arms becomes an explicit both-arm flag.
// Nothing recorded the launch's controlBase, an audit pin no trial reads, so it stays the live recipe's.
function derivedRecipe(launch:FixedLaunchEntry,reads:LaunchedRecipeReads,live:FeatureRecipe,romSha1:string):FeatureRecipe {
 const name=(arm:string):string=>`${launch.phase}-${arm}.json`;
 const presets={control:presetFeatures(name("control"),reads),bundle:presetFeatures(name("bundle"),reads)};
 const control=presets.control.features,bundle=presets.bundle.features;
 if(createHash("sha256").update(presets[launch.arm].text).digest("hex")!==launch.presetSha256)throw new FixedDesignError(`cannot derive the launched recipe: ${name(launch.arm)} differs from the launch's recorded preset`);
 const switches:string[]=[],onInBoth:string[]=[],offInBoth:string[]=[];
 for(const id of new Set([...Object.keys(control),...Object.keys(bundle)])){
  const off=control[id],on=bundle[id];
  if(off===false&&on===true)switches.push(id);
  else if(off===true&&on===true)onInBoth.push(id);
  else if(off===false&&on===false)offInBoth.push(id);
  else throw new FixedDesignError(`cannot derive the launched recipe: switch ${id} is ${String(off)} in control and ${String(on)} in bundle`);
 }
 return {...live,romSha1,switches,offInBoth,onInBoth,features:{...control}};
}
export function launchedRecipeReader(reads:LaunchedRecipeReads,readRecipe:(id:string)=>string,sourceText:string):(id:string)=>string {
 return id=>{
  const latest=launches(reads).at(-1);
  if(latest===undefined)return readRecipe(id);
  const frozen=reads.frozenText();
  if(frozen!==null)return frozen;
  const live:unknown=JSON.parse(readRecipe(id));
  if(!Value.Check(FeatureRecipeSchema,live))throw new FixedDesignError("invalid feature recipe");
  const source:unknown=JSON.parse(sourceText);
  return JSON.stringify(derivedRecipe(latest,reads,live,Value.Check(SourceRom,source)?source.romSha1:live.romSha1));
 };
}
export function frozenRecipeToWrite(reads:LaunchedRecipeReads,recipeText:string|null):string|null {
 if(recipeText===null||(launches(reads).length>0&&reads.frozenText()!==null))return null;
 return recipeText;
}
function featureKey(text:string):string|null {
 let value:unknown;
 try{value=JSON.parse(text);}catch{return null;}
 return Value.Check(PresetFeatures,value)?JSON.stringify(Object.entries(value.features).sort(([a],[b])=>a<b?-1:a>b?1:0)):null;
}
// Features only: a definition's schedule may still change after launch, its recipe may not.
export function presetToUse(launched:boolean,existing:string|null,generated:string):{readonly text:string;readonly write:boolean} {
 if(!launched||existing===null)return {text:generated,write:true};
 if(featureKey(existing)!==featureKey(generated))throw new FixedDesignError("a kept preset differs from the launched recipe; restore it before resuming");
 return {text:existing,write:false};
}
