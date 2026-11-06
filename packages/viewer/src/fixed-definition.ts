// Source protocols may reference current features; saved definitions remain self-contained.
import {createHash} from "node:crypto";
import {existsSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {Value} from "typebox/value";
import {FeatureRecipeSchema,FixedDesignError,parseFixedDefinition,resolveFeatureRecipe,type FixedDefinition} from "./fixed-design.js";
const validId=(id:string):void=>{if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id))throw new FixedDesignError("invalid definition or recipe id");};
export function readFeatureRecipe(root:string,id:string,read:(path:string)=>string=path=>readFileSync(path,"utf8")):string {
 const raw=(recipeId:string):string=>{validId(recipeId);return read(join(root,"experiments/feature-configs",`${recipeId}.json`));};
 return resolveFeatureRecipe(raw(id),raw);
}
export function readFixedDefinition(root:string,id:string,allowArchive=false):{definition:FixedDefinition;sha256:string;featureRecipe:{readonly id:string;readonly sha256:string}|null}{
 validId(id);
 let path=join(root,"experiments/fixed",`${id}.json`);
 if(!existsSync(path)&&allowArchive)path=join(root,"experiments/archive/fixed",`${id}.json`);
 if(!existsSync(path))throw new FixedDesignError(`no definition ${path}`);
 const text=readFileSync(path,"utf8");
 let featureRecipe:{readonly id:string;readonly sha256:string}|null=null;
 const parsed=parseFixedDefinition(text,recipeId=>{
  const recipe=readFeatureRecipe(root,recipeId);
  featureRecipe={id:recipeId,sha256:createHash("sha256").update(recipe).digest("hex")};return recipe;
 });
 const ancestry=parsed.definition.derivedFrom;
 if(ancestry!==undefined){
  if(ancestry.path!==`experiments/feature-configs/archive/current-${ancestry.sha256.slice(0,12)}.json`)throw new FixedDesignError("frozen recipe path does not match its hash");
  const source=readFileSync(join(root,ancestry.path),"utf8");
  if(createHash("sha256").update(source).digest("hex")!==ancestry.sha256)throw new FixedDesignError("frozen recipe hash mismatch");
  const recipe:unknown=JSON.parse(source);
  if(!Value.Check(FeatureRecipeSchema,recipe)||recipe.id!=="current")throw new FixedDesignError("frozen source must be a current feature recipe");
 }
 return {...parsed,featureRecipe};
}
