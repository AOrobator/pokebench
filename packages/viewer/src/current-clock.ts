// Scan only the stable run-control protocol. State decoding and history totals
// can catch up independently without inventing an elapsed-time estimate.
import {eventEnvelope} from "@pokebench/agent/events";
import {parseDisplayEvent,type DisplayEvent} from "./display-event.js";
import {emptyCurrent,foldCurrent,type CurrentState} from "./current-state.js";

export function clockEvent(text: string): DisplayEvent {
  const value:unknown=JSON.parse(text), envelope=eventEnvelope(value);
  if(envelope===null)throw new Error("Invalid clock event identity");
  if(envelope.type==="operator_control"||envelope.type==="run_end")return parseDisplayEvent(text);
  return {...envelope,type:"viewer_unsupported",originalType:envelope.type,problem:""};
}

export function clockStart(start: NonNullable<CurrentState["start"]>): CurrentState {
  return foldCurrent(emptyCurrent(),start);
}

export function foldClock(prior:CurrentState,event:DisplayEvent,problem?:string):CurrentState {
  if(event.run!==prior.run)throw new Error("Foreign clock event");
  if(prior.end!==null)throw new Error("Clock already ended");
  if(event.seq<prior.nextSeq)throw new Error("Clock event sequence moved backwards");
  const warning=problem??(event.seq!==prior.nextSeq?"Clock event sequence gap":prior.warning);
  const next={...prior,warning};
  if(event.type==="viewer_unsupported"){
    return {...next,seq:event.seq,nextSeq:event.seq+1,at:Date.parse(event.t),turn:event.turn,
      warning:event.problem!==""?event.problem:warning};
  }
  if(event.type!=="operator_control"&&event.type!=="run_end")throw new Error("Unexpected clock event");
  return foldCurrent({...next,nextSeq:event.seq},event);
}
