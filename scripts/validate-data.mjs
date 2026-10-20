import fs from 'node:fs/promises';
import path from 'node:path';
import {validateData} from '../dist/assets/data.js';
const campaignPath=path.resolve(process.argv[2]||'dist/data/campaign.json');
const casePath=path.resolve(process.argv[3]||'dist/data/cases.json');
try{
 const [campaign,pack]=await Promise.all([campaignPath,casePath].map(async file=>JSON.parse(await fs.readFile(file,'utf8'))));
 validateData(campaign,pack);
 console.log(`数据可读取：${pack.cases.length} 份案卷，${campaign.stages.length} 个阶段。`);
 for(const stage of campaign.stages)console.log(`第 ${stage.day} 日：${stage.caseIds.length} 份案卷，${stage.tabs.length} 类材料。`);
}catch(error){console.error('案卷数据未通过校验：'+error.message);process.exitCode=1;}
