#!/usr/bin/env python3
"""Exercise the skill's real aggregation, extraction, recovery and rendering boundaries."""
import argparse
import ast
import collections
import copy
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import statistics
import subprocess
import sys
import tempfile
import unittest

parser=argparse.ArgumentParser()
parser.add_argument('--repo',type=Path,required=True)
parser.add_argument('--workbench',type=Path,required=True)
parser.add_argument('--frontier-source',type=Path,required=True)
parser.add_argument('--fixture-run',required=True)
args,rest=parser.parse_known_args()
SKILL=Path(__file__).parent
TREE=ast.parse((SKILL/'extract.py').read_text())
NS={'collections':collections,'statistics':statistics,'math':math,'GROUPS':{'Model':['fixture']},'REQUIRED':['RIVAL_MET'],'KEYS':['RIVAL_MET']}
exec(compile(ast.Module(body=[n for n in TREE.body if isinstance(n,ast.FunctionDef)],type_ignores=[]),str(SKILL/'extract.py'),'exec'),NS)
spec=importlib.util.spec_from_file_location('report_renderer',SKILL/'render_report.py')
renderer=importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)
DIAGNOSTICS=['negativeFeedbackCount','immediateSameStateFailedRepeats','sameStateFailedRecurrencesWithin30Turns','assistantLatencyMedianMs','toolResults','toolCalls','loopGuardWarnings','loopGuardSupervisors','loopGuardWouldWarn','loopGuardRecoveredLabels']


def run_row(reason='budget'):
    return {'id':'fixture','modelGroup':'Model','role':'primary_census','excluded':None,'problem':None,'arm':'control','endReason':reason,'turns':95,'activeMs':1000,'wallMs':1000,'gradingStatus':{'RIVAL_MET':'not-reached'},'milestones':[],'provenance':{'effectiveMaxWallMs':7200000},'diagnostics':{k:0 for k in DIAGNOSTICS},'tokens':{'input':0,'output':0},'longestRequiredStoryGapByTurns':{'turns':0},'longestRequiredStoryGapByTime':{'elapsedMs':0}}


def horizon(row):
    return next(x for x in NS['aggregate']([row])[0]['horizons'] if x['axis']=='turn' and x['horizon']==100)


def payload(color='#155a7a'):
    return {'title':'Fixture','snapshot':'Frozen fixture','verdict':'No verdict','scope':'No gameplay','kpis':[],'charts':{'milestones':[],'series':[{'name':'Unavailable series','color':color,'values':[]}]},'sections':[],'runs':[],'references':[],'reproducibility':[]}


