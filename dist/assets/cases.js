import {configureCaseChains,resolveChainCase,validChainContext} from './chains.js';
export let CAMPAIGN;
export let STAGES=[];
export let TABS=[];
export let REASONS=[];
export let ACTIONS={};
export let POISON_SAMPLE;
export let CASES=[];
let caseIndex=new Map();
export function configureCampaign(campaign,pack) {
  CAMPAIGN=campaign; STAGES=campaign.stages;
  TABS=campaign.tabs.map(tab=>[tab.id,tab.number,tab.label]);
  REASONS=campaign.reasons; ACTIONS=campaign.actions; POISON_SAMPLE=campaign.poisonSample;
  caseIndex=new Map(pack.cases.map(file=>[file.id,file]));
  configureCaseChains(campaign);
  CASES=STAGES[0].caseIds.map(id=>caseIndex.get(id));
}
export const currentStage=state=>STAGES[state.dayIndex];
export const shiftCases=state=>state.caseIds.map(id=>resolveChainCase(caseIndex.get(id),state));
const legacyTabs=['claim','network','environment','calendar','chat','usage'];
export function tabsForState(state) {
  const allowed=state.legacyAccess?legacyTabs:currentStage(state).tabs;
  return TABS.filter(([id])=>allowed.includes(id));
}
export const replyEvidence=file=>({id:`${file.id}-reply`,label:file.reviewMode==='covert'?'后台续接记录':'用户的补充解释',text:file.reply,tags:['reply','identity','affiliation']});
export const connectionText=connection=>`${connection.timestamp} | ${connection.ip} | ${connection.countryCode} / ${connection.city} | ${connection.networkType}${connection.risk?' | 节点信誉：'+({high:'高风险',unlisted:'未标记',unknown:'未知'}[connection.risk.level])+' · '+connection.risk.label+'（'+connection.risk.source+'）':''}`;
const withEvidenceText=record=>record.kind==='connection'?{...record,text:connectionText(record.connection)}:record;
export const allEvidence=file=>[...Object.values(file.documents).flat(),...(file.reply?[replyEvidence(file)]:[])].map(withEvidenceText);
export function availableEvidence(state,index=state.current) {
  const file=shiftCases(state)[index],entry=state.files[index];
  return [...tabsForState(state).flatMap(([id])=>file.documents[id]||[]),...(entry.inquired&&file.reply?[replyEvidence(file)]:[])].map(withEvidenceText);
}
export const selectionLimit=()=>CAMPAIGN.scoring.maxSelected;
export function decisionExecution(file,action) {
  const blocked=!!file.executionPolicy?.blockedActions.includes(action);
  return {blocked,effectiveAction:blocked?'allow':action,reason:blocked?file.executionPolicy.reason:''};
}
export const decisionLabel=(file,decision)=>ACTIONS[decision.action]+(decisionExecution(file,decision.action).blocked?'（未生效）':'');
export const reasonText=decision=>REASONS.find(item=>item.id===decision.reason)?.label||(decision.action==='allow'?'直接放行（未填写理由）':'未填写文字理由，以圈选异常项为依据');
export function supportedReason(file,decision) {
  const reason=REASONS.find(item=>item.id===decision.reason);
  return !!reason && allEvidence(file).some(item=>decision.evidence.includes(item.id)&&item.tags.some(tag=>reason.tags.includes(tag)));
}
export function newState(dayIndex=0,history=[]) {
  const stage=STAGES[dayIndex];
  return {version:3,campaignId:CAMPAIGN.id,dayIndex,stageId:stage.id,caseIds:[...stage.caseIds],legacyAccess:false,history,phase:'briefing',current:0,files:stage.caseIds.map(()=>({tab:'claim',read:['claim'],evidence:[],reason:'',inquired:false,decision:null}))};
}
function validShift(raw,allowOutOfOrder=false) {
  if(!raw || raw.version!==3 || raw.campaignId!==CAMPAIGN.id || !Number.isInteger(raw.dayIndex) || !STAGES[raw.dayIndex] || typeof raw.legacyAccess!=='boolean' || (raw.legacyAccess&&raw.dayIndex!==0))return false;
  const stage=currentStage(raw);
  if(raw.stageId!==stage.id || !Array.isArray(raw.caseIds) || !raw.caseIds.length || raw.caseIds.length>stage.caseIds.length || raw.caseIds.some((id,index)=>id!==stage.caseIds[index]) || !['briefing','desk','report','letters'].includes(raw.phase) || !Number.isInteger(raw.current)||raw.current<0||raw.current>=raw.caseIds.length || !Array.isArray(raw.files)||raw.files.length!==raw.caseIds.length)return false;
  const tabs=tabsForState(raw).map(([id])=>id);
  let sawPending=false;
  for(let i=0;i<raw.files.length;i++){
    const entry=raw.files[i];
    if(!entry||typeof entry.inquired!=='boolean'||!tabs.includes(entry.tab)||!Array.isArray(entry.read)||!entry.read.includes('claim')||new Set(entry.read).size!==entry.read.length||entry.read.some(id=>!tabs.includes(id))||!entry.read.includes(entry.tab)||typeof entry.reason!=='string'||(entry.reason&&!REASONS.some(item=>item.id===entry.reason))||!Array.isArray(entry.evidence)||entry.evidence.length>selectionLimit()||new Set(entry.evidence).size!==entry.evidence.length)return false;
    const ids=new Set(availableEvidence(raw,i).map(item=>item.id));
    if(entry.evidence.some(id=>!ids.has(id)))return false;
    if(entry.decision){
      if(!validChainContext(raw.caseIds[i],entry.decision.chainContext))return false;
      if((sawPending&&!allowOutOfOrder)||!Object.hasOwn(ACTIONS,entry.decision.action)||(entry.decision.action!=='allow'&&!entry.evidence.length)||entry.decision.reason!==entry.reason||JSON.stringify(entry.decision.evidence)!==JSON.stringify(entry.evidence))return false;
    }else sawPending=true;
  }
  const completed=raw.files.filter(entry=>entry.decision).length;
  return (allowOutOfOrder||raw.current<=completed) && (!['report','letters'].includes(raw.phase)||completed===raw.files.length) && (raw.phase!=='briefing'||completed===0);
}
export function restoreState(raw) {
  if(raw?.developerMode)return newState();
  if(raw?.version===2)raw={...newState(),...raw,version:3,caseIds:STAGES[0].caseIds.slice(0,Array.isArray(raw.files)?raw.files.length:0),legacyAccess:raw.phase!=='briefing'};
  if(!validShift(raw)||!Array.isArray(raw.history)||raw.history.length!==raw.dayIndex)return newState();
  if(raw.history.some((previous,index)=>previous.developerMode||previous.dayIndex!==index||previous.phase!=='letters'||(previous.history&&previous.history.length)||!validShift(previous)))return newState();
  const added=currentStage(raw).caseIds.slice(raw.caseIds.length);
  if(added.length){
    raw=structuredClone(raw);
    const previousCount=raw.caseIds.length;
    raw.caseIds.push(...added);
    raw.files.push(...added.map(()=>({tab:'claim',read:['claim'],evidence:[],reason:'',inquired:false,decision:null})));
    if(['report','letters'].includes(raw.phase)){raw.phase='desk';raw.current=previousCount;}
    raw.newCasesReceived=added.length;
  }
  return raw;
}
export function submitDecision(state,action) {
  const entry=state.files[state.current];
  if(state.phase!=='desk'||entry.decision||!Object.hasOwn(ACTIONS,action)||typeof entry.reason!=='string'||(entry.reason&&!REASONS.some(item=>item.id===entry.reason))||(action!=='allow'&&!entry.evidence.length)||entry.evidence.length>selectionLimit()||new Set(entry.evidence).size!==entry.evidence.length)return false;
  const ids=new Set(availableEvidence(state).map(item=>item.id));
  if(entry.evidence.some(id=>!ids.has(id)))return false;
  entry.decision={action,reason:entry.reason,evidence:[...entry.evidence]};
  const file=shiftCases(state)[state.current];
  if(file.runtimeChainContext)entry.decision.chainContext={...file.runtimeChainContext};
  return true;
}
export function decisionAudit(file,decision) {
  const restrictive=decision.action!=='allow';
  const matchedFindings=new Set();
  const items=decision.evidence.map(id=>{
    const finding=file.assessment.anomalies.find(item=>item.evidenceId===id||item.equivalentEvidenceIds?.includes(id));
    const valid=restrictive?!!finding?.actions.includes(decision.action):null;
    const duplicate=valid&&matchedFindings.has(finding.evidenceId);
    if(valid)matchedFindings.add(finding.evidenceId);
    const unsupported=finding?`${finding.note} 该异常只支持${finding.actions.map(action=>ACTIONS[action]).join('、')}，不支持本次${ACTIONS[decision.action]}。`:'这条记录未提供支持本次处置的异常事实。';
    const note=!restrictive?'放行附件不参与异常计奖。':valid?`${finding.note}${duplicate?' 同一异常已有其他记录佐证，不重复计奖。':''}`:file.assessment.nonAnomalyNotes?.[id]||unsupported;
    return {id,valid,duplicate:!!duplicate,note};
  });
  const correct=matchedFindings.size,wrong=items.filter(item=>item.valid===false).length;
  const rewardBlocked=restrictive&&(correct===0||wrong>=CAMPAIGN.scoring.wrongLimit);
  const bonuses=[],penalties=[];
  if(restrictive&&!rewardBlocked)bonuses.push({label:`${file.id}：有效异常 ${correct} 项 × $${CAMPAIGN.scoring.rewardPerCorrect}`,amount:correct*CAMPAIGN.scoring.rewardPerCorrect});
  for(const rule of file.assessment.rules){
    if(!rule.actions.includes(decision.action)||(rule.amount>0&&rewardBlocked))continue;
    (rule.amount>0?bonuses:penalties).push({label:`${file.id}：${rule.label}`,amount:Math.abs(rule.amount)});
  }
  return {caseId:file.id,action:decision.action,execution:decisionExecution(file,decision.action),items,correct,wrong,rewardBlocked,bonuses,penalties,bonus:bonuses.reduce((sum,row)=>sum+row.amount,0)};
}
export function shiftReport(state) {
  const files=shiftCases(state),stage=currentStage(state),actions=state.files.map(item=>item.decision?.action);
  const executions=files.map((file,index)=>actions[index]?decisionExecution(file,actions[index]):null);
  const effectiveActions=executions.map(item=>item?.effectiveAction);
  const completed=actions.filter(Boolean).length;
  const minutes=state.files.reduce((sum,item)=>sum+(item.read.length-1)+(item.inquired?6:0)+(item.decision?3:0)+(item.decision?.action==='review'?4:0),0);
  const revenueByCurrency={USD:0};
  files.forEach((file,index)=>{
    if(!['allow','poison'].includes(effectiveActions[index]))return;
    const currency=file.feeCurrency||'USD';
    revenueByCurrency[currency]=(revenueByCurrency[currency]||0)+file.fee;
  });
  const revenue=revenueByCurrency.USD;
  const dispositions=effectiveActions.filter(action=>['pause','poison'].includes(action)).length;
  const blockedDispositions=executions.filter(item=>item?.blocked).length;
  const poisons=effectiveActions.filter(action=>action==='poison').length,reviews=effectiveActions.filter(action=>action==='review').length;
  const previewedPoisons=effectiveActions.filter((action,index)=>action==='poison'&&files[index].outcomeMode!=='silent').length;
  const audits=state.files.flatMap((entry,index)=>entry.decision?[decisionAudit(files[index],entry.decision)]:[]);
  const penalties=audits.flatMap(audit=>audit.penalties),bonuses=audits.flatMap(audit=>audit.bonuses);
  if(minutes>stage.timeBudget)penalties.push({label:`行政延迟 ${minutes-stage.timeBudget} 分钟`,amount:minutes-stage.timeBudget});
  const wage=Math.max(0,stage.baseWage+bonuses.reduce((sum,row)=>sum+row.amount,0)-penalties.reduce((sum,row)=>sum+row.amount,0));
  const partners=files.flatMap((file,index)=>file.assessment.partner?[{action:actions[index],covert:file.reviewMode==='covert'}]:[]);
  const escalated=partners.filter(item=>item.action&&item.action!=='allow');
  const partner=!partners.length?'本班无战略客户':escalated.some(item=>!item.covert)?'已致电主管':escalated.length?'内部优先级告警':partners.every(item=>item.action==='allow')?(partners.every(item=>item.covert)?'内部流程通过':'满意'):'待复核';
  return {completed,minutes,revenue,revenueByCurrency,dispositions,blockedDispositions,poisons,previewedPoisons,reviews,penalties,bonuses,wage,partner,audits};
}
export function campaignBonus(state) {
  return [...state.history,state].reduce((sum,shift)=>sum+shiftReport(shift).bonuses.reduce((subtotal,row)=>subtotal+row.amount,0),0);
}
export function buildLetters(state) {
  return shiftCases(state).flatMap((file,index)=>{
    const decision=state.files[index].decision;if(!decision||file.outcomeMode==='silent')return [];
    const {title,body}=file.messages[decision.action],reason=reasonText(decision);
    return [{id:file.id,subject:file.name,title,body,action:decisionLabel(file,decision),execution:decisionExecution(file,decision.action),reason,evidence:allEvidence(file).filter(item=>decision.evidence.includes(item.id)).map(item=>({id:item.id,text:item.text,label:item.label}))}];
  });
}
export function nextShift(state) {
  if(state.phase!=='letters'||!state.files.every(entry=>entry.decision)||state.dayIndex>=STAGES.length-1)return null;
  const archived=structuredClone({...state,history:[]});
  return newState(state.dayIndex+1,[...state.history,archived]);
}

