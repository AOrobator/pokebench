import {expect,it} from "vitest";
import {NavigationFailure} from "./navigation-failure.js";
import type {CompletedCall} from "./loop-detection.js";
import type {GameStateSnapshot} from "./game-state.js";
const field=(x=30):GameStateSnapshot=>({screen:"overworld",started:true,name:"A",location:"ROUTE104",map_id:[0,19],position:{x,y:58},facing:"left",field_controls_locked:false,in_battle:false,party:[],money:0,badges:[],play_time_s:0});
const nav=(i:number,extra:Partial<CompletedCall>={}):CompletedCall=>({name:"navigate_to",args:{x:31,y:55-i,map_id:[0,19]},text:"Navigation: no supported path on the current map; 0 ordinary button attempts.",isError:false,state:field(),beforeState:field(),seq:i,...extra});
it("detects different unreachable targets, retains evidence across a turn and one-tile move, then recovers after sustained displacement",()=>{
 const f=new NavigationFailure();
 expect(f.observe(nav(1))).toBeNull();expect(f.observe(nav(2))).toBeNull();
 expect(f.observe(nav(3))).toEqual({active:true,evidence:[1,2,3]});
 expect(f.observe(nav(4,{name:"press",args:{buttons:["UP"]},state:{...field(),facing:"up"}}))?.active).toBe(true);
 expect(f.observe(nav(5,{name:"press",state:field(31)}))?.active).toBe(true);
 expect(f.observe(nav(6,{name:"press",state:field(34)}))).toEqual({active:false,evidence:[]});
});
it("never counts successful partial walks, errors, battles, unknown/locked fields or menus",()=>{
 for(const change of [{state:field(31)},{isError:true},{state:{...field(),in_battle:true}},{state:{...field(),field_controls_locked:true}},{state:{...field(),field_controls_locked:null}},{state:{...field(),screen:"menu" as const}},{state:undefined}]){
  const f=new NavigationFailure();for(let i=1;i<=5;i++)expect(f.observe(nav(i,change))?.active??false).toBe(false);
 }
});
it("re-arms on changed resources and an explicit reset",()=>{
 const f=new NavigationFailure();f.observe(nav(1));f.observe(nav(2));
 f.observe(nav(3,{state:{...field(),money:5},beforeState:{...field(),money:5}}));expect(f.observe(nav(4))).toBeNull();
 f.observe(nav(5));expect(f.observe(nav(6))?.active).toBe(true);f.reset();expect(f.observe(nav(7))).toBeNull();
});

it("overlapping geometry changes re-arm, while a scrolling local window does not clear an active episode",()=>{
 const grid=(x:number,collision=0)=>({elevation:0,tiles:[{x,y:0,collision,behavior:0,elevation:0}],objects:[],warps:[]});
 const f=new NavigationFailure();const s={...field(),navigation_grid:grid(0)};
 for(let i=1;i<=3;i++)f.observe(nav(i,{state:s,beforeState:s}));
 expect(f.observe(nav(4,{name:"press",state:{...s,position:{x:31,y:58},navigation_grid:grid(1)}}))?.active).toBe(true);
 expect(f.observe(nav(5,{name:"observe",state:{...s,navigation_grid:grid(0,1)}}))).toEqual({active:false,evidence:[]});
});
it("unknown observations and errors cannot clear an active episode; a qualified interface does",()=>{
 const f=new NavigationFailure();for(let i=1;i<=3;i++)f.observe(nav(i));
 expect(f.observe(nav(4,{state:undefined}))).toBeNull();expect(f.observe(nav(5,{isError:true}))).toBeNull();
 expect(f.observe(nav(6,{name:"observe"}))?.active).toBe(true);
 expect(f.observe(nav(7,{state:{...field(),in_battle:true}}))).toEqual({active:false,evidence:[]});
});

it("a change only in the party readout's summary-screen facts does not re-arm",()=>{
 const mon={species:"TORCHIC",level:16,hp:49,max_hp:50};const s=(attack:number|null)=>({...field(),party:[{...mon,attack,met_location_name:attack===null?null:"ROUTE 101"}]});
 const f=new NavigationFailure();f.observe(nav(1,{state:s(23),beforeState:s(23)}));f.observe(nav(2,{state:s(23),beforeState:s(23)}));
 expect(f.observe(nav(3,{state:s(26),beforeState:s(26)}))?.active).toBe(true);
});

it("a change only in a stored Pokémon's summary-screen facts does not re-arm",()=>{
 const mon={species:"TORCHIC",level:16,hp:49,max_hp:50};const s=(ball:string|null)=>({...field(),resources:{bag:null,pc_items:null,berry_trees:null,planted_berries:null,diagnostics:[],script_pc:null,script_mode:null,script_status:null,selected_tree_id:null,berry_script_owner:null,storage:{current_box:0,occupied:[{box:0,slot:0,pokemon:{...mon,ball_name:ball}}]}}});
 const f=new NavigationFailure();f.observe(nav(1,{state:s("POKé BALL"),beforeState:s("POKé BALL")}));f.observe(nav(2,{state:s("POKé BALL"),beforeState:s("POKé BALL")}));
 expect(f.observe(nav(3,{state:s("GREAT BALL"),beforeState:s("GREAT BALL")}))?.active).toBe(true);
});
