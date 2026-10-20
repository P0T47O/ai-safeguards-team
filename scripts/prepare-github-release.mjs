import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url));
const releaseRoot=path.join(root,'artifacts/releases');
await fs.mkdir(releaseRoot,{recursive:true});
const output=await fs.mkdtemp(path.join(releaseRoot,'ai-safeguards-team-'));
const snapshot=path.join(output,'source');
const directories=['.github','content','dist','docs','scripts','tests'];
const generatedFiles=new Set(['dist/data/campaign.json','dist/data/cases.json','dist/credits.html','dist/LICENSE.txt','dist/NOTICE.txt']);
const files=['.gitignore','README.md','LICENSE','NOTICE','CREDITS.md','package.json','preview.cjs'];
async function walk(relative){
  const entries=await fs.readdir(path.join(root,relative),{withFileTypes:true});
  for(const entry of entries){
    const name=path.posix.join(relative,entry.name);
    if(entry.isSymbolicLink())throw new Error('发布快照不包含符号链接：'+name);
    if(entry.isDirectory())await walk(name);
    else if(entry.isFile()&&!generatedFiles.has(name))files.push(name);
  }
}
for(const directory of directories)await walk(directory);
files.sort();
const manifest=[];
for(const name of files){
  const bytes=await fs.readFile(path.join(root,name));
  const destination=path.join(snapshot,name);
  await fs.mkdir(path.dirname(destination),{recursive:true});
  await fs.writeFile(destination,bytes);
  manifest.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({snapshot,manifest:path.join(output,'manifest.json'),files:manifest.length,bytes:manifest.reduce((sum,item)=>sum+item.bytes,0)}));
