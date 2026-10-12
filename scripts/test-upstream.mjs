import {readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {dirname,resolve,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const files=(await readdir(resolve(root,'scripts'))).filter(f=>f.endsWith('.test.mjs')).sort().map(f=>`scripts/${f}`);
const env={...process.env,NODE_PATH:[resolve(root,'node_modules'),process.env.NODE_PATH].filter(Boolean).join(delimiter)};
if(!env.CHROME_PATH){
  const {chromium}=await import('playwright');
  env.CHROME_PATH=chromium.executablePath();
}
const child=spawn(process.execPath,['--test','--test-concurrency=1',...files],{cwd:root,env,stdio:'inherit'});
child.on('error',error=>{console.error(error);process.exitCode=1;});
child.on('exit',(code,signal)=>{process.exitCode=signal?1:code??1;});
