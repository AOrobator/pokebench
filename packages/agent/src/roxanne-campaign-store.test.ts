import {mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {it,expect} from "vitest";
import {FileCampaignStore} from "./roxanne-campaign-store.js";
import {CampaignController,createCampaign} from "./roxanne-campaign.js";
it("durably stores CAS transitions, refuses stale writers, orphan locks and clobbers",()=>{const root=mkdtempSync(join(tmpdir(),"roxanne-store-"));try{const path=join(root,"state.json"),store=FileCampaignStore.create(path,createCampaign("test",0));expect(()=>FileCampaignStore.create(path,createCampaign("other",0))).toThrow();const a=new CampaignController(store),b=new CampaignController(store);a.stop("no launch");expect(store.read().stopped).toBe("no launch");expect(()=> { b.stop("stale"); }).toThrow(/revision/);const text=readFileSync(path,"utf8");writeFileSync(`${path}.lock`,"uncertain owner");expect(()=> { new CampaignController(store).stop("cannot steal"); }).toThrow();expect(readFileSync(path,"utf8")).toBe(text);}finally{rmSync(root,{recursive:true,force:true});}});
