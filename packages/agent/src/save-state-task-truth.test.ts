import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {ALL_ON,type FeatureSet} from "./features.js";
import {initialPlayTask,PLAY_TASK} from "./play-config.js";

const features=(enabled:boolean):FeatureSet=>({...ALL_ON,"save-state-task-truth-v1":enabled} as FeatureSet);

it("keeps boot and OFF tasks byte-identical while describing a restored start truthfully when ON",()=>{
 expect(initialPlayTask({kind:"boot"},null,features(true))).toBe(PLAY_TASK);
 expect(initialPlayTask({kind:"save_state",path:"woods.state",sha1:"a".repeat(40)},null,features(false))).toBe(PLAY_TASK);
 expect(initialPlayTask({kind:"save_state",path:"woods.state",sha1:"a".repeat(40)},null,features(true))).toBe("The game has resumed from a recorded checkpoint. Continue playing from the current state.");
});

it("keeps the native target and removes boot wording from a restored targeted run",()=>{
 const task=initialPlayTask({kind:"save_state",path:"woods.state",sha1:"a".repeat(40)},"RUSTBORO_CITY",features(true));
 expect(task).toBe("The game has resumed from a recorded checkpoint. Reach the native game milestone RUSTBORO CITY.");
 expect(task).not.toContain("booted");
 expect(initialPlayTask({kind:"boot"},"RUSTBORO_CITY",features(true))).toBe("The game has just booted. Reach the native game milestone RUSTBORO CITY.");
});

it("wires the production entrypoint through start.kind and the recorded feature switch",()=>{
 const live=readFileSync(new URL("./live.ts",import.meta.url),"utf8");
 expect(live).toContain("initialPlayTask(start,target,features)");
});
