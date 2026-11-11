import {expect,it} from "vitest";
import {currentFixture} from "../test-support/current.js";
import {currentMetadataCache,packCurrentAnswer,parseCurrentMetadata,unpackCurrentSummary} from "./current-metadata.js";
import {parseCurrentAnswer,parseCurrentSnapshot} from "./current-public.js";

it("loads immutable configuration once across list, selected state and repeated live polls",async()=>{
 const f=currentFixture(),p=f.publication;if(p.metadata===undefined)throw new Error("metadata fixture");let calls=0;
 const metadata=parseCurrentMetadata(JSON.parse(p.metadata.text));
 const cache=currentMetadataCache((run,reference)=>{calls++;expect(run).toBe(f.summary.id);expect(reference).toBe(p.metadata?.reference);return Promise.resolve(metadata);});
 const signal=new AbortController().signal;
 for(const answer of [f.list,f.detail,{kind:"updates",version:1,epoch:"epoch",cursor:"next",reset:false,more:false,changes:[{id:f.summary.id,removed:false,summary:f.summary,snapshot:f.snapshot}]}]){
  const restored=parseCurrentAnswer(await cache.hydrate(packCurrentAnswer(answer),signal));expect(restored.kind).toBe(answer.kind);
 }
 expect(calls).toBe(1);
 const restored=parseCurrentSnapshot(unpackCurrentSummary(JSON.parse(p.wire?.detail??"null"),metadata));
 expect(restored.display).toEqual(f.snapshot.display);expect(restored.header).toEqual(f.snapshot.header);expect(restored.run.config).toEqual(f.snapshot.run.config);
});

it("rejects cross-run configuration binding and retains the effective live limit separately",()=>{
 const f=currentFixture(),other=currentFixture({run:"other-run"}),p=f.publication;
 if(p.metadata===undefined||other.publication.metadata===undefined)throw new Error("fixture");
 const wire:unknown=JSON.parse(p.wire?.summary??"null");
 expect(()=>unpackCurrentSummary(wire,parseCurrentMetadata(JSON.parse(other.publication.metadata?.text??"null")))).toThrow("Foreign");
 const config=f.snapshot.run.config;if(config===null)throw new Error("config fixture");
 const snapshot={...f.snapshot,run:{...f.snapshot.run,config:{...config,extendedWallMs:3_600_000}}};
 const packed=packCurrentAnswer({...f.detail,snapshot});
 expect(JSON.stringify(packed)).not.toContain('"features"');
});

it("retries a failed metadata load instead of caching the failed request",async()=>{
 const f=currentFixture(),p=f.publication;if(p.metadata===undefined)throw new Error("fixture");let failed=true,calls=0;
 const cache=currentMetadataCache(()=>{calls++;return failed?Promise.reject(new Error("offline")):Promise.resolve(JSON.parse(p.metadata?.text??"null") as unknown);});
 const signal=new AbortController().signal,wire=packCurrentAnswer(f.detail);
 await expect(cache.hydrate(wire,signal)).rejects.toThrow("offline");failed=false;
 expect(parseCurrentAnswer(await cache.hydrate(wire,signal)).kind).toBe("current");expect(calls).toBe(2);
});
