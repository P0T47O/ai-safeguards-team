// Recurring cases keep evidence IDs fixed; only the account and quoted follow-up vary.
let chains=[];
let developerHistory=[];
const findChain=id=>chains.find(chain=>chain.caseIds.includes(id));
export function configureCaseChains(campaign) {
  chains=campaign.caseChains||[];
  developerHistory=[];
}
export function setDeveloperChainHistory(days) {
  developerHistory=Object.values(days||{});
}
export function validChainContext(caseId,context) {
  if(context===undefined)return true;
  const chain=findChain(caseId);
  return !!chain&&context!==null&&typeof context==='object'&&context.chainId===chain.id&&chain.accounts.some(account=>account.accountId===context.accountId)&&(context.previousAction===null||['allow','review','pause','poison'].includes(context.previousAction));
}
const interpolate=(value,variables)=>{
  if(typeof value==='string')return value.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g,(match,key)=>Object.hasOwn(variables,key)?variables[key]:match);
  if(Array.isArray(value))return value.map(item=>interpolate(item,variables));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,interpolate(item,variables)]));
  return value;
};
export function resolveChainCase(file,state) {
  const chain=findChain(file.id);
  if(!chain)return file;
  const position=chain.caseIds.indexOf(file.id);
  const ownDecision=state.files?.[state.caseIds.indexOf(file.id)]?.decision;
  let accountIndex=0,previousAction=null;
  if(ownDecision?.chainContext&&validChainContext(file.id,ownDecision.chainContext)){
    accountIndex=chain.accounts.findIndex(account=>account.accountId===ownDecision.chainContext.accountId);
    previousAction=ownDecision.chainContext.previousAction;
  }else{
    const history=state.developerMode?[...developerHistory.filter(shift=>shift.dayIndex<state.dayIndex),state]:[...(state.history||[]),state];
    for(const priorId of chain.caseIds.slice(0,position)){
      const shift=history.find(item=>item.caseIds.includes(priorId));
      const decision=shift?.files?.[shift.caseIds.indexOf(priorId)]?.decision;
      const action=decision?.action;
      // Filed episodes keep the account that was actually reviewed, even in an edited dev path.
      if(decision?.chainContext&&validChainContext(priorId,decision.chainContext))accountIndex=chain.accounts.findIndex(item=>item.accountId===decision.chainContext.accountId);
      if(action==='pause')accountIndex++;
      if(priorId===chain.caseIds[position-1])previousAction=action||null;
    }
  }
  const account=chain.accounts[Math.min(accountIndex,chain.accounts.length-1)];
  const followUp=chain.followUps[file.id]?.[previousAction||'unseen']||'';
  return {...interpolate(file,{...account,followUp}),runtimeChainContext:{chainId:chain.id,accountId:account.accountId,previousAction}};
}
