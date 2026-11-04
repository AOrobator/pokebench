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

it("forwards one verified absolute state path to the owned launcher without changing it",()=>{
 const state="/runs/source/checkpoints/PETALBURG_WOODS.state";
 expect(gameServerLauncherArgs("/venv/python","/runs/new","run-2",8123,state)).toEqual(["/venv/python","-m","pokebench_env.launcher","--run-dir","/runs/new","--run-id","run-2","--port","8123","--exec","--load-state",state]);
 expect(gameServerLauncherArgs("/venv/python","/runs/new","run-2",8123)).not.toContain("--load-state");
});
