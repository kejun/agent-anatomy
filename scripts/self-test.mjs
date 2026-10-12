#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,cp,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateModel,parseModel,normalizeTrace,attachTrace,spanStats,scriptJson,MAX_SPANS,buildTraceIndex,traceActivity,mechanicalState} from './model.mjs';
import {renderModel} from './render.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const clone=value=>JSON.parse(JSON.stringify(value));
const model=JSON.parse(await readFile(join(root,'assets/templates/agent.json'),'utf8'));
let tests=0;
async function test(name,fn){await fn();tests++;console.log(`PASS ${name}`);}
const canonical={id:'s1',traceId:'t',name:'model',startMs:10,endMs:110,status:'ok',attributes:{input_tokens:20,output_tokens:4}};
const temp=await mkdtemp(join(tmpdir(),'agent-anatomy-'));
try {
  await test('three templates build as self-contained HTML',async()=>{
    for(const name of ['agent','software','ai-pipeline']) {
      const source=parseModel(await readFile(join(root,`assets/templates/${name}.json`),'utf8'));
      const path=await renderModel(source,join(temp,`${name}.html`)), html=await readFile(path,'utf8');
      assert(html.includes('data-node-id'));assert(!html.includes('__SCRIPT__'));assert(!/<script[^>]+src=|<link[^>]+href=/i.test(html));
    }
  });
  await test('Markdown structured block and prose rejection',()=>{
    assert.equal(parseModel('说明\n```anatomy\n'+JSON.stringify(model)+'\n```').title,model.title);
    assert.throws(()=>parseModel('只有自然语言说明'),/代码块/);
    assert.throws(()=>parseModel('```json\n{}\n```\n```json\n{}\n```'),/代码块/);
  });
  await test('missing evidence, invalid endpoints and unsafe URL rejected',()=>{
    let bad=clone(model);bad.nodes[0].evidence='source';assert.throws(()=>validateModel(bad),/证据/);
    bad=clone(model);bad.edges[0].to='absent';assert.throws(()=>validateModel(bad),/端点/);
    bad=clone(model);bad.sources[0].url='javascript:alert(1)';assert.throws(()=>validateModel(bad),/HTTP/);
    bad=clone(model);delete bad.nodes[0].id;assert.throws(()=>validateModel(bad),/ID 无效/);
  });
  await test('cyclic and cross-domain hierarchy rejected',()=>{
    const bad=clone(model);bad.nodes[1].parentId='planner';assert.throws(()=>validateModel(bad),/成环/);
    const cross=clone(model);cross.nodes[0].parentId='memory';assert.throws(()=>validateModel(cross),/跨业务域/);
  });
  await test('canonical time rebasing, metrics and missing status',()=>{
    const t=normalizeTrace([canonical,{...canonical,id:'s2',startMs:30,endMs:60,status:undefined,attributes:{}}]);
    assert.equal(t.spans[0].startMs,0);assert.equal(t.spans[1].status,'unknown');
    const stats=spanStats(t.spans);assert.equal(stats.cumulativeMs,130);assert.equal(stats.rangeMs,100);assert.equal(stats.tokens,24);
    assert.equal(spanStats([{...canonical,attributes:{input_tokens:null,output_tokens:'bad'}}]).tokens,null);
  });
  await test('incomplete spans excluded with diagnostics',()=>{
    const t=normalizeTrace([canonical,{...canonical,id:'open',endMs:null},{...canonical,id:'bad',endMs:2}]);
    assert.equal(t.spans.length,1);assert.equal(t.warnings[0].count,2);
    assert.throws(()=>normalizeTrace([{...canonical,endMs:null}]),/没有可回放/);
  });
  await test('JSONL single and multiple records',()=>{
    assert.equal(normalizeTrace(JSON.stringify(canonical)).spans.length,1);
    assert.equal(normalizeTrace(JSON.stringify(canonical)+'\n'+JSON.stringify({...canonical,id:'s2'})).spans.length,2);
  });
  await test('Chrome X and nested B/E microseconds',()=>{
    const t=normalizeTrace({traceEvents:[{name:'outer',ph:'B',pid:1,tid:1,ts:1000},{name:'inner',ph:'B',pid:1,tid:1,ts:2000},{ph:'E',pid:1,tid:1,ts:3000},{ph:'E',pid:1,tid:1,ts:5000},{name:'model',ph:'X',pid:1,tid:2,ts:6000,dur:1500,args:{status:'error'}},{name:'open',ph:'B',pid:1,tid:1,ts:8000}]});
    assert.equal(t.spans[0].endMs,4);assert.equal(t.spans[1].parentId,t.spans[0].id);assert.equal(t.spans[2].endMs-t.spans[2].startMs,1.5);assert.equal(t.spans[2].status,'error');assert.equal(t.warnings[0].count,1);
  });
  await test('invalid Chrome timestamps are not coerced to zero',()=>{
    const t=normalizeTrace({traceEvents:[{name:'model',ph:'X',ts:0,dur:5},{name:'bad',ph:'X',ts:null,dur:null}]});
    assert.equal(t.spans.length,1);assert.equal(t.spans[0].endMs,.005);assert.equal(t.warnings.length,1);
    const epoch=normalizeTrace({traceEvents:[{name:'model',ph:'X',ts:1790000000000001,dur:3}]});assert.equal(epoch.spans[0].endMs,.003);
  });
  await test('OTLP epoch precision and recursive attributes',()=>{
    const base=1790000000000000000n;
    const t=normalizeTrace({resourceSpans:[{resource:{attributes:[{key:'business.domain',value:{stringValue:'reasoning'}}]},scopeSpans:[{spans:[{spanId:'n1',traceId:'t',name:'model',startTimeUnixNano:String(base+1n),endTimeUnixNano:String(base+1000002n),status:{code:2},attributes:[{key:'nested',value:{arrayValue:{values:[{intValue:'4'},{boolValue:true}]}}}]}]}]}]});
    assert.equal(t.spans[0].endMs,1.000001);assert.equal(t.spans[0].status,'error');assert.deepEqual(t.spans[0].attributes.nested,['4',true]);
  });
  await test('explicit mapping, domain fallback and unknown retention',()=>{
    const t=normalizeTrace([{...canonical,nodeId:'tools',domainId:'reasoning'},{...canonical,id:'s2',name:'external',domainId:'reasoning'},{...canonical,id:'s3',name:'external-2',nodeId:'missing'},{...canonical,id:'s4',name:'memory'}]);
    const attached=attachTrace(model,t);assert.equal(attached.spans[0].domainId,'execution');assert.equal(attached.traceMeta.unmapped,1);assert(attached.nodes.some(n=>n.label==='未归属活动'));assert.equal(attached.spans[3].nodeId,'memory');assert(attached.traceMeta.warnings.length>=2);
  });
  await test('ambiguous labels are not guessed',()=>{
    const duplicate=clone(model);duplicate.nodes[0].label='same';duplicate.nodes[1].label='same';
    const attached=attachTrace(duplicate,normalizeTrace([{...canonical,name:'same'}]));assert.equal(attached.traceMeta.unmapped,1);
  });
  await test('duplicate span IDs scoped by trace and input limits',()=>{
    const t=normalizeTrace([canonical,canonical,{...canonical,traceId:'other'}]);assert.equal(t.spans.length,2);assert.equal(t.warnings[0].count,1);
    assert.throws(()=>normalizeTrace(Array.from({length:MAX_SPANS+1},()=>canonical)),/最多/);
  });
  await test('embedded model trace validated before rendering',()=>{
    const bad=clone(model);bad.mode='trace';assert.throws(()=>validateModel(bad),/追踪模式/);
    bad.spans=[canonical];assert.throws(()=>validateModel(bad),/归属/);
  });
  await test('script closing tag and HTML injection encoded',async()=>{
    const data=clone(model);data.title='</script><script>alert(1)</script>';data.nodes[0].label='<img src=x onerror=alert(1)>';
    const html=await readFile(await renderModel(data,join(temp,'hostile.html')),'utf8');
    assert(!scriptJson(data).includes('<'));assert(html.includes('&lt;/script&gt;'));assert(!html.includes('<img src=x'));assert.equal((html.match(/<script>/g)||[]).length,1);
  });
  await test('OTLP original error, exception events and links survive import',()=>{
    const raw={spanId:'bad',traceId:'trace',name:'db',startTimeUnixNano:'1790000000000000000',endTimeUnixNano:'1790000000001000000',status:{code:2,message:'pool exhausted'},events:[{name:'exception',attributes:[{key:'exception.stacktrace',value:{stringValue:'pool.js:42'}}]}],links:[{traceId:'related',spanId:'parent'}]};
    const s=normalizeTrace({resourceSpans:[{scopeSpans:[{scope:{name:'sdk'},spans:[raw]}]}]}).spans[0];
    assert.equal(s.statusMessage,'pool exhausted');assert.deepEqual(s.raw,raw);assert.deepEqual(s.events,raw.events);assert.deepEqual(s.links,raw.links);assert.equal(s.instrumentationScope.name,'sdk');
  });
  await test('full authored node/domain budgets still accept activity buckets',()=>{
    const full=clone(model);full.mode='architecture';delete full.steps;delete full.exampleTrace;full.edges=[];
    full.domains=Array.from({length:40},(_,i)=>({id:`d${i}`,name:`域 ${i}`,description:'容量验收'}));
    full.nodes=Array.from({length:240},(_,i)=>({...model.nodes[0],id:`n${i}`,domainId:`d${Math.floor(i/16)}`,label:`部件 ${i}`}));
    validateModel(full);
    const spans=full.domains.map((d,i)=>({...canonical,id:`s${i}`,name:'external',domainId:d.id}));spans.push({...canonical,id:'unknown',name:'unknown'});
    const attached=attachTrace(full,normalizeTrace(spans));assert.equal(attached.nodes.length,281);assert.equal(attached.domains.length,41);assert.equal(attached.traceMeta.unmapped,1);validateModel(attached);
    const replaced=attachTrace(attached,normalizeTrace([canonical]));assert.equal(replaced.nodes.length,241);
  });
  await test('trace index keeps final records and scoped parent/child identities',()=>{
    const spans=Array.from({length:230},(_,i)=>({...canonical,id:`s${i}`,traceId:`doc-${i}`,nodeId:'model',parentId:null}));
    spans.push({...canonical,id:'child',traceId:'doc-229',nodeId:'tools',parentId:'s229'});
    const attached=attachTrace(model,normalizeTrace(spans)),index=buildTraceIndex(attached);
    assert.equal(index.byTrace.get('doc-229').length,2);assert.equal(index.byNode.get('model').length,230);
    assert.equal(index.children.get(JSON.stringify(['doc-229','s229']))[0].id,'child');
    assert.equal(normalizeTrace([{...canonical,traceId:'a/b',id:'c'},{...canonical,traceId:'a',id:'b/c'}]).spans.length,2);
  });
  await test('domain activity and ancestor state follow recorded time',()=>{
    const attached=attachTrace(model,normalizeTrace([{...canonical,id:'child',nodeId:'planner',startMs:0,endMs:10,status:'error'},{...canonical,id:'later',nodeId:'tools',startMs:20,endMs:30}]));
    const index=buildTraceIndex(attached),now=traceActivity(index,5),later=traceActivity(index,25);
    assert.equal(now.nodes.get('controller').running,1);assert.equal(now.domains.get('control').running,1);
    assert.equal(later.nodes.get('controller').errors,1);assert.equal(later.domains.get('execution').running,1);assert.equal(later.domains.get('control').running,0);
  });
  await test('queue and retry snapshots enforce capacity and survive reverse seeking',async()=>{
    const q=parseModel(await readFile(join(root,'assets/examples/queue-retry.json'),'utf8'));
    assert.equal(mechanicalState(q,'queue',2).queueDepth,8);assert.equal(mechanicalState(q,'rejection',2).rejected,1);
    assert.equal(mechanicalState(q,'queue',3).queueDepth,6);assert.equal(mechanicalState(q,'workers',3).activeWorkers,2);
    assert.equal(mechanicalState(q,'workers',5).retries,1);assert.equal(mechanicalState(q,'failure',6).failed,1);
    assert.equal(mechanicalState(q,'workers',4).retries,0);assert.equal(mechanicalState(q,'workers',0).activeWorkers,0);
    for(const [field,value,id,step] of [['queueDepth',9,'queue',1],['activeWorkers',3,'workers',3],['retries',2,'workers',5]]){const bad=clone(q);bad.steps[step].states[id][field]=value;assert.throws(()=>validateModel(bad),/超过约束/);}
    const missing=clone(q);delete missing.steps[1].states.queue;assert.equal(mechanicalState(missing,'queue',1),null);
    assert.equal(mechanicalState({...q,mode:'trace'},'queue',1),null);
    await renderModel(q,join(temp,'queue-retry.html'));
  });
  await test('relocated skill with spaces runs from an unrelated working directory',async()=>{
    const portable=join(temp,'portable skill');await mkdir(portable);
    for(const name of ['SKILL.md','scripts','assets','references','agents'])await cp(join(root,name),join(portable,name),{recursive:true});
    const output=join(temp,'portable output.html');
    const {stdout}=await promisify(execFile)(process.execPath,[join(portable,'scripts/render.mjs'),'--template','agent','--out',output],{cwd:tmpdir(),timeout:10000});
    assert.equal(JSON.parse(stdout).mode,'demo');assert((await readFile(output,'utf8')).includes('anatomy-model'));
  });
  console.log(`All ${tests} checks passed.`);
} finally {await rm(temp,{recursive:true,force:true});}
