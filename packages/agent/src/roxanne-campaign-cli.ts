import {mkdirSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {CampaignController,createCampaign} from "./roxanne-campaign.js";
import {FileCampaignStore} from "./roxanne-campaign-store.js";
import {rehearseCampaign} from "./roxanne-rehearsal.js";

// Only the rehearsal command is exposed. No endpoint discovery, GPU leases or launch adapter is reachable.
const [command,output,scenario]=process.argv.slice(2);
if(command!=="rehearse"||output===undefined||scenario!==undefined&&scenario!=="revision_wins"&&scenario!=="no_nominee")throw new Error("usage: roxanne-campaign-cli rehearse <new-output-directory> [revision_wins|no_nominee]; no campaign launch command is enabled");
const root=resolve(output);mkdirSync(root,{recursive:false});
const store=FileCampaignStore.create(join(root,"controller.json"),createCampaign("offline-roxanne-rehearsal",0));
const receipt=await rehearseCampaign(new CampaignController(store),(id,value)=>{writeFileSync(join(root,`${id}.json`),`${JSON.stringify(value,null,2)}\n`);},scenario??"revision_wins");
console.log(JSON.stringify({mode:receipt.mode,episodes:receipt.episodes,modelResponses:receipt.modelResponses,simulatedGpuHours:receipt.spentMs/3_600_000,simulatedWallHours:receipt.wallMs/3_600_000,gpuCalls:receipt.gpuCalls,status:receipt.result.status,leasesReleased:receipt.leasesReleased}));
