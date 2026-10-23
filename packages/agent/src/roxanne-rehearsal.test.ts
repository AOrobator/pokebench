import {it,expect} from "vitest";
import {rehearseCampaign} from "./roxanne-rehearsal.js";
import {CampaignController,MemoryCampaignStore,createCampaign} from "./roxanne-campaign.js";
it.each(["revision_wins","no_nominee"] as const)("rehearses full ordinary loop and reserve discipline: %s",async scenario=>{
 const c=new CampaignController(new MemoryCampaignStore(createCampaign("fixture",0)));
 const artifacts=new Map<string,unknown>();const receipt=await rehearseCampaign(c,(id,value)=>{artifacts.set(id,value);},scenario);
 expect(receipt.gpuCalls).toBe(0);expect(receipt.leasesReleased).toBe(true);
 expect(receipt.episodes).toBe(scenario==="revision_wins"?36:10);
 expect(receipt.result.status).toBe(scenario==="revision_wins"?"provisional_winner":"no_winner");
 expect(receipt.spentMs).toBeLessThanOrEqual(57_600_000);
 expect(artifacts.has("frozen-finalist")).toBe(scenario==="revision_wins");
 expect(c.state.jobs.every(j=>j.status==="complete")).toBe(true);
 expect(c.state.batches.every(b=>b.gradeHash!==null&&b.blindMap!==null)).toBe(true);
});
