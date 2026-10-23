import {it,expect} from "vitest";
import {CAMPAIGN_CAP_MS,CampaignController,MemoryCampaignStore,createCampaign,freezeBatch,digest} from "./roxanne-campaign.js";
it("charges prior failed-epoch physical occupancy before reserving new work",()=>{
 const c=new CampaignController(new MemoryCampaignStore(createCampaign("recovery",0,{gpuMs:2_460_992,episodes:2})));expect(c.state.spentMs).toBe(2_460_992);
 const near=new CampaignController(new MemoryCampaignStore(createCampaign("nearly-spent",0,{gpuMs:CAMPAIGN_CAP_MS-1000,episodes:2}))),before=near.state;
 expect(()=>{near.freeze(freezeBatch("explore",[{id:"one",arm:"baseline",family:"d",endpoint:"gpu0",capMs:1001,promptHash:digest(""),restoreHash:digest("restore")}]));}).toThrow(/budget/);expect(near.state).toEqual(before);
});
it("does not reset the global launched-episode ceiling on a fresh recovery controller",()=>{
 const c=new CampaignController(new MemoryCampaignStore(createCampaign("episodes-spent",0,{gpuMs:2_460_992,episodes:36}))),before=c.state;
 expect(()=>{c.freeze(freezeBatch("explore",[{id:"one",arm:"baseline",family:"d",endpoint:"gpu0",capMs:1000,promptHash:digest(""),restoreHash:digest("restore")}]));}).toThrow(/episode/);expect(c.state).toEqual(before);
});
