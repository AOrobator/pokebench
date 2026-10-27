import {createHash} from "node:crypto";
import {expect,it} from "vitest";
import {newDigest,parseDigest,updateDigest,finishDigest} from "./current-digest.js";
it("resumes a bounded SHA256 checkpoint against the native implementation across padding boundaries",()=>{
 for(const length of [0,1,55,56,63,64,65,128,1000]){
  const bytes=Buffer.from(Array.from({length},(_,i)=>(i*37)%256));
  for(const chunk of [3,17,64]){
   let state=newDigest();for(let at=0;at<length;at+=chunk){state=updateDigest(state,bytes.subarray(at,at+chunk));state=parseDigest(JSON.parse(JSON.stringify(state)) as unknown);expect(state.tail.length).toBeLessThan(64);}
   const before=structuredClone(state);expect(finishDigest(state)).toBe(createHash("sha256").update(bytes).digest("hex"));expect(state).toEqual(before);
  }
 }
});
it("rejects malformed or inconsistent resumable hash state",()=>{const state=newDigest();for(const bad of [null,{}, {...state,h:[]},{...state,h:[-1,...state.h.slice(1)]},{...state,bytes:1},{...state,tail:[256]},{...state,bytes:NaN}])expect(()=>parseDigest(bad)).toThrow(/digest/);});
