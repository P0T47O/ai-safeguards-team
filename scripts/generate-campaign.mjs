import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateData} from '../dist/assets/data.js';
import {createCaseGenerator} from './lib/generate-case.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const fail=message=>{throw new Error(message);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const read=async name=>{
  try{return JSON.parse(await fs.readFile(path.join(root,name),'utf8'));}
  catch(error){throw new Error(name+'：'+error.message);}
};
const [sourceCampaign,cityPack,routinePack,distillationPack]=await Promise.all([
  'content/campaign.json','content/cities.json',
  'content/templates/routine-scenarios.json','content/templates/distillation-templates.json'
].map(read));
if(sourceCampaign.schemaVersion!==1||!Array.isArray(sourceCampaign.stages)||!sourceCampaign.stages.length)fail('content/campaign.json 需要版本 1 和班次文件列表');
if(new Set(sourceCampaign.stages).size!==sourceCampaign.stages.length)fail('班次文件列表重复');
for(const pack of [cityPack,routinePack,distillationPack])if(pack.schemaVersion!==1)fail('不支持的城市或模板数据版本');
if(!Array.isArray(cityPack.cities)||!Array.isArray(routinePack.scenarios)||!Array.isArray(distillationPack.templates))fail('缺少城市、场景或采集模板数组');
for(const [label,items] of [['城市',cityPack.cities],['场景',routinePack.scenarios],['采集模板',distillationPack.templates]]){
  if(items.some(item=>!object(item)||typeof item.id!=='string')||new Set(items.map(item=>item.id)).size!==items.length)fail(label+'标识缺失或重复');
}
const stages=await Promise.all(sourceCampaign.stages.map(name=>{
  if(typeof name!=='string'||!/^day-[0-9]+$/.test(name))fail('无效班次文件标识：'+name);
  return read('content/days/'+name+'.json');
}));
if(sourceCampaign.caseChains!==undefined&&!Array.isArray(sourceCampaign.caseChains))fail('content/campaign.json.caseChains 需要事件链文件列表');
const caseChains=await Promise.all((sourceCampaign.caseChains||[]).map(async name=>{
  if(typeof name!=='string'||!/^[-A-Za-z0-9_]+$/.test(name))fail('无效事件链文件标识：'+name);
  const chain=await read('content/chains/'+name+'.json');
  if(chain.id!==name)fail('事件链 ID 与文件名不一致：'+name);
  return chain;
}));
const entries=await fs.readdir(path.join(root,'content/cases'),{withFileTypes:true});
const names=entries.filter(entry=>entry.isFile()&&entry.name.endsWith('.json')).map(entry=>entry.name).sort();
const sources=await Promise.all(names.map(async name=>{
  const source=await read('content/cases/'+name);
  if(!object(source)||source.id!==name.slice(0,-5)||!/^OC-[0-9]+$/.test(source.id))fail('案卷 ID 与文件名不一致：content/cases/'+name);
  if(source.authoring)fail('content/cases/'+name+' 是运行包内容，请使用完整手写案卷（移除 authoring）或模板参数');
  if(source.kind!==undefined&&!['ordinary','distillation','region','identity'].includes(source.kind))fail('未知模板类型：content/cases/'+name);
  if(source.kind!==undefined&&source.documents!==undefined)fail('案卷不能同时包含模板 kind 和完整 documents：'+name);
  return source;
}));
const sourceById=new Map(sources.map(source=>[source.id,source]));
const makeCase=createCaseGenerator({cityList:cityPack.cities,routinePack,distillationPack});
const generated=[],assigned=new Set();
for(const stage of stages){
  if(!object(stage)||!Array.isArray(stage.caseIds))fail('班次缺少 caseIds');
  for(const id of stage.caseIds){
    if(assigned.has(id))fail('案卷重复排期：'+id);
    assigned.add(id);
    const source=sourceById.get(id);
    if(!source)fail('班次 '+stage.id+' 引用不存在的 content/cases/'+id+'.json');
    if(source.kind){
      try{generated.push(makeCase(source,stage));}
      catch(error){throw new Error('content/cases/'+id+'.json：'+error.message);}
    }
  }
}
for(const source of sources)if(source.kind&&!assigned.has(source.id))fail('模板案卷缺少生成日期，请先加入班次：'+source.id);
const authored=sources.filter(source=>!source.kind);
const campaign={$schema:'./content.schema.json',...sourceCampaign,stages,caseChains};
const pack={$schema:'./content.schema.json',schemaVersion:1,cases:[...authored,...generated]};
validateData(campaign,pack);
const library=new Map(pack.cases.map(file=>[file.id,file]));
const schedule=[
  '# 当前班次排期（自动生成）',
  '',
  '编辑 content/days、content/cases 和 content/campaign.json 后运行 npm run build:content。本文件由构建器生成。',
  '',
  `共 ${stages.length} 天、${assigned.size} 案；${authored.length} 份手写案、${generated.length} 份模板案。`,
  '',
  '| 天数 | 主题 | 材料类别 | 案数 | 工时预算 | 手写事件（按出现顺序） |',
  '| --- | --- | --- | --- | --- | --- |',
  ...stages.map(stage=>`| ${stage.day} | ${stage.title} | ${stage.tabs.length} | ${stage.caseIds.length} | ${stage.timeBudget} | ${stage.caseIds.filter(id=>!sourceById.get(id).kind).map(id=>id+' '+library.get(id).title).join('、')||'—'} |`),
  '',
  '## 完整队列',
  '',
  ...stages.map(stage=>`- 第 ${stage.day} 日：${stage.caseIds.join(' → ')}`),
  ''
].join('\n');
const [licenseText,noticeText,packageInfo]=await Promise.all([
  fs.readFile(path.join(root,'LICENSE'),'utf8'),
  fs.readFile(path.join(root,'NOTICE'),'utf8'),
  read('package.json')
]);
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const repositoryUrl=packageInfo.repository.url.replace(/\.git$/,'');
const creditsPage=`<!doctype html>
<html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>作者与许可 · ${escapeHtml(campaign.title)}</title>
<style>body{margin:0;background:#f7f5ee;color:#29392f;font:15px/1.9 system-ui,"Microsoft YaHei",sans-serif}main{max-width:820px;margin:40px auto;padding:36px;background:#fff;border:1px solid #deddd3;border-radius:12px}h1{font:32px/1.4 Georgia,serif}h2{font-size:20px;margin-top:32px}a{color:#8e4f30;text-underline-offset:3px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f2e9;padding:20px;font:13px/1.8 monospace}.star{color:#df734d;font-size:40px;vertical-align:middle}small{color:#72766c}@media(max-width:650px){main{margin:18px;padding:24px}h1{font-size:25px}}</style></head>
<body><main><span class="star" aria-hidden="true">*</span> ORANGE CRAB AI<h1>${escapeHtml(campaign.title)}</h1><p><strong>Original project by <a href="${escapeHtml(repositoryUrl)}">${escapeHtml(packageInfo.author)}</a></strong></p><p>允许非商业试玩、学习、修改、翻译和分享。未经书面许可不得商业利用，包括收费访问、商业再发行或带收益广告的部署。再发布及修改版本须保留原作者信息、许可文件与可见署名，不得删除、覆盖或冒充唯一原创。</p><p>采用自定义 Noncommercial Use and Attribution Preservation License 1.0；以下英文许可正文为准。本项目不以 OSI 标准开源许可发布。</p><p>虚构讽刺游戏，与 Anthropic 或其他真实 AI 公司无隶属、授权或背书关系。角色、账号、证件和会话均为预写道具，不进行真实 KYC。制作使用了 AI 辅助工具，游戏运行不调用真实语言模型。</p><p><a href="./index.html">返回游戏</a> · <a href="${escapeHtml(repositoryUrl)}">原项目仓库</a> · <a href="./LICENSE.txt">下载许可</a> · <a href="./NOTICE.txt">下载署名声明</a></p><h2>署名声明</h2><pre>${escapeHtml(noticeText)}</pre><h2>License</h2><pre>${escapeHtml(licenseText)}</pre><small>仅就作者有权许可的原创部分授予许可；第三方材料与商标不因此获得授权。</small></main></body></html>\n`;
const outputs=[['dist/data/campaign.json',campaign],['dist/data/cases.json',pack],['docs/campaign-schedule.md',schedule],['dist/LICENSE.txt',licenseText],['dist/NOTICE.txt',noticeText],['dist/credits.html',creditsPage]];
const changed=[];
for(const [name,data] of outputs){
  const serialized=typeof data==='string'?data:JSON.stringify(data,null,2)+'\n';
  const target=path.join(root,name);
  const existing=await fs.readFile(target,'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(existing!==serialized){await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,serialized);changed.push(name);}
}
const kinds=Object.fromEntries(['ordinary','distillation','region','identity'].map(kind=>[kind,sources.filter(source=>source.kind===kind).length]));
console.log(JSON.stringify({days:stages.length,total:pack.cases.length,authored:authored.length,generated:generated.length,kinds,changed}));