class AnalysisBoundaries(unittest.TestCase):
    def test_behavioral_terminal_miss_is_failure(self):
        for reason in ['stuck','stalled']:
            with self.subTest(reason=reason):
                result=horizon(run_row(reason))
                self.assertEqual((result['S'],result['F'],result['U']),(0,1,0),result)

    def test_insufficient_turn_exposure_remains_unknown(self):
        for reason in ['budget','operator_abort','operator_stop','crash','model_error']:
            result=horizon(run_row(reason))
            self.assertEqual((result['F'],result['U']),(0,1),(reason,result))

    def test_unsupported_target_remains_unknown_even_on_behavioral_stop(self):
        row=run_row('stuck');row['gradingStatus']['RIVAL_MET']='unsupported'
        result=horizon(row)
        self.assertEqual((result['F'],result['U']),(0,1),result)

    def test_kept_pre_interruption_success_is_preserved(self):
        row=run_row('crash');row['problem']='later infrastructure problem'
        row['milestones']=[{'name':'RIVAL_MET','turn':50,'elapsedMs':500,'wallFromStartMs':500,'inputTokens':1,'outputTokens':1}]
        result=horizon(row)
        self.assertEqual((result['S'],result['F'],result['U']),(1,0,0),result)

    def test_empty_chart_color_cannot_emit_network_css(self):
        with self.assertRaises(ValueError):
            renderer.render(payload('red;background-image:url(https://example.invalid/review-probe)'),{'episodes':[]})

    def test_safe_unavailable_chart_renders_without_loading_assets(self):
        result=renderer.render(payload(),{'episodes':[]})
        self.assertIn('Validated cumulative chart unavailable',result)
        self.assertNotIn('background-image:url(',result)

    def test_recovery_rejects_changed_source_before_publishing(self):
        with tempfile.TemporaryDirectory(prefix='cross-model-recovery-test-') as tmp:
            root=Path(tmp);(root/'packages/agent/dist').mkdir(parents=True)
            (root/'packages/agent/dist/loop-recovery.js').symlink_to(args.repo/'packages/agent/dist/loop-recovery.js')
            log=root/'runs/fixture/events.jsonl';log.parent.mkdir(parents=True)
            raw=(json.dumps({'type':'run_start','turn':0,'seq':0})+'\n'+json.dumps({'type':'run_end','turn':1,'seq':1,'reason':'budget'})+'\n').encode();log.write_bytes(raw)
            out=root/'out';out.mkdir();data={'requiredStoryOrder':[],'runs':[{'id':'fixture','modelGroup':'Model','role':'primary_census','turns':1,'milestones':[],'provenance':{'logSha256':'0'*64}}]};(out/'metrics.json').write_text(json.dumps(data))
            command=['node',str(SKILL/'recovery.mjs'),'--repo',str(root),'--output',str(out)]
            result=subprocess.run(command,capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)
            self.assertFalse((out/'recovery.json').exists(),result.stdout+result.stderr)
            data['runs'][0]['provenance']['logSha256']=hashlib.sha256(raw).hexdigest();(out/'metrics.json').write_text(json.dumps(data))
            result=subprocess.run(command,capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            self.assertEqual(json.loads((out/'recovery.json').read_text())['runs'][0]['events'],2)

    def test_checkpoint_and_present_at_start_refuse_earned_denominators(self):
        workbench=json.loads(args.workbench.read_text())
        original=next(r for r in workbench['runs'] if r['id']==args.fixture_run)
        self.assertEqual((original.get('config') or {}).get('resume'),'MAIN_MENU',original['id'])
        self.assertEqual(original.get('status'),'ended',original['id'])
        rid=original['id'];source=args.repo/'runs'/rid/'events.jsonl'
        with source.open() as handle:
            start=json.loads(next(handle));initial=next(json.loads(line) for line in handle if json.loads(line).get('type')=='state')
        with source.open('rb') as handle:
            handle.seek(max(0,source.stat().st_size-8192));end=json.loads(handle.read().splitlines()[-1])
        for case in ['checkpoint','present_at_start']:
            with self.subTest(case=case),tempfile.TemporaryDirectory(prefix='cross-model-checkpoint-test-') as tmp:
                root=Path(tmp);out=root/'out';row=copy.deepcopy(original);new_start=copy.deepcopy(start);new_initial=copy.deepcopy(initial)
                row['config']['resume']='CLOCK_SET' if case=='checkpoint' else 'MAIN_MENU'
                new_start['start_state']['path']='CLOCK_SET.state' if case=='checkpoint' else 'MAIN_MENU.state'
                new_initial['started']=True if case=='checkpoint' else False
                inherited={'v':1,'type':'milestone','run':rid,'seq':2,'turn':0,'t':start['t'],'name':'RIVAL_MET','kind':'story','origin':'present_at_start','evidence':[]}
                raw='\n'.join(json.dumps(e) for e in ([new_start,new_initial,inherited,end] if case=='present_at_start' else [new_start,new_initial,end]))+'\n'
                log=root/'runs'/rid/'events.jsonl';log.parent.mkdir(parents=True);log.write_text(raw)
                row['measurement']['logSha256']=hashlib.sha256(raw.encode()).hexdigest();wb=copy.deepcopy(workbench);wb['runs']=[row]
                (root/'workbench.json').write_text(json.dumps(wb));(root/'manifest.json').write_text(json.dumps({'runIds':[rid],'groups':{'Model':[rid]}}))
                result=subprocess.run([sys.executable,str(SKILL/'extract.py'),'--repo',str(root),'--workbench',str(root/'workbench.json'),'--manifest',str(root/'manifest.json'),'--frontier-source',str(args.frontier_source),'--output',str(out)],capture_output=True,text=True)
                self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)
                self.assertFalse((out/'metrics.json').exists(),result.stdout+result.stderr)


if __name__=='__main__':
    unittest.main(argv=[sys.argv[0],*rest])
