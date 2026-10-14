import type {Button} from './model.js';
export const HUMAN_KEYS:Readonly<Record<string,Button>>={KeyW:'UP',KeyA:'LEFT',KeyS:'DOWN',KeyD:'RIGHT',KeyZ:'SELECT',KeyX:'START',KeyO:'A',KeyP:'B',Digit1:'L',Digit2:'R'};
export class HumanKeyboard {
 private active=false;
 private readonly held=new Set<Button>();
 constructor(private readonly send:(buttons:readonly Button[])=>void){}
 focus(active:boolean):void {this.active=active;if(!active){this.held.clear();this.send([]);}}
 key(code:string,down:boolean):boolean {
  const button=HUMAN_KEYS[code];if(!this.active||button===undefined)return false;
  if(down===this.held.has(button))return true;
  if(down)this.held.add(button);else this.held.delete(button);
  this.send([...this.held]);return true;
 }
 get buttons():readonly Button[]{return [...this.held];}
}
