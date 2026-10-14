import {expect,it} from "vitest";
import {experimentFromEnv} from "./play-experiment.js";
import {checkEvent} from "./events.js";

it("reads the experiment, arm and trial a launcher names for this run",()=>{
 expect(experimentFromEnv({})).toBeNull();
 const label={id:"factorial-2x2-think-fast",arm:"both",trial:5,of:32};
 expect(experimentFromEnv({POKEBENCH_EXPERIMENT:JSON.stringify(label)})).toEqual(label);
 for(const bad of ["not json",JSON.stringify({...label,trial:0}),JSON.stringify({...label,trial:33}),JSON.stringify({...label,extra:1}),JSON.stringify({...label,arm:""})])expect(()=>experimentFromEnv({POKEBENCH_EXPERIMENT:bad})).toThrow(/POKEBENCH_EXPERIMENT/);
});

it("records it in run_start evaluation",()=>{
 const start={v:1,run:"r",seq:0,t:"2026-10-14T12:00:00.000-04:00",turn:0,type:"run_start"} as const;
 const evaluation={preset_id:"p",target:null,failure_limit:3,flags:{loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false},experiment:{id:"x",arm:"control",trial:1,of:32}};
 expect(()=>checkEvent({...start,model:{id:"m",context_window:1,max_tokens:1,vision:true},sampling:{thinking_level:"medium",max_tokens:1},system_prompt:"s",tools:[],harness:{commit:"a".repeat(40),dirty:false},vendor_pin:"b",pi_version:"1",start_state:{kind:"boot"},harness_features:[],budgets:{max_turns:1,max_wall_ms:1},isolation:{run_data_id:"r",load_checkpoint_mode:false},evaluation})).not.toThrow();
});