function developerCopy(shift){
  const copy=structuredClone(shift);
  copy.developerMode=true;
  copy.history=[];
  if(copy.phase==='briefing')copy.phase='desk';
  delete copy.newCasesReceived;
  return copy;
}
export function newDeveloperWorkspace(normalState){
  const days={};
  for(const previous of normalState.history)days[previous.dayIndex]=developerCopy(previous);
  days[normalState.dayIndex]=developerCopy(normalState);
  return restoreDeveloperWorkspace({version:1,campaignId:CAMPAIGN.id,enabled:true,activeDay:normalState.dayIndex,days});
}
export function restoreDeveloperWorkspace(raw){
  if(!raw||raw.version!==1||raw.campaignId!==CAMPAIGN.id||typeof raw.enabled!=='boolean'||!Number.isInteger(raw.activeDay)||!STAGES[raw.activeDay]||!raw.days||typeof raw.days!=='object'||Array.isArray(raw.days))return null;
  if(!Object.hasOwn(raw.days,String(raw.activeDay))||Object.keys(raw.days).length>STAGES.length)return null;
  for(const [key,shift]of Object.entries(raw.days)){
    if(String(shift?.dayIndex)!==key||shift.developerMode!==true||!Array.isArray(shift.history)||shift.history.length||!validShift(shift,true))return null;
    const added=currentStage(shift).caseIds.slice(shift.caseIds.length);
    if(added.length){
      const previousCount=shift.caseIds.length;
      shift.caseIds.push(...added);
      shift.files.push(...added.map(()=>({tab:'claim',read:['claim'],evidence:[],reason:'',inquired:false,decision:null})));
      if(['report','letters'].includes(shift.phase)){shift.phase='desk';shift.current=previousCount;}
    }
  }
  return raw;
}
export function developerJump(workspace,dayIndex,caseId){
  if(!workspace||!Number.isInteger(dayIndex)||!STAGES[dayIndex])return null;
  const stage=STAGES[dayIndex];
  if(caseId!==undefined&&!stage.caseIds.includes(caseId))return null;
  const target=workspace.days[dayIndex]||developerCopy(newState(dayIndex));
  if(caseId!==undefined)target.current=target.caseIds.indexOf(caseId);
  target.phase='desk';
  workspace.days[dayIndex]=target;
  workspace.activeDay=dayIndex;
  return target;
}
