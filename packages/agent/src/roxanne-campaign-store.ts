import {closeSync,existsSync,fsyncSync,mkdirSync,openSync,readFileSync,renameSync,unlinkSync,writeFileSync} from "node:fs";
import {dirname} from "node:path";
import {randomUUID} from "node:crypto";
import {parseState,type CampaignState,type CampaignStore} from "./roxanne-campaign.js";

/** One atomic state owner. An orphaned lock is a reconciliation requirement, not permission to steal it. */
export class FileCampaignStore implements CampaignStore{
 constructor(readonly path:string){}
 static create(path:string,state:CampaignState):FileCampaignStore{
  mkdirSync(dirname(path),{recursive:true});const fd=openSync(path,"wx");
  try{writeFileSync(fd,`${JSON.stringify(parseState(state))}\n`);fsyncSync(fd);}finally{closeSync(fd);}
  return new FileCampaignStore(path);
 }
 read():CampaignState{return parseState(JSON.parse(readFileSync(this.path,"utf8")) as unknown);}
 commit(expectedRevision:number,next:CampaignState):void{
  const lock=`${this.path}.lock`,temporary=`${this.path}.${randomUUID()}.partial`;const fd=openSync(lock,"wx");
  try{
   if(this.read().revision!==expectedRevision)throw new Error("campaign revision changed");
   if(next.revision!==expectedRevision+1)throw new Error("invalid next campaign revision");
   const file=openSync(temporary,"wx");try{writeFileSync(file,`${JSON.stringify(parseState(next))}\n`);fsyncSync(file);}finally{closeSync(file);}
   renameSync(temporary,this.path);const directory=openSync(dirname(this.path),"r");try{fsyncSync(directory);}finally{closeSync(directory);}
  }finally{if(existsSync(temporary))unlinkSync(temporary);closeSync(fd);unlinkSync(lock);}
 }
}
