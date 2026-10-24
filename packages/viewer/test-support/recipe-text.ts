// Recipe tests resolve current source references and explicitly retained historical archives.
import {existsSync,readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {join} from "node:path";
import {materializeFixedSource} from "../src/fixed-design.js";
const root=fileURLToPath(new URL("../../../",import.meta.url));
export function recipeText(url:URL,encoding:"utf8"="utf8"):string {
 let path=fileURLToPath(url);
 const marker="/experiments/fixed/";
 if(!path.includes(marker))return readFileSync(path,encoding);
 if(!existsSync(path)){const name=path.slice(path.lastIndexOf("/")+1);const archived=join(root,"experiments/archive/fixed",name);if(existsSync(archived))path=archived;}
 const text=readFileSync(path,encoding),value:unknown=JSON.parse(text);
 const materialized=materializeFixedSource(value,id=>readFileSync(join(root,"experiments/feature-configs",`${id}.json`),"utf8"));
 return materialized===value?text:JSON.stringify(materialized);
}
