// Source protocols may reference current features; saved definitions remain self-contained.
import {createHash} from "node:crypto";
import {existsSync,readFileSync,readdirSync} from "node:fs";
import {join} from "node:path";
import {Value} from "typebox/value";
import {FeatureRecipeSchema,FixedDesignError,parseFixedDefinition,resolveFeatureRecipe,type FixedDefinition} from "./fixed-design.js";
import type {LaneRunReads} from "./fixed-lane-drift.js";
import {launchedRecipeReader,type LaunchedRecipeReads} from "./fixed-launched-recipe.js";
import {fileLines} from "./run-log.js";
const validId=(id:string):void=>{if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id))throw new FixedDesignError("invalid definition or recipe id");};
export function readFeatureRecipe(root:string,id:string,read:(path:string)=>string=path=>readFileSync(path,"utf8")):string {
 const raw=(recipeId:string):string=>{validId(recipeId);return read(join(root,"experiments/feature-configs",`${recipeId}.json`));};
 return resolveFeatureRecipe(raw(id),raw);
}
export function fileLaneRunReads(root:string,runsRoot:string):LaneRunReads {
 const dirs=[join(root,"experiments/fixed"),join(root,"experiments/archive/fixed")];
 const names=(dir:string):string[]=>existsSync(dir)?readdirSync(dir).filter(name=>name.endsWith(".json")).map(name=>name.slice(0,-".json".length)):[];
 return {
  recipeText:id=>readFileSync(join(root,"experiments/feature-configs",`${id}.json`),"utf8"),
  definitionIds:()=>[...new Set(dirs.flatMap(names))],
  definitionText:id=>readFileSync(dirs.map(dir=>join(dir,`${id}.json`)).find(existsSync)??join(dirs[0]??"",`${id}.json`),"utf8"),
  ledgerText:id=>{const path=join(runsRoot,"experiments",id,"trials.jsonl");return existsSync(path)?readFileSync(path,"utf8"):null;},
  runStartLine:run=>{
   const path=join(runsRoot,run,"events.jsonl");
   if(!existsSync(path))return null;
   for(const line of fileLines(path))return line;
   return null;
  },
 };
}
export const FROZEN_RECIPE_FILE="resolved-recipe.json";
export function fileLaunchedRecipeReads(runsRoot:string,id:string):LaunchedRecipeReads {
 const dir=join(runsRoot,"experiments",id);
 const text=(path:string):string|null=>existsSync(path)?readFileSync(path,"utf8"):null;
 return {ledgerText:()=>text(join(dir,"trials.jsonl")),frozenText:()=>text(join(dir,FROZEN_RECIPE_FILE)),presetText:name=>text(join(dir,"presets",name))};
}
// With launched reads, an experiment that has launched gets the recipe it launched, not today's.
export function readFixedDefinition(root:string,id:string,allowArchive=false,launched?:LaunchedRecipeReads):{definition:FixedDefinition;sha256:string;featureRecipe:{readonly id:string;readonly sha256:string}|null;recipeText:string|null}{
 validId(id);
 let path=join(root,"experiments/fixed",`${id}.json`);
 if(!existsSync(path)&&allowArchive)path=join(root,"experiments/archive/fixed",`${id}.json`);
 if(!existsSync(path))throw new FixedDesignError(`no definition ${path}`);
 const text=readFileSync(path,"utf8");
 let featureRecipe:{readonly id:string;readonly sha256:string}|null=null,recipeText:string|null=null;
 const live=(recipeId:string):string=>readFeatureRecipe(root,recipeId);
 const read=launched===undefined?live:launchedRecipeReader(launched,live,text);
 const parsed=parseFixedDefinition(text,recipeId=>{
  const recipe=read(recipeId);
  featureRecipe={id:recipeId,sha256:createHash("sha256").update(recipe).digest("hex")};recipeText=recipe;return recipe;
 });
 const ancestry=parsed.definition.derivedFrom;
 if(ancestry!==undefined){
  if(ancestry.path!==`experiments/feature-configs/archive/current-${ancestry.sha256.slice(0,12)}.json`)throw new FixedDesignError("frozen recipe path does not match its hash");
  const source=readFileSync(join(root,ancestry.path),"utf8");
  if(createHash("sha256").update(source).digest("hex")!==ancestry.sha256)throw new FixedDesignError("frozen recipe hash mismatch");
  const recipe:unknown=JSON.parse(source);
  if(!Value.Check(FeatureRecipeSchema,recipe)||recipe.id!=="current")throw new FixedDesignError("frozen source must be a current feature recipe");
 }
 return {...parsed,featureRecipe,recipeText};
}
