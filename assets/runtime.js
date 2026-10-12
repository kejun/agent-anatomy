(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const original = parseModel(JSON.parse($('anatomy-model').textContent));
  let model = JSON.parse(JSON.stringify(original));
  const state = {domain:null,parent:null,selected:null,tab:'component',scope:'view',errors:false,span:null,cursor:0,phase:0,playing:false,zoom:1,last:0,page:0,query:'',traceId:'',domainMetric:'count'};
  let index=buildTraceIndex(model), indexedModel=model, activity=null, activityCursor=null;
  let traceDuration=Math.max(0,...index.spans.map(s=>s.endMs));
  let ordinals=new Map(index.spans.map((s,i)=>[s,i+1]));
  let domainStats=new Map([...index.byDomain].map(([id,spans])=>[id,spanStats(spans)]));
  const pageSize=100;
  const actionNames={idle:'待机',enqueue:'入队',dequeue:'出队',process:'处理',read:'读取',write:'写入',retry:'重试',reject:'拒绝',error:'失败',complete:'完成'};
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const evidenceNames = {source:'来源事实',provided:'用户或文件提供',inference:'推断',demo:'合成演示',unknown:'未知'};
  const statusNames = {running:'运行中',pending:'尚未开始',ok:'完成',error:'错误',unknown:'状态未记录',idle:'待机'};
  const fmt = v => v === null || v === undefined ? '未提供' : Number(v).toLocaleString('zh-CN',{maximumFractionDigits:2});
  const ms = v => v === null || v === undefined ? '未提供' : `${fmt(v)} ms`;
  const h = escapeHtml;
  let visible = [], edgePaths = [], frame = null;
  function allSpans() { return model.spans || []; }
  function duration() { return traceDuration; }
  function maxCursor() { return model.mode === 'trace' ? duration() : Math.max(0,(model.steps?.length || 1)-1); }
  function nodeSet(id) { return descendants(model,id); }
  function spansForNode(id) { return index.byNode.get(id) || []; }
  function currentActivity() {
    if(!activity||activityCursor!==state.cursor){activity=traceActivity(index,state.cursor);activityCursor=state.cursor;}
    return activity;
  }
  function visibleNodes() { return model.nodes.filter(n=>(state.parent ? n.parentId === state.parent : !n.parentId) && (!state.domain || n.domainId===state.domain)); }
  function viewSpans() {
    if(state.traceId) return index.byTrace.get(state.traceId) || [];
    if(state.scope==='node' && state.selected) return spansForNode(state.selected);
    return state.domain ? index.byDomain.get(state.domain) || [] : allSpans();
  }
  function nodeState(id) {
    const set = nodeSet(id);
    if(model.mode==='demo') {
      const actions=[...set].map(n=>mechanicalState(model,n,state.cursor)?.action);
      if(actions.includes('error')||actions.includes('reject'))return 'error';
      if((model.steps[Math.round(state.cursor)]?.active || []).some(n=>set.has(n)))return 'running';
      return actions.includes('complete')?'ok':'idle';
    }
    if(model.mode!=='trace') return 'unknown';
    const a=currentActivity().nodes.get(id);
    if(!a?.total)return 'unknown';
    if(a.running)return 'running';
    if(a.errors)return 'error';
    if(!a.completed)return 'pending';
    return a.unknown?'unknown':'ok';
  }
  function pause() { state.playing=false; if(frame!==null) cancelAnimationFrame(frame); frame=null; $('play').textContent='播放'; }
  function resetNavigation() {
    state.domain=null; state.parent=null; state.selected=model.nodes.find(n=>!n.parentId)?.id;
    state.tab='component'; state.scope='view'; state.errors=false; state.span=null; state.cursor=0; state.phase=0;state.page=0;state.query='';state.traceId='';
  }
  function resetRecordFilters(){state.scope='view';state.errors=false;state.span=null;state.page=0;state.query='';state.traceId='';}
  function notify(message,error=false) { $('notice').textContent=message; $('notice').classList.toggle('error',error); }
  function renderDomains() {
    const total=spanStats(allSpans());
    const metric=state.domainMetric, metricNames={count:'条记录',cumulativeMs:'ms 累计',errors:'条错误',tokens:'已记录 token'};
    const maximum=Math.max(1,...[...domainStats.values()].map(s=>s[metric]||0));
    const item=(id,name,description,count,errors,stats) => `<button class="domain" data-domain="${id || ''}" aria-pressed="${state.domain===id}"><strong>${h(name)}</strong><span>${model.mode==='trace'?`${count} SPANS`:`${count} 部件`}</span><small>${h(description)}${errors?` · ${errors} 个错误`:''}</small>${model.mode==='trace'&&id?`<small class="domain-load">${fmt(stats[metric])} ${metricNames[metric]}<i style="width:${(stats[metric]||0)/maximum*100}%"></i></small>`:''}<small data-activity-for="${id||''}" class="domain-activity"></small></button>`;
    $('domains').innerHTML=item(null,'全貌','从业务域到部件，再到执行记录。',model.mode==='trace'?total.count:model.nodes.length,total.errors)+model.domains.map(d=>{
      const stats=domainStats.get(d.id);
      return item(d.id,d.name,d.description,model.mode==='trace'?stats.count:model.nodes.filter(n=>n.domainId===d.id).length,stats.errors,stats);
    }).join('');
    $('domains').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
      state.domain=b.dataset.domain || null; state.parent=null; resetRecordFilters();
      state.selected=visibleNodes()[0]?.id; draw();
    }));
  }
  function renderCrumbs() {
    const crumbs=[{id:'',label:'全貌'}];
    if(state.domain) crumbs.push({id:`domain:${state.domain}`,label:model.domains.find(d=>d.id===state.domain).name});
    const chain=[]; let parent=model.nodes.find(n=>n.id===state.parent);
    while(parent) { chain.unshift(parent); parent=model.nodes.find(n=>n.id===parent.parentId); }
    for(const n of chain) crumbs.push({id:n.id,label:n.label});
    $('crumbs').innerHTML=crumbs.map((c,i)=>`${i?'<span class="muted">/</span>':''}<button data-crumb="${c.id}">${h(c.label)}</button>`).join('');
    $('crumbs').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
      const id=b.dataset.crumb; resetRecordFilters();
      if(!id) {state.parent=null;state.domain=null;}
      else if(id.startsWith('domain:')) {state.domain=id.slice(7);state.parent=null;}
      else state.parent=id;
      state.selected=visibleNodes()[0]?.id; draw();
    }));
  }
  function drawScene() {
    visible=visibleNodes();
    if(!visible.length) { $('scene').innerHTML='<text x="30" y="60">当前层级没有部件</text>'; $('scene').setAttribute('viewBox','0 0 400 180'); edgePaths=[]; return; }
    const visibleIds=new Set(visible.map(n=>n.id)), nodes=new Map(model.nodes.map(n=>[n.id,n]));
    const owner=id=>{let n=nodes.get(id);while(n&&!visibleIds.has(n.id)) n=nodes.get(n.parentId);return n?.id;};
    const edges=model.edges.map(e=>({...e,from:owner(e.from),to:owner(e.to)})).filter(e=>e.from&&e.to&&e.from!==e.to);
    const scene=sceneMarkup(model,visible,edges,state.selected,window.matchMedia('(max-width: 760px)').matches);
    $('scene').setAttribute('viewBox',`0 0 ${scene.width} ${scene.height}`); $('scene').innerHTML=scene.markup; edgePaths=scene.edgePaths;
    $('scene').querySelectorAll('.station').forEach(g=>{
      const select=()=>{state.selected=g.dataset.nodeId;state.tab='component';state.span=null;renderInspector();syncActivity();};
      g.addEventListener('click',select);g.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();select();}});
    });
    setZoom(state.zoom);
  }
  function statsMarkup(spans) {
    if(model.mode!=='trace') return '<p class="fine-print">没有导入实际 Trace；延迟、调用量和 token 均未提供。</p>';
    const s=spanStats(spans);
    return `<div class="metrics"><div class="metric"><strong>${fmt(s.count)}</strong><span>完成 span 记录</span></div><div class="metric"><strong>${fmt(s.errors)}</strong><span>错误记录</span></div><div class="metric"><strong>${s.count?ms(s.meanMs):'无记录'}</strong><span>平均 span 耗时</span></div><div class="metric"><strong>${fmt(s.tokens)}</strong><span>已记录 token 求和</span></div></div><p class="fine-print">记录时间范围 ${ms(s.rangeMs)}；span 累计耗时 ${ms(s.cumulativeMs)}。累计包含并行及父子重叠，不能当墙钟时间。Token 只统计已记录字段，父子重复上报可能重复计数。</p>`;
  }
  function sourceMarkup(ids) {
    return ids.map(id=>{
      const s=model.sources.find(source=>source.id===id);if(!s)return '';
      const label=safeUrl(s.url)?`<a href="${h(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${h(s.title)}</a>`:h(s.title);
      return `<div class="link-row">${label}${s.ref?`<small>${h(s.ref)}</small>`:''}</div>`;
    }).join('') || '<p class="fine-print">未提供外部来源。请检查本项的证据分类。</p>';
  }
  function renderComponent() {
    const n=model.nodes.find(n=>n.id===state.selected);if(!n) return '<p>选择一个部件查看机制。</p>';
    const children=model.nodes.filter(child=>child.parentId===n.id);
    const edges=model.edges.filter(e=>e.from===n.id||e.to===n.id);
    return `<div class="evidence">${h(evidenceNames[n.evidence])} / <span id="current-node-state">${statusNames[nodeState(n.id)]}</span></div><h2>${h(n.label)}</h2><p class="description">${h(n.description)}</p><div class="io"><div class="io-box"><strong>输入</strong><ul>${(n.inputs.length?n.inputs:['未声明']).map(t=>`<li>${h(t)}</li>`).join('')}</ul></div><div class="io-box"><strong>输出</strong><ul>${(n.outputs.length?n.outputs:['未声明']).map(t=>`<li>${h(t)}</li>`).join('')}</ul></div></div><h3>机制</h3><p class="behaviour">${h(n.behaviour)}</p><div id="mechanical-detail"></div>${children.length?`<button id="drill" class="action">进入内部 · ${children.length} 个部件 <span>↗</span></button>`:''}<h3>已记录的活动</h3>${statsMarkup(spansForNode(n.id))}${model.mode==='trace'?'<button id="node-records" class="action">查看该部件的执行记录 <span>→</span></button>':''}<h3>连接关系</h3><ul class="relations">${edges.map(e=>{const other=model.nodes.find(node=>node.id===(e.from===n.id?e.to:e.from));return `<li>${e.from===n.id?'→':'←'} ${h(other.label)}：${h(e.label)} <small>(${h(evidenceNames[e.evidence])})</small></li>`;}).join('')||'<li>未声明连接</li>'}</ul><h3>部件依据</h3>${sourceMarkup(n.sources)}`;
  }
  function spanButton(s,label) {
    return `<button class="action" data-related-span="${ordinals.get(s)}">${h(label)} · ${h(s.name)} <span>→</span></button>`;
  }
  function renderSpan(span) {
    const key=JSON.stringify([span.traceId,span.id]);
    const parent=span.parentId?index.byIdentity.get(JSON.stringify([span.traceId,span.parentId])):null;
    const children=index.children.get(key)||[];
    return `<button id="records-back" class="action">← 返回执行记录</button><h3>记录详情</h3><h2>${h(span.name)}</h2><p class="description">${statusNames[span.status]} · ${ms(span.endMs-span.startMs)}</p><div class="link-row">traceId <small>${h(span.traceId)}</small></div><button id="whole-trace" class="action">查看本次处理的全部 ${index.byTrace.get(span.traceId).length} 条记录 →</button><div class="link-row">span ID <small>${h(span.id)}</small></div><h3>调用关系</h3>${parent?spanButton(parent,'父记录'):`<p class="fine-print">${span.parentId?`${h(span.parentId)}（父记录未在文件中找到）`:'没有父记录'}</p>`}${children.slice(0,20).map(s=>spanButton(s,'子记录')).join('')}${children.length>20?'<p class="fine-print">此处预览前 20 个子记录，其余可在本次处理的完整列表中分页查看。</p>':''}<div class="link-row">时间 <small>${ms(span.startMs)} → ${ms(span.endMs)}</small></div>${span.statusMessage?`<h3>错误消息</h3><p class="error-message">${h(span.statusMessage)}</p>`:''}<h3>属性</h3><pre class="span-attrs">${h(JSON.stringify(span.attributes,null,2))}</pre>${span.events?.length?`<h3>事件与异常</h3><pre class="span-attrs">${h(JSON.stringify(span.events,null,2))}</pre>`:''}${span.links?.length?`<h3>关联记录</h3><pre class="span-attrs">${h(JSON.stringify(span.links,null,2))}</pre>`:''}<details class="raw-record"><summary>原始输入记录</summary><pre class="span-attrs">${h(JSON.stringify(span.raw||span,null,2))}</pre></details>`;
  }
  function renderTrace() {
    if(model.mode!=='trace') return `<h2>执行记录</h2><p class="description">选择本地 Trace 文件后可回放活动、定位错误并检查原始属性。${model.mode==='demo'?'当前为合成教学步骤。':'当前为静态架构，没有运行记录。'}</p><p class="fine-print">支持 JSON / JSONL、Chrome Trace 和 OTLP JSON。文件在浏览器中解析，不会上传。</p>`;
    if(state.span) {const span=allSpans()[state.span-1];if(span)return renderSpan(span);}
    const spans=viewSpans(), query=state.query.trim().toLowerCase();
    const filtered=spans.filter(s=>(!state.errors||s.status==='error')&&(!query||index.search.get(s).includes(query)));
    const pages=Math.max(1,Math.ceil(filtered.length/pageSize));state.page=Math.min(state.page,pages-1);
    const rows=filtered.slice(state.page*pageSize,(state.page+1)*pageSize), total=duration()||1;
    const name=state.traceId?`本次处理 · ${state.traceId}`:state.scope==='node'?model.nodes.find(n=>n.id===state.selected)?.label:state.domain?model.domains.find(d=>d.id===state.domain).name:'全部记录';
    return `<h2>${h(name)}</h2><p class="description">选择记录会定位所属部件；按 traceId 查看一次处理及其父子调用。</p>${statsMarkup(spans)}<form id="record-filters" class="record-filters"><label>搜索名称、ID 或属性<input id="record-search" type="search" value="${h(state.query)}" placeholder="例如错误消息或文档编号"></label><label>完整 traceId<input id="trace-filter" value="${h(state.traceId)}" placeholder="留空查看当前范围"></label><button type="submit">应用筛选</button><button type="button" id="clear-records">全部记录</button></form>${state.traceId?'':`<button id="record-scope" class="action">${state.scope==='node'?'查看当前业务域全部记录':'仅查看所选部件'} <span>↔</span></button>`}<button id="errors" class="filter-errors" aria-pressed="${state.errors}">只看错误 · ${spans.filter(s=>s.status==='error').length} 条</button><div class="pagination"><button id="page-prev" ${state.page===0?'disabled':''}>上一页</button><span>${state.page+1} / ${pages} 页 · ${filtered.length} 条</span><button id="page-next" ${state.page===pages-1?'disabled':''}>下一页</button></div><p class="fine-print">统计包含当前范围全部记录；搜索与错误筛选作用于下方列表。</p>${rows.length?rows.map(s=>`<button class="span-row ${s.status==='error'?'error':''}" data-span-index="${ordinals.get(s)}"><strong>${h(s.name)}</strong><small>${h(s.traceId)} · ${h(s.id)}</small><small>${ms(s.startMs)} → ${ms(s.endMs)} · ${statusNames[s.status]}</small><span class="span-bar"><i style="left:${s.startMs/total*100}%;width:${(s.endMs-s.startMs)/total*100}%"></i></span></button>`).join(''):'<p class="description">没有匹配记录。可清除筛选或检查 traceId。</p>'}`;
  }
  function renderSources() {
    const warnings=model.traceMeta?.warnings || [];
    return `<h2>来源与统计口径</h2><p class="description">每个部件与连接都区分来源事实、输入依据、推断、合成演示和未知。当前图形包含 ${model.nodes.filter(n=>n.evidence==='demo').length} 个合成部件。</p>${sourceMarkup(model.sources.map(s=>s.id))}<h3>追踪输入</h3><p class="fine-print">${model.mode==='trace'?`${h(model.traceMeta?.format||'标准 span')}；未归属 ${model.traceMeta?.unmapped||0} 条。${model.traceMeta?.synthetic?'此追踪已标记为合成数据。':''}`:'尚未导入实际记录。'}${model.traceMeta?.fileName?` 文件：${h(model.traceMeta.fileName)}`:''}</p>${warnings.length?`<h3>导入诊断</h3><ul class="relations">${warnings.map(w=>`<li>${h(w.message)} × ${h(w.count)}</li>`).join('')}</ul>`:''}<h3>度量的边界</h3><p class="fine-print">总时间范围是最早开始到最晚结束。平均与累计耗时按 span 计算，包含父子和并行重叠。Token 只求和输入文件提供的字段，不能保证消除父子重复记录。费用未提供，也不推算。</p><h3>图形的含义</h3><p class="fine-print">机械部件是解释机制的隐喻。合成模式的流动表示教学步骤；Trace 模式仅根据 span 点亮活动，不推测未记录的传输。回放不是实时采集。</p>`;
  }
  function renderInspector() {
    for(const tab of ['component','trace','source']) $('tab-'+tab).setAttribute('aria-selected',String(state.tab===tab));
    $('detail').setAttribute('aria-labelledby','tab-'+state.tab);
    $('detail').innerHTML=state.tab==='component'?renderComponent():state.tab==='trace'?renderTrace():renderSources();
    if($('drill')) $('drill').onclick=()=>{state.parent=state.selected;state.domain=model.nodes.find(n=>n.id===state.selected).domainId;state.selected=visibleNodes()[0]?.id;resetRecordFilters();draw();};
    if($('node-records')) $('node-records').onclick=()=>{resetRecordFilters();state.tab='trace';state.scope='node';renderInspector();};
    if($('records-back')) $('records-back').onclick=()=>{Object.assign(state,state.returnTo||{});state.span=null;state.tab='trace';draw();};
    if($('whole-trace')) $('whole-trace').onclick=()=>{const s=allSpans()[state.span-1];resetRecordFilters();state.traceId=s.traceId;state.domain=null;state.parent=null;state.selected=visibleNodes()[0]?.id;state.tab='trace';draw();};
    if($('record-scope')) $('record-scope').onclick=()=>{state.scope=state.scope==='node'?'view':'node';state.page=0;state.span=null;renderInspector();};
    if($('errors')) $('errors').onclick=()=>{state.errors=!state.errors;state.page=0;renderInspector();};
    if($('page-prev')) $('page-prev').onclick=()=>{state.page--;renderInspector();};
    if($('page-next')) $('page-next').onclick=()=>{state.page++;renderInspector();};
    if($('record-filters')) $('record-filters').onsubmit=event=>{event.preventDefault();state.query=$('record-search').value;state.traceId=$('trace-filter').value.trim();state.page=0;renderInspector();};
    if($('clear-records')) $('clear-records').onclick=()=>{resetRecordFilters();state.domain=null;state.parent=null;state.selected=visibleNodes()[0]?.id;draw();};
    $('detail').querySelectorAll('[data-span-index],[data-related-span]').forEach(b=>b.onclick=()=>selectSpan(Number(b.dataset.spanIndex||b.dataset.relatedSpan)));
    syncMechanicalDetail();
  }
  function selectSpan(ordinal){
    const s=allSpans()[ordinal-1];if(!s)return;
    if(!state.span)state.returnTo=Object.fromEntries(['domain','parent','selected','scope','errors','page','query','traceId'].map(k=>[k,state[k]]));
    pause();state.span=ordinal;state.tab='trace';state.selected=s.nodeId;
    const n=index.nodes.get(s.nodeId);state.domain=n.domainId;state.parent=n.parentId||null;
    state.cursor=s.status==='error'?s.endMs:s.startMs;state.phase=0;draw();
    $('scene').querySelector('.station.selected')?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function mechanicalReadout(n,s){
    const m=n.mechanism||{},parts=[];
    if(m.capacity!==undefined)parts.push(`队列 ${s?.queueDepth??'?'}/${m.capacity}`);
    if(m.concurrency!==undefined)parts.push(`工位 ${s?.activeWorkers??'?'}/${m.concurrency}`);
    if(s?.failed!==undefined)parts.push(`失败 ${s.failed}`);
    if(s?.rejected!==undefined)parts.push(`拒绝 ${s.rejected}`);
    if(s?.completed!==undefined&&!m.concurrency)parts.push(`完成 ${s.completed}`);
    if(s?.action)parts.push(actionNames[s.action]);
    return parts.join(' · ');
  }
  function syncMechanicalDetail(){
    const target=$('mechanical-detail'),n=index.nodes.get(state.selected);if(!target||!n)return;
    const s=mechanicalState(model,n.id,state.cursor),previous=mechanicalState(model,n.id,state.cursor-1);
    if(!n.mechanism&&!s){target.innerHTML='';return;}
    const labels={queueDepth:'等待任务',activeWorkers:'占用工位',retries:'重试次数',completed:'完成数',failed:'失败数',rejected:'拒绝数'};
    target.innerHTML=`<h3>机械状态 · ${model.mode==='demo'?'合成快照':'未提供快照'}</h3><p class="fine-print">${h(mechanicalReadout(n,s))}</p>${s?`<table class="state-table"><tbody>${Object.entries(labels).filter(([k])=>s[k]!==undefined).map(([k,label])=>`<tr><th>${label}</th><td>${previous?.[k]===undefined?'未提供':fmt(previous[k])} → <strong>${fmt(s[k])}</strong></td></tr>`).join('')}</tbody></table><p class="fine-print">前一步 → 当前步骤；每步为完整快照，缺失字段不继承、不推算。重试计数按场景中声明的任务计算。</p>`:'<p class="fine-print">配置表示容量约束；当前数量未知。仅有 span 活动不足以推算队列或重试次数。</p>'}`;
  }
  function syncActivity() {
    $('scene').querySelectorAll('.station').forEach(g=>{
      const n=index.nodes.get(g.dataset.nodeId),s=mechanicalState(model,n.id,state.cursor);
      g.dataset.state=nodeState(n.id);g.classList.toggle('selected',n.id===state.selected);g.dataset.action=s?.action||'unknown';
      const key=JSON.stringify(s);if(g.dataset.mechanicalKey!==key){g.querySelector('.mechanical-parts').innerHTML=mechanismMarkup(n,s);g.dataset.mechanicalKey=key;}
      const readout=g.querySelector('.mechanical-readout'),label=clippedLabel([mechanicalReadout(n,s),model.mode==='trace'?statusNames[nodeState(n.id)]:''].filter(Boolean).join(' · '),window.matchMedia('(max-width: 760px)').matches?14:29);
      if(readout.textContent!==label)readout.textContent=label;
    });
    syncMechanicalDetail();
    $('domains').querySelectorAll('[data-activity-for]').forEach(el=>{
      const id=el.dataset.activityFor;
      if(model.mode==='trace'){
        const a=id?currentActivity().domains.get(id):[...currentActivity().domains.values()].reduce((sum,v)=>{for(const k of Object.keys(sum))sum[k]+=v[k];return sum;},{running:0,completed:0,errors:0,total:0});
        el.textContent=a.total?`此刻 ${a.running} 项活动 · 已结束 ${a.completed} · 已发生 ${a.errors} 个错误`:'没有运行记录';
        el.dataset.active=String(a.running>0);
      }else if(model.mode==='demo'){
        const count=(model.steps[Math.round(state.cursor)]?.active||[]).filter(n=>!id||index.nodes.get(n).domainId===id).length;
        el.textContent=`当前步骤 ${count} 个活动部件`;el.dataset.active=String(count>0);
      }else{el.textContent='运行状态未提供';el.dataset.active='false';}
    });
    if($('current-node-state')) $('current-node-state').textContent=statusNames[nodeState(state.selected)];
    const activeEdges=model.mode==='demo'?(model.steps[Math.round(state.cursor)]?.edges||[]):[];
    for(const edge of edgePaths) {
      const path=$(edge.pathId);path.classList.toggle('active',activeEdges.includes(edge.id));
      const packet=$('scene').querySelector(`[data-packet-id="${edge.id}"]`);
      const show=model.mode==='demo'&&state.playing&&!reduced.matches&&activeEdges.includes(edge.id);
      packet.setAttribute('visibility',show?'visible':'hidden');
      if(show) {const p=path.getPointAtLength(path.getTotalLength()*state.phase);packet.setAttribute('cx',p.x);packet.setAttribute('cy',p.y);}
    }
    $('scrubber').value=state.cursor;
    if(model.mode==='demo') {
      const step=model.steps[Math.round(state.cursor)];$('step-title').textContent=step.title;$('step-description').textContent=step.description;
      $('position').textContent=`${Math.round(state.cursor)+1} / ${model.steps.length}`;
    } else if(model.mode==='trace') {
      const active=currentActivity().active.filter(s=>!state.domain||s.domainId===state.domain);
      $('step-title').textContent=active.length?`${active.length} 项活动正在运行`:'当前时间没有运行中的记录';
      $('step-description').textContent=active.length?active.slice(0,3).map(s=>s.name).join(' · ')+(active.length>3?' …':''):'活动灯来自已导入 span；连线不模拟未记录的消息。';
      $('position').textContent=`${ms(state.cursor)} / ${ms(duration())}`;
    } else {$('step-title').textContent='静态架构';$('step-description').textContent='选择业务域或部件查看机制与来源。未导入记录时不推测运行状态。';$('position').textContent='';}
    $('play').textContent=state.playing?'暂停':'播放';
  }
  function draw() {
    if(indexedModel!==model){index=buildTraceIndex(model);indexedModel=model;traceDuration=Math.max(0,...index.spans.map(s=>s.endMs));ordinals=new Map(index.spans.map((s,i)=>[s,i+1]));domainStats=new Map([...index.byDomain].map(([id,spans])=>[id,spanStats(spans)]));activity=null;activityCursor=null;}
    $('domain-metric').disabled=model.mode!=='trace';$('domain-metric').value=state.domainMetric;$('domain-metric').closest('.domain-controls').hidden=model.mode!=='trace';
    $('title').textContent=model.title;$('summary').textContent=model.summary;
    $('mode-badge').textContent=model.mode==='demo'?'合成演示 · 无实际性能数据':model.mode==='trace'?(model.traceMeta?.synthetic?'合成 Trace 回放':'本地 Trace 回放'):'来源架构 · 静态视图';
    $('footer-note').textContent=model.mode==='trace'?'架构来自当前模型；活动来自导入记录。':model.mode==='architecture'?'架构依据见来源；未导入运行记录。':'合成教学模板不代表实际项目；度量未提供。';
    renderDomains();renderCrumbs();drawScene();renderInspector();
    $('scrubber').max=maxCursor();$('scrubber').step=model.mode==='trace'?'any':'1';
    for(const id of ['play','back','next','scrubber']) $(id).disabled=model.mode==='architecture'||maxCursor()===0;
    syncActivity();
  }
  function setZoom(value) {state.zoom=Math.max(.75,Math.min(3,value));$('scene').style.width=`${state.zoom*100}%`;}
  function advance(amount) {pause();state.cursor=Math.min(maxCursor(),Math.max(0,state.cursor+amount));state.phase=0;syncActivity();}
  function loop(time) {
    if(!state.playing)return;
    const elapsed=Math.min(100,time-state.last);state.last=time;
    if(model.mode==='demo') {
      state.phase+=elapsed/1800;
      if(state.phase>=1) {state.phase=0;if(state.cursor>=maxCursor()){pause();syncActivity();return;}state.cursor++;}
    } else {
      state.cursor+=elapsed*Math.max(1,duration()/15000);
      if(state.cursor>=maxCursor()){state.cursor=maxCursor();pause();syncActivity();return;}
    }
    syncActivity();frame=requestAnimationFrame(loop);
  }
  $('play').onclick=()=>{
    if(state.playing){pause();syncActivity();return;}
    if(state.cursor>=maxCursor()){state.cursor=0;state.phase=0;}
    state.playing=true;state.last=performance.now();syncActivity();frame=requestAnimationFrame(loop);
  };
  $('back').onclick=()=>advance(model.mode==='trace'?-Math.max(1,duration()/20):-1);
  $('next').onclick=()=>advance(model.mode==='trace'?Math.max(1,duration()/20):1);
  $('scrubber').oninput=()=>{pause();state.cursor=Number($('scrubber').value);state.phase=0;syncActivity();};
  $('zoom-in').onclick=()=>setZoom(state.zoom+.25);$('zoom-out').onclick=()=>setZoom(state.zoom-.25);$('fit').onclick=()=>setZoom(1);
  $('domain-metric').onchange=()=>{state.domainMetric=$('domain-metric').value;renderDomains();syncActivity();};
  $('theme').onclick=()=>{const dark=document.body.dataset.theme!=='dark';document.body.dataset.theme=dark?'dark':'light';$('theme').textContent=dark?'浅色':'深色';};
  $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('figure').requestFullscreen();}catch{notify('此浏览器不支持全屏；可以使用图形缩放。');}};
  for(const tab of ['component','trace','source']) $('tab-'+tab).onclick=()=>{state.tab=tab;state.span=null;renderInspector();};
  document.querySelector('.tabs').addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
    const tabs=['component','trace','source'];state.tab=tabs[(tabs.indexOf(state.tab)+(event.key==='ArrowRight'?1:2))%3];renderInspector();$('tab-'+state.tab).focus();event.preventDefault();
  });
  $('trace-file').onchange=async()=>{
    const file=$('trace-file').files[0];if(!file)return;pause();
    try {
      if(file.size>MAX_BYTES)throw new Error('Trace 超过 15 MiB');
      const trace=normalizeTrace(await file.text()), next=attachTrace(original,trace);next.traceMeta.fileName=file.name;
      model=next;resetNavigation();draw();$('restore').hidden=false;
      notify(`已导入 ${trace.spans.length} 条完成记录。未归属 ${model.traceMeta.unmapped} 条${model.traceMeta.warnings.length?'；存在导入诊断，详见“来源与口径”':''}。`);
    } catch(error) {notify(`导入失败：${error.message}。当前画面已保留。`,true);}
    $('trace-file').value='';
  };
  $('example-trace').hidden=!original.exampleTrace;
  $('example-trace').onclick=()=>{
    pause();model=attachTrace(original,normalizeTrace(original.exampleTrace));resetNavigation();state.tab='trace';draw();$('restore').hidden=false;
    notify(`已加载 ${model.spans.length} 条合成追踪，含 ${spanStats(model.spans).errors} 条错误和 ${model.traceMeta.unmapped} 条未归属记录。所有数值仅供教学。`);
  };
  $('restore').onclick=()=>{pause();model=JSON.parse(JSON.stringify(original));resetNavigation();draw();$('restore').hidden=true;notify('已恢复初始示例。');};
  document.addEventListener('keydown',event=>{
    if(['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)||event.target.closest('.tabs'))return;
    if(event.key==='Escape'&&state.parent){state.parent=model.nodes.find(n=>n.id===state.parent)?.parentId||null;state.selected=visibleNodes()[0]?.id;resetRecordFilters();draw();}
    if(['ArrowLeft','ArrowRight'].includes(event.key)&&event.target.closest('#figure')){advance((event.key==='ArrowRight'?1:-1)*(model.mode==='trace'?Math.max(1,duration()/20):1));event.preventDefault();}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();syncActivity();}});
  if('IntersectionObserver' in window) new IntersectionObserver(entries=>{if(!entries[0].isIntersecting){pause();syncActivity();}},{threshold:0}).observe($('figure'));
  reduced.addEventListener('change',()=>{pause();syncActivity();});
  let resizeTimer;
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{drawScene();syncActivity();},120);});
  document.body.dataset.theme=model.theme||'light';$('theme').textContent=model.theme==='dark'?'浅色':'深色';
  resetNavigation();draw();
  if(model.mode==='demo')notify('这是合成教学场景。播放查看机制，点击部件检查输入输出；导入实际 Trace 后才显示度量。');
  else if(model.mode==='trace'&&model.traceMeta?.synthetic)notify('这是合成 Trace 示例。数值仅用于验证回放和错误下钻，不代表真实项目性能。');
})();
