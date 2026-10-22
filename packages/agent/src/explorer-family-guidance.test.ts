import {expect,it} from "vitest";
import {featuresOf} from "./features.js";
import {playSystemPrompt} from "./play-config.js";

const BASE={...featuresOf([]),"explorer-guidance-v2":true};
it("replaces the generic section with existing family/re-talk guidance without naming a story route",()=>{
 const off=playSystemPrompt(BASE,null);
 const on=playSystemPrompt({...BASE,"explorer-family-guidance-v1":true},null);
 const existing=playSystemPrompt({...BASE,"explorer-guidance-v1":true,"explorer-guidance-v2":false},null);
 expect(on).toBe(existing);
 expect(on).not.toBe(off);
 expect(on).toContain("families");
 expect(on).not.toMatch(/MAY|ROUTE 103|ROXANNE/);
});
it("OFF retains exact existing prompt precedence with either original switch setting",()=>{
 for(const a of [false,true])for(const b of [false,true]){
  const f={...BASE,"explorer-guidance-v1":a,"explorer-guidance-v2":b};
  expect(playSystemPrompt({...f,"explorer-family-guidance-v1":false},null)).toBe(playSystemPrompt(f,null));
 }
});
