import {it,expect} from 'vitest';
import {checkEvent,type BodyOf} from '@pokebench/agent/events';
import {BASE_MS,Log,START} from '../test-support/events.js';
import {RunView,foldUntil} from './model.js';
import {actionRow,inspector} from './panels.js';
import {LANES,lanesSvg} from './timeline.js';
const choice:BodyOf<'battle_choice'>={type:'battle_choice',turn:4,id:1,frame:120,recorded_ms:BASE_MS+200,battle:2,battle_turn:3,action:'move',action_id:0,origin:'selected',actor:{battler:0,position:0,party_slot:0,species_id:25,species:'PIKACHU',identity:'00000001:00000002',level:10,hp:20,max_hp:30},move:{id:55,name:'WATER GUN',slot:0,pp:25},target:{battler:1,position:1,party_slot:0,species_id:74,species:'GEODUDE',identity:'00000003:00000004',level:12,hp:30,max_hp:40},item_id:null,switch_party_slot:null,source:{main_func:0x0803D2E9,communication:[5,5],battle_type:0}};
it('schema-valid choices replay in history and both timelines at actual commit time',()=>{
 const log=new Log();log.add(0,START);log.add(500,choice);const view=new RunView();for(const e of log.events)view.apply(checkEvent(e));
 expect(view.battleChoices).toHaveLength(1);
 const event=view.battleChoices[0];if(event===undefined)throw Error('missing');
 expect(actionRow(event)).toContain('WATER GUN');expect(actionRow(event)).toContain('GEODUDE Lv12');expect(actionRow(event)).toContain('PP 25');expect(actionRow(event)).toContain('execution unobserved');expect(inspector(event)).toContain('134468329');
 for(const lanes of [LANES,['presses','milestones'] as const])expect(lanesSvg(view,BASE_MS+300,lanes)).toContain('WATER GUN');
 expect(lanesSvg(view,BASE_MS+100)).not.toContain('WATER GUN');expect(lanesSvg(view,BASE_MS+61000)).not.toContain('WATER GUN');expect(lanesSvg(view,BASE_MS+300,['errors'])).not.toContain('WATER GUN');
 expect(foldUntil(log.events,BASE_MS+100).battleChoices).toHaveLength(0);expect(foldUntil(log.events,BASE_MS+500).battleChoices).toHaveLength(1);
});
it('shows switch/item/automatic/run choices without fabricated moves or success',()=>{
 const log=new Log();log.add(0,START);
 for(const [action,detail] of [['switch','party slot 3'],['item','item #13'],['run','run'],['move','automatic']] as const){
  const event=log.add(100,{...choice,action,move:null,target:null,item_id:action==='item'?13:null,switch_party_slot:action==='switch'?2:null,origin:'automatic'});
  expect(actionRow(event)).toContain(detail);expect(actionRow(event)).toContain('execution unobserved');
 }
});
