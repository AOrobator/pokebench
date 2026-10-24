// Source protocols may reference current features; saved definitions remain self-contained.
import {createHash} from "node:crypto";
import {existsSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {FixedDesignError,parseFixedDefinition,type FixedDefinition} from "./fixed-design.js";
const validId=(id:string):void=>{if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id))throw new FixedDesignError("invalid definition or recipe id");};
export function readFeatureRecipe(root:string,id:string):string {
 validId(id);return readFileSync(join(root,"experiments/feature-configs",`${id}.json`),"utf8");
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
 return {...parsed,featureRecipe};
}
