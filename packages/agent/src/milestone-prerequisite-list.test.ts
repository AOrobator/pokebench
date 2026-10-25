import {describe,expect,it,vi} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {parseGameState} from "./game-state.js";
import {progressReached,type ProgressDefinition} from "./story-progress.js";

// Vitest's isolated module mock supplies test-only definitions to the production evaluator.
// No real story dependency or shared catalog object is changed.
vi.mock("./campaign-catalog.js",async importOriginal=>{
 const actual=await importOriginal<typeof import("./campaign-catalog.js")>();
 return {...actual,campaignCatalog:(base:readonly ProgressDefinition[])=>[
  ...actual.campaignCatalog(base),
  {name:"TEST_FLAG_FIRST",label:"Test only",map:[9,9],prerequisites:["MAGMA_HIDEOUT_STORY_COMPLETE","SPACE_CENTER_STORY_COMPLETE"]},
  {name:"TEST_VARIABLE_FIRST",label:"Test only",map:[9,9],prerequisites:["SPACE_CENTER_STORY_COMPLETE","MAGMA_HIDEOUT_STORY_COMPLETE"]},
 ]};
});

describe.each(["TEST_FLAG_FIRST","TEST_VARIABLE_FIRST"])("all-of prerequisites in %s",name=>{
 it.each([
  {flag:false,stage:0,expected:false},
  {flag:true,stage:0,expected:false},
  {flag:false,stage:3,expected:false},
  {flag:true,stage:3,expected:true},
  {flag:true,stage:null,expected:null},
  {flag:false,stage:null,expected:false},
 ])("flag=$flag and variable=$stage produce $expected",({flag,stage,expected})=>{
  const flags=Buffer.alloc(300);if(flag)flags[0x6f>>3]=128;
  const variables=Buffer.alloc(512);if(stage!==null)variables.writeUInt16LE(stage,2*(0x409f-0x4000));
  const s=parseGameState({...IN_GAME,map_id:[9,9],story_progress:{flags:flags.toString("hex"),rustboro_stage:0,devon_stage:0,letter:false,...(stage===null?{}:{variables:variables.toString("hex")})}});
  expect(progressReached(name,s),`${name}: native flag=${String(flag)}, variable=${String(stage)}`).toBe(expected);
 });
});
