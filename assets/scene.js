function isoPoint(x, y, z = 0) { return [(x - y) * .866, (x + y) * .5 - z]; }
function pointString(points) { return points.map(p => p.map(v => v.toFixed(2)).join(',')).join(' '); }
function polygon(points, fill, stroke = 'var(--side)') { return `<polygon points="${pointString(points)}" fill="${fill}" stroke="${stroke}" stroke-width=".8" stroke-linejoin="round"/>`; }
function solid(x, y, z, w, d, h, tone = 'var(--face)') {
  const p = (a,b,c) => isoPoint(a,b,c);
  return polygon([p(x,y+d,z),p(x+w,y+d,z),p(x+w,y+d,z+h),p(x,y+d,z+h)],'var(--metal)') +
    polygon([p(x+w,y,z),p(x+w,y+d,z),p(x+w,y+d,z+h),p(x+w,y,z+h)],'var(--side)') +
    polygon([p(x,y,z+h),p(x+w,y,z+h),p(x+w,y+d,z+h),p(x,y+d,z+h)],tone);
}
function screw(x,y,z) { const [a,b] = isoPoint(x,y,z); return `<ellipse cx="${a}" cy="${b}" rx="2.5" ry="1.4" fill="var(--paper)" stroke="var(--side)" stroke-width=".8"/><path d="M${a-1.5},${b}h3" stroke="var(--side)" stroke-width=".8"/>`; }
function rod(x,y,z,w,d,h) { return solid(x,y,z,w,d,h,'var(--metal)'); }
function cylinder(x,y,z,r,h,tone='var(--face)') {
  const [cx,b] = isoPoint(x,y,z), t = b-h, rx = r*1.12, ry = r*.55;
  return `<path d="M${cx-rx},${t}v${h}a${rx},${ry} 0 0 0 ${rx*2},0v-${h}a${rx},${ry} 0 0 1 -${rx*2},0" fill="url(#drum-tone)" stroke="var(--side)" stroke-width=".9"/><ellipse cx="${cx}" cy="${t}" rx="${rx}" ry="${ry}" fill="${tone}" stroke="var(--side)" stroke-width=".9"/>`;
}
function faceLine(points, color='var(--slot)', width=1) { return `<polyline points="${pointString(points.map(p=>isoPoint(...p)))}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`; }
function stationMachine(node) {
  const {kind}=node;
  let parts = '';
  for (const [x,y] of [[-53,-39],[43,-39],[-53,29],[43,29]]) parts += solid(x,y,-9,10,10,10,'var(--side)');
  parts += solid(-62,-48,0,124,96,10);
  parts += solid(-48,-35,10,96,70,3,'var(--metal)');
  for (const [x,y] of [[-55,-41],[55,-41],[-55,41],[55,41]]) parts += screw(x,y,11);
  const rails = () => rod(-38,-24,13,4,64,12) + rod(34,-24,13,4,64,12);
  if (kind === 'queue') {
    parts += rails() + rod(-40,-28,13,80,4,38);
    parts += rod(-40,32,13,80,5,18) + solid(-15,35,13,30,12,6,'var(--warm)');
  } else if (kind === 'processor') {
    parts += solid(-35,-29,13,70,58,7,'var(--slot)');
    for(let i=0;i<7;i++) {
      parts += rod(-42,-23+i*7,16,7,3,3) + rod(35,-23+i*7,16,7,3,3);
      parts += rod(-27+i*8,-36,16,3,7,3) + rod(-27+i*8,29,16,3,7,3);
    }
    parts += solid(-25,-20,21,50,40,16,'var(--metal)');
    for(let i=0;i<7;i++) parts += rod(-22+i*7,-18,37,2,36,14);
    parts += solid(-11,-10,52,22,20,3,'var(--warm)');
    for(const [x,y] of [[-34,-28],[29,-28],[-34,24],[29,24]]) parts += rod(x,y,14,5,5,46);
    parts += rod(-34,-28,59,68,4,4) + rod(-34,25,59,68,4,4);
    parts += `<ellipse class="working-part" cx="0" cy="-53" rx="7" ry="3.5" fill="var(--warm)"/>`;
  } else if (kind === 'memory' || kind === 'database') {
    parts += cylinder(0,0,14,33,14,'var(--metal)');
    for(let i=0;i<3;i++) {
      parts += cylinder(0,0,31+i*16,29,12,i===2?'var(--face)':'var(--metal)');
      parts += cylinder(0,0,43+i*16,7,3,'var(--warm)');
    }
    parts += rod(-39,-25,14,5,50,68) + rod(34,-25,14,5,50,68);
    parts += rod(-39,-26,81,78,5,5);
    parts += solid(-20,29,14,40,8,12,'var(--slot)');
    for(let i=0;i<4;i++) { const [a,b]=isoPoint(-13+i*8,34,26);parts+=`<circle cx="${a}" cy="${b}" r="1.6" fill="var(--warm)"/>`; }
  } else if (kind === 'tool') {
    parts += rails();
    for(const x of [-34,30]) parts += rod(x,-22,13,5,6,76);
    parts += rod(-34,-23,89,69,7,6);
    parts += solid(-9,-26,91,18,13,10,'var(--warm)');
    parts += rod(-3,-21,54,6,6,37) + cylinder(0,-18,48,8,9);
    parts += rod(-13,-22,34,6,8,15) + rod(7,-22,34,6,8,15);
    parts += solid(-17,9,14,34,28,8,'var(--metal)') + solid(-9,16,22,18,13,9,'var(--warm)');
    parts += faceLine([[-31,-22,69],[-31,35,20]],'var(--slot)',2);
  } else if (kind === 'sensor') {
    parts += cylinder(0,0,13,23,6) + cylinder(0,0,19,6,31);
    parts += cylinder(0,0,50,15,35,'var(--metal)') + cylinder(0,0,85,15,4,'var(--slot)');
    for(let i=0;i<5;i++) {
      const [a,b]=isoPoint(0,0,55+i*6);
      parts += `<ellipse cx="${a}" cy="${b}" rx="16" ry="6" fill="none" stroke="var(--side)" stroke-width="1.2"/>`;
    }
    parts += solid(-34,20,13,19,14,8,'var(--slot)') + solid(15,20,13,19,14,8,'var(--slot)');
  } else if (kind === 'speaker') {
    parts += solid(-34,-26,13,68,52,56,'var(--metal)');
    const [a,b]=isoPoint(10,27,43);
    parts += `<ellipse cx="${a}" cy="${b}" rx="24" ry="28" fill="var(--slot)" stroke="var(--side)" stroke-width="3"/><ellipse cx="${a}" cy="${b}" rx="17" ry="21" fill="var(--side)"/><ellipse cx="${a}" cy="${b}" rx="9" ry="11" fill="var(--slot)"/>`;
    for(let i=0;i<5;i++) parts += rod(-26+i*10,-20,69,3,30,2);
    parts += cylinder(-26,34,13,5,6,'var(--warm)');
  } else if (kind === 'router') {
    parts += solid(-39,-28,13,78,56,28,'var(--metal)');
    for(let i=0;i<4;i++) {
      parts += solid(-29+i*17,18,32,11,8,10,'var(--slot)');
      parts += solid(-29+i*17,-17,41,10,28,3);
      for(let j=0;j<3;j++) parts+=faceLine([[-27+i*17,-12+j*7,45],[-21+i*17,-12+j*7,45]],'var(--side)',1);
    }
    parts += cylinder(-25,35,13,5,6,'var(--warm)') + cylinder(24,35,13,5,6,'var(--warm)');
  } else {
    parts += rod(-32,-22,13,5,6,64) + rod(28,-22,13,5,6,64);
    parts += solid(-39,-28,58,78,10,44,'var(--metal)');
    const screen=[isoPoint(-31,-17,67),isoPoint(31,-17,67),isoPoint(31,-17,94),isoPoint(-31,-17,94)];
    parts += polygon(screen,'var(--slot)');
    for(let i=0;i<3;i++) parts += faceLine([[-25,-16,72+i*7],[i===2?5:21,-16,72+i*7]],i===0?'var(--warm)':'var(--face)',1.5);
    parts += solid(-33,4,13,66,33,9);
    for(let i=0;i<6;i++) parts += solid(-27+i*10,11,22,6,17,2,'var(--metal)');
    parts += cylinder(-26,33,23,5,5,'var(--warm)') + cylinder(24,33,23,5,5);
  }
  // A socket on each side of the base is the endpoint of structural links.
  for(const [x,y] of [[-62,32],[62,-32]]) {const [a,b]=isoPoint(x,y,3);parts+=`<circle cx="${a}" cy="${b}" r="4.5" fill="var(--slot)" stroke="var(--metal)" stroke-width="2"/>`;}
  parts += `<circle class="status-led" cx="-5" cy="40" r="6"/>`;
  return parts;
}
function clippedLabel(value, limit) {
  let size=0, output='';
  for(const ch of String(value)) {size+=/[\u2e80-\uffff]/.test(ch)?1:.56;if(size>limit)return output+'…';output+=ch;}
  return output;
}
function mechanismMarkup(node,state) {
  const m=node.mechanism||{};let parts='';
  if(state?.queueDepth!==undefined){
    if(m.capacity<=16){
      for(let i=0;i<state.queueDepth;i++)parts+=solid(-28,-15+i*2,24+i*3,56,20,2,'var(--warm)');
    }else{
      parts+=solid(-28,-15,16,56,40,44*state.queueDepth/m.capacity,'var(--warm)');
    }
  }
  if(m.concurrency){
    for(let i=0;i<m.concurrency;i++){
      const x=-45+(i%8)*12,y=55+Math.floor(i/8)*10;
      parts+=`<rect class="worker-slot" data-busy="${state?.activeWorkers===undefined?'unknown':i<state.activeWorkers}" x="${x}" y="${y}" width="9" height="7" rx="1" fill="${state?.activeWorkers===undefined?'var(--line)':i<state.activeWorkers?'var(--accent)':'var(--paper)'}" stroke="var(--side)"/>`;
    }
  }
  if(m.retryLimit!==undefined){
    const angle=state?.retries===undefined?-120:-120+240*state.retries/Math.max(1,m.retryLimit);
    parts+=`<g class="retry-dial" transform="translate(60 53)"><circle r="12" fill="var(--paper)" stroke="var(--side)"/><path d="M0,0L0,-9" transform="rotate(${angle})" stroke="${state?.retries===undefined?'var(--muted)':'var(--warm)'}" stroke-width="2"/><text text-anchor="middle" y="24" style="font-size:10px">${state?.retries===undefined?'?':state.retries}/${m.retryLimit}</text></g>`;
  }
  return parts;
}
function sceneMarkup(model, visible, graphEdges, selectedId, compact=false) {
  const cols = Math.min(compact?2:3, visible.length), rows = Math.ceil(visible.length / cols);
  const width = cols*300 + 80, height = rows*300 + 100;
  const positions = new Map(visible.map((n,i) => [n.id,{x:180 + (i%cols)*300,y:145 + Math.floor(i/cols)*300}]));
  let markup = `<defs><linearGradient id="drum-tone"><stop offset="0" stop-color="var(--metal)"/><stop offset=".6" stop-color="var(--face)"/><stop offset="1" stop-color="var(--side)"/></linearGradient></defs>`;
  const edgePaths = [];
  for(const edge of graphEdges) {
    const from=positions.get(edge.from), to=positions.get(edge.to); if(!from||!to) continue;
    const a=[from.x+80.6,from.y+12], b=[to.x-81.4,to.y-18];
    const middle=(a[0]+b[0])/2;
    const path=`M${a[0]},${a[1]}C${middle},${a[1]+(a[0]>b[0]?70:0)} ${middle},${b[1]+(a[0]>b[0]?70:0)} ${b[0]},${b[1]}`;
    const key=`edge-path-${edgePaths.length}`;
    markup+=`<path id="${key}" data-edge-id="${escapeHtml(edge.id)}" class="edge ${edge.kind}" d="${path}"><title>${escapeHtml(edge.label)} (${edge.evidence})</title></path><circle class="packet" data-packet-id="${escapeHtml(edge.id)}" r="5" visibility="hidden"/>`;
    edgePaths.push({id:edge.id,pathId:key});
  }
  const labels={source:'来源事实',provided:'输入依据',inference:'推断',demo:'合成示例',unknown:'未知'};
  visible.forEach((node,i) => {
    const pos=positions.get(node.id), domain=model.domains.find(d=>d.id===node.domainId);
    const childCount=model.nodes.filter(n=>n.parentId===node.id).length;
    const subtitle=`${domain.name} / ${labels[node.evidence]}${childCount?` / 内含 ${childCount} 部件`:''}`;
    markup+=`<g class="station ${selectedId===node.id?'selected':''}" data-node-id="${node.id}" data-state="unknown" tabindex="0" role="button" aria-label="${escapeHtml(node.label)}，${childCount?'可进入内部，':''}查看详情" transform="translate(${pos.x},${pos.y})"><title>${escapeHtml(node.label)} · ${escapeHtml(node.description)}</title><ellipse class="selection-ring" cx="0" cy="10" rx="113" ry="75"/><ellipse cx="0" cy="50" rx="104" ry="25" fill="var(--shadow)"/>${stationMachine(node)}<g class="mechanical-parts"></g><text x="-80" y="100" class="label" style="font-size:${compact?26:15}px">${String(i+1).padStart(2,'0')} · ${escapeHtml(clippedLabel(node.label,compact?10:15))}</text><text x="-80" y="${compact?124:119}" class="sub-label" style="font-size:${compact?20:10}px">${escapeHtml(clippedLabel(subtitle,compact?14:28))}</text><text x="-80" y="${compact?146:137}" class="mechanical-readout" style="font-size:${compact?20:11}px"></text></g>`;
  });
  return {markup,width,height,edgePaths};
}
