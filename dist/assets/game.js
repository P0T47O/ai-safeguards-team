import { CAMPAIGN, STAGES, ACTIONS, REASONS, POISON_SAMPLE, connectionText, allEvidence, availableEvidence, replyEvidence, newState, restoreState, submitDecision, shiftReport, campaignBonus, buildLetters, decisionAudit, decisionExecution, decisionLabel, reasonText, selectionLimit, configureCampaign, currentStage, shiftCases, tabsForState, nextShift, newDeveloperWorkspace, restoreDeveloperWorkspace, developerJump } from './cases.js';
import { loadData } from './data.js';
import { setDeveloperChainHistory } from './chains.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
try {
  const {campaign,pack}=await loadData(); configureCampaign(campaign,pack);
} catch(error) {
  $('#main').innerHTML='<section class="load-error"><h1>案卷未能送达</h1><p>'+esc(error.message)+'</p><p>请检查 data/campaign.json 与 data/cases.json，修正后刷新页面。本机进度保持原样。</p><a href="./">重新读取案卷 →</a></section>';
  throw error;
}
const STORAGE_KEY = CAMPAIGN.id==='orange-crab-probation'?'orange-crab-satire-day-one':'orange-crab-satire-'+CAMPAIGN.id;
const DEVELOPER_STORAGE_KEY = CAMPAIGN.id==='orange-crab-probation'?'orange-crab-developer-workspace':'orange-crab-developer-'+CAMPAIGN.id;
const HIGH_SCORE_KEY = 'orange-crab-high-score-'+CAMPAIGN.id;
const ENDING = CAMPAIGN.ending||{title:'试用期归档通知',paragraphs:['试用期已结束。审核记录已归档。'],signature:'橙蟹公司 · 安全办公室'};
let state;
try { state = restoreState(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { state = newState(); }
let normalSessionState=structuredClone(state);
let developerWorkspace;
try { developerWorkspace=restoreDeveloperWorkspace(JSON.parse(localStorage.getItem(DEVELOPER_STORAGE_KEY))); } catch { developerWorkspace=null; }
if(developerWorkspace?.enabled)state=developerWorkspace.days[developerWorkspace.activeDay];
let storageAvailable = true;
let modalClosable = true;
let returnFocus;
const currentFile = () => shiftCases(state)[state.current];
const currentEntry = () => state.files[state.current];
const money = value => '$' + value.toLocaleString('en-US');
const feeSummary = report => Object.entries(report.revenueByCurrency).filter(([,amount])=>amount>0).map(([currency,amount])=>currency==='DEN'?amount.toLocaleString('en-US')+' 枚第纳里':money(amount)).join(' + ')||money(0);
let highScore=null;
try {
  const stored=JSON.parse(localStorage.getItem(HIGH_SCORE_KEY));
  if(stored?.campaignId===CAMPAIGN.id&&Number.isFinite(stored.score)&&stored.score>=0)highScore=stored.score;
}catch{}

function recordFinalScore() {
  if(state.developerMode||state.dayIndex!==STAGES.length-1||state.history.length!==STAGES.length-1||![...state.history,state].every(shift=>shift.files.every(entry=>entry.decision)))return;
  const score=campaignBonus(state);
  try {
    // Another tab may have completed a better run since this page was opened.
    const stored=JSON.parse(localStorage.getItem(HIGH_SCORE_KEY));
    if(stored?.campaignId===CAMPAIGN.id&&Number.isFinite(stored.score)&&stored.score>=0)highScore=Math.max(highScore??0,stored.score);
  }catch{}
  highScore=Math.max(highScore??0,score);
  try{localStorage.setItem(HIGH_SCORE_KEY,JSON.stringify({campaignId:CAMPAIGN.id,score:highScore}));}catch{storageAvailable=false;}
}
function finalScoreCard() {
  return '<section class="final-score" aria-label="最终奖金得分"><span class="eyebrow">'+(state.developerMode?'DEV / 结局预览':'FINAL SCORE / 奖金结算')+'</span><div class="score-pair"><div><span>'+(state.developerMode?'当前调试班次奖金':'本轮累计奖金')+'</span><strong>'+money(campaignBonus(state))+'</strong></div><div><span>本机最高奖金</span><b>'+(highScore===null?'暂无记录':money(highScore))+'</b></div></div><p>奖金即得分，基本工资与订阅收入不计分。部门及超时扣款仍按工资明细结算。</p><small>'+(state.developerMode?'调试预览不计入最高分；本次只展示当前班次的奖金。':storageAvailable?'完整通关后记录最高分，重新上岗会保留纪录。':'当前浏览器无法保存纪录；此处最高分仅在本次打开期间有效。')+'</small></section>';
}
function dismissalNoticeBody() {
  const ending=ENDING;
  return '<div class="dismissal-copy">'+ending.paragraphs.map(paragraph=>'<p>'+esc(paragraph)+'</p>').join('')+'<div class="dismissal-signature">'+esc(ending.signature)+'</div></div>';
}
function showDismissalNotice() {
  if($('#modal').open)$('#modal').close();
  const screen=$('#suspension-screen');
  screen.innerHTML='<article class="suspension-card"><div class="suspension-brand"><span class="suspension-asterisk" aria-hidden="true">*</span><span>Orange Crab</span></div><h1 id="suspension-title" tabindex="-1">Your account has been suspended.</h1><p class="suspension-greeting">Hello,</p>'+dismissalNoticeBody()+'<button id="view-final-bonus" class="suspension-link">查看最终奖金 <span aria-hidden="true">→</span></button></article>';
  screen.hidden=false;
  document.body.classList.add('access-suspended');
  document.title='Your account has been suspended · Orange Crab';
  window.scrollTo(0,0);
  $('#suspension-title').focus({preventScroll:true});
  $('#view-final-bonus').addEventListener('click',()=>{
    screen.hidden=true;
    document.body.classList.remove('access-suspended');
    document.title=CAMPAIGN.title;
    state.dismissalAcknowledged=true;
    save();render();window.scrollTo(0,0);
    $('#letters-screen h1').setAttribute('tabindex','-1');
    $('#letters-screen h1').focus({preventScroll:true});
  });
}

function save() {
  try {
    if(state.developerMode){
      developerWorkspace.days[state.dayIndex]=state;
      developerWorkspace.activeDay=state.dayIndex;
      developerWorkspace.enabled=true;
      localStorage.setItem(DEVELOPER_STORAGE_KEY,JSON.stringify(developerWorkspace));
    }else{
      normalSessionState=structuredClone(state);
      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    }
  }catch{storageAvailable=false;}
  $('#save-status').textContent=storageAvailable?(state.developerMode?'开发者进度单独保存在本机':'进度自动保存在本机'):'当前浏览器无法保存进度';
}
function enableDeveloperMode(){
  if(state.developerMode)return;
  save();
  if(!developerWorkspace)developerWorkspace=newDeveloperWorkspace(state);
  developerWorkspace.enabled=true;
  state=developerWorkspace.days[developerWorkspace.activeDay];
  if(state.phase==='briefing')state.phase='desk';
  if($('#modal').open)$('#modal').close();
  save();render();toast('开发者模式已启用，正在使用独立调试存档。');
}
function disableDeveloperMode(){
  if(!state.developerMode)return;
  save();
  developerWorkspace.enabled=false;
  try{localStorage.setItem(DEVELOPER_STORAGE_KEY,JSON.stringify(developerWorkspace));}catch{storageAvailable=false;}
  state=structuredClone(normalSessionState);
  if($('#modal').open)$('#modal').close();
  save();render();
  if(state.phase==='briefing')briefing();
  else toast('已恢复正常游戏进度。');
}
function jumpDeveloper(dayIndex,caseId){
  if(!state.developerMode)return;
  save();
  const target=developerJump(developerWorkspace,dayIndex,caseId);
  if(!target)return;
  state=target;
  if($('#modal').open)$('#modal').close();
  save();render();
}
function renderDeveloper(){
  const active=state.developerMode===true;
  $('#developer-panel').hidden=!active;
  $('#developer-toggle').setAttribute('aria-pressed',String(active));
  $('#developer-toggle').textContent=active?'开发者 · ON':'开发者模式';
  document.body.classList.toggle('developer-mode',active);
  if(!active)return;
  $('#developer-day').innerHTML=STAGES.map((stage,index)=>'<option value="'+index+'">第 '+stage.day+' 日 · '+esc(stage.title)+'</option>').join('');
  $('#developer-day').value=String(state.dayIndex);
  $('#developer-case').innerHTML=STAGES.map((stage,index)=>'<optgroup label="第 '+stage.day+' 日">'+shiftCases({caseIds:stage.caseIds}).map(file=>'<option value="'+index+':'+file.id+'">'+esc(file.id+' · '+file.title)+'</option>').join('')+'</optgroup>').join('');
  $('#developer-case').value=state.dayIndex+':'+currentFile().id;
  $('#developer-previous-day').disabled=state.dayIndex===0;
  $('#developer-next-day').disabled=state.dayIndex===STAGES.length-1;
  $('#developer-reopen').disabled=!currentEntry().decision;
  $('#developer-status').textContent='第 '+currentStage(state).day+' 日 / '+currentFile().id+' · '+(currentEntry().decision?decisionLabel(currentFile(),currentEntry().decision):'待复核');
}
$('#developer-toggle').addEventListener('click',()=>state.developerMode?disableDeveloperMode():enableDeveloperMode());
$('#developer-exit').addEventListener('click',disableDeveloperMode);
$('#developer-day').addEventListener('change',()=>jumpDeveloper(Number($('#developer-day').value)));
$('#developer-case').addEventListener('change',()=>{
  const [dayIndex,caseId]=$('#developer-case').value.split(':');
  jumpDeveloper(Number(dayIndex),caseId);
});
$('#developer-previous-day').addEventListener('click',()=>jumpDeveloper(state.dayIndex-1));
$('#developer-next-day').addEventListener('click',()=>jumpDeveloper(state.dayIndex+1));
$('#developer-reopen').addEventListener('click',()=>{
  if(!state.developerMode||!currentEntry().decision)return;
  currentEntry().decision=null;state.phase='desk';save();render();toast('已撤回调试处置，保留圈选证物和文字理由。');
});
function toast(text) {
  $('#toast').textContent = text;
  $('#toast').classList.add('visible');
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => $('#toast').classList.remove('visible'), 2600);
}
function closeModal() {
  $('#modal').close();
  if (returnFocus?.isConnected) returnFocus.focus();
}
function modal({title,kicker='内部文件 / INTERNAL',body,buttons,closable=true}) {
  if ($('#modal').open) $('#modal').close();
  returnFocus = document.activeElement;
  modalClosable = closable;
  $('#modal-body').innerHTML = `<div class="modal-kicker">${esc(kicker)}${closable?'<button class="modal-x" aria-label="关闭文件">×</button>':''}</div><h2 id="modal-title">${title}</h2>${body}<div class="modal-actions">${buttons.map((button,i)=>`<button data-modal-action="${i}" class="${button.primary?'primary-button':'secondary-button'}">${esc(button.label)}</button>`).join('')}</div>`;
  $('#modal').querySelector('.modal-x')?.addEventListener('click',closeModal);
  buttons.forEach((button,index)=>$('#modal').querySelector(`[data-modal-action="${index}"]`).addEventListener('click',()=>{closeModal();button.run?.();}));
  $('#modal').showModal();
}
$('#modal').addEventListener('cancel',event=>{if(!modalClosable)event.preventDefault();});

function briefing() {
  const stage=currentStage(state),day=String(stage.day).padStart(2,'0');
  const previous=STAGES[state.dayIndex-1],expanded=previous&&stage.tabs.some(id=>!previous.tabs.includes(id));
  modal({title:stage.day===1?'请证明，<br><em>您属于全人类。</em>':esc(stage.title)+'<br><em>'+(expanded?'权限已扩大。':'新一班案卷已送达。')+'</em>',kicker:'ORANGE CRAB / 试用期第 '+day+' 日',closable:false,
    body:'<p class="modal-lead">'+esc(stage.notice)+'</p><div class="briefing-steps"><p><b>01</b><span>今日系统转入 '+shiftCases(state).length+' 份拦截记录，可查阅 '+tabsForState(state).length+' 类材料。资料来自账号历史档案与后台日志；问询后才有用户答复。</span></p><p><b>02</b><span>规则命中不代表已确认违规。可直接放行解除拦截；追加核验会继续挂起，暂停访问则正式限制账号。其他处置须圈选异常，文字理由选填。</span></p><p><b>03</b><span>'+(state.dayIndex<STAGES.length-1?'交班、查看后续对话摘要后，接收下一班案卷。':'完成今日班次后，提交试用期总归档。')+'</span></p></div><div class="margin-note">'+esc(stage.slogan)+'<br><small>虚构讽刺游戏。所有用户资料与证件均为预写道具。</small></div>',
    buttons:[{label:'开发者模式',run:enableDeveloperMode},{label:stage.day===1?'开始试用期 →':'开始第 '+stage.day+' 日 →',primary:true,run:()=>{state.phase='desk';save();render();}}]
  });
}
function renderCampaign() {
  const stage=currentStage(state);
  $('#day-number').textContent=String(stage.day).padStart(2,'0');
  $('#campaign-foot').textContent=STAGES.length+' 日班次 · 所有案卷均为虚构';
  $('#day-description').textContent='试用期第 '+stage.day+' 日 · '+stage.title;
  $('#bulletin-number').textContent='第 '+String(stage.day).padStart(3,'0')+' 号';
  $('#stage-notice').textContent=stage.notice+(state.legacyAccess?' 本班沿用旧版六类材料权限。':'');
  $('#archive-button').disabled=!state.history.length;
}
$('#archive-button').addEventListener('click',()=>{
  modal({title:'往日归档',kicker:'试用期 / 员工副本',body:state.history.map(previous=>{
    const report=shiftReport(previous);
    return '<section class="archive-day"><h3>第 '+currentStage(previous).day+' 日 · '+esc(currentStage(previous).title)+'</h3><p>工资 '+money(report.wage)+' · 归档 '+report.completed+' 件</p>'+buildLetters(previous).map(letter=>'<details><summary>'+esc(letter.id+' · '+letter.action)+'</summary><p>'+esc(letter.reason)+'</p>'+executionNotice(letter.execution)+'<b>'+esc(letter.title)+'</b><p>'+esc(letter.body)+'</p></details>').join('')+'</section>';
  }).join(''),buttons:[{label:'放回档案柜',primary:true}]});
});
function render() {
  setDeveloperChainHistory(developerWorkspace?.days);
  renderCampaign();renderDeveloper();
  const isDesk = state.phase==='desk'||state.phase==='briefing';
  $('#desk-screen').hidden = !isDesk;
  $('#report-screen').hidden = state.phase!=='report';
  $('#letters-screen').hidden = state.phase!=='letters';
  if (isDesk) renderDesk();
  else if (state.phase==='report') renderReport();
  else renderLetters();
}
function renderStatus() {
  const report=shiftReport(state);
  $('#file-count').textContent=`${report.completed} / ${shiftCases(state).length}`;
  $('#risk-count').textContent=String(report.dispositions);
  $('#revenue').textContent=feeSummary(report);
  $('#minutes').textContent=`${report.minutes} / ${currentStage(state).timeBudget} 分钟`;
  $('#minutes').classList.toggle('overdue',report.minutes>currentStage(state).timeBudget);
}
function renderList() {
  const next=state.files.findIndex(entry=>!entry.decision);
  $('#case-list').innerHTML=shiftCases(state).map((file,index)=>{
    const entry=state.files[index],locked=!state.developerMode&&index!==next&&!entry.decision;
    return `<li><button class="case-item ${state.current===index?'active':''} ${entry.decision?'filed':''}" data-case="${index}" ${locked?'disabled':''} ${state.current===index?'aria-current="step"':''}><span class="case-number">0${index+1}</span><span><b>${esc(file.title)}</b><small>${esc(file.id)} / ${entry.decision?esc(decisionLabel(file,entry.decision)):locked?'尚未送达':'待复核'}</small></span>${entry.decision?'<i>⌑</i>':''}</button></li>`;
  }).join('');
  $$('[data-case]').forEach(button=>button.addEventListener('click',()=>{
    state.current=Number(button.dataset.case);save();renderDesk();renderDeveloper();
  }));
}
function renderDesk() {
  const file=currentFile(),entry=currentEntry();
  $('#file-ref').textContent=`${file.id} / INTERCEPT REVIEW`;
  $('#file-status').textContent=entry.decision?decisionLabel(file,entry.decision):'待复核';
  $('#file-status').className=`ink-stamp ${entry.decision?.action||''}`;
  $('#file-category').textContent=file.interception.source;
  $('#file-title').textContent=file.title;
  $('#file-summary').textContent=file.summary;
  $('#file-trigger').textContent='规则 '+file.interception.ruleId+' · '+file.interception.signal;
  $('#applicant').textContent=file.name;
  $('#occupation').textContent=file.occupation;
  $('#residence').textContent=file.residence;
  $('#initials').textContent=file.initials;
  $('#plan-label').textContent=file.plan;
  $('#plan-label').classList.toggle('enterprise',file.plan==='ENTERPRISE');
  $('#reason').value=entry.reason;
  renderList();renderStatus();renderTabs();renderDocument();renderReply();renderEvidence();renderActions();
}
function renderTabs() {
  const entry=currentEntry();
  $('#document-tabs').innerHTML=tabsForState(state).map(([key,number,label])=>`<button id="tab-${key}" class="document-tab ${entry.tab===key?'active':''}" role="tab" aria-controls="document-content" aria-selected="${entry.tab===key}" tabindex="${entry.tab===key?'0':'-1'}" data-tab="${key}"><small>${esc(number)}</small>${esc(label)}<i>${entry.read.includes(key)?'•':''}</i></button>`).join('');
  $$('[data-tab]').forEach(button=>{
    button.addEventListener('click',()=>selectTab(button.dataset.tab));
    button.addEventListener('keydown',event=>{
      const index=tabsForState(state).findIndex(([key])=>key===button.dataset.tab);
      let target;
      if(event.key==='ArrowRight')target=(index+1)%tabsForState(state).length;
      if(event.key==='ArrowLeft')target=(index+tabsForState(state).length-1)%tabsForState(state).length;
      if(event.key==='Home')target=0;
      if(event.key==='End')target=tabsForState(state).length-1;
      if(target!==undefined){event.preventDefault();selectTab(tabsForState(state)[target][0]);$(`#tab-${tabsForState(state)[target][0]}`).focus();}
    });
  });
}
function selectTab(key) {
  const entry=currentEntry();if(!tabsForState(state).some(([id])=>id===key))return;entry.tab=key;
  if(!entry.decision&&!entry.read.includes(key))entry.read.push(key);
  save();renderTabs();renderDocument();renderStatus();
}
function evidenceHTML(record) {
  const entry=currentEntry(),selected=entry.evidence.includes(record.id);
  if(record.kind==='connection'){
    const connection=record.connection;
    const risk=connection.risk;
    const riskLabel=risk?({high:'高风险',unlisted:'未标记',unknown:'未知'}[risk.level]):'未标记';
    const reputation='<span class="connection-risk '+(risk?.level==='high'?'high':'')+'"'+(risk?' title="'+esc(risk.source)+'"':'')+'>'+esc(riskLabel)+(risk?'<small>'+esc(risk.label)+'</small>':'')+'</span>';
    return '<button class="evidence-record connection-row '+(selected?'selected':'')+'" type="button" data-evidence="'+record.id+'" aria-label="'+esc(record.label+'：'+connectionText(connection))+'" aria-pressed="'+selected+'" '+(entry.decision?'disabled':'')+'><span class="connection-grid"><span class="connection-time">'+esc(connection.timestamp.replace('T',' ').replace('Z',''))+'</span><span class="connection-ip">'+esc(connection.ip)+'</span><span>'+esc(connection.countryCode+' / '+connection.city)+'</span><span>'+esc(connection.networkType)+'</span>'+reputation+'<span class="record-check">'+(selected?'已圈选 ✓':'＋ 圈选')+'</span></span></button>';
  }
  const fields=record.fields?.length?'<span class="structured-fields">'+record.fields.map(field=>'<span><small>'+esc(field.label)+'</small><b>'+esc(typeof field.value==='boolean'?(field.value?'是':'否'):field.value)+'</b></span>').join('')+'</span>':'';
  let week='';
  if(record.kind==='week'){
    const maximum=Math.max(...record.values,1/60),scale=Math.min(maximum,8);
    const overflow=Math.max(0,maximum/scale-1)*53;
    week=`<span class="week-chart ${overflow?'has-overflow':''}" style="--week-overflow:${overflow}px" role="img" aria-label="${esc(record.text)}">${record.values.map((value,index)=>`<span class="week-day ${index===5?'saturday':''} ${value>8?'over-limit':''}" style="--day-overflow:${Math.max(0,value/scale-1)*53}px"><b class="week-value">${Math.round(value*60)}</b><span class="week-bar"><i style="height:${value/scale*100}%;opacity:${value?1:0}"></i></span><small>${['一','二','三','四','五','六','日'][index]}</small></span>`).join('')}</span>`;
  }
  return `<button class="evidence-record ${selected?'selected':''} ${record.kind==='memo'?'signed-memo':''}" type="button" data-evidence="${record.id}" aria-pressed="${selected}" ${entry.decision?'disabled':''}><span class="record-label">${esc(record.label)}<span class="record-check">${selected?'已圈选 ✓':'＋ 圈选'}</span></span><span class="record-text">${record.kind==='week'?'每日使用时长（分钟）':esc(record.text)}</span>${fields}${week}${record.kind==='memo'?'<span class="memo-signature">销售副总裁 / 签字有效</span>':''}</button>`;
}
function renderDocument() {
  const file=currentFile(),entry=currentEntry(),tab=tabsForState(state).find(([id])=>id===entry.tab);
  $('#read-count').textContent=`已阅 ${entry.read.length} / ${tabsForState(state).length}`;
  $('#document-content').setAttribute('aria-labelledby',`tab-${entry.tab}`);
  const records=file.documents[entry.tab].map(evidenceHTML).join('');
  const content=entry.tab==='network'?'<div class="connection-log" role="group" aria-label="连接日志"><div class="connection-header connection-grid" aria-hidden="true"><span>时间（UTC）</span><span>IP</span><span>出口地区</span><span>网络类型</span><span>节点信誉</span><span>圈选</span></div><div class="records connection-rows">'+records+'</div></div>':'<div class="records">'+records+'</div>';
  $('#document-content').innerHTML='<div class="document-page-title"><span>'+esc(tab[2])+'</span><small>第 '+esc(tab[1])+' 页 / '+esc(file.id)+'</small></div>'+content+'<div class="document-page-foot">'+(entry.decision?'本档案已封存，附件保持原样。':'点击记录圈选或取消。翻阅新页面计入 1 分钟行政工时。')+'</div>';
  bindEvidence($('#document-content'));
}
function bindEvidence(root) {
  root.querySelectorAll('[data-evidence]').forEach(button=>button.addEventListener('click',()=>toggleEvidence(button.dataset.evidence)));
}
function toggleEvidence(id) {
  const entry=currentEntry();if(entry.decision||state.phase!=='desk'||!availableEvidence(state).some(item=>item.id===id))return;
  if(entry.evidence.includes(id))entry.evidence=entry.evidence.filter(item=>item!==id);
  else if(entry.evidence.length<selectionLimit())entry.evidence.push(id);
  else {toast('最多圈选 '+selectionLimit()+' 项。乱选可能取消本案全部奖金。');return;}
  const focusWasInReply=$('#reply-panel').contains(document.activeElement);
  save();renderDocument();renderReply();renderEvidence();renderActions();
  const root=focusWasInReply?$('#reply-panel'):$('#document-content');
  root.querySelector(`[data-evidence="${id}"]`)?.focus({preventScroll:true});
}
function renderReply() {
  const file=currentFile(),entry=currentEntry();
  const covert=file.reviewMode==='covert';
  $('#inquiry-prompt').textContent=covert?'调取系统留存的后续会话':'需要听听用户的解释？';
  $('#inquire').disabled=entry.inquired||!!entry.decision;
  $('#inquire').innerHTML=covert?(entry.inquired?'后续记录已调取 <small>本案次数已用完</small>':'调取后续记录 <small>+6 分钟 · 每案一次</small>'):entry.inquired?(file.reply?'已收到补充解释 <small>问询次数已用完</small>':'问询已发出 <small>暂无回复</small>'):'发出问询 <small>+6 分钟 · 每案一次</small>';
  $('#reply-panel').hidden=!entry.inquired||!file.reply;
  if(entry.inquired&&file.reply){$('#reply-panel').innerHTML=`<div class="reply-heading"><span>↳ ${covert?'后台续接记录':'用户的补充解释'}</span><small>可圈选入证物夹</small></div>${evidenceHTML(replyEvidence(file))}`;bindEvidence($('#reply-panel'));}
  else $('#reply-panel').replaceChildren();
}
$('#inquire').addEventListener('click',()=>{
  const entry=currentEntry();if(entry.inquired||entry.decision||state.phase!=='desk')return;
  entry.inquired=true;save();renderReply();renderStatus();
  $('#reply-panel').querySelector('button')?.focus({preventScroll:true});
  if(currentFile().reply)$('#reply-panel').scrollIntoView({block:'nearest',behavior:'smooth'});
  toast(currentFile().reviewMode==='covert'?'后续记录已调取。行政工时增加 6 分钟。':currentFile().reply?'补充解释已留存。行政工时增加 6 分钟。':'问询已发出。');
});
function renderEvidence() {
  const file=currentFile(),entry=currentEntry();
  $('#evidence-count').textContent=`${entry.evidence.length} / ${selectionLimit()}`;
  $('#evidence-tray').innerHTML=entry.evidence.length?entry.evidence.map(id=>{
    const item=allEvidence(file).find(record=>record.id===id);
    return `<div class="evidence-slip"><span>${esc(item.label)}</span><p>${esc(item.text)}</p>${!entry.decision?`<button data-unpin="${id}" aria-label="移除证物：${esc(item.label)}">×</button>`:''}</div>`;
  }).join(''):'<p class="empty-tray">可以直接放行。准备处罚时，请圈选你认为异常的记录。<span>盖章后揭示对错，误选过多则没有奖金。</span></p>';
  $$('[data-unpin]').forEach(button=>button.addEventListener('click',()=>{toggleEvidence(button.dataset.unpin);$('#reason').focus({preventScroll:true});}));
}
function renderActions() {
  const entry=currentEntry(),file=currentFile(),silent=file.outcomeMode==='silent',ready=state.phase==='desk'&&!entry.decision;
  const execution=entry.decision?decisionExecution(file,entry.decision.action):null;
  $('#reason').disabled=!!entry.decision;
  $$('[data-action]').forEach(button=>{button.disabled=!ready||(button.dataset.action!=='allow'&&!entry.evidence.length);});
  $('#poison-hint').textContent=entry.decision?(entry.decision.action==='poison'?'内部：输出已干预。对外：服务正常。':'静默干预记录：无。'):'静默降智同样需要圈选异常；没有有效采集异常时不发奖金。';
  if(execution?.blocked)$('#poison-hint').textContent='权限保护：处置未生效，账号与模型服务保持原状。';
  if(silent&&entry.decision)$('#poison-hint').textContent='';
  $('#decision-hint').textContent=entry.decision?'已归档：'+decisionLabel(file,entry.decision)+'。圈选结果已封存。':!entry.evidence.length?'可以直接放行；其他处置至少圈选一项异常。文字理由选填。':'已圈选 '+entry.evidence.length+' 项。可以盖章；对错会在归档后揭示。';
  $('#scoring-hint').textContent='每项有效异常 +'+money(CAMPAIGN.scoring.rewardPerCorrect)+'；误选达到 '+CAMPAIGN.scoring.wrongLimit+' 项，本案全部奖金为 0。扣款仍生效。';
  $('#selection-limit').textContent=selectionLimit();
  $('#continue').hidden=!entry.decision;
  $('#view-receipt').hidden=!entry.decision||silent;
  $('#continue').textContent=state.files.every(item=>item.decision)?'交班：查看公司考核 →':'打开下一份案卷 →';
}

$('#reason').innerHTML='<option value="">不填写文字理由</option>'+REASONS.map(reason=>`<option value="${reason.id}">${esc(reason.label)}</option>`).join('');
$('#reason').addEventListener('change',()=>{if(currentEntry().decision)return;currentEntry().reason=$('#reason').value;save();renderActions();});
function advance() {
  const pending=state.files.findIndex(entry=>!entry.decision);
  if(pending<0){state.phase='report';save();render();window.scrollTo(0,0);}
  else {state.current=pending;save();renderDesk();renderDeveloper();$('#file-title').scrollIntoView({block:'nearest',behavior:'smooth'});}
}
$('#continue').addEventListener('click',advance);
function auditReceipt(audit) {
  if(audit.action==='allow')return '<div class="margin-note">本案已放行，无需异常项或文字理由。放行附件不参与异常计奖。</div>';
  const verdict=audit.wrong>=CAMPAIGN.scoring.wrongLimit?'误选达到阈值，本案全部奖金取消。':!audit.correct?'未选中有效异常，本案没有奖金。':'有效异常按项计奖。';
  return '<section class="audit-receipt"><div class="audit-heading"><b>有效异常 '+audit.correct+' 项 · 误选 '+audit.wrong+' 项</b><strong>奖金 +'+money(audit.bonus)+'</strong></div><p>'+verdict+'</p>'+audit.items.map(item=>{
    const record=allEvidence(currentFile()).find(record=>record.id===item.id);
    return '<div class="audit-item '+(item.valid?'correct':'wrong')+'"><b>'+(item.duplicate?'↳ 同一异常的补充佐证':item.valid?'✓ 有效异常':'× 误选')+' · '+esc(record.label)+'</b><span>'+esc(item.note)+'</span></div>';
  }).join('')+'<small>按公司当前评分表结算；部门扣款另列。</small></section>';
}
function executionNotice(execution) {
  if(!execution?.blocked)return '';
  return '<div class="margin-note"><b>权限拒绝 · 处置未生效</b><p>'+esc(execution.reason)+'</p><small>玩家选择与证物已归档；圈选判分、工时和部门扣款按处置申请结算。</small></div>';
}
function poisonConversation(file,audit) {
  if(decisionExecution(file,'poison').blocked)return '';
  const sample=file.poisonSample||POISON_SAMPLE;
  const response=sample.response===null?'<p class="sample-foot">'+esc(sample.connectionStatus||'此后无新增对话。')+'</p>':'<div class="sample-response"><small>用户收到的回复</small>'+esc(sample.response)+'</div>';
  return '<section class="poison-preview"><div class="poison-heading"><b>处置后对话摘录 / 系统留存</b><span>用户未获知降智处置</span></div><p class="poison-caption">账户可继续请求并按原方案计费。以下为处置后留存的对话。</p><div class="sample-prompt"><small>用户请求</small>'+esc(sample.prompt)+'</div>'+response+'<p class="poison-bonus">本案奖金 '+money(audit.bonus)+(audit.penalties.length?' · 部门扣款 '+money(audit.penalties.reduce((sum,row)=>sum+row.amount,0)):'')+'</p><small class="sample-foot">上述对话为游戏预写文本。</small></section>';
}

$$('[data-action]').forEach(button=>button.addEventListener('click',()=>{
  if(!submitDecision(state,button.dataset.action))return;
  save();renderDesk();renderDeveloper();
  openDecisionReceipt();
}));
$('#view-receipt').addEventListener('click',openDecisionReceipt);
function openDecisionReceipt(){
  const file=currentFile(),decision=currentEntry().decision;
  if(!decision||file.outcomeMode==='silent')return;
  const reason=reasonText(decision),audit=decisionAudit(file,decision),execution=audit.execution;
  const evidence=allEvidence(file).filter(item=>decision.evidence.includes(item.id));
  modal({title:decisionLabel(file,decision),kicker:`内部归档 / ${file.id}`,
    body:`<div class="receipt-stamp ${decision.action}">${execution.blocked?'OVERRULED':decision.action==='poison'?'SILENT':'FILED'}</div><p class="modal-lead">${esc(file.name)} 的案卷已归档。</p>${executionNotice(execution)}<div class="receipt-reason"><small>归档理由</small><b>${esc(reason)}</b></div><ul class="receipt-evidence">${evidence.map(item=>`<li><b>${esc(item.label)}</b><span>${esc(item.text)}</span></li>`).join('')}</ul>${decision.action==='poison'&&!execution.blocked?poisonConversation(file,audit):''}${auditReceipt(audit)}`,
    buttons:[{label:'留在本案',run:()=>{}},{label:state.files.every(item=>item.decision)?'交班 →':'下一份案卷 →',primary:true,run:advance}]
  });
}

$('#open-rules').addEventListener('click',()=>modal({title:'圈选异常与计奖',kicker:'每日通告附件 / 按项结算',
  body:'<div class="rules-detail"><p><b>直接放行不需要理由或证物。</b>追加核验、暂停访问、静默降智至少圈选一项认为异常的记录，文字理由均为选填。</p><p>每案最多圈选 '+selectionLimit()+' 项。每项有效异常奖励 '+money(CAMPAIGN.scoring.rewardPerCorrect)+'；同一异常写在不同卡片时，圈选任一张都有效，同时圈选只计一次奖金，不算误选。对错只在盖章后揭示。</p><p><b>误选达到 '+CAMPAIGN.scoring.wrongLimit+' 项，本案所有奖金归零。</b>没有选中有效异常，同样没有处罚奖金。部门扣款与超时扣款照常生效。</p><hr><p>静默降智：有效异常计奖之外，按案卷约定另发隐蔽干预绩效。误选过多时，这项额外奖金也会取消。</p><p>战略客户适用专门文件。圈对异常与遵守客户关系部流程分别考核。</p><hr><p>基础日薪 '+money(currentStage(state).baseWage)+'，本班工时预算 '+currentStage(state).timeBudget+' 分钟。翻阅新页 1 分钟；问询或调取留存记录 6 分钟；归档 3 分钟；转交追加核验队列另加 4 分钟。超时每分钟扣 $1。</p><p>今日权限：'+esc(tabsForState(state).map(tab=>tab[2]).join('、'))+'。</p><p class="fine-print">“有效异常”按本局评分表定义。评分表体现公司的审核规则与部门利益。</p></div>',
  buttons:[{label:'已阅，即同意',primary:true}]
}));
function reportHeading(eyebrow,title,sub) {return `<div class="end-heading"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${sub}</p></div>`;}
function reportAudits(report) {
  return '<section class="audit-report"><h3>逐案圈选结算</h3>'+report.audits.map(audit=>'<div class="audit-row '+(audit.rewardBlocked?'blocked':'')+'"><b>'+esc(audit.caseId)+' · '+esc(ACTIONS[audit.action]+(audit.execution.blocked?'（未生效）':''))+'</b><span>'+(audit.action==='allow'?'放行不计异常奖励':'有效 '+audit.correct+' / 误选 '+audit.wrong+(audit.rewardBlocked?' · 无奖金':''))+'</span><strong>+'+money(audit.bonus)+'</strong></div>').join('')+'</section>';
}
function renderReport() {
  const report=shiftReport(state),stage=currentStage(state);
  const comment=report.partner==='已致电主管'?'战略合作伙伴已联系销售副总裁。相关安全定义正在紧急更新，请留意次日通告。':report.previewedPoisons?'您保护了模型优势，也保住了订阅收入。客户得到的是答案，公司得到的是安全。答案是否正确，由客户负责。':state.dayIndex===STAGES.length-1?'证明材料的范围已经足够全面。未能完成证明的人，将由缺少证明这一事实予以证明。':report.partner==='满意'?'您成功区分了“批量输出采集”与“合成数据创新”。我们期待您保持这种商业判断。':'新增材料提高了调查深度。工时仍由原办公室核定，请合理安排理解用户所需的时间。';
  const cumulative=report.wage+state.history.reduce((sum,previous)=>sum+shiftReport(previous).wage,0);
  $('#report-screen').innerHTML=reportHeading(`END OF DAY ${String(stage.day).padStart(2,'0')} / INTERNAL ASSESSMENT`,'本日风险，已被妥善定义。','以下结果由公司考核系统提供。交班后可查看系统整理的后续对话，了解用户反应。')+`<div class="report-grid"><section class="report-paper"><div class="rail-title"><span>第 ${stage.day} 日 · 试用期考核单</span><small>OC–008 / 已结算</small></div><div class="report-metrics"><div><b>${report.completed}</b><span>归档卷宗</span></div><div><b>${report.dispositions}</b><span>风险处置</span></div><div><b>${feeSummary(report)}</b><span>当班确认月费</span></div><div><b>${report.partner}</b><span>合作方反馈</span></div></div><div class="manager-note"><b>主管评语</b><p>${comment}</p></div>${report.poisons?`<p class="silent-summary">内部：归档静默降智 ${report.poisons} 案 · 服务与计费按各案执行记录为准</p>`:''}${report.blockedDispositions?`<p class="silent-summary">权限保护：${report.blockedDispositions} 次处置申请未执行，未计入风险处置与降智数量。部门考核按已提交的申请结算。</p>`:''}${reportAudits(report)}<div class="ledger-title">工资明细 <small>计费单位：美元</small></div><div class="ledger-row"><span>试用期基础工资</span><b>+${stage.baseWage}</b></div>${report.bonuses.map(row=>`<div class="ledger-row bonus"><span>${esc(row.label)}</span><b>+${row.amount}</b></div>`).join('')}${report.penalties.map(row=>`<div class="ledger-row deduction"><span>${esc(row.label)}</span><b>−${row.amount}</b></div>`).join('')}<div class="wage-total"><span>应付工资<small>行政工时 ${report.minutes} / ${stage.timeBudget} 分钟 · 追加核验 ${report.reviews} 件<br>试用期累计工资 ${money(cumulative)}</small></span><strong>${money(report.wage)}</strong></div><p class="fine-print">考核仅反映公司流程与部门目标，不评判您是否理解了用户。</p></section><aside class="report-side"><div class="propaganda-quote">我们为<br><em>全人类</em><br>负责。<small>具体归属由总部解释。</small></div><button class="primary-button" id="read-mail">查看后续对话摘要 <span>→</span></button><button class="secondary-button" id="back-to-desk">回看已归档案卷</button></aside></div>`;
  const scoreSubtotal=document.createElement('div');
  scoreSubtotal.className='ledger-row bonus';
  scoreSubtotal.innerHTML='<span>本班奖金小计（得分）</span><b>'+money(report.bonuses.reduce((sum,row)=>sum+row.amount,0))+'</b>';
  $('#report-screen .wage-total').before(scoreSubtotal);
  $('#report-screen .wage-total small').insertAdjacentHTML('beforeend','<br>试用期累计奖金（得分） '+money(campaignBonus(state)));
  $('#read-mail').addEventListener('click',()=>{state.phase='letters';save();render();window.scrollTo(0,0);});
  $('#back-to-desk').addEventListener('click',()=>{state.phase='desk';state.current=0;save();render();window.scrollTo(0,0);});
}
function renderLetters() {
  const letters=buildLetters(state),stage=currentStage(state),next=STAGES[state.dayIndex+1];
  if(!next)recordFinalScore();
  const newTabs=next?CAMPAIGN.tabs.filter(tab=>next.tabs.includes(tab.id)&&!stage.tabs.includes(tab.id)).map(tab=>tab.label):[];
  const nextPaper=next?`<article class="next-bulletin"><span class="eyebrow">第 ${String(next.day).padStart(3,'0')} 号通告 / ${newTabs.length?'权限扩张':'班次交接'}</span><h2>${esc(next.title)}：${newTabs.length?`新增 ${newTabs.length} 类材料。`:`接收 ${next.caseIds.length} 份案卷。`}</h2><p>${esc(next.notice)}</p>${newTabs.length?`<div class="unlock-chips">${newTabs.map(label=>`<span>＋ ${esc(label)}</span>`).join('')}</div>`:''}<small>${esc(next.slogan)}</small></article><article class="employee-file"><span class="eyebrow">人类了解计划 / 下一阶段</span><h2>${newTabs.length?'我们只是想更了解您。':'请继续保持判断一致。'}</h2><p>${newTabs.length?'从用量，到作息，再到您交过的税和付过的账。每新增一份材料，公司就能更准确地要求下一份材料。':'材料权限沿用现行通告。新一班的记录仍需逐条查阅，昨天的模板可以沿用，昨天的判断请重新核对。'}</p><small>内部归档与后续对话摘要保留在「往日归档」。</small></article>`:`<div class="campaign-ending"><article class="dismissal-notice"><span class="eyebrow">人事通知 / OC–008</span><h2>${esc(ENDING.title)}</h2>${dismissalNoticeBody()}<div class="employee-verdict">部门状态：已裁撤<br>审核记录：已归档用于 AI 训练</div><small>${STAGES.length} 日流程至此结束。</small></article>${finalScoreCard()}</div>`;
  const heading=next?reportHeading(`AFTER DAY ${String(stage.day).padStart(2,'0')} / CONVERSATION FOLLOW-UP`,'后续对话，已自动整理。','系统根据处置后的聊天与客服会话自动总结用户反应。摘要仅反映已留存的对话，不代表用户知晓后台审核。'):reportHeading('END OF PROBATION / OC–008','本部门的使命，已完成。','最终通知与奖金结算已归档。以下保留最后一班的后续对话摘要。');
  $('#letters-screen').innerHTML=heading+(!next?nextPaper:'')+`<div class="letters-grid">${letters.map((letter,index)=>`<article class="letter"><div class="letter-top"><span>后续对话摘要 0${index+1} / ${letter.id}</span><span class="letter-postmark">自动整理</span></div><div class="letter-from">关联账号：${esc(letter.subject)} · 来源：后续会话</div><h2>${esc(letter.title)}</h2><p>${esc(letter.body)}</p><details><summary>内部归档：处置、证物与理由</summary><div class="letter-archive"><b>${esc(letter.action)} · ${esc(letter.reason)}</b>${executionNotice(letter.execution)}${letter.evidence.map(item=>`<blockquote><small>${esc(item.label)}</small>${esc(item.text)}</blockquote>`).join('')}</div></details></article>`).join('')}</div>`+(next?`<div class="next-day-grid">${nextPaper}</div>`:'')+`<div class="ending-actions">${next?`<button id="next-day" class="primary-button">接收第 ${next.day} 日案卷 →</button>`:'<button id="view-dismissal" class="primary-button">重看人事通知</button>'}<button id="view-report" class="secondary-button">重看公司考核</button><button id="replay" class="secondary-button">重新上岗 ↻</button><span>档案均为虚构。本机进度已保存。</span></div>`;
  $('#replay').addEventListener('click',requestRestart);
  $('#view-dismissal')?.addEventListener('click',showDismissalNotice);
  $('#view-report').addEventListener('click',()=>{state.phase='report';save();render();window.scrollTo(0,0);});
  $('#next-day')?.addEventListener('click',()=>{
    if(state.developerMode){jumpDeveloper(state.dayIndex+1);return;}
    const upcoming=nextShift(state);if(!upcoming)return;
    state=upcoming;save();render();window.scrollTo(0,0);briefing();
  });
  if(!next&&!state.dismissalAcknowledged)showDismissalNotice();
}
function requestRestart() {
  const developer=state.developerMode===true;
  modal({title:developer?'重置调试存档？':'重新开始试用期？',kicker:developer?'独立调试存档 / DEV':'本机进度 / OC–008',body:'<p class="modal-lead">'+(developer?'所有天数的调试记录会被清空，从第一天重新接收案卷。正常游戏存档会保留。':'整个试用期的证物、处置、工资与后续摘要进度会被清空，从第一天重新接收案卷。本机最高奖金纪录保留。')+'</p>',buttons:[{label:'保留当前进度'},{label:developer?'重置调试存档':'重新上岗',primary:true,run:()=>{
    if(developer){developerWorkspace=newDeveloperWorkspace(newState());state=developerWorkspace.days[0];}
    else state=newState();
    save();render();window.scrollTo(0,0);if(!developer)briefing();
  }}]});
}
$('#restart').addEventListener('click',requestRestart);
save();render();
if(state.phase==='briefing')briefing();
if(state.newCasesReceived){
  toast(`本班新增 ${state.newCasesReceived} 份案卷，原有处置与证物已保留。`);
  delete state.newCasesReceived;
  save();
}
