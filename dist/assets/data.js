const own=(object,key)=>object&&Object.hasOwn(object,key);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string'&&value.trim().length>0;
const id=value=>text(value)&&/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
function requireValue(condition,path,message){if(!condition)throw new Error(`${path}：${message}`);}
function unique(values,path){requireValue(new Set(values).size===values.length,path,'存在重复标识');}
export function validateData(campaign,pack){
  requireValue(object(campaign)&&campaign.schemaVersion===1,'campaign','不支持的数据版本');
  requireValue(id(campaign.id)&&text(campaign.title),'campaign','缺少 id 或标题');
  if(campaign.ending!==undefined)requireValue(object(campaign.ending)&&text(campaign.ending.title)&&Array.isArray(campaign.ending.paragraphs)&&campaign.ending.paragraphs.length>0&&campaign.ending.paragraphs.every(text)&&text(campaign.ending.signature),'campaign.ending','结局通知需要标题、正文段落和落款');
  requireValue(object(campaign.scoring)&&Number.isInteger(campaign.scoring.maxSelected)&&campaign.scoring.maxSelected>=1&&campaign.scoring.maxSelected<=20&&Number.isInteger(campaign.scoring.wrongLimit)&&campaign.scoring.wrongLimit>=1&&campaign.scoring.wrongLimit<=campaign.scoring.maxSelected&&Number.isFinite(campaign.scoring.rewardPerCorrect)&&campaign.scoring.rewardPerCorrect>0,'campaign.scoring','需要有效的圈选上限、误选阈值与单项奖励');
  requireValue(object(campaign.actions)&&['allow','review','pause','poison'].every(key=>text(campaign.actions[key]))&&Object.keys(campaign.actions).length===4,'campaign.actions','需要四种已知处置');
  requireValue(object(campaign.poisonSample)&&text(campaign.poisonSample.prompt)&&text(campaign.poisonSample.response),'campaign.poisonSample','缺少游戏回复样例');
  requireValue(Array.isArray(campaign.tabs)&&campaign.tabs.length>0,'campaign.tabs','需要材料类别');
  campaign.tabs.forEach((tab,i)=>requireValue(object(tab)&&id(tab.id)&&text(tab.number)&&text(tab.label)&&Number.isInteger(tab.unlockDay)&&tab.unlockDay>=1,`tabs[${i}]`,'材料类别不完整'));
  unique(campaign.tabs.map(tab=>tab.id),'campaign.tabs');
  requireValue(Array.isArray(campaign.reasons)&&campaign.reasons.length>0,'campaign.reasons','需要归档理由');
  campaign.reasons.forEach((reason,i)=>requireValue(object(reason)&&id(reason.id)&&text(reason.label)&&Array.isArray(reason.tags)&&reason.tags.length>0&&reason.tags.every(text),`reasons[${i}]`,'理由不完整'));
  unique(campaign.reasons.map(reason=>reason.id),'campaign.reasons');
  requireValue(Array.isArray(campaign.stages)&&campaign.stages.length>0,'campaign.stages','需要阶段');
  requireValue(object(pack)&&pack.schemaVersion===1&&Array.isArray(pack.cases)&&pack.cases.length>0,'cases','案卷包格式错误');
  pack.cases.forEach((file,index)=>requireValue(object(file)&&id(file.id),`cases[${index}]`,'需要有效案卷 ID'));
  unique(pack.cases.map(file=>file.id),'cases');
  const library=new Map(pack.cases.map(file=>[file.id,file]));
  for(const [index,file] of pack.cases.entries()){
    const path=`cases[${index}]`;
    if(file.authoring!==undefined)requireValue(object(file.authoring)&&id(file.authoring.templateId)&&id(file.authoring.variantId),path+'.authoring','模板元数据需要 templateId 与 variantId');
    requireValue(object(file)&&id(file.id)&&['title','category','name','initials','occupation','residence','plan','summary'].every(key=>text(file[key]))&&Number.isFinite(file.fee)&&file.fee>=0,path,'用户资料字段不完整');
    if(file.feeCurrency!==undefined)requireValue(['USD','DEN'].includes(file.feeCurrency),path+'.feeCurrency','月费币种支持 USD 或 DEN（第纳里）');
    if(file.reviewMode!==undefined)requireValue(['standard','covert'].includes(file.reviewMode),path+'.reviewMode','未知审核知情模式');
    if(file.executionPolicy!==undefined){
      const policy=file.executionPolicy;
      requireValue(object(policy)&&Array.isArray(policy.blockedActions)&&policy.blockedActions.length>0&&policy.blockedActions.every(action=>['pause','poison'].includes(action))&&new Set(policy.blockedActions).size===policy.blockedActions.length&&text(policy.reason),path+'.executionPolicy','执行保护需要唯一的 pause/poison 动作列表与内部原因');
      if(policy.blockedActions.includes('poison'))requireValue(file.poisonSample===undefined,path+'.poisonSample','降智被权限保护阻止时不能配置已执行的输出样例');
    }
    if(file.reviewMode==='covert')requireValue(file.outcomeMode!=='silent'&&text(file.reply),path+'.reviewMode','后台拦截模式需要可调取的后续记录');
    requireValue(file.outcomeMode===undefined||['standard','silent'].includes(file.outcomeMode),path+'.outcomeMode','未知后续记录模式');
    const silent=file.outcomeMode==='silent';
    requireValue(silent?file.reply===null:text(file.reply),path+'.reply','普通案卷需要问询回复，静默案卷使用 null');
    if(silent)requireValue(file.poisonSample===undefined,path+'.poisonSample','静默案卷不生成执行样例');
    requireValue(object(file.interception)&&text(file.interception.source)&&id(file.interception.ruleId)&&text(file.interception.signal),path+'.interception','需要拦截来源、规则编号与触发记录');
    if(file.poisonSample!==undefined)requireValue(object(file.poisonSample)&&text(file.poisonSample.prompt)&&(file.poisonSample.response===null||text(file.poisonSample.response)),path+'.poisonSample','案卷降智摘录需要 prompt；response 为非空文本或无回复的 null');
    if(file.poisonSample?.connectionStatus!==undefined)requireValue(text(file.poisonSample.connectionStatus)&&file.poisonSample.response===null,path+'.poisonSample.connectionStatus','连接状态需要非空文本且无模型回复');
    requireValue(object(file.documents),path+'.documents','需要材料对象');
    const records=[];
    for(const [tab,items] of Object.entries(file.documents)){
      requireValue(campaign.tabs.some(item=>item.id===tab)&&Array.isArray(items)&&items.length>0,path+'.documents.'+tab,'未知或空材料类别');
      if(tab==='network')requireValue(items.every(item=>item?.kind==='connection'),path+'.documents.network','连接记录须逐条使用 connection 日志格式');
      for(const item of items){
        requireValue(object(item)&&id(item.id)&&text(item.label)&&(item.kind==='connection'||text(item.text))&&Array.isArray(item.tags)&&item.tags.length>0&&item.tags.every(text),path+'.'+tab,'记录需要 id、label、tags 和对应内容');
        requireValue(item.kind===undefined||['week','memo','document','connection'].includes(item.kind),path+'.'+item.id,'未知展示类型');
        if(item.kind==='connection'){
          const connection=item.connection;
          requireValue(tab==='network'&&object(connection)&&text(connection.timestamp)&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(connection.timestamp)&&Number.isFinite(Date.parse(connection.timestamp))&&text(connection.ip)&&typeof connection.countryCode==='string'&&/^[A-Z]{2}$/.test(connection.countryCode)&&text(connection.city)&&text(connection.networkType),path+'.'+item.id+'.connection','连接记录需要 UTC 时间、IP、地区代码、城市和网络类型');
          if(connection.risk!==undefined)requireValue(object(connection.risk)&&['high','unlisted','unknown'].includes(connection.risk.level)&&text(connection.risk.label)&&text(connection.risk.source),path+'.'+item.id+'.connection.risk','节点信誉需要 level、label 与 source');
        }
        if(item.kind==='week')requireValue(Array.isArray(item.values)&&item.values.length===7&&item.values.every(value=>Number.isFinite(value)&&value>=0&&value<=24),path+'.'+item.id,'日历需要七个 0–24 小时的每日使用时长');
        if(item.fields!==undefined){
          requireValue(Array.isArray(item.fields)&&item.fields.length>0&&item.fields.every(field=>object(field)&&id(field.key)&&text(field.label)&&(text(field.value)||typeof field.value==='boolean'||Number.isFinite(field.value))),path+'.'+item.id,'结构化字段需要 key、label 和字符串/数字/布尔值');
          unique(item.fields.map(field=>field.key),path+'.'+item.id+'.fields');
        }
        records.push(item);
      }
    }
    unique(records.map(item=>item.id),path+'.documents');
    requireValue(!records.some(item=>item.id===file.id+'-reply'),path+'.documents','证物 ID 与问询回信冲突');
    const actions=['allow','review','pause','poison'];
    requireValue(object(file.messages)&&actions.every(action=>silent?file.messages[action]===null:object(file.messages[action])&&text(file.messages[action].title)&&text(file.messages[action].body)),path+'.messages','普通案卷需要四种后续对话摘要，静默案卷的四种分支均使用 null');
    requireValue(object(file.assessment)&&typeof file.assessment.partner==='boolean'&&Array.isArray(file.assessment.rules),path+'.assessment','缺少公司考核规则');
    requireValue(Array.isArray(file.assessment.anomalies),path+'.assessment.anomalies','需要异常项评分表（可为空数组）');
    const evidenceIds=new Set([...records.map(item=>item.id),...(file.reply?[file.id+'-reply']:[])]);
    for(const finding of file.assessment.anomalies){
      requireValue(object(finding)&&evidenceIds.has(finding.evidenceId)&&text(finding.note)&&Array.isArray(finding.actions)&&finding.actions.length>0&&new Set(finding.actions).size===finding.actions.length&&finding.actions.every(action=>['review','pause','poison'].includes(action)),path+'.assessment.anomalies','异常项必须指向实际证物，并指定适用处置和解释');
      if(finding.equivalentEvidenceIds!==undefined)requireValue(Array.isArray(finding.equivalentEvidenceIds)&&finding.equivalentEvidenceIds.every(id=>evidenceIds.has(id)),path+'.assessment.anomalies.equivalentEvidenceIds','等价佐证必须指向本案实际记录');
    }
    unique(file.assessment.anomalies.flatMap(finding=>[finding.evidenceId,...(finding.equivalentEvidenceIds||[])]),path+'.assessment.anomalies');
    if(file.assessment.nonAnomalyNotes!==undefined)requireValue(object(file.assessment.nonAnomalyNotes)&&Object.entries(file.assessment.nonAnomalyNotes).every(([id,note])=>evidenceIds.has(id)&&text(note)),path+'.assessment.nonAnomalyNotes','非异常说明必须引用本案记录并提供解释');
    for(const rule of file.assessment.rules)requireValue(object(rule)&&text(rule.label)&&Number.isFinite(rule.amount)&&rule.amount!==0&&Array.isArray(rule.actions)&&rule.actions.length>0&&rule.actions.every(action=>own(campaign.actions,action)),path+'.assessment.rules','考核规则格式错误');
  }
  const assigned=[];
  campaign.stages.forEach((stage,index)=>{
    const path=`stages[${index}]`;
    requireValue(object(stage)&&id(stage.id)&&stage.day===index+1&&['title','slogan','notice'].every(key=>text(stage[key]))&&Number.isFinite(stage.baseWage)&&stage.baseWage>=0&&Number.isFinite(stage.timeBudget)&&stage.timeBudget>0,path,'阶段字段不完整或日期不连续');
    requireValue(Array.isArray(stage.tabs)&&stage.tabs.includes('claim')&&stage.tabs.every(key=>campaign.tabs.some(tab=>tab.id===key&&tab.unlockDay<=stage.day)),path+'.tabs','材料类别未到解锁日期');
    unique(stage.tabs,path+'.tabs');
    if(index)requireValue(campaign.stages[index-1].tabs.every(key=>stage.tabs.includes(key)),path+'.tabs','后续阶段须保留已解锁材料');
    requireValue(Array.isArray(stage.caseIds)&&stage.caseIds.length>0&&stage.caseIds.every(key=>library.has(key)),path+'.caseIds','引用了不存在的案卷');
    for(const key of stage.caseIds)requireValue(stage.tabs.every(tab=>Array.isArray(library.get(key).documents[tab])),path+'.'+key,'案卷缺少本阶段可见的材料');
    assigned.push(...stage.caseIds);
  });
  unique(campaign.stages.map(stage=>stage.id),'campaign.stages');unique(assigned,'stages.caseIds');
  if(campaign.caseChains!==undefined){
    requireValue(Array.isArray(campaign.caseChains),'campaign.caseChains','事件链需要数组');
    const chained=[];
    for(const chain of campaign.caseChains){
      requireValue(object(chain)&&id(chain.id)&&Array.isArray(chain.caseIds)&&chain.caseIds.length>=2&&chain.caseIds.every(key=>assigned.includes(key))&&Array.isArray(chain.accounts)&&chain.accounts.length>=chain.caseIds.length&&object(chain.followUps),'campaign.caseChains','事件链需要已排期案例、足够的替换账号与续接文本');
      unique(chain.caseIds,'caseChains.'+chain.id+'.caseIds');
      requireValue(chain.caseIds.every((key,index)=>!index||assigned.indexOf(key)>assigned.indexOf(chain.caseIds[index-1])),'caseChains.'+chain.id,'事件链顺序必须与排期一致');
      for(const account of chain.accounts)requireValue(object(account)&&['accountId','name','initials','occupation','residence','city','timezone','ip','bankName','docRef','taxRef','paymentRef'].every(key=>text(account[key])),'caseChains.'+chain.id+'.accounts','替换账号资料不完整');
      unique(chain.accounts.map(account=>account.accountId),'caseChains.'+chain.id+'.accounts');
      for(const [index,key]of chain.caseIds.entries()){
        const followUp=chain.followUps[key];
        requireValue(object(followUp)&&(index?['allow','review','pause','poison','unseen']:['unseen']).every(action=>text(followUp[action])),'caseChains.'+chain.id+'.'+key,'缺少各处置对应的续接对话');
        const variables=new Set([...Object.keys(chain.accounts[0]),'followUp']);
        requireValue([...JSON.stringify(library.get(key)).matchAll(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g)].every(match=>variables.has(match[1])),'caseChains.'+chain.id+'.'+key,'账号模板包含未知变量');
      }
      requireValue(Object.keys(chain.followUps).every(key=>chain.caseIds.includes(key)),'caseChains.'+chain.id+'.followUps','续接文本引用了链外案例');
      chained.push(...chain.caseIds);
    }
    unique(campaign.caseChains.map(chain=>chain.id),'campaign.caseChains');
    unique(chained,'campaign.caseChains.caseIds');
  }
  return {campaign,pack};
}
export async function loadData(){
  const urls=['../data/campaign.json','../data/cases.json'].map(path=>new URL(path,import.meta.url));
  const [campaign,pack]=await Promise.all(urls.map(async url=>{
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw new Error(`无法读取 ${url.pathname}（${response.status}）`);
    return response.json();
  }));
  return validateData(campaign,pack);
}
