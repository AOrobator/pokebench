import {expect,it} from "vitest";
import {checkEvent} from "@pokebench/agent/events";
import {Log,START,state} from "../test-support/events.js";
import {parseDisplayEvent} from "./display-event.js";
import {emptyCurrent,foldCurrent} from "./current-state.js";

it("removes additive display fields without weakening the recorded event validator",()=>{
 const log=new Log();log.add(0,START);const event=log.add(1,state());
 if(event.type!=="state"||!("position" in event))throw new Error("state fixture");
 const future={...event,new_metric:3,position:{...event.position,future_direction:"north"}};
 expect(()=>checkEvent(future)).toThrow();
 const display=parseDisplayEvent(JSON.stringify(future));
 expect(display.type).toBe("state");
 expect(display).not.toHaveProperty("new_metric");
 expect(()=>checkEvent(display)).not.toThrow();
});

it("keeps later state updates after unknown or malformed bodies and marks the omission",()=>{
 const log=new Log();const start=log.add(0,START);
 const future=log.add(1,state()), later=log.add(2,state({location:"RUSTBORO CITY"}));
 const unknown=parseDisplayEvent(JSON.stringify({...future,type:"future_sensor",value:1}));
 let view=foldCurrent(emptyCurrent(),start);
 view=foldCurrent(view,unknown);
 view=foldCurrent(view,later);
 expect(view.card?.location).toBe("RUSTBORO CITY");
 expect(view.warning).toMatch(/future_sensor/);
 const invalid=parseDisplayEvent(JSON.stringify({...future,party:"broken"}));
 expect(invalid.type).toBe("viewer_unsupported");
 expect(()=>parseDisplayEvent("{broken")).toThrow();
 expect(()=>parseDisplayEvent(JSON.stringify({...future,seq:-1}))).toThrow();
});
