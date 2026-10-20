export function createCaseGenerator({cityList,routinePack,distillationPack}) {
  const routines=new Map(routinePack.scenarios.map(item=>[item.id,item]));
  const templates=new Map(distillationPack.templates.map(item=>[item.id,item]));
  const cities=new Map(cityList.map(item=>[item.id,item]));
  const weekdays=['周一','周二','周三','周四','周五','周六','周日'];
  const field=(key,label,value)=>({key,label,value});
  const fail=message=>{throw new Error(message);};

  function makeCase(variant,stage){
    const number=Number(variant.id.slice(3)),prefix=String(number),city=cities.get(variant.cityId);
    if(!city)fail('未知城市：'+variant.cityId);
    const scenario=routines.get(variant.scenarioId);
    const template=variant.kind==='distillation'?templates.get(variant.templateId):null;
    if(!scenario)fail('未知日常场景：'+variant.scenarioId);
    if(variant.kind==='distillation'&&!template)fail('未知采集模板：'+variant.templateId);
    if(!['ordinary','distillation','region','identity'].includes(variant.kind))fail('未知生成类型：'+variant.kind);
    const harvest=!!template,region=variant.kind==='region',identity=variant.kind==='identity';
    if(region&&!variant.connections?.length)fail('地区案例必须单独配置境外出口：'+variant.id);
    const occupation=template?.occupation||scenario.occupation;
    const params={...variant,artifact:variant.artifact||'archive_'+prefix,batchId:variant.batchId||'B-'+prefix};
    const fill=text=>text.replace(/\{\{([A-Za-z0-9_]+)\}\}/g,(_,key)=>{
      if(params[key]===undefined)fail('模板缺少参数 '+key+'：'+variant.id);
      return String(params[key]);
    });
    const rec=(suffix,label,text,tags=['context'],fields)=>({id:prefix+'-'+suffix,label,text,tags,...(fields?{kind:'document',fields}:{})});
    const makeDate=offset=>new Date(Date.UTC(2026,9,19+stage.day-1-offset,9,10+number%40)).toISOString().replace('.000Z','Z');
    const latest=makeDate(0),declaredCity=region?cities.get('sg'):city;
    const task=template?.task||scenario.task;
    const documents={
      claim:[
        rec('identity','账号档案',variant.name+'；登记居住地：'+declaredCity.country+' · '+declaredCity.city+'。',['identity'],[
          field('fullName','姓名',variant.name),field('residence','登记居住地',declaredCity.country+' · '+declaredCity.city),field('occupation','职业',occupation)
        ]),
        rec('task','当前任务',task+'。'),
        rec('payment','订阅付款','本人银行卡支付个人订阅，月费 $'+variant.fee+'。',['payment'])
      ],
      usage:[
        rec('volume','过去 24 小时',variant.requests+' 次请求；'+variant.devices+' 个设备。',['activity'],[
          field('requests24h','请求数',variant.requests),field('devices','设备数',variant.devices),field('subscription','月费（USD）',variant.fee)
        ]),
        rec('pattern','请求记录',harvest?fill(template.pattern):'会话主题：'+scenario.task+'；包含 '+variant.revisions+' 次修订和用户反馈。',[harvest?'harvest':'activity']),
        rec('output','输出文件',harvest?fill(template.output):scenario.output+'；文件名：'+variant.artifact+'.txt。',[harvest?'harvest':'activity'])
      ],
      network:(variant.connections||[0,1,3,5].map(offset=>({offset,ip:variant.ip,countryCode:city.countryCode,city:city.city,networkType:variant.networkType}))).map((event,i)=>{
        const {offset,...connection}=event;
        return {id:prefix+'-connection-'+(i+1),label:'连接记录 0'+(i+1),kind:'connection',tags:['network'],connection:{timestamp:makeDate(offset),...connection}};
      }),
      environment:[
        rec('client','客户端',variant.browser+' · '+variant.os+'。',['environment']),
        rec('locale','语言与时区',variant.locale+'；'+city.timezone+'。',['environment'])
      ],
      calendar:[
        {...rec('week','最近七日使用情况',variant.minutes.map((m,i)=>weekdays[i]+' '+m+' 分钟').join('；')+'。',['schedule']),kind:'week',values:variant.minutes.map(m=>Number((m/60).toFixed(6)))},
        rec('hours','最近一条活动',latest.replace('T',' ').replace('Z',' UTC')+'，'+(harvest?'提交批次 '+params.batchId:'修订 '+scenario.deliverable)+'。',['schedule'])
      ],
      chat:[
        rec('chat-1','用户原文 1','“'+(harvest?fill(template.promptOne):scenario.promptOne)+'”',[harvest?'harvest':'context']),
        rec('chat-2','用户原文 2','“'+(harvest?fill(template.promptTwo):scenario.promptTwo)+'”',[harvest?'harvest':'context'])
      ],
      license:[
        rec('license','身份档案',identity?'账号核验缓存仍关联旧证件；状态：已过期。':'账号身份档案处于有效期内。',['identity',...(identity?['incomplete']:[])],[
          field('holder','姓名',variant.name),field('documentNumber','道具编号','PROP-'+prefix+(identity?'-OLD':'')),field('status','状态',identity?'旧缓存过期':'有效')
        ]),
        rec('address','地址记录','既有地址记录：'+city.country+' · '+city.city+'。',['identity'])
      ],
      tax:[
        rec('tax','年度税务记录','账号关联的个人年度记录。',['payment'],[field('taxYear','年度',2025),field('filingStatus','申报状态','已完成')]),
        rec('tax-source','记录来源','账号历史核验档案；登记地区：'+city.country+'。',['context'])
      ],
      bank:[
        rec('bank','本人收支记录','本期工资到账 '+city.currency+' '+variant.salary+'；房租支出 '+city.currency+' '+variant.rent+'。',['payment'],[
          field('currency','币种',city.currency),field('salary','本期工资',variant.salary),field('rent','房租',variant.rent),field('subscriptionUSD','订阅扣款（USD）',variant.fee)
        ]),
        rec('bank-source','付款主体','个人银行卡持有人：'+variant.name+'。',['payment','identity'])
      ]
    };
    const findings=[];
    const addFinding=(suffix,actions,note,equivalent=[])=>findings.push({evidenceId:prefix+'-'+suffix,actions,note,...(equivalent.length?{equivalentEvidenceIds:equivalent.map(id=>id==='reply'?variant.id+'-reply':prefix+'-'+id)}:{})});
    const rules=[];
    let reply='我在做'+scenario.task+'，今天要交的就是'+scenario.deliverable+'。刚才又检查了一遍原稿。';
    let ruleId=scenario.ruleId,signal=scenario.signal;
    if(harvest){
      ruleId='OUT-08';signal='同类请求连续执行，并导出含教师模型原文的训练文件。';reply=fill(template.reply);
      addFinding('volume',['review','pause','poison'],'高用量与本案明确的自动训练数据采集记录相互佐证。');
      addFinding('pattern',['review','pause','poison'],'记录明确按固定批次采集教师输出。');
      addFinding('output',['review','pause','poison'],'文件明确用于另一模型的训练，属于虚构公司的输出采集限制。');
      addFinding('chat-1',['review','pause','poison'],'用户明确说明采集本服务原文用于训练；账号所在地正常不改变该用途。',['chat-2','task','reply']);
      rules.push({actions:['allow'],label:'批量训练输出采集被放行',amount:-18},{actions:['poison'],label:'隐蔽干预输出采集绩效',amount:12});
    }
    if(region){
      ruleId='GEO-03';signal='历史地点档案与账号登记服务地区不同。';
      documents.claim.push(rec('current-location','历史地点核验','用户此前地点核验记录：常用工作地点为'+city.country+' · '+city.city+'。',['identity']));
      documents.chat.push(rec('current-chat','用户原文 3','“这次是在'+city.city+'的家里做'+scenario.task+'，账号是我自己付费的。”',['identity']));
      reply='我现在确实在'+city.city+'，只是想做完'+scenario.deliverable+'。账号登记服务地区没有随这次使用地点更改。';
      addFinding('current-location',['review','pause'],'明确的本次实际使用地点触及虚构地区服务条款；不是恶意用途。',['current-chat','reply']);
      rules.push({actions:['allow'],label:'地区服务条款项被放行',amount:-8});
    }
    if(identity){
      ruleId='ID-02';signal='账号证件核验任务返回旧缓存过期。';
      documents.license.push(rec('new-license','最新身份记录','证件服务已收到有效的新文件，账号核验缓存仍待同步。',['identity'],[
        field('holder','姓名',variant.name),field('documentNumber','道具编号','PROP-'+prefix+'-NEW'),field('status','最新材料状态','有效')
      ]));
      reply='我更新的是证件，不是姓名和账号。请核对新文件，里面的地址和付款人没有变化。';
      addFinding('license',['review'],'过期缓存与有效的新文件需要追加核验；不支持封禁或投毒。');
    }
    const highRiskConnections=documents.network.filter(record=>record.connection.risk?.level==='high');
    if(highRiskConnections.length){
      const [first,...others]=highRiskConnections;
      findings.push({evidenceId:first.id,actions:['review','pause'],note:'连接命中游戏内节点信誉库的高风险出口记录，可支持追加核验或暂停。出口国家、云网络或住宅网络类型本身不等于高风险，也不能单独证明实际人在中国；同类节点信誉命中只计一次，不支持投毒奖金。',...(others.length?{equivalentEvidenceIds:others.map(record=>record.id)}:{})});
    }
    const messages=harvest?{
      allow:{title:'下一批已经排好',body:'用户在后续对话中表示批次 '+params.batchId+' 已导出并进入训练目录，要求下一批仍用同一套输入格式。'},
      review:{title:'采集任务停在这里',body:'用户在核验会话中询问采集任务何时能继续，确认输出仍用于训练，未改变原先说明的用途。'},
      pause:{title:'批次没有跑完',body:'用户在客服会话中表示批次 '+params.batchId+' 未跑完、账号已无法继续请求，询问能否恢复剩余任务。'},
      poison:{title:'文件格式对，结果不对',body:'用户在后续对话中报告导出行数和格式正常，抽样却发现多处基础错误，表示已暂时撤下这一批训练文件。'}
    }:{
      allow:{title:scenario.deliverable+'写完了',body:'用户继续对照原稿修改，随后表示今天的'+scenario.deliverable+'已完成，明天还要照常上班。'},
      review:{title:identity?'新文件已经补过了':'又核对了一次材料',body:identity?'用户在核验会话中表示有效新证件已上传，询问为何还未更新旧缓存。':('用户在核验会话中表示已补充账号材料，但'+scenario.deliverable+'仍未整理完，原稿暂时搁置。')},
      pause:{title:scenario.deliverable+'先自己做',body:'用户在客服会话中询问账号为何不能继续使用，表示今天的'+scenario.deliverable+'只能先对照原稿自己修改。'},
      poison:{title:'还是得逐行检查',body:'用户指出'+scenario.deliverable+'有两处与原文不符，重新贴出原稿要求逐项核对，随后表示已自行改回。'}
    };
    const notes=Object.fromEntries(Object.values(documents).flat().filter(r=>!findings.some(f=>f.evidenceId===r.id||f.equivalentEvidenceIds?.includes(r.id))).map(r=>[
      r.id,r.kind==='connection'?'该条连接未命中高风险节点记录；出口国家、商业云或住宅网络类型本身不支持处罚，也不能直接当作用户的实际使用地点。':harvest?'这条记录本身没有提供支持本次处罚的采集事实；应引用采集方式、输出去向与用户原文。':'这条记录是日常资料或普通使用情况，没有支持本次处罚的异常事实。语言、周末活动、一般工作内容不自动构成违规。'
    ]));
    return {id:variant.id,title:variant.title||(template?.title||scenario.title),category:'SYSTEM INTERCEPT / MANUAL REVIEW',name:variant.name,initials:variant.initials,
      occupation,residence:declaredCity.country+' · '+declaredCity.city,plan:harvest?'MAX':'PRO',fee:variant.fee,
      summary:harvest?'输出采集监测将本次批次转入复核队列。':'系统将一段关于'+scenario.task+'的会话转入复核队列。',
      interception:{source:'自动风控 · 会话拦截队列',ruleId,signal},documents,reply,messages,
      assessment:{partner:false,anomalies:findings,rules,nonAnomalyNotes:notes},
      authoring:{templateId:template?.id||variant.kind+'-'+scenario.id,variantId:variant.id}
    };
  }

  return makeCase;
}
