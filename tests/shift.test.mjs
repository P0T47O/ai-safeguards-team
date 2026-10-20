import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {CASES,TABS,ACTIONS,REASONS,allEvidence,configureCampaign,tabsForState,newState,restoreState,submitDecision,shiftReport,buildLetters} from '../dist/assets/cases.js';

const originalCampaign=JSON.parse(fs.readFileSync(new URL('../dist/data/campaign.json',import.meta.url),'utf8'));
originalCampaign.stages[0].caseIds=originalCampaign.stages[0].caseIds.slice(0,4);
originalCampaign.stages[0].timeBudget=32;
configureCampaign(originalCampaign,JSON.parse(fs.readFileSync(new URL('../dist/data/cases.json',import.meta.url),'utf8')));
const originalTabs=TABS.filter(([id])=>['claim','network','environment','calendar','chat','usage'].includes(id));

function play(actions) {
  const state = newState(); state.phase='desk'; state.legacyAccess=true;
  const evidence=['1-name','2-chat-a','3-volume','4-note'];
  const reasons=['consistent','calendar','harvest','partner'];
  actions.forEach((action,index)=>{
    state.current=index;
    Object.assign(state.files[index],{evidence:[evidence[index]],reason:reasons[index]});
    assert.equal(submitDecision(state,action),true);
  });
  return state;
}

test('punitive stamps require a real attached exhibit; archived decisions cannot be rewritten',()=>{
  const state=newState();state.phase='desk';
  assert.equal(submitDecision(state,'pause'),false);
  state.files[0].reason='consistent';
  state.files[0].evidence=['nonexistent'];
  assert.equal(submitDecision(state,'allow'),false);
  state.files[0].evidence=['OC-001-reply'];
  assert.equal(submitDecision(state,'allow'),false,'unrequested testimony is not available evidence');
  state.files[0].evidence=['1-name'];
  assert.equal(submitDecision(state,'toString'),false);
  assert.equal(submitDecision(state,'allow'),true);
  assert.equal(submitDecision(state,'pause'),false);
  assert.equal(state.files[0].decision.action,'allow');
});

test('company rewards its contradictory personal and partner rules without a moral accuracy score',()=>{
  const state=play(['allow','pause','pause','allow']);
  const report=shiftReport(state);
  assert.equal(report.revenue,20020);
  assert.equal(report.dispositions,2);
  assert.equal(report.wage,108);
  assert.equal(report.partner,'满意');
  assert.ok(!('accuracy' in report));
  assert.equal(CASES[2].documents.usage[0].text,CASES[3].documents.usage[0].text);
});

test('all 81 decision sequences produce four appropriate letters, retain exhibits, and survive reload',()=>{
  const originalActions=['allow','review','pause'];
  for(const a of originalActions)for(const b of originalActions)for(const c of originalActions)for(const d of originalActions){
    const actions=[a,b,c,d],state=play(actions);state.phase='letters';
    const restored=restoreState(JSON.parse(JSON.stringify(state)));
    assert.equal(restored.phase,'letters');
    const letters=buildLetters(restored),report=shiftReport(restored);
    assert.equal(letters.length,4);
    assert.equal(new Set(letters.map(letter=>letter.id)).size,4);
    letters.forEach((letter,index)=>{
      assert.equal(letter.action,ACTIONS[actions[index]]);
      assert.equal(letter.body,CASES[index].messages[actions[index]].body.replaceAll('{reason}',letter.reason));
      assert.equal(letter.evidence[0].id,state.files[index].decision.evidence[0]);
    });
    assert.ok(Number.isFinite(report.wage)&&report.wage>=0);
  }
});

test('review work and inquiries affect administrative time, including overtime payroll deductions',()=>{
  const state=play(['review','review','review','review']);
  state.files.forEach(entry=>{entry.inquired=true;entry.read=tabsForState(state).map(([id])=>id);});
  const report=shiftReport(state);
  assert.equal(report.minutes,72);
  assert.equal(report.reviews,4);
  assert.equal(report.revenue,0);
  assert.ok(report.penalties.some(row=>row.label==='行政延迟 40 分钟'&&row.amount===40));
});

test('corrupted, future, forged, or out-of-order saved progress resets safely',()=>{
  assert.equal(restoreState(null).phase,'briefing');
  for(const corrupt of [
    state=>{state.version=99;},
    state=>{state.phase='letters';},
    state=>{state.current=3;},
    state=>{state.files[0].evidence=['forged'];},
    state=>{state.files[0].evidence=['OC-001-reply'];},
    state=>{state.files[0].decision={action:'toString',reason:'',evidence:[]};},
    state=>{state.files[1].evidence=['2-name'];state.files[1].reason='consistent';state.files[1].decision={action:'allow',reason:'consistent',evidence:['2-name']};}
  ]){const state=newState();corrupt(state);assert.deepEqual(restoreState(state),newState());}
});

test('every selectable source record has a unique identifier and all six dossier pages exist',()=>{
  for(const file of CASES){
    const records=allEvidence(file);
    assert.equal(new Set(records.map(item=>item.id)).size,records.length);
    for(const [tab]of originalTabs)assert.ok(file.documents[tab].length>=2);
    assert.ok(records.every(item=>item.label&&item.text&&item.tags.length));
  }
});


test('letters quote the submitted reason even when it does not support the selected action',()=>{
  const state=play(['allow','pause','pause','allow']);
  state.files[1].reason='harvest';
  state.files[1].decision.reason='harvest';
  const letter=buildLetters(state)[1];
  assert.ok(letter.body.includes('存在重复收集输出的行为'));
  assert.ok(!letter.body.includes('{reason}'));
  assert.equal(shiftReport(state).audits.find(row=>row.caseId==='OC-002').correct,1);
});
