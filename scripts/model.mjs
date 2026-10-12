export const MAX_BYTES = 15 * 1024 * 1024;
export const MAX_SPANS = 15000;
const kinds = ['queue','console','processor','memory','tool','router','database','sensor','speaker','display'];
const evidences = ['source','provided','inference','demo','unknown'];
const idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const MECHANICAL_ACTIONS = ['idle','enqueue','dequeue','process','read','write','retry','reject','error','complete'];
const counters = ['queueDepth','activeWorkers','retries','completed','failed','rejected'];
function need(test, message) { if (!test) throw new Error(message); }
function textField(value, label, limit = 6000) {
  need(typeof value === 'string' && value.trim().length > 0 && value.length <= limit, `${label} 必须是非空文本（最多 ${limit} 字符）`);
}
function ids(items, label, limit) {
  need(Array.isArray(items) && items.length <= limit, `${label} 必须是数组，最多 ${limit} 项`);
  const seen = new Set();
  for (const item of items) {
    need(item && typeof item.id === 'string' && idPattern.test(item.id), `${label} ID 无效`);
    need(!seen.has(item.id), `${label} ID 重复: ${item.id}`);
    seen.add(item.id);
  }
  return seen;
}
export function safeUrl(value) {
  try { const u = new URL(value); return ['https:','http:'].includes(u.protocol) ? u.href : null; }
  catch { return null; }
}
export function validateModel(model) {
  need(model && typeof model === 'object' && !Array.isArray(model), '模型必须是对象');
  need(model.schemaVersion === 1, 'schemaVersion 必须为 1');
  textField(model.title, 'title', 200); textField(model.summary, 'summary');
  need(['agent','software','ai-pipeline'].includes(model.template), '未知模板');
  need(['demo','architecture','trace'].includes(model.mode), '未知 mode');
  if (model.theme !== undefined) need(['light','dark'].includes(model.theme), '未知 theme');
  // Imported activity buckets have their own bounded allowance. A valid authored
  // model must remain importable when its ordinary node/domain budget is full.
  const domains = ids(model.domains, 'domains', 41), nodes = ids(model.nodes, 'nodes', 281);
  need(model.domains.filter(d => !d.traceGenerated).length <= 40, '最多 40 个业务域');
  need(model.domains.filter(d => d.traceGenerated).length <= 1, '最多一个导入生成的未归属域');
  need(model.nodes.filter(n => !n.traceGenerated).length <= 240, '最多 240 个建模部件');
  const edges = ids(model.edges, 'edges', 600), sources = ids(model.sources, 'sources', 120);
  need(domains.size > 0 && nodes.size > 0, '至少需要一个业务域和一个部件');
  for (const d of model.domains) { textField(d.name, 'domain.name', 80); textField(d.description, 'domain.description'); }
  for (const s of model.sources) {
    textField(s.title, 'source.title', 300);
    if (s.url !== undefined) need(safeUrl(s.url), '来源链接必须使用 HTTP/HTTPS');
    if (s.ref !== undefined) textField(s.ref, 'source.ref');
  }
  const byId = new Map(model.nodes.map(n => [n.id, n]));
  const evidence = item => {
    need(evidences.includes(item.evidence), `无效 evidence: ${item.id}`);
    need(Array.isArray(item.sources) && item.sources.every(s => sources.has(s)), `来源引用无效: ${item.id}`);
    need(item.evidence !== 'source' || item.sources.length > 0, `来源事实缺少证据: ${item.id}`);
  };
  const scopes = new Map();
  for (const n of model.nodes) {
    need(domains.has(n.domainId), `部件业务域不存在: ${n.id}`);
    need(kinds.includes(n.kind), `未知部件 kind: ${n.id}`);
    textField(n.label, 'node.label', 80); textField(n.description, 'node.description'); textField(n.behaviour, 'node.behaviour');
    for (const field of ['inputs','outputs']) need(Array.isArray(n[field]) && n[field].length <= 30 && n[field].every(v => typeof v === 'string' && v.length <= 1000), `${n.id}.${field} 无效`);
    evidence(n);
    if (n.mechanism !== undefined) {
      need(n.mechanism && typeof n.mechanism === 'object' && !Array.isArray(n.mechanism), 'mechanism 必须是对象');
      for (const [field, max] of [['capacity',64],['concurrency',16],['retryLimit',100]]) {
        const v = n.mechanism[field];
        if (v !== undefined) need(Number.isInteger(v) && v >= (field === 'retryLimit' ? 0 : 1) && v <= max, `mechanism.${field} 超出范围`);
      }
      need(Object.keys(n.mechanism).every(k => ['capacity','concurrency','retryLimit'].includes(k)), '未知 mechanism 字段');
    }
    let current = n; const seen = new Set([n.id]);
    while (current.parentId) {
      const parent = byId.get(current.parentId);
      need(parent && parent.domainId === n.domainId, `父部件缺失或跨业务域: ${n.id}`);
      need(!seen.has(parent.id), `部件层级成环: ${n.id}`);
      seen.add(parent.id); current = parent;
    }
    const scope = n.parentId ? `parent:${n.parentId}` : `domain:${n.domainId}`;
    if (!n.traceGenerated) scopes.set(scope, (scopes.get(scope) || 0) + 1);
    else need(!n.parentId && model.nodes.filter(x => x.traceGenerated && x.domainId === n.domainId).length === 1, '每域最多一个导入生成的根部件');
  }
  for (const [scope, count] of scopes) need(count <= 16, `${scope} 有 ${count} 个直接部件，请拆分层级（最多 16）`);
  for (const e of model.edges) {
    need(nodes.has(e.from) && nodes.has(e.to), `连线端点不存在: ${e.id}`);
    need(['control','data'].includes(e.kind), `未知连线 kind: ${e.id}`);
    textField(e.label, 'edge.label', 200); evidence(e);
  }
  if (model.steps !== undefined) {
    ids(model.steps, 'steps', 100);
    for (const s of model.steps) {
      textField(s.title, 'step.title', 200); textField(s.description, 'step.description');
      need(Array.isArray(s.active) && s.active.every(n => nodes.has(n)), `步骤部件引用无效: ${s.id}`);
      need(Array.isArray(s.edges) && s.edges.every(e => edges.has(e)), `步骤连线引用无效: ${s.id}`);
      if (s.states !== undefined) {
        need(s.states && typeof s.states === 'object' && !Array.isArray(s.states), 'step.states 必须是完整状态快照对象');
        for (const [id, state] of Object.entries(s.states)) {
          need(nodes.has(id) && state && typeof state === 'object' && !Array.isArray(state), '机械状态部件无效');
          need(Object.keys(state).every(k => [...counters,'action'].includes(k)), '未知机械状态字段');
          for (const k of counters) if (state[k] !== undefined) need(Number.isSafeInteger(state[k]) && state[k] >= 0, `机械状态 ${k} 必须为非负整数`);
          if (state.action !== undefined) need(MECHANICAL_ACTIONS.includes(state.action), '未知机械动作');
          const m = byId.get(id).mechanism || {};
          for (const [field, limit] of [['queueDepth','capacity'],['activeWorkers','concurrency'],['retries','retryLimit']]) {
            if (state[field] !== undefined) need(m[limit] !== undefined && state[field] <= m[limit], `${id}.${field} 缺少对应容量或超过约束`);
          }
        }
      }
    }
  }
  if (model.mode === 'demo') need(model.steps?.length > 0, '演示模式必须有 steps');
  if (model.exampleTrace !== undefined) {
    need(model.exampleTrace?.synthetic === true, 'exampleTrace 必须明确声明 synthetic:true');
    normalizeTrace(model.exampleTrace);
  }
  if (model.spans !== undefined) {
    need(Array.isArray(model.spans) && model.spans.length <= MAX_SPANS, 'spans 必须是数组且不超过上限');
    for (const s of model.spans) {
      need(s && typeof s.id === 'string' && typeof s.traceId === 'string' && typeof s.name === 'string', 'span 标识无效');
      need(Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.endMs >= s.startMs, 'span 时间无效');
      need(nodes.has(s.nodeId) && byId.get(s.nodeId).domainId === s.domainId, 'span 归属无效');
      need(['ok','error','unknown'].includes(s.status), 'span 状态无效');
      need(s.attributes && typeof s.attributes === 'object' && !Array.isArray(s.attributes), 'span 属性无效');
    }
  }
  if (model.mode === 'trace') need(model.spans?.length > 0, '追踪模式必须有已归属的完成 span；使用 --trace 导入');
  if (model.traceMeta !== undefined) {
    need(model.traceMeta && Array.isArray(model.traceMeta.warnings) && model.traceMeta.warnings.every(w => typeof w.message === 'string' && Number.isFinite(w.count)), 'traceMeta.warnings 无效');
  }
  return model;
}
export function parseModel(input) {
  if (typeof input !== 'string') return validateModel(input);
  if (input.length > MAX_BYTES) throw new Error('模型超过 15 MiB');
  let raw = input.trim();
  if (!raw.startsWith('{')) {
    const blocks = [...raw.matchAll(/```(?:anatomy|json)\s*\n([\s\S]*?)\n```/g)];
    need(blocks.length === 1, 'Markdown 需要且只能包含一个 anatomy/json JSON 代码块；自然语言请先由 Agent 整理为模型');
    raw = blocks[0][1];
  }
  try { return validateModel(JSON.parse(raw)); }
  catch (error) { throw new Error(`模型无效: ${error.message}`); }
}
function otelValue(v) {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('boolValue' in v) return v.boolValue;
  if ('intValue' in v) return v.intValue;
  if ('doubleValue' in v) return v.doubleValue;
  if (v.arrayValue) return (v.arrayValue.values || []).map(otelValue);
  if (v.kvlistValue) return attrs(v.kvlistValue.values);
  return null;
}
function attrs(items) { return Object.fromEntries((items || []).filter(a => a && typeof a.key === 'string').map(a => [a.key, otelValue(a.value)])); }
function explicitStatus(v) { return ['ok','error','unknown'].includes(v) ? v : 'unknown'; }
export function normalizeTrace(input) {
  let raw = input;
  if (typeof input === 'string') {
    need(input.length <= MAX_BYTES, 'Trace 超过 15 MiB');
    try { raw = JSON.parse(input); }
    catch {
      try { raw = input.split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l)); }
      catch { throw new Error('Trace 不是有效的 JSON 或 JSONL'); }
    }
  }
  const diagnostics = new Map();
  const warn = message => diagnostics.set(message, (diagnostics.get(message) || 0) + 1);
  let spans = [], format = 'canonical', origin = null;
  if (raw?.resourceSpans) {
    format = 'OTLP JSON'; const all = [];
    need(Array.isArray(raw.resourceSpans), 'resourceSpans 必须是数组');
    for (const resource of raw.resourceSpans) {
      for (const scope of resource.scopeSpans || resource.instrumentationLibrarySpans || []) {
        for (const span of scope.spans || []) all.push({span, resource: attrs(resource.resource?.attributes), scope: scope.scope || scope.instrumentationLibrary || null});
      }
    }
    need(all.length <= MAX_SPANS, `最多 ${MAX_SPANS} 个 span`);
    const valid = [];
    for (const item of all) {
      try {
        need(typeof item.span.startTimeUnixNano === 'string' && /^\d+$/.test(item.span.startTimeUnixNano) && typeof item.span.endTimeUnixNano === 'string' && /^\d+$/.test(item.span.endTimeUnixNano), '纳秒时间必须是十进制字符串');
        const start = BigInt(item.span.startTimeUnixNano), end = BigInt(item.span.endTimeUnixNano);
        need(start > 0n && end >= start, '无效纳秒时间');
        valid.push({...item, start, end});
      } catch { warn('排除未完成或时间无效的 OTLP span'); }
    }
    if (valid.length) {
      const base = valid.reduce((m, s) => s.start < m ? s.start : m, valid[0].start);
      origin = {startTimeUnixNano: base.toString()};
      spans = valid.map(({span: s, resource, scope, start, end}) => ({
        id: s.spanId, traceId: s.traceId || 'otlp', parentId: s.parentSpanId || null, name: s.name,
        startMs: Number(start - base) / 1e6, endMs: Number(end - base) / 1e6,
        status: s.status?.code === 2 || s.status?.code === 'STATUS_CODE_ERROR' ? 'error' : s.status?.code === 1 || s.status?.code === 'STATUS_CODE_OK' ? 'ok' : 'unknown',
        attributes: {...resource, ...attrs(s.attributes)}, resourceAttributes:resource, instrumentationScope:scope,
        statusMessage:s.status?.message || '', events:s.events || [], links:s.links || [], raw:s
      }));
    }
  } else if (Array.isArray(raw?.traceEvents) || (Array.isArray(raw) && raw.some(s => s?.ph))) {
    format = 'Chrome Trace'; const events = raw.traceEvents || raw;
    need(events.length <= MAX_SPANS * 4, 'Chrome Trace 事件数量过多');
    const times = events.filter(e => ['X','B','E'].includes(e?.ph) && Number.isFinite(e.ts)).map(e => e.ts);
    const baseUs = times.length ? Math.min(...times) : 0;
    origin = {startTimeMicroseconds:baseUs};
    const stacks = new Map(); let sequence = 0;
    const sorted = events.map((e, i) => ({e, i})).sort((a,b) => (Number(a.e.ts) || 0) - (Number(b.e.ts) || 0) || a.i - b.i);
    for (const {e} of sorted) {
      if (['M','i','I','C'].includes(e.ph)) continue;
      if (!['X','B','E'].includes(e.ph)) { warn('忽略不支持的 Chrome 事件类型'); continue; }
      if (!Number.isFinite(e.ts) || (e.ph === 'X' && !Number.isFinite(e.dur))) { warn('排除时间无效的 Chrome 事件'); continue; }
      const thread = `${e.pid ?? 0}/${e.tid ?? 0}`;
      const stack = stacks.get(thread) || []; stacks.set(thread, stack);
      const make = (event, end, id, parentId = null) => ({id, traceId: `chrome:${event.pid ?? 0}`, parentId: event.args?.parentId || parentId,
        name: event.name, startMs: (event.ts - baseUs) / 1000, endMs: (end - baseUs) / 1000,
        status: explicitStatus(event.args?.status ?? (event.args?.error === true ? 'error' : undefined)), attributes: event.args || {}, raw:event});
      if (e.ph === 'X') spans.push(make(e, Number(e.ts) + Number(e.dur), `chrome-${++sequence}`));
      else if (e.ph === 'B') stack.push({event:e, id:`chrome-${++sequence}`, parentId:stack.at(-1)?.id || null});
      else if (e.ph === 'E') {
        const begin = stack.pop();
        if (!begin) warn('排除没有对应 B 的 E 事件');
        else {
          const event = {...begin.event, args:{...begin.event.args, ...e.args}};
          spans.push({...make(event, Number(e.ts), begin.id, begin.parentId),raw:{begin:begin.event,end:e}});
        }
      } else warn('忽略不支持的 Chrome 事件类型');
    }
    for (const stack of stacks.values()) for (const unused of stack) warn('排除没有对应 E 的未完成 B 事件');
  } else {
    spans = Array.isArray(raw) ? raw : raw?.spans || (raw && 'startMs' in raw ? [raw] : undefined);
    need(Array.isArray(spans), 'Trace 需要 spans、traceEvents、resourceSpans 或 span 数组');
  }
  need(spans.length <= MAX_SPANS, `最多 ${MAX_SPANS} 个 span`);
  const valid = [], seen = new Set();
  for (const [index, s] of spans.entries()) {
    const start = s?.startMs, end = s?.endMs;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || !s.name || typeof s.name !== 'string') { warn('排除未完成或字段无效的 span'); continue; }
    const id = String(s.id ?? `span-${index}`), traceId = String(s.traceId ?? 'default');
    const key = JSON.stringify([traceId,id]);
    if (seen.has(key)) { warn('排除重复 traceId/span ID'); continue; } seen.add(key);
    const attributes = s.attributes && typeof s.attributes === 'object' && !Array.isArray(s.attributes) ? s.attributes : {};
    valid.push({...s, id, traceId, parentId:s.parentId ? String(s.parentId) : null, name:s.name, startMs:start, endMs:end,
      status:explicitStatus(s.status), attributes, raw:s.raw || s,
      nodeId:s.nodeId ?? attributes['anatomy.node_id'], domainId:s.domainId ?? attributes['business.domain'] ?? attributes['anatomy.domain_id']});
  }
  need(valid.length > 0, '没有可回放的完成 span');
  const base = Math.min(...valid.map(s => s.startMs));
  if (!origin) origin = {startMs:base};
  for (const s of valid) { s.startMs -= base; s.endMs -= base; }
  valid.sort((a,b) => a.startMs - b.startMs || a.endMs - b.endMs);
  return {spans:valid, format, origin, synthetic:raw?.synthetic === true, warnings:[...diagnostics].map(([message,count]) => ({message,count}))};
}
export function attachTrace(model, trace) {
  validateModel(model); const result = JSON.parse(JSON.stringify(model));
  result.nodes = result.nodes.filter(n => !n.traceGenerated);
  result.domains = result.domains.filter(d => !d.traceGenerated);
  const nodes = new Map(result.nodes.map(n => [n.id,n]));
  const domains = new Map(result.domains.map(d => [d.id,d]));
  const warnings = [...trace.warnings]; const counts = new Map(); let unmapped = 0;
  const warn = message => counts.set(message, (counts.get(message) || 0) + 1);
  const exact = (items, value, field) => {
    const matches = items.filter(item => item.id === value || item[field] === value);
    return matches.length === 1 ? matches[0] : null;
  };
  const used = new Set([...nodes.keys(), ...domains.keys()]);
  const unique = base => { let id = base, i = 1; while (used.has(id)) id = `${base}-${i++}`; used.add(id); return id; };
  const buckets = new Map(); let unknownDomain;
  result.spans = trace.spans.map(s => {
    let node = s.nodeId ? nodes.get(s.nodeId) : exact(result.nodes, s.name, 'label');
    let domain = s.domainId ? exact(result.domains, s.domainId, 'name') : null;
    if (s.nodeId && !node) warn('显式 nodeId 未匹配部件');
    if (s.domainId && !domain) warn('显式 domainId 未匹配业务域');
    if (node && domain && domain.id !== node.domainId) warn('nodeId 与 domainId 冲突，按部件所属业务域归属');
    if (node) domain = domains.get(node.domainId);
    if (!domain) {
      unmapped++;
      if (!unknownDomain) {
        unknownDomain = {id:unique('trace-unmapped'), name:'未归属', description:'没有明确业务域或部件映射的记录。', traceGenerated:true};
        result.domains.push(unknownDomain); domains.set(unknownDomain.id, unknownDomain);
      }
      domain = unknownDomain;
    }
    if (!node) {
      node = buckets.get(domain.id);
      if (!node) {
        node = {id:unique(`trace-activity-${buckets.size}`), domainId:domain.id, label:domain === unknownDomain ? '未归属活动' : `${domain.name}活动`, kind:'processor',
          description:'已导入 span 的聚合部件；未建立这些 span 之间的调用关系。', behaviour:'按时间回放记录中的活动。', inputs:[], outputs:[], evidence:'provided', sources:[], traceGenerated:true};
        result.nodes.push(node); nodes.set(node.id,node); buckets.set(domain.id,node);
      }
    }
    return {...s, nodeId:node.id, domainId:domain.id};
  });
  warnings.push(...[...counts].map(([message,count]) => ({message,count})));
  result.mode = 'trace'; result.traceMeta = {format:trace.format, origin:trace.origin, synthetic:trace.synthetic === true, warnings, unmapped};
  validateModel(result);
  return result;
}
export function spanStats(spans) {
  let duration = 0, errors = 0, tokens = 0, tokenFields = 0;
  for (const s of spans) {
    duration += s.endMs - s.startMs; errors += Number(s.status === 'error');
    for (const keys of [['gen_ai.usage.input_tokens','input_tokens','prompt_tokens'],['gen_ai.usage.output_tokens','output_tokens','completion_tokens']]) {
      const key = keys.find(k => s.attributes?.[k] !== undefined);
      const raw = key ? s.attributes[key] : undefined;
      const value = typeof raw === 'string' && /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : raw;
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) { tokens += value; tokenFields++; }
    }
  }
  return {count:spans.length, errors, cumulativeMs:duration, meanMs:spans.length ? duration / spans.length : null,
    rangeMs:spans.length ? Math.max(...spans.map(s => s.endMs)) - Math.min(...spans.map(s => s.startMs)) : null,
    tokens:tokenFields ? tokens : null, tokenFields};
}
export function descendants(model, id) {
  const set = new Set([id]); let changed = true;
  while (changed) { changed = false; for (const n of model.nodes) if (set.has(n.parentId) && !set.has(n.id)) { set.add(n.id); changed = true; } }
  return set;
}
export function buildTraceIndex(model) {
  const nodes = new Map(model.nodes.map(n => [n.id,n]));
  const byNode = new Map(model.nodes.map(n => [n.id,[]])), byDomain = new Map(model.domains.map(d => [d.id,[]]));
  const byTrace = new Map(), byIdentity = new Map(), children = new Map(), search = new Map();
  const depth = n => {let value=0;while(n.parentId){value++;n=nodes.get(n.parentId);}return value;};
  const bottomUp = [...model.nodes].sort((a,b) => depth(b)-depth(a));
  for (const s of model.spans || []) {
    let n=nodes.get(s.nodeId);while(n){byNode.get(n.id).push(s);n=nodes.get(n.parentId);}
    byDomain.get(s.domainId)?.push(s);
    if(!byTrace.has(s.traceId))byTrace.set(s.traceId,[]);byTrace.get(s.traceId).push(s);
    byIdentity.set(JSON.stringify([s.traceId,s.id]),s);
    const parentKey=JSON.stringify([s.traceId,s.parentId]);
    if(s.parentId){if(!children.has(parentKey))children.set(parentKey,[]);children.get(parentKey).push(s);}
    search.set(s,`${s.traceId} ${s.id} ${s.name} ${JSON.stringify(s.attributes)} ${s.statusMessage || ''}`.toLowerCase());
  }
  return {nodes,byNode,byDomain,byTrace,byIdentity,children,search,bottomUp,spans:model.spans || []};
}
export function traceActivity(index,cursor) {
  const empty=()=>({running:0,completed:0,errors:0,unknown:0,total:0});
  const nodes=new Map([...index.nodes.keys()].map(id=>[id,empty()]));
  const domains=new Map([...index.byDomain.keys()].map(id=>[id,empty()]));const active=[];
  for(const s of index.spans){
    const running=s.startMs<=cursor&&s.endMs>cursor, done=s.endMs<=cursor;
    if(running)active.push(s);
    for(const item of [nodes.get(s.nodeId),domains.get(s.domainId)]){
      item.total++;item.running+=Number(running);item.completed+=Number(done);
      item.errors+=Number(done&&s.status==='error');item.unknown+=Number(done&&s.status==='unknown');
    }
  }
  for(const n of index.bottomUp)if(n.parentId){const child=nodes.get(n.id),parent=nodes.get(n.parentId);for(const k of Object.keys(child))parent[k]+=child[k];}
  return {nodes,domains,active};
}
export function mechanicalState(model,nodeId,cursor) {
  // Only explicit, complete demo snapshots drive counters. Span activity alone
  // cannot establish queue length, concurrency capacity or retry policy.
  return model.mode==='demo' ? model.steps?.[Math.round(cursor)]?.states?.[nodeId] || null : null;
}
export function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function scriptJson(value) { return JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029'); }
