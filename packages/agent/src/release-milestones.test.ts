import {describe,expect,it} from "vitest";
import table from "../../../env/pokebench_env/release-milestones.json" with {type:"json"};
import {PROGRESS_CATALOG,type ProgressDefinition} from "./story-progress.js";

type Row={name:string;flag?:number;anyFlags?:number[];allFlags?:number[];variable?:number;maximum?:number;values?:number[]};

// The precedence of progressReached: a map condition first, then a variable, then flag, anyFlags, allFlags.
function nativeRow(d:ProgressDefinition):Row|null{
 if(d.map!==undefined)return null;
 if(d.variable!==undefined)return {name:d.name,variable:d.variable,maximum:d.maximum??0,values:[...(d.values??[])]};
 if(d.flag!==undefined)return {name:d.name,flag:d.flag};
 if(d.anyFlags!==undefined)return {name:d.name,anyFlags:[...d.anyFlags]};
 if(d.allFlags!==undefined)return {name:d.name,allFlags:[...d.allFlags]};
 return null;
}

describe("release-milestones.json (just verify-release)",()=>{
 it("is the catalog's flag and variable predicates, in catalog order",()=>{
  const derived=PROGRESS_CATALOG.map(nativeRow).filter((row):row is Row=>row!==null);
  expect(table.milestones).toEqual(derived);
 });
 it("keeps the headline flags the verifier depends on",()=>{
  const byName=new Map<string,Row>(table.milestones.map(row=>[row.name,row]));
  expect(byName.get("GAME_CLEAR_CONFIRMED")).toEqual({name:"GAME_CLEAR_CONFIRMED",flag:0x864});
  expect(byName.get("RAIN_BADGE")).toEqual({name:"RAIN_BADGE",flag:0x86E});
  expect(nativeRow({name:"X",label:"X",map:[0,1],flag:1})).toBeNull();
  expect(nativeRow({name:"X",label:"X",field:"letter"})).toBeNull();
 });
});
