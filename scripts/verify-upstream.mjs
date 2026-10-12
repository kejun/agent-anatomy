import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await readFile(resolve(root,'upstream.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const entry of manifest.files){
  assert.equal(sha(await readFile(resolve(root,entry.path))),entry.sha256,`Upstream file changed: ${entry.path}`);
}
const skill=await readFile(resolve(root,'SKILL.md'),'utf8');
const start=skill.indexOf('# Anatomy\n');
assert(start>0,'Original Anatomy workflow is required');
assert.equal(sha(skill.slice(start)),manifest.workflowBodySha256,'Original workflow changed');
console.log(`PASS ${manifest.files.length} upstream files and the complete original workflow match ${manifest.commit}`);
