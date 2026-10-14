import {expect,it} from "vitest";
import {experimentFromEnv} from "./play-experiment.js";
import {checkEvent} from "./events.js";
import {RUN_START} from "../test-support/events.js";

it("reads the experiment, arm and trial a launcher names for this run",()=>{
 expect(experimentFromEnv({})).toBeNull();
 const label={id:"factorial-2x2-think-fast",arm:"both",trial:5,of:32};
 expect(experimentFromEnv({POKEBENCH_EXPERIMENT:JSON.stringify(label)})).toEqual(label);
 for(const bad of ["not json",JSON.stringify({...label,trial:0}),JSON.stringify({...label,trial:33}),JSON.stringify({...label,extra:1}),JSON.stringify({...label,arm:""})])expect(()=>experimentFromEnv({POKEBENCH_EXPERIMENT:bad})).toThrow(/POKEBENCH_EXPERIMENT/);
});

it("records it in run_start evaluation",()=>{
 const evaluation={preset_id:"p",target:null,failure_limit:3,flags:{loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false},experiment:{id:"x",arm:"control",trial:1,of:32}};
 expect(()=>checkEvent({v:1,run:"r",seq:0,t:"2026-10-14T12:00:00.000-04:00",...RUN_START,evaluation})).not.toThrow();
 expect(()=>checkEvent({v:1,run:"r",seq:0,t:"2026-10-14T12:00:00.000-04:00",...RUN_START,evaluation:{...evaluation,experiment:{...evaluation.experiment,trial:0}}})).toThrow();
});
