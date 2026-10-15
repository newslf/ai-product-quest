"""Verify the learner's extracted package, with no network calls or real data."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

archive=Path(__file__).resolve().parents[1]/'dist'/'materials'/'ai-quest-learning-kit.zip'
with tempfile.TemporaryDirectory(prefix='ai-quest-kit-') as directory:
    target=Path(directory)
    with zipfile.ZipFile(archive) as source:
        assert len(source.namelist())==14
        assert not any('runs/' in x or '__pycache__' in x for x in source.namelist())
        source.extractall(target)
    def run(*args):
        result=subprocess.run([sys.executable,str(target/'practice.py'),*args],capture_output=True,text=True,encoding='utf-8',check=True)
        return json.loads(result.stdout.split('\nSaved:')[0])
    low=run('threshold','--threshold','0.35');assert (low['TP'],low['FP'],low['FN'],low['TN'])==(6,5,0,9)
    high=run('threshold','--threshold','0.7');assert (high['TP'],high['FP'],high['FN'],high['TN'])==(4,1,2,13)
    assert run('threshold','--threshold','1')['precision'] is None
    assert len(run('inspect')['observations_after_cutoff'])==4
    for method in ['keyword','tfidf']:
        for split in ['dev','holdout']:
            result=run('retrieval','--method',method,'--split',split,'--valid-only')
            assert len(result['rows'])==(12 if split=='dev' else 6)
            assert result['answers_generated'] is False
            for row in result['rows']:
                for doc in row['candidates']:
                    assert doc['valid_from']<=row['as_of'] and (not doc['valid_to'] or row['as_of']<doc['valid_to'])
    override=run('retrieval','--method','tfidf','--at','2026-08-15','--valid-only')
    assert override['hit_at_k'] is None
    assert all(row['hit'] is None for row in override['rows'])
    replay=run('model','--mode','replay');assert len(replay['rows'])==12
    assert replay['mode']=='fixed_replay_NOT_inference';assert replay['structure_pass']<1
    a=run('model','--mode','replay','--prompt','evidence');assert [r['output'] for r in replay['rows']]==[r['output'] for r in a['rows']]
    for scenario in ['normal','timeout','duplicate','denied']:
        result=run('tools','--scenario',scenario);assert result['real_business_action'] is False
        if scenario=='duplicate':assert result['created_drafts']==1 and result['logs'][-1]['state']=='duplicate'
        elif scenario in ['timeout','denied']:assert result['logs'][-1]['next']=='human_review'
    timings=run('value');assert timings['n']==8 and timings['slower_tasks']==2
print('PASS: extracted kit, independent confusion-matrix values, undefined metric, leakage, real retrieval dates, relabeling guard, replay disclosure, tool failures, paired timings.')
