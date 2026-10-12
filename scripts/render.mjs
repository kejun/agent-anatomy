#!/usr/bin/env node
import {readFile, writeFile, mkdir, rename, unlink, stat} from 'node:fs/promises';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {MAX_BYTES, parseModel, normalizeTrace, attachTrace, scriptJson, escapeHtml} from './model.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function readBounded(path) {
  const info = await stat(path);
  if (info.size > MAX_BYTES) throw new Error('输入超过 15 MiB');
  return readFile(path, 'utf8');
}
export async function renderModel(model, output) {
  model = parseModel(model);
  const [shell, core, scene, runtime] = await Promise.all([
    readFile(join(root,'assets/page.html'),'utf8'), readFile(join(root,'scripts/model.mjs'),'utf8'),
    readFile(join(root,'assets/scene.js'),'utf8'), readFile(join(root,'assets/runtime.js'),'utf8')
  ]);
  const code = core.replace(/^export /gm, '') + '\n' + scene + '\n' + runtime;
  if (/<\/script/i.test(code)) throw new Error('脚本包含不安全的 HTML 结束标签');
  const html = shell.replace('__TITLE__', () => escapeHtml(model.title)).replace('__DATA__', () => scriptJson(model)).replace('__SCRIPT__', () => code);
  const path = resolve(output); await mkdir(dirname(path), {recursive:true});
  const temp = `${path}.${process.pid}.tmp`;
  try { await writeFile(temp, html, 'utf8'); await rename(temp, path); }
  finally { await unlink(temp).catch(() => {}); }
  return path;
}
async function main() {
  const {values} = parseArgs({options:{input:{type:'string'},template:{type:'string'},trace:{type:'string'},out:{type:'string'},help:{type:'boolean'}}});
  if (values.help) { console.log('node scripts/render.mjs (--input MODEL.json|MODEL.md | --template agent|software|ai-pipeline) [--trace TRACE.json] --out FILE.html'); return; }
  if (!values.out || Boolean(values.input) === Boolean(values.template)) throw new Error('指定 --out，并只选择 --input 或 --template 之一');
  if (values.template && !['agent','software','ai-pipeline'].includes(values.template)) throw new Error('未知模板');
  const input = resolve(values.input || join(root,'assets/templates',`${values.template}.json`));
  if ([input, values.trace && resolve(values.trace)].includes(resolve(values.out))) throw new Error('输出路径不能覆盖输入');
  let model = parseModel(await readBounded(input));
  if (values.trace) model = attachTrace(model, normalizeTrace(await readBounded(resolve(values.trace))));
  const path = await renderModel(model, values.out);
  console.log(JSON.stringify({output:path, mode:model.mode, nodes:model.nodes.length, spans:model.spans?.length || 0, warnings:model.traceMeta?.warnings || []}));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`构建失败: ${error.message}`); process.exitCode = 1; });
