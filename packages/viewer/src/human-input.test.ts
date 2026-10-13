import {expect,it} from 'vitest';
import {HumanKeyboard,HUMAN_KEYS} from './human-input.js';
it('uses the exact physical-key map and preserves held combinations',()=>{
 expect(HUMAN_KEYS).toEqual({KeyW:'UP',KeyA:'LEFT',KeyS:'DOWN',KeyD:'RIGHT',KeyZ:'SELECT',KeyX:'START',KeyO:'A',KeyP:'B',Digit1:'L',Digit2:'R'});
 const transitions:readonly string[][]=[];const received:string[][]=[];const keys=new HumanKeyboard(buttons=>{received.push([...buttons]);});
 expect(keys.key('KeyW',true)).toBe(false);keys.focus(true);
 for(const code of Object.keys(HUMAN_KEYS)){expect(keys.key(code,true)).toBe(true);expect(keys.key(code,true)).toBe(true);keys.key(code,false);}
 expect(received).toHaveLength(20);keys.key('KeyO',true);keys.key('KeyW',true);expect(received.at(-1)).toEqual(['A','UP']);keys.key('KeyO',false);expect(received.at(-1)).toEqual(['UP']);keys.focus(false);expect(received.at(-1)).toEqual([]);expect(keys.key('Escape',true)).toBe(false);expect(transitions).toEqual([]);
});
