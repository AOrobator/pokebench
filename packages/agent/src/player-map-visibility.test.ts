import {expect,it} from "vitest";
import {ALL_ON,featuresOf,featureInfo,serverFeatureEnv,SWITCHABLE_FEATURES,playHarnessFeatures} from "./features.js";
import {normalizeFeatures} from "./play-preset.js";
import {playSystemPrompt} from "./play-config.js";
import {parseGameState} from "./game-state.js";
import {planNavigation} from "./navigation.js";
import {UntakenExits} from "./untaken-exits.js";
import {PeopleLedger} from "./people-ledger.js";
import {untalkedInGymLine} from "./untalked-in-gym.js";
import {noExitLine} from "./no-exit-here.js";
const ID="player-map-visibility-v1";

it("registers a reversible default-off server and prompt feature",()=>{
 const off={...ALL_ON,[ID]:false},on={...off,[ID]:true};
 expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(296);
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

it("qualifies empty people and exit summaries rather than claiming the whole map is empty",()=>{
 const s=parseGameState({screen:"overworld",started:true,name:"A",location:"DEWFORD TOWN GYM",map_id:[3,3],position:{x:1,y:1},facing:"up",in_battle:false,party:[],money:0,badges:[],play_time_s:0,field_controls_locked:false,
  interaction_targets:[],topology:{width:3,height:3,connections:[]},world_context:{objects:[],triggers:[],dialogue:null},
  map_visibility:{known:[[1,1]],visible:[[1,1]],diagnostic:null}});
 const readout="Location: DEWFORD TOWN GYM",ledger=new PeopleLedger(true);
 expect(new UntakenExits(ALL_ON).line(s,readout)).toContain("none among currently visible exits");
 expect(ledger.block(s,readout,"x")).toContain("currently visible");
 expect(ledger.untalkedLine(s,readout,"x")).toContain("Visible people");
 expect(untalkedInGymLine(ledger,{state:s},readout,"x")).toContain("Visible people");
 expect(noExitLine(ALL_ON,s,readout,["NORTH"])).toContain("currently listed");
});
