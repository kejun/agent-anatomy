import {spawn} from 'node:child_process';
import {copyFile,mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const buildRoot=await mkdtemp(resolve(tmpdir(),'anatomy-upstream-rebuild-'));
async function run(args){
  await new Promise((done,fail)=>{
    const child=spawn(process.execPath,args,{cwd:buildRoot,stdio:'inherit'});
    child.on('error',fail);
    child.on('exit',(code,signal)=>code===0?done():fail(new Error(`${args.join(' ')} exited ${code??signal}`)));
  });
}
try{
  const manifest=JSON.parse(await readFile(resolve(root,'upstream.json'),'utf8'));
  for(const path of [...manifest.files.map(f=>f.path),'SKILL.md','upstream.json','scripts/verify-upstream.mjs']){
    const destination=resolve(buildRoot,path);
    await mkdir(dirname(destination),{recursive:true});
    await copyFile(resolve(root,path),destination);
  }
  console.log(`Rebuilding in an isolated directory on ${process.platform}/${process.arch}, Node ${process.versions.node}`);
  console.log('Canonical byte-for-byte baseline: macOS with Node 22, matching upstream CI.');
  for(const name of ['dial-indicator','desk-computer','arcade-cabinet','ripple-tank','turning-dial','raptor-engine']){
    for(const args of [[],['--light']])await run([`examples/${name}/build.mjs`,...args]);
  }
  await run(['examples/turning-dial/build.mjs','--light','--verify']);
  await run(['examples/turning-dial/stress.mjs','--light']);
  await run(['scripts/verify-upstream.mjs']);
}finally{
  await rm(buildRoot,{recursive:true,force:true});
}
