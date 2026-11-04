import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {IN_GAME,RUN_START_META} from "../test-support/events.js";
import {checkEvent,type AuthoredSceneLabel,type RunEvent} from "./events.js";
import {featuresOf,type FeatureSet} from "./features.js";
import {contextDiff,decisionContext,recordedRun,type ProbePorts,type RawRef} from "./decision-probe.js";
import {pageLines} from "./dialogue-auto-advance.js";
import {filePorts} from "./probe-decision-cli.js";

const raw=(n:number)=>({v:1 as const,sequence:n,frame:n,path:`raw-ram/${String(n).padStart(8,"0")}.json.gz`,sha256:String(n).repeat(64)});
const native=(employee=false):AuthoredSceneLabel=>employee
 ?{source:"authored-script",scene:"rustboro-theft-chase",beat:"employee-chase",speaker:"DEVON EMPLOYEE",map_id:[0,3],actor_local_id:9,message_pointer:0x081e1817,return_pc:0x081e09ff,rom_sha1:"f3ae088181bf583e55daf962a92bb46f4f1d07b7"}
 :{source:"authored-script",scene:"rustboro-theft-chase",beat:"grunt-escape",speaker:"TEAM AQUA GRUNT",map_id:[0,3],actor_local_id:10,message_pointer:0x081e17fe,return_pc:0x081e09d5,rom_sha1:"f3ae088181bf583e55daf962a92bb46f4f1d07b7"};
const ref=(n:number):RawRef=>({path:raw(n).path,sha256:raw(n).sha256});
it("file ports invoke the same native reader with argv, source refs and strict typed results",async()=>{
 const calls:{file:string;args:readonly string[];input:string}[]=[];
 const p=filePorts("/runs/source","/repo/env","reasoning_content",(file,args,options)=>{calls.push({file,args,input:options.input});return JSON.stringify({labels:[native()]});});
 expect(await p.sceneLabels?.([ref(1)])).toEqual([native()]);expect(calls).toEqual([{file:"uv",args:["run","--project","/repo/env","python","-m","pokebench_env.authored_scene_labels"],input:JSON.stringify({run_dir:"/runs/source",raw_ram:[ref(1)]})}]);
});
it.each(["{}",'{"labels":[]}','{"labels":[{"speaker":"made up"}]}'])("file ports reject an invalid native body %s",body=>{const p=filePorts("/runs/source","/repo/env","reasoning_content",()=>body);expect(p.sceneLabels).toBeTypeOf("function");expect(()=>p.sceneLabels?.([ref(1)])).toThrow(/scene.*label|native.*label/i);});
