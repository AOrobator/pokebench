import {expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import type {GameStateSnapshot} from "./game-state.js";
import {learnMoveTool} from "./learn-move.js";
import {featuresOf} from "./features.js";
import {normalizeFeatures} from "./play-preset.js";

const switchId="tmhm-learning-visibility-v1";
const moves=["FLY","REST","EXTREMESPEED","OUTRAGE"];
const snapshot=(phase:string,names:string[],details:NonNullable<GameStateSnapshot["active_ui"]>["details"],ready:boolean,identity="rayquaza"):GameStateSnapshot=>({
 ...IN_GAME,screen:"party_menu",party:[{species:"RAYQUAZA",identity,level:70,hp:190,max_hp:228,
  moves:names.map((name,index)=>({name,move_id:index+1,pp:5,pp_bonus:0}))}],
 active_ui:{phase,ready,selected:null,controls:"",diagnostic:null,value:null,details:details??null},
});
const offered=(index:number)=>snapshot("summary_move_forget",moves,
 {party_slot:0,new_move_name:"WATERFALL",selected_index:index,move_names:moves},true);

it("preserves old preset defaults and accepts an explicit correctness opt-in",()=>{
 const { [switchId]: omitted,...old }=featuresOf([]);
 expect(omitted).toBe(false);
 expect(normalizeFeatures(old)[switchId]).toBe(false);
 expect(normalizeFeatures({...old,[switchId]:true})[switchId]).toBe(true);
 expect(normalizeFeatures({...old,[switchId]:false})[switchId]).toBe(false);
});

it("reports a selected replacement as pending until the party slot actually changes",async()=>{
 const pending=snapshot("party_tmhm_replacement_pending",moves,{party_slot:0},false);
 const changed=snapshot("party_tmhm_learned_printing",["FLY","WATERFALL","EXTREMESPEED","OUTRAGE"],{party_slot:0},false);
 async function replay(observed:GameStateSnapshot,enabled:boolean,verified:boolean|null){
  const state=pending;
  const states=[offered(0),offered(1),state];
  const presses:string[]=[];
  const tool=learnMoveTool({
   wait:()=>Promise.resolve({state:states.shift()??state,reason:"other",frames:0,battle_learner:null}),
   press:(_id,{buttons})=>{presses.push(...buttons);return Promise.resolve({content:[],details:{state}});},
   observe:()=>Promise.resolve({content:[],details:{state:observed}}),
  },false,enabled);
  const result=await tool.execute("tmhm",{forget:"REST"});
  expect(result.details).toMatchObject({learn_move:{verified}});
  expect(presses).toEqual(["DOWN","A"]);
  const first=result.content[0];
  return first?.type==="text"?first.text:"";
 }
 expect(await replay(pending,false,false)).toContain("do not show WATERFALL");
 expect(await replay(pending,true,null)).toContain("Replacement pending");
 expect(await replay(changed,true,true)).toContain("checked in the party's moves");
 const swapped=snapshot("party_tmhm_learned_printing",["FLY","WATERFALL","EXTREMESPEED","OUTRAGE"],{party_slot:0},false,"different-rayquaza");
 expect(await replay(swapped,true,false)).toContain("do not show WATERFALL");
});
