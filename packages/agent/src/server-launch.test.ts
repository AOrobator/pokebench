import {it,expect} from "vitest";

it("limits campaign cleanup to the exact recorded run's launcher process group",async()=>{
 const {ownedCampaignServerGroup}=await import("./server-launch.js"),receipt={pid:123,runId:"owned",port:8064},command="/p/python -m pokebench_env.launcher --run-dir /runs/owned --run-id owned --port 8064 --load-state /checkpoint --exec";
 expect(ownedCampaignServerGroup("/runs/owned","owned",receipt,command)).toBe(-123);expect(ownedCampaignServerGroup("/runs/owned","owned",receipt,null)).toBe(null);
 // The launcher execs the server, so the recorded pid also answers as the server it became.
 expect(ownedCampaignServerGroup("/runs/owned","owned",receipt,"/p/python -m pokebench_env.serve --port 8064 --no-ocr")).toBe(-123);
 expect(()=>ownedCampaignServerGroup("/runs/owned","owned",receipt,"/p/python -m pokebench_env.serve --port 8065")).toThrow();
 expect(()=>ownedCampaignServerGroup("/runs/other","owned",receipt,command)).toThrow();expect(()=>ownedCampaignServerGroup("/runs/owned","other",receipt,command)).toThrow();expect(()=>ownedCampaignServerGroup("/runs/owned","owned",{...receipt,pid:0},command)).toThrow();expect(()=>ownedCampaignServerGroup("/runs/owned","owned",receipt,"another process")).toThrow();
});

it("refuses a healthy game listener outside the newly launched server group",async()=>{
 const {verifyCampaignListenerGroups}=await import("./server-launch.js");expect(()=>{verifyCampaignListenerGroups(123,[123]);}).not.toThrow();for(const [group,listeners]of [[123,[456]],[123,[]],[undefined,[123]],[0,[0]]] as const)expect(()=>{verifyCampaignListenerGroups(group,listeners);}).toThrow();
});
