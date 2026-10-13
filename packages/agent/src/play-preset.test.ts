import {expect,it} from "vitest";
import {parsePlayPreset} from "./play-preset.js";
const preset={version:1,id:"name-control",target:"PLAYER_NAME_CONFIRMED",limits:{maxTurns:300,maxWallMs:600000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},flags:{loopGuard:false,activeUi:true,interfaceDocs:true,objectives:true}};
it("strictly accepts full explicit presets and ordinary no-target variants",()=>{expect(parsePlayPreset(preset)).toEqual(preset);expect(parsePlayPreset({...preset,target:null})).toEqual({...preset,target:null});});
it.each([{...preset,extra:true},{...preset,limits:{...preset.limits,maxWallMs:"600000"}},{...preset,flags:{...preset.flags,loopGuard:"false"}},{...preset,target:"PLAYER_NAME_SET"},{...preset,target:"invented"},{...preset,sampling:{thinkingLevel:"invented",maxTokens:4096}},{...preset,limits:{...preset.limits,failureLimit:0}}])("rejects unsupported or malformed contracts",value=>{expect(()=>parsePlayPreset(value)).toThrow(/preset/i);});
