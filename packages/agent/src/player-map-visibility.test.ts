import {expect,it} from "vitest";
import {ALL_ON,featuresOf,featureInfo,serverFeatureEnv,SWITCHABLE_FEATURES,playHarnessFeatures} from "./features.js";
import {normalizeFeatures} from "./play-preset.js";
import {playSystemPrompt} from "./play-config.js";
import {parseGameState} from "./game-state.js";
import {planNavigation} from "./navigation.js";
const ID="player-map-visibility-v1";

it("registers a reversible default-off server and prompt feature",()=>{
 const off={...ALL_ON,[ID]:false},on={...off,[ID]:true};
 expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(294);
 expect(featureInfo(ID).description).toContain("Off:");
 expect(normalizeFeatures(featuresOf([]))[ID]).toBe(false);
 expect(serverFeatureEnv(off).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
 expect(serverFeatureEnv(on).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
 expect(playHarnessFeatures(on,null)).toContain(ID);
 expect(playHarnessFeatures(off,null)).not.toContain(ID);
 expect(playSystemPrompt(on,null)).toContain("? is unseen terrain");
 expect(playSystemPrompt(off,null)).not.toContain("? is unseen terrain");
});

it("carries discovered terrain through parsing and refuses routes through unknown cells",()=>{
 const known=parseGameState({screen:"overworld",started:true,name:"A",location:"CAVE",map_id:[24,46],position:{x:0,y:0},facing:"right",in_battle:false,party:[],money:0,badges:[],play_time_s:0,field_controls_locked:false,
  map_visibility:{known:[[0,0],[2,0]],visible:[[0,0]],diagnostic:null},
  map_grid:{width:3,height:1,elevation:3,rows:["0300ffff0300"],objects:[],warps:[]}});
 expect(known.map_visibility?.known).toEqual([[0,0],[2,0]]);
 expect(planNavigation(known,{x:2,y:0},{mode:"full"})).toBeNull();
 const grid=known.map_grid;if(grid==null)throw new Error("grid required");
 expect(planNavigation({...known,map_grid:{...grid,rows:["030003000300"]}},{x:2,y:0},{mode:"full"})).toEqual(["RIGHT","RIGHT"]);
});
