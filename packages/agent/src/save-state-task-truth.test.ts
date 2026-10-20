import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {type FeatureSet} from "./features.js";
import {deliverInitialPlayTask,initialPlayTask,PLAY_TASK} from "./play-config.js";
import {gameServerLauncherArgs} from "./server-launch.js";

const features=(enabled:boolean):FeatureSet=>({...ALL_ON,"save-state-task-truth-v1":enabled});

it("keeps boot and OFF tasks byte-identical while describing a restored start truthfully when ON",()=>{
 expect(initialPlayTask({kind:"boot"},null,features(true))).toBe(PLAY_TASK);
 expect(initialPlayTask({kind:"save_state"},null,features(false))).toBe(PLAY_TASK);
 expect(initialPlayTask({kind:"save_state"},null,features(true))).toBe("The game has resumed from a recorded checkpoint. Continue playing from the current state.");
});

it("keeps the native target and removes boot wording from a restored targeted run",()=>{
 const task=initialPlayTask({kind:"save_state"},"RUSTBORO_CITY",features(true));
 expect(task).toBe("The game has resumed from a recorded checkpoint. Reach the native game milestone RUSTBORO CITY.");
 expect(task).not.toContain("booted");
 expect(initialPlayTask({kind:"boot"},"RUSTBORO_CITY",features(true))).toBe("The game has just booted. Reach the native game milestone RUSTBORO CITY.");
});

it("delivers the exact resumed task through the production consumer seam",async()=>{
 let delivered:unknown;
 const result=await deliverInitialPlayTask({kind:"save_state"},"RUSTBORO_CITY",features(true),()=>123,task=>{delivered=task;return Promise.resolve("played");});
 expect(result).toBe("played");expect(delivered).toEqual({role:"user",content:"The game has resumed from a recorded checkpoint. Reach the native game milestone RUSTBORO CITY.",timestamp:123});
 const live=readFileSync(new URL("./live.ts",import.meta.url),"utf8");
 expect(live).toContain("deliverInitialPlayTask(start,goalTarget,features,()=>Date.now(),task=>play(task,governor,loop))");
 expect(live).toContain('realHost(port,start.kind==="save_state"?start.path:undefined,serverEnv)');
 expect(live).toContain("gameServerLauncherArgs(python,runDir,runId,serverPort,loadState).slice(1)");
});

it("forwards one verified absolute state path to the owned launcher without changing it",()=>{
 const state="/runs/source/checkpoints/PETALBURG_WOODS.state";
 expect(gameServerLauncherArgs("/venv/python","/runs/new","run-2",8123,state)).toEqual(["/venv/python","-m","pokebench_env.launcher","--run-dir","/runs/new","--run-id","run-2","--port","8123","--load-state",state]);
 expect(gameServerLauncherArgs("/venv/python","/runs/new","run-2",8123)).not.toContain("--load-state");
});

it("registers the default-off treatment as pending without pretending the boot queue can test it",()=>{
 const entry=JSON.parse(readFileSync(new URL("../../../experiments/save-state-task-truth.json",import.meta.url),"utf8")) as {changedFeature:string;queuePosition?:number;activationMilestone:string;primaryMilestone:string;incumbent:{features:Record<string,boolean>};notes:string};
 expect(entry).toMatchObject({changedFeature:"save-state-task-truth-v1",activationMilestone:"PETALBURG_WOODS",primaryMilestone:"TEAM_AQUA_WOODS_EVENT_COMPLETE"});
 expect(entry.queuePosition).toBeUndefined();expect(entry.incumbent.features["save-state-task-truth-v1"]).toBe(false);expect(entry.notes).toContain("Boot-start queue trials would have identical arms");
});
