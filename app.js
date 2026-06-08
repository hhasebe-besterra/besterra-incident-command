/* ============================================================
   BESTERRA // INCIDENT COMMAND — frontend (ITIL 4 / HDI 準拠)
   ============================================================ */
'use strict';
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep = ms => new Promise(r=>setTimeout(r,ms));

// 種別のやさしい説明（専門用語が分からないメンバー向け・具体例つき）
const TYPE_HELP = {
  incident:{ def:'ITの困りごと・トラブル・「これどうやるの？」という質問の問合せ。いつも使えるIT（PC・メール・ネット・社内システム）が使えない・操作が分からない等。早く解決するのが目的です。',
    eg:'メールが送受信できない／PCが起動しない・固まる／Wi-Fi・ネットに繋がらない／共有フォルダ(NAS)が開けない／印刷できない／操作方法が分からない／ウイルス警告が出た',
    tip:'どれにするか迷ったら、まず「問合せ（インシデント）」を選べばOKです。' },
  request:{ def:'壊れてはいないけれど「ITに○○してほしい」という依頼。新しく用意・変更してほしいことです。',
    eg:'新しいPC・アカウントが欲しい／ソフトを入れてほしい／パスワードを再発行してほしい／権限を追加してほしい／メールの転送設定をしてほしい' },
  problem:{ def:'今すぐ困っているわけではない、改善の提案・やってみたい計画・アイデア。「ITをこう良くしたい」という声を受け付けます。',
    eg:'この作業を自動化・効率化したい／新しいツールを試したい／将来こうしたいという改善案／中長期で進めたい計画' },
  other:{ def:'上のどれにも当てはまらないもの。種別に迷うときも、まずは気軽に起票してください。担当が内容を見て振り分けます。',
    eg:'分類が分からない連絡事項／とりあえず相談したいこと' },
};
function typeHelpHtml(t){ const h=TYPE_HELP[t]; if(!h) return '';
  return `<div class="th-def">${esc(h.def)}</div>`
    + `<div class="th-eg"><b>こんなとき：</b>${esc(h.eg)}</div>`
    + (h.tip?`<div class="th-tip">💡 ${esc(h.tip)}</div>`:''); }

// 関連チケットを既存チケットの一覧からチェック選択（複数可・文字入力不要）
/* 関連チケット：ホストにはボタン＋選択チップだけを置き、選択は別ウィンドウ（ダイアログ）で行う */
function initLinkPicker(hostId, selectedCsv, excludeCode){
  const host=document.getElementById(hostId); if(!host) return;
  host.classList.add('lk-field');
  const selected=new Set(String(selectedCsv||'').split(',').map(s=>s.trim()).filter(Boolean));
  host._getLinked=()=>[...selected].join(',');
  const paint=()=>{
    host.innerHTML=`<button type="button" class="btn-ghost lk-open">🔗 関連チケットを選ぶ${selected.size?`（${selected.size}件）`:''}</button>
      <div class="lk-chips"></div>`;
    const chips=host.querySelector('.lk-chips');
    chips.innerHTML = selected.size
      ? [...selected].map(c=>`<span class="lk-chip"><span class="lk-code">${esc(c)}</span><button type="button" class="lk-x" data-c="${esc(c)}" title="外す">✕</button></span>`).join('')
      : '<span class="t-meta">未選択（任意）</span>';
    host.querySelector('.lk-open').onclick=()=>openLinkDialog(selected, excludeCode, paint);
    chips.querySelectorAll('.lk-x').forEach(b=>b.onclick=()=>{ selected.delete(b.dataset.c); paint(); });
  };
  paint();
}
async function openLinkDialog(selected, excludeCode, onDone){
  openDialog(`<h3>🔗 関連チケットを選ぶ</h3>
    <input class="inp lk-search" placeholder="🔍 コード・件名でしぼり込み" style="width:100%">
    <div class="lk-list" style="margin-top:10px"><div class="t-meta" style="padding:10px">読み込み中…</div></div>
    <div class="lk-sel t-meta" style="margin-top:8px"></div>
    <div class="dlg-actions"><button class="btn-ghost" id="lk-cancel">キャンセル</button><button class="btn-ok" id="lk-done">この内容で確定</button></div>`,'pick');
  const work=new Set(selected);
  const listEl=$('#dialog .lk-list'), selEl=$('#dialog .lk-sel');
  let rows=[];
  try{ rows=(await api('list',{},'GET')).incidents||[]; }
  catch(e){ listEl.innerHTML='<div class="t-meta" style="padding:10px">一覧の取得に失敗しました</div>'; }
  if(excludeCode) rows=rows.filter(r=>r.code!==excludeCode);
  const render=(filter='')=>{ const f=filter.trim().toLowerCase();
    const shown=rows.filter(r=> !f || (r.code+' '+(r.title||'')).toLowerCase().includes(f));
    listEl.innerHTML = shown.length ? shown.map(r=>{ const on=work.has(r.code);
      return `<label class="lk-item${on?' on':''}"><input type="checkbox" value="${esc(r.code)}" ${on?'checked':''}>`
        +`<span class="lk-code">${esc(r.code)}</span><span class="lk-ttl">${esc(r.title||'')}</span>${statusChip(r.status)}</label>`;
    }).join('') : '<div class="t-meta" style="padding:10px">該当チケットなし</div>'; };
  const updSel=()=>{ selEl.textContent = work.size ? '選択中: '+[...work].join(' , ') : '選択なし'; };
  render(''); updSel();
  $('#dialog .lk-search').oninput=e=>render(e.target.value);
  listEl.onchange=e=>{ const c=e.target; if(!c.matches('input[type=checkbox]')) return;
    if(c.checked) work.add(c.value); else work.delete(c.value);
    const it=c.closest('.lk-item'); if(it) it.classList.toggle('on',c.checked); updSel(); };
  $('#lk-cancel').onclick=closeDialog;
  $('#lk-done').onclick=()=>{ selected.clear(); work.forEach(c=>selected.add(c)); closeDialog(); onDone&&onDone(); };
}

const State = { meta:null, user:null, view:'dashboard', incidents:[], employees:[], assignees:[], sort:{key:'priority',dir:'asc'} };

/* ---------- API ---------- */
async function api(action, params={}, method='POST'){
  const opt = { method, headers:{}, credentials:'same-origin' };
  let url = 'api.php';
  if (method === 'GET'){ url += '?' + new URLSearchParams({action, ...params}); }
  else { opt.headers['Content-Type']='application/json'; opt.body=JSON.stringify({action, ...params}); }
  const r = await fetch(url, opt);
  let j; try { j = await r.json(); } catch(e){ throw new Error('BAD RESPONSE'); }
  if (!j.ok) throw new Error(j.error || ('HTTP '+r.status));
  return j;
}

/* ---------- toast ---------- */
function toast(msg, kind='info', ms=3200){
  const t=document.createElement('div'); t.className='toast '+kind; t.textContent=msg;
  $('#toasts').appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateY(8px)'; t.style.transition='.3s'; setTimeout(()=>t.remove(),320); }, ms);
}

/* ---------- matrix rain ---------- */
function matrix(){
  const c=$('#matrix'), x=c.getContext('2d'); let w,h,cols,drops;
  const glyphs='ｱｲｳｴｵｶｷｸ0123456789ABCDEF<>/\\[]{}#$%ITILHDI'.split('');
  function size(){ w=c.width=innerWidth; h=c.height=innerHeight; cols=Math.floor(w/16); drops=Array(cols).fill(0).map(()=>Math.random()*-50); }
  size(); addEventListener('resize', size);
  function draw(){
    x.fillStyle='rgba(16,26,40,.10)'; x.fillRect(0,0,w,h); x.font='14px monospace';
    for(let i=0;i<cols;i++){ const ch=glyphs[Math.floor(Math.random()*glyphs.length)];
      x.fillStyle=Math.random()>.96?'rgba(62,230,255,.9)':'rgba(61,255,171,.5)';
      x.fillText(ch,i*16,drops[i]*16);
      if(drops[i]*16>h && Math.random()>.975) drops[i]=0; drops[i]++; }
    requestAnimationFrame(draw);
  }
  draw();
}

/* ---------- clock ---------- */
function clock(){ const el=$('#clock'); const t=()=>el.textContent=new Date().toLocaleTimeString('ja-JP',{hour12:false}); t(); setInterval(t,1000); }

/* ---------- boot ---------- */
async function bootSeq(){
  const log=$('#boot-log');
  const lines=[
    ['[ OK ] secure channel established · 192.168.1.10',90],
    ['[ OK ] service desk core online · ITIL 4 / HDI',120],
    ['[ OK ] practices: incident · request · problem',90],
    ['[ .. ] loading operator registry',150],
    ['[ OK ] 4 operators · 5 auditor channels',90],
    ['<span class="dim">awaiting authentication ▒</span>',60],
  ];
  log.innerHTML='';
  for(const [t,d] of lines){ log.innerHTML+=t+'\n'; await sleep(d); }
}

/* ---------- format ---------- */
function fmt(iso, withTime=true){ if(!iso) return '—'; const d=new Date(iso), p=n=>String(n).padStart(2,'0');
  const b=`${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())}`; return withTime?`${b} ${p(d.getHours())}:${p(d.getMinutes())}`:b; }
function ago(iso){ if(!iso) return ''; const s=(Date.now()-new Date(iso).getTime())/1000;
  if(s<60) return '今'; if(s<3600) return Math.floor(s/60)+'分前'; if(s<86400) return Math.floor(s/3600)+'時間前'; return Math.floor(s/86400)+'日前'; }
function dur(sec){ if(sec==null) return '—'; if(sec<3600) return Math.round(sec/60)+'分'; if(sec<86400) return (sec/3600).toFixed(1)+'時間'; return (sec/86400).toFixed(1)+'日'; }
// datetime-local 入力用（ローカルタイム "YYYY-MM-DDTHH:MM"）
function toLocalInput(iso){ const d=iso?new Date(iso):new Date(); const p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }

/* ---------- badges ---------- */
const M = ()=>State.meta;
const prioBadge = p => `<span class="badge prio-${p}">${p}</span>`;
const statusChip = s => `<span class="st st-${s}"><i class="dot"></i>${M().statuses[s]||s}</span>`;
const typeChip = t => `<span class="type-chip type-${t}">${M().types[t]?M().types[t].icon:''} ${M().types[t]?M().types[t].label:t}</span>`;
const isWriter = () => State.user && State.user.role !== 'auditor';
function calcPriority(i,u){ const w={H:3,M:2,L:1}; const s=(w[i]||2)+(w[u]||2); return {6:'P1',5:'P2',4:'P3',3:'P4',2:'P5'}[s]||'P3'; }
function slaTag(inc){ if(['RESOLVED','CLOSED','CANCELLED'].includes(inc.status)) return inc.sla_breached?`<span class="sla-tag bad">SLA超過</span>`:`<span class="sla-tag ok">SLA内</span>`;
  return inc.sla_breached?`<span class="sla-tag bad">SLA超過</span>`:`<span class="sla-tag">SLA: ${fmt(inc.sla_target)}</span>`; }

/* ============================================================ LOGIN */
function initLogin(){
  $('#login-form').addEventListener('submit', async e=>{
    e.preventDefault(); const btn=$('#li-btn'), msg=$('#li-msg');
    btn.disabled=true; msg.className='login-msg'; msg.textContent='> 認証中…';
    try{ const j=await api('login',{username:$('#li-user').value.trim(), password:$('#li-pass').value});
      State.user=j.user; msg.className='login-msg ok'; msg.textContent='> ACCESS GRANTED — '+j.user.display_name;
      await sleep(520); enterApp();
    }catch(err){ msg.className='login-msg bad'; msg.textContent='> '+err.message; $('#li-pass').value=''; $('#li-pass').focus(); }
    finally{ btn.disabled=false; }
  });
}

/* ============================================================ APP */
function enterApp(){
  $('#login').classList.add('hide'); $('#app').hidden=false;
  $('#tb-tag').textContent=M().app.tag;
  $('#btn-model').textContent=M().app.standards||'ITIL 4 / HDI 準拠';
  const r=State.user.role;
  $('#who').innerHTML=`<span class="uname">${esc(State.user.display_name)}</span><span class="role ${r}">${r.toUpperCase()}</span>`;
  fillSelect('#f-type', M().types, '種別: 全て', v=>v.label);
  fillSelect('#f-priority', M().priorities, '優先度: 全て', v=>v.label);
  fillSelect('#f-status', M().statuses, '状態: 全て');
  fillSelect('#f-cat', M().categories, '分類: 全て');
  fillSelect('#f-channel', M().channels, '経路: 全て');
  $('#rep-date').value=new Date().toISOString().slice(0,10);
  bindApp(); switchView('dashboard');
  api('employees',{},'GET').then(j=>{ State.employees=j.employees||[]; }).catch(()=>{});
  api('assignees',{},'GET').then(j=>{ State.assignees=j.assignees||[]; }).catch(()=>{});
  setTimeout(()=>startTutorial(false), 700);
}

/* ---------- 社員オートコンプリート（氏名・カナ・部署で検索／自由入力可） ---------- */
function deptLeaf(d){ if(!d) return ''; const p=d.split('/'); return p[p.length-1]; }
function attachEmpAutocomplete(input, srcFn){
  srcFn = srcFn || (()=>State.employees);
  const wrap=document.createElement('div'); wrap.className='ac-pop'; wrap.hidden=true;
  input.parentNode.appendChild(wrap); input.setAttribute('autocomplete','off');
  let active=-1, items=[];
  const close=()=>{ wrap.hidden=true; active=-1; };
  const pick=e=>{ input.value = e.d ? `${e.n}（${deptLeaf(e.d)}）` : e.n; close(); input.focus(); };
  const render=q=>{
    const s=q.trim().toLowerCase().replace(/\s+/g,'');
    const all=srcFn()||[];
    items = !s ? all.slice(0,30) : all.filter(e=>{
      const hay=(e.n+e.k+(e.d||'')+(e.t||'')).toLowerCase().replace(/\s+/g,'');
      return hay.includes(s);
    }).slice(0,30);
    if(!items.length){ wrap.hidden=true; return; }
    wrap.innerHTML=items.map((e,i)=>`<div class="ac-item${i===active?' on':''}" data-i="${i}">
        <span class="ac-name">${esc(e.n)}</span>
        <span class="ac-dept">${esc(e.d?deptLeaf(e.d):(e.t||'—'))}</span></div>`).join('');
    wrap.hidden=false;
    $$('.ac-item',wrap).forEach(el=>{ el.onmousedown=ev=>{ ev.preventDefault(); pick(items[+el.dataset.i]); }; });
  };
  input.addEventListener('focus',()=>render(input.value));
  input.addEventListener('input',()=>{ active=-1; render(input.value); });
  input.addEventListener('blur',()=>setTimeout(close,150));
  input.addEventListener('keydown',e=>{
    if(wrap.hidden) return;
    if(e.key==='ArrowDown'){ e.preventDefault(); active=Math.min(active+1,items.length-1); render(input.value); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); active=Math.max(active-1,0); render(input.value); }
    else if(e.key==='Enter'){ if(active>=0){ e.preventDefault(); pick(items[active]); } }
    else if(e.key==='Escape'){ close(); }
  });
}
function fillSelect(sel,map,allLabel,fn){ const el=$(sel); if(!el) return;
  el.innerHTML=`<option value="">${allLabel}</option>`+Object.entries(map).map(([k,v])=>`<option value="${k}">${esc(fn?fn(v):v)}</option>`).join(''); }

function bindApp(){
  $$('.nav-tab').forEach(t=>t.onclick=()=>switchView(t.dataset.view));
  $('#btn-logout').onclick=async()=>{ await api('logout'); location.reload(); };
  $('#btn-pw').onclick=openChangePw;
  $('#btn-help').onclick=()=>startTutorial(true);
  $('#btn-model').onclick=openModel;
  ['#f-q','#f-scope','#f-type','#f-priority','#f-status','#f-cat','#f-channel'].forEach(s=>{
    const el=$(s); if(!el) return; const ev=(s==='#f-q')?'input':'change'; let t;
    el.addEventListener(ev,()=>{ clearTimeout(t); t=setTimeout(loadIncidents,250); }); });
  $('#btn-new').onclick=()=> isWriter()?openNew():toast('監査ロールは閲覧専用です','bad');
  if(!isWriter()) $('#btn-new').classList.add('hide');
  $('#btn-rep-run').onclick=runReport;
  $('#btn-rep-print').onclick=()=>{ window.open(`report.php?period=${$('#rep-period').value}&date=${$('#rep-date').value}&print=1`,'_blank'); };
}

function switchView(v){
  State.view=v; $$('.nav-tab').forEach(t=>t.classList.toggle('active',t.dataset.view===v));
  $$('.view').forEach(s=>s.hidden=(s.id!=='view-'+v));
  if(v==='dashboard') loadDashboard(); if(v==='incidents') loadIncidents();
}

/* ============================================================ DASHBOARD */
async function loadDashboard(){
  const all=(await api('list',{},'GET')).incidents||[];
  const s=computeDash(all);
  renderStatStrip(s); renderDashCards(s);
  const openS=M().open_statuses, rank={P1:1,P2:2,P3:3,P4:4,P5:5};
  const attention=all.filter(r=>openS.includes(r.status))
    .sort((a,b)=> ((b.sla_breached?1:0)-(a.sla_breached?1:0)) || ((rank[a.priority]||9)-(rank[b.priority]||9)) || (a.created_at<b.created_at?1:-1));
  $('#dash-open').innerHTML=incTable(attention); bindRows('#dash-open');
}
function computeDash(all){
  const openS=M().open_statuses, DAY=86400000, now=Date.now();
  const open=all.filter(r=>openS.includes(r.status));
  const cnt=(key,master)=>{ const o={}; Object.keys(master).forEach(k=>o[k]=0); all.forEach(r=>{ if(r[key]!=null&&r[key]!=='') o[r[key]]=(o[r[key]]||0)+1; }); return o; };
  const resolved=all.filter(r=>r.resolved_at);
  const durs=resolved.filter(r=>r.created_at).map(r=>(new Date(r.resolved_at)-new Date(r.created_at))/1000).filter(x=>x>=0);
  const mttr=durs.length?durs.reduce((a,b)=>a+b,0)/durs.length:null;
  const csv=resolved.filter(r=>r.csat!=null&&r.csat!=='').map(r=>+r.csat);
  const days=[]; for(let i=13;i>=0;i--){ const d=new Date(now-i*DAY); d.setHours(0,0,0,0); days.push(d); }
  const inDay=(iso,s,e)=>{ if(!iso) return false; const t=new Date(iso).getTime(); return t>=s&&t<e; };
  const trend=days.map(d=>{ const s=d.getTime(), e=s+DAY;
    return { d, opened:all.filter(r=>inDay(r.created_at,s,e)).length, resolved:all.filter(r=>inDay(r.resolved_at,s,e)).length }; });
  return { total:all.length, open:open.length,
    critical_open:open.filter(r=>['P1','P2'].includes(r.priority)).length,
    sla_risk:open.filter(r=>r.sla_breached).length,
    unassigned:open.filter(r=>!r.assignee).length,
    resolved_7d:resolved.filter(r=>(now-new Date(r.resolved_at))<7*DAY).length,
    mttr, fcr_rate:resolved.length?Math.round(resolved.filter(r=>r.fcr).length/resolved.length*100):null,
    csat:csv.length?(csv.reduce((a,b)=>a+b,0)/csv.length):null,
    by_type:cnt('type',M().types), by_priority:cnt('priority',M().priorities),
    by_status:cnt('status',M().statuses), by_category:cnt('category',M().categories), trend };
}
const PCOL={P1:'var(--sev1)',P2:'var(--sev2)',P3:'var(--sev3)',P4:'var(--green)',P5:'var(--sev4)'};
const SCOL={NEW:'#ff9a6b',IN_PROGRESS:'var(--cyan)',ON_HOLD:'var(--gold)',RESOLVED:'var(--green)',CLOSED:'var(--dim)',CANCELLED:'#c98a9a'};
function kpi(label,val,sub,state){ return `<div class="kpi ${state||''}"><div class="kpi-k">${label}</div><div class="kpi-v">${val}</div><div class="kpi-s">${sub||''}</div></div>`; }
function renderStatStrip(s){
  $('#statstrip').innerHTML=`
    ${kpi('未解決 / OPEN', s.open, `全 ${s.total} 件`, s.open?'cyan':'green')}
    ${kpi('要対応 P1・P2', s.critical_open, '高優先度の未解決', s.critical_open?'bad':'green')}
    ${kpi('SLA超過', s.sla_risk, '対応期限ごえ', s.sla_risk?'bad':'green')}
    ${kpi('未割当', s.unassigned, '担当者なし', s.unassigned?'warn':'green')}
    ${kpi('7日間で解決', s.resolved_7d, '直近1週間', 'green')}
    ${kpi('平均解決(MTTR)', dur(s.mttr), '起票→解決', 'cyan')}
    ${kpi('満足度(CSAT)', s.csat==null?'—':('★'+s.csat.toFixed(1)), s.fcr_rate==null?'一次解決 —':('一次解決 '+s.fcr_rate+'%'), 'cyan')}`;
}
function donut(byStatus,total){
  const segs=Object.entries(byStatus).filter(([k,v])=>v>0);
  if(!total){ return `<div class="donut" style="background:conic-gradient(var(--line2) 0 100%)"><div class="donut-hole"><b>0</b><span>件</span></div></div>`; }
  let acc=0; const stops=segs.map(([k,v])=>{ const a=acc/total*100, b=(acc+v)/total*100; acc+=v; return `${SCOL[k]} ${a}% ${b}%`; }).join(',');
  const legend=segs.map(([k,v])=>`<div class="lg-row"><i class="dot" style="background:${SCOL[k]}"></i><span class="lg-n">${esc(M().statuses[k])}</span><b>${v}</b><span class="lg-p">${Math.round(v/total*100)}%</span></div>`).join('');
  return `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${stops})"><div class="donut-hole"><b>${total}</b><span>件</span></div></div><div class="donut-legend">${legend}</div></div>`;
}
function bars(obj,labelFn,colFn){
  const max=Math.max(1,...Object.values(obj));
  return Object.entries(obj).map(([k,v])=>`<div class="mb-row"><span class="lbl">${esc(labelFn(k))}</span><span class="mb-track"><span class="mb-fill" style="width:${v/max*100}%;background:${colFn(k)}"></span></span><span class="num">${v}</span></div>`).join('');
}
function trendChart(trend){
  const max=Math.max(1,...trend.map(t=>Math.max(t.opened,t.resolved)));
  const cols=trend.map(t=>{ const lbl=`${t.d.getMonth()+1}/${t.d.getDate()}`;
    return `<div class="tr-col" title="${lbl}　起票 ${t.opened} / 解決 ${t.resolved}">
      <div class="tr-bars"><i class="tr-o" style="height:${t.opened/max*100}%"></i><i class="tr-r" style="height:${t.resolved/max*100}%"></i></div>
      <span class="tr-x">${t.d.getDate()}</span></div>`; }).join('');
  return `<div class="trend">${cols}</div>
    <div class="trend-legend"><span><i class="dot" style="background:var(--cyan)"></i>起票</span><span><i class="dot" style="background:var(--green)"></i>解決</span><span class="t-meta">直近14日</span></div>`;
}
function renderDashCards(s){
  const prows=bars(s.by_priority,k=>M().priorities[k].label,k=>PCOL[k]);
  const crows=bars(s.by_category,k=>M().categories[k],()=>'var(--cyan)');
  const tcol={incident:'var(--cyan)',request:'var(--green)',problem:'var(--mag)',other:'var(--gold)'};
  const trows=bars(s.by_type,k=>M().types[k].label,k=>tcol[k]||'var(--dim)');
  $('#dash-cards').innerHTML=`
    <div class="dpanel"><div class="dpanel-h">ステータス内訳</div>${donut(s.by_status,s.total)}</div>
    <div class="dpanel"><div class="dpanel-h">優先度 / PRIORITY</div><div class="minibars">${prows}</div></div>
    <div class="dpanel"><div class="dpanel-h">種別 / TYPE</div><div class="minibars">${trows}</div></div>
    <div class="dpanel span2"><div class="dpanel-h">起票 vs 解決トレンド</div>${trendChart(s.trend)}</div>
    <div class="dpanel span2"><div class="dpanel-h">分類別 / CATEGORY</div><div class="minibars">${crows}</div></div>`;
}

/* ============================================================ LIST */
const LIST_COLS=[['code','CODE'],['type','種別'],['priority','優先'],['status','状態'],['received_at','問合日'],['reporter','申請者'],['title','件名 / 分類'],['assignee','担当'],['updated_at','最終更新日時']];
function incRows(list){
  return list.map(i=>`
    <tr data-id="${i.id}">
      <td class="code">${esc(i.code)}</td>
      <td class="c-chip">${typeChip(i.type)}</td>
      <td class="c-chip">${prioBadge(i.priority)}</td>
      <td class="c-chip">${statusChip(i.status)}</td>
      <td class="t-meta c-kv" data-label="問合日">${i.received_at?esc(fmt(i.received_at,false)):'—'}</td>
      <td class="t-meta c-kv" data-label="申請者">${esc(i.reporter||'—')}</td>
      <td class="c-title"><div class="t-title">${esc(i.title)}</div>
          <div class="t-meta">${esc(M().categories[i.category]||i.category)}${i.affected?' · '+esc(i.affected):''} ${slaTag(i)}</div></td>
      <td class="t-meta c-kv" data-label="担当">${esc(i.assignee||'未割当')}</td>
      <td class="t-meta c-kv" data-label="最終更新日時" title="${esc(ago(i.updated_at))}">${esc(fmt(i.updated_at))}</td>
    </tr>`).join('');
}
function incTable(list, sortable){
  if(!list.length) return `<div class="empty">▢ 該当チケットなし — ALL CLEAR</div>`;
  const th=LIST_COLS.map(([k,label])=>{
    if(!sortable) return `<th>${label}</th>`;
    const on=State.sort.key===k, ar=on?(State.sort.dir==='asc'?'▲':'▼'):'△';
    return `<th class="srt${on?' on':''}" data-k="${k}" title="クリックで並び替え">${label}<span class="ar">${ar}</span></th>`;
  }).join('');
  return `<table class="inc"><thead><tr>${th}</tr></thead><tbody>${incRows(list)}</tbody></table>`;
}
const SORT_RANKP={P1:1,P2:2,P3:3,P4:4,P5:5}, SORT_STORDER={NEW:0,IN_PROGRESS:1,ON_HOLD:2,RESOLVED:3,CLOSED:4,CANCELLED:5};
function sortList(list,key,dir){
  const val=r=>{ switch(key){
    case 'priority':return SORT_RANKP[r.priority]||9;
    case 'status':return SORT_STORDER[r.status]??9;
    case 'received_at':return r.received_at?new Date(r.received_at).getTime():0;
    case 'updated_at':return r.updated_at?new Date(r.updated_at).getTime():0;
    default:return String(r[key]||'').toLowerCase(); } };
  return [...list].sort((a,b)=>{ const x=val(a),y=val(b); let c=x<y?-1:x>y?1:0;
    if(c!==0) return dir==='desc'?-c:c;
    return new Date(b.updated_at||0)-new Date(a.updated_at||0); });
}
function defaultDir(key){ return (key==='received_at'||key==='updated_at')?'desc':'asc'; }
function sortHintText(key,dir){
  const L={code:'コード',type:'種別',priority:'優先度',status:'状態',received_at:'問合日',reporter:'申請者',title:'件名',assignee:'担当',updated_at:'最終更新日時'};
  let d; if(key==='priority') d=dir==='asc'?'高い順 P1→P5':'低い順 P5→P1';
  else if(key==='status') d=dir==='asc'?'未対応が上→完了が下':'完了が上';
  else if(key==='received_at'||key==='updated_at') d=dir==='asc'?'古い順':'新しい順';
  else d=dir==='asc'?'昇順 (あ→ん / A→Z)':'降順 (ん→あ / Z→A)';
  return `並び替え：<b style="color:var(--gold)">${L[key]||key}</b>（${d}）　｜　列見出しをクリックで変更　・　全 ${State.incidents.length} 件`;
}
function bindRows(scope){ $$(`${scope} tr[data-id]`).forEach(tr=>tr.onclick=()=>openIncident(+tr.dataset.id)); }
function renderIncList(){
  const sorted=sortList(State.incidents, State.sort.key, State.sort.dir);
  $('#inc-list').innerHTML=incTable(sorted,true); bindRows('#inc-list');
  const hint=$('#inc-sorthint'); if(hint) hint.innerHTML=sortHintText(State.sort.key,State.sort.dir);
  $$('#inc-list th.srt').forEach(th=>th.onclick=()=>{
    const k=th.dataset.k;
    if(State.sort.key===k) State.sort.dir=State.sort.dir==='asc'?'desc':'asc';
    else { State.sort.key=k; State.sort.dir=defaultDir(k); }
    renderIncList();
  });
}
async function loadIncidents(){
  const p={ q:$('#f-q').value.trim(), scope:$('#f-scope').value, type:$('#f-type').value,
    priority:$('#f-priority').value, status:$('#f-status').value, category:$('#f-cat').value, channel:$('#f-channel').value };
  const j=await api('list',p,'GET'); State.incidents=j.incidents||[]; renderIncList();
}

/* ============================================================ DRAWER */
function openDrawer(html){ $('#modal-back').hidden=false; const d=$('#drawer'); d.hidden=false; d.innerHTML=html;
  $('#modal-back').onclick=closeDrawer; const x=$('#drawer .x'); if(x) x.onclick=closeDrawer; }
function closeDrawer(){ $('#drawer').hidden=true; $('#modal-back').hidden=true; $('#drawer').innerHTML=''; }

function opts(map, sel, fn){ return Object.entries(map).map(([k,v])=>`<option value="${k}" ${k===sel?'selected':''}>${esc(fn?fn(v):v)}</option>`).join(''); }

async function openIncident(id){
  const j=await api('get',{id},'GET'); const i=j.incident, ev=j.events, m=M();
  const tl=ev.map(e=>`<div class="tl-item ${esc(e.kind)}"><div class="tl-meta"><b>${esc(e.author)}</b> · ${esc(fmt(e.created_at))} · ${esc(e.kind)}</div>
      <div class="tl-body">${esc(e.body)||'<span style="color:var(--dim)">—</span>'}</div></div>`).join('');
  const writer=isWriter();
  const isProblem=i.type==='problem';
  const probView = (i.workaround||i.root_cause||i.known_error||isProblem) ? `
    <div class="sec-h">▶ 問題管理 / PROBLEM</div>
    <div class="kv">
      <span class="k">既知のエラー</span><span class="v">${i.known_error==1?'✔ 登録済':'—'}</span>
      <span class="k">ワークアラウンド</span><span class="v">${esc(i.workaround||'—')}</span>
      <span class="k">根本原因</span><span class="v">${esc(i.root_cause||'—')}</span>
    </div>`:'';

  const editPanel = writer ? `
    <div class="sec-h">▶ 更新 / UPDATE</div>
    <div class="form-2">
      <div class="form-row"><label>影響度</label><select class="inp" id="e-impact">${opts(m.impact,i.impact)}</select></div>
      <div class="form-row"><label>緊急度</label><select class="inp" id="e-urgency">${opts(m.urgency,i.urgency)}</select></div>
    </div>
    <div class="prio-preview">→ 優先度 <span id="e-prio">${prioBadge(i.priority)}</span> <span class="t-meta">（影響度×緊急度で自動決定）</span></div>
    <div class="form-2">
      <div class="form-row"><label>ステータス</label><select class="inp" id="e-status">${opts(m.statuses,i.status)}</select></div>
      <div class="form-row ac-host"><label>担当</label><input class="inp" id="e-assignee" value="${esc(i.assignee||'')}" placeholder="氏名・部署で検索"></div>
    </div>
    <div class="form-2"><div class="form-row"><label>受付日時 / 問い合わせ・依頼があった日時</label><input class="inp" type="datetime-local" id="e-received" value="${i.received_at?toLocalInput(i.received_at):''}"></div>
      <div class="form-row"><label>クローズ予定日 / いつまでに完了させるか</label><input class="inp" type="date" id="e-due" value="${esc(i.due_date||'')}"></div></div>
    <div class="form-2">
      <div class="form-row"><label>一次解決(FCR)</label><label class="chk"><input type="checkbox" id="e-fcr" ${i.fcr==1?'checked':''}> 初回対応で解決した</label></div>
      <div class="form-row"><label>満足度(CSAT)</label><select class="inp" id="e-csat">
        <option value="">未評価</option>${[[5,'大変満足'],[4,'満足'],[3,'普通'],[2,'やや不満'],[1,'不満']].map(([n,t])=>`<option value="${n}" ${String(i.csat)===String(n)?'selected':''}>${'★'.repeat(n)}（${n}）${t}</option>`).join('')}</select></div>
    </div>
    ${isProblem?`<div class="form-row"><label>ワークアラウンド（暫定対応）</label><textarea class="inp" id="e-wa">${esc(i.workaround||'')}</textarea></div>
      <div class="form-row"><label>根本原因</label><textarea class="inp" id="e-rc">${esc(i.root_cause||'')}</textarea></div>
      <div class="form-row"><label class="chk"><input type="checkbox" id="e-ke" ${i.known_error==1?'checked':''}> 既知のエラーとして登録</label></div>`:''}
    <div class="form-row"><label>関連チケット（過去・対応中のチケットから選択）</label><div class="lk-pick" id="e-linkpick"></div></div>
    <div class="form-row"><label>対応メモ / コメント（タイムラインに記録）</label><textarea class="inp" id="e-note" placeholder="調査・対応・連絡事項…"></textarea></div>
  ` : `<div class="sec-h">▶ 閲覧モード（監査）</div><div class="t-meta">監査ロールのため編集はできません。</div>`;

  openDrawer(`
   <div class="dr-head"><span class="logo-mark sm">◤◢</span>
     <div><div class="t-meta">${esc(i.code)} · ${esc(m.categories[i.category]||i.category)}</div>
       <div class="dr-title">${esc(i.title)}</div>
       <div>${typeChip(i.type)} ${prioBadge(i.priority)} ${statusChip(i.status)} ${slaTag(i)}</div></div>
     <button class="x">✕</button></div>
   <div class="dr-body">
     <div class="kv">
       <span class="k">影響度 × 緊急度</span><span class="v">${esc(m.impact[i.impact])} × ${esc(m.urgency[i.urgency])} → <b>${esc(m.priorities[i.priority].label)}</b></span>
       <span class="k">問い合わせ経路</span><span class="v">${esc(m.channels[i.channel]||'—')}</span>
       <span class="k">受付日時</span><span class="v">${esc(i.received_at?fmt(i.received_at):'—')}</span>
       <span class="k">クローズ予定日</span><span class="v">${esc(i.due_date||'—')}</span>
       <span class="k">影響範囲</span><span class="v">${esc(i.affected||'—')}</span>
       <span class="k">申告/要求者</span><span class="v">${esc(i.reporter||'—')}</span>
       <span class="k">担当</span><span class="v">${esc(i.assignee||'未割当')}</span>
       <span class="k">一次解決(FCR)</span><span class="v">${i.fcr==1?'✔':'—'}　満足度: ${i.csat?('★'.repeat(i.csat)):'—'}</span>
       <span class="k">SLA目標</span><span class="v">${esc(fmt(i.sla_target))} ${i.sla_breached?'<span class="sla-tag bad">超過</span>':''}</span>
       <span class="k">起票者 / 日時</span><span class="v">${esc(i.created_by)} ・ ${esc(fmt(i.created_at))}</span>
       <span class="k">最終更新</span><span class="v">${esc(fmt(i.updated_at))}</span>
       <span class="k">解決日時</span><span class="v">${esc(i.resolved_at?fmt(i.resolved_at):'—')}</span>
       <span class="k">関連チケット</span><span class="v">${esc(i.linked||'—')}</span>
     </div>
     <div class="sec-h">▶ 詳細 / DESCRIPTION</div>
     <div class="tl-body">${esc(i.description)||'<span style="color:var(--dim)">—</span>'}</div>
     ${probView}
     ${editPanel}
     <div class="sec-h">▶ タイムライン / TIMELINE (${ev.length})</div>
     <div class="timeline">${tl||'<div class="t-meta">記録なし</div>'}</div>
   </div>
   ${writer?`<div class="dr-foot"><button class="btn-ok" id="e-save">✓ 更新を記録</button>
       <button class="btn-ghost" id="e-comment">＋ コメントのみ</button>
       <button class="btn-del" id="e-delete">🗑 削除</button></div>`:''}
  `);

  if(writer){
    const upd=()=>{ $('#e-prio').innerHTML=prioBadge(calcPriority($('#e-impact').value,$('#e-urgency').value)); };
    $('#e-impact').onchange=upd; $('#e-urgency').onchange=upd;
    attachEmpAutocomplete($('#e-assignee'), ()=>State.assignees); initLinkPicker('e-linkpick', i.linked, i.code);
    $('#e-save').onclick=async()=>{
      const p={ id, impact:$('#e-impact').value, urgency:$('#e-urgency').value, status:$('#e-status').value,
        assignee:$('#e-assignee').value.trim(), fcr:$('#e-fcr').checked?1:0, csat:$('#e-csat').value,
        received_at:$('#e-received').value?new Date($('#e-received').value).toISOString():'', due_date:$('#e-due').value||'',
        linked:($('#e-linkpick')._getLinked?.()||''), note:$('#e-note').value.trim() };
      if(isProblem){ p.workaround=$('#e-wa').value.trim(); p.root_cause=$('#e-rc').value.trim(); p.known_error=$('#e-ke').checked?1:0; }
      try{ await api('update',p); toast(i.code+' を更新','ok'); closeDrawer(); refresh(); }catch(err){ toast(err.message,'bad'); }
    };
    $('#e-comment').onclick=async()=>{ const b=$('#e-note').value.trim(); if(!b) return toast('コメントを入力してください','bad');
      try{ await api('comment',{id, body:b}); toast('コメントを追加','ok'); closeDrawer(); refresh(); }catch(err){ toast(err.message,'bad'); } };
    $('#e-delete').onclick=()=>confirmDelete(i);
  }
}

function confirmDelete(i){
  openDialog(`<h3 style="color:var(--bad)">🗑 チケット削除</h3>
    <div class="t-meta" style="margin-bottom:12px">${esc(i.code)} «${esc(i.title)}» を削除します。<br>
      <b style="color:var(--bad)">タイムライン記録ごと完全に削除され、元に戻せません。</b></div>
    <div class="form-row"><label>削除理由（任意・通知に記載）</label><input class="inp" id="del-reason" placeholder="例: 重複起票のため"></div>
    <div class="dlg-actions"><button class="btn-ghost" id="del-cancel">キャンセル</button>
      <button class="btn-del" id="del-ok">完全に削除する</button></div>`);
  $('#del-cancel').onclick=closeDialog;
  $('#del-ok').onclick=async()=>{ try{ await api('delete',{id:i.id, reason:$('#del-reason').value.trim()});
    toast('削除しました — '+i.code,'ok'); closeDialog(); closeDrawer(); refresh(); }catch(err){ toast(err.message,'bad'); } };
}

/* ============================================================ NEW */
function openNew(){
  const m=M();
  openDrawer(`
   <div class="dr-head"><span class="logo-mark sm">◤◢</span>
     <div><div class="t-meta">NEW TICKET</div><div class="dr-title">新規起票</div></div><button class="x">✕</button></div>
   <div class="dr-body">
     <div class="form-row"><label>種別 / TYPE</label><select class="inp" id="n-type">${opts(m.types,'incident',v=>v.icon+' '+v.label)}</select>
       <div class="type-help" id="n-typehelp"></div></div>
     <div class="form-row"><label>件名 / TITLE *</label><input class="inp" id="n-title" placeholder="例: 本社7F無線LANが断続的に切断"></div>
     <div class="form-2">
       <div class="form-row"><label>影響度 / IMPACT</label><select class="inp" id="n-impact">${opts(m.impact,'M')}</select></div>
       <div class="form-row"><label>緊急度 / URGENCY</label><select class="inp" id="n-urgency">${opts(m.urgency,'M')}</select></div>
     </div>
     <div class="prio-preview">→ 優先度 <span id="n-prio">${prioBadge('P3')}</span> <span class="t-meta">（影響度×緊急度で自動決定）</span></div>
     <div class="form-2">
       <div class="form-row"><label>分類</label><select class="inp" id="n-cat">${opts(m.categories,'')}</select></div>
       <div class="form-row"><label>問い合わせ経路</label><select class="inp" id="n-channel"><option value="">—</option>${opts(m.channels,'phone')}</select></div>
     </div>
     <div class="form-2">
       <div class="form-row"><label>受付日時 / いつ問い合わせ・依頼があったか <span class="req">必須</span></label><input class="inp" type="datetime-local" id="n-received"></div>
       <div class="form-row"><label>初期ステータス</label><select class="inp" id="n-status">${opts(m.statuses,'NEW')}</select></div>
     </div>
     <div class="form-row"><label>クローズ予定日 / いつまでに完了させるか（任意）</label><input class="inp" type="date" id="n-due">
       <div class="type-help">この件を<b>いつまでにクローズ（完了）する予定か</b>の目標日です。緊急度の目安 → <b>高＝即時</b>／<b>中＝1〜3日</b>／<b>低＝任意</b>。分からなければ空欄でOK。</div></div>
     <div class="form-2">
       <div class="form-row ac-host"><label>担当 <span class="req">必須</span></label><input class="inp" id="n-assignee" placeholder="氏名・部署で検索"></div>
       <div class="form-row ac-host"><label id="n-replbl">申告者 / 要求者</label><input class="inp" id="n-reporter" placeholder="氏名・部署で検索（自由入力も可）"></div>
     </div>
     <div class="form-row"><label>影響範囲 / システム</label><input class="inp" id="n-affected" placeholder="例: 本社7F全体 / 営業部 / メールサーバー / 勤怠システム">
       <div class="type-help">どの<b>場所・部署・機器・システム</b>に影響が出ているかを書きます。例：「本社7F全体」「経理課のPC1台」「メールが全社で使えない」「Salesforceにログインできない」。分からなければ空欄でOK。</div></div>
     <div id="n-prob" class="hide">
       <div class="form-row"><label>ワークアラウンド（暫定対応）</label><textarea class="inp" id="n-wa" placeholder="暫定的な回避策…"></textarea></div>
       <div class="form-row"><label>根本原因</label><textarea class="inp" id="n-rc" placeholder="判明していれば…"></textarea></div>
       <div class="form-row"><label class="chk"><input type="checkbox" id="n-ke"> 既知のエラーとして登録</label></div>
     </div>
     <div class="form-row"><label>関連チケット（過去・対応中のチケットから選択／任意）</label><div class="lk-pick" id="n-linkpick"></div></div>
     <div class="form-row"><label>詳細 / DESCRIPTION</label><textarea class="inp" id="n-desc" placeholder="事象・発生日時・再現条件・初動…"></textarea></div>
     <label class="chk"><input type="checkbox" id="n-fcr"> 初回対応で解決済み（FCR）</label>
     <label class="chk"><input type="checkbox" id="n-notify" checked> 起票時に通知する（村野・竹内・長谷部・加藤へメール＋Slack #ベステラit_working）</label>
   </div>
   <div class="dr-foot"><button class="btn-ok" id="n-save">▶ 起票する</button></div>`);

  const refreshType=()=>{ const t=$('#n-type').value;
    $('#n-typehelp').innerHTML=typeHelpHtml(t);
    $('#n-prob').classList.add('hide');
    $('#n-replbl').textContent = t==='request' ? '依頼者' : (t==='problem' ? '起案者' : '申告者');
  };
  const upd=()=>{ $('#n-prio').innerHTML=prioBadge(calcPriority($('#n-impact').value,$('#n-urgency').value)); };
  $('#n-type').onchange=refreshType; $('#n-impact').onchange=upd; $('#n-urgency').onchange=upd;
  $('#n-received').value=toLocalInput();
  refreshType(); attachEmpAutocomplete($('#n-reporter')); attachEmpAutocomplete($('#n-assignee'), ()=>State.assignees); initLinkPicker('n-linkpick','',''); $('#n-title').focus();
  $('#n-save').onclick=async()=>{
    const title=$('#n-title').value.trim(); if(!title) return toast('件名は必須です','bad');
    const assignee=$('#n-assignee').value.trim(); if(!assignee) return toast('担当は必須です','bad');
    const recv=$('#n-received').value; if(!recv) return toast('受付日時は必須です','bad');
    const p={ type:$('#n-type').value, title, impact:$('#n-impact').value, urgency:$('#n-urgency').value,
      category:$('#n-cat').value, channel:$('#n-channel').value, status:$('#n-status').value,
      assignee, affected:$('#n-affected').value.trim(), reporter:$('#n-reporter').value.trim(),
      received_at:new Date(recv).toISOString(), due_date:$('#n-due').value||'', notify:$('#n-notify').checked?1:0,
      linked:($('#n-linkpick')._getLinked?.()||''), description:$('#n-desc').value.trim(), fcr:$('#n-fcr').checked?1:0 };
    if($('#n-type').value==='problem'){ p.workaround=$('#n-wa').value.trim(); p.root_cause=$('#n-rc').value.trim(); p.known_error=$('#n-ke').checked?1:0; }
    try{ const j=await api('create',p); toast('起票完了 — '+j.code,'ok'); closeDrawer(); refresh(); }catch(err){ toast(err.message,'bad'); }
  };
}
function refresh(){ if(State.view==='dashboard') loadDashboard(); else if(State.view==='incidents') loadIncidents(); }

/* ============================================================ REPORT */
async function runReport(){
  try{ const j=await api('report',{period:$('#rep-period').value, date:$('#rep-date').value},'GET');
    $('#rep-out').innerHTML=renderReport(j.report); }catch(err){ toast(err.message,'bad'); }
}
function renderReport(r){
  const m=M(), s=r.summary;
  const tbl=list=> list.length?`<table class="rep"><thead><tr><th>CODE</th><th>種別</th><th>優先</th><th>件名</th><th>状態</th><th>担当</th></tr></thead><tbody>`+
    list.map(i=>`<tr><td class="code">${esc(i.code)}</td><td>${typeChip(i.type)}</td><td>${prioBadge(i.priority)}</td><td>${esc(i.title)}</td><td>${statusChip(i.status)}</td><td class="t-meta">${esc(i.assignee||'—')}</td></tr>`).join('')+`</tbody></table>`
    :`<div class="t-meta" style="padding:10px">該当なし</div>`;
  const kv=(o,map,fn)=>Object.entries(o).filter(([k,v])=>v>0||map===m.priorities).map(([k,v])=>`<tr><td>${esc(fn?fn(map[k]):map[k])}</td><td style="text-align:right;font-weight:700">${v}</td></tr>`).join('')||'<tr><td class="t-meta">なし</td></tr>';
  return `<div class="rep-doc">
    <div class="rep-head"><div><h2>${r.period==='month'?'月次':'週次'}サービスデスク・レポート</h2>
      <div class="t-meta" style="margin-top:6px">対象期間 : <b style="color:var(--cyan)">${esc(r.label)}</b></div></div>
      <div class="meta">BESTERRA // INCIDENT COMMAND<br>ベステラIT ・ ITIL 4 / HDI 準拠<br>生成 ${esc(fmt(r.generated_at))}</div></div>
    <div class="rep-kpis">
      <div class="rep-kpi"><div class="v" style="color:var(--gold)">${s.opened}</div><div class="k">期間内 起票</div></div>
      <div class="rep-kpi"><div class="v" style="color:var(--green)">${s.resolved}</div><div class="k">期間内 解決</div></div>
      <div class="rep-kpi"><div class="v" style="color:${s.carry_open?'var(--bad)':'var(--cyan)'}">${s.carry_open}</div><div class="k">期末 未解決</div></div>
      <div class="rep-kpi"><div class="v" style="color:var(--cyan)">${dur(s.mttr_seconds)}</div><div class="k">平均解決(MTTR)</div></div>
      <div class="rep-kpi"><div class="v" style="color:var(--green)">${s.fcr_rate==null?'—':s.fcr_rate+'%'}</div><div class="k">一次解決率(FCR)</div></div>
      <div class="rep-kpi"><div class="v" style="color:var(--cyan)">${s.sla_rate==null?'—':s.sla_rate+'%'}</div><div class="k">SLA遵守率</div></div>
      <div class="rep-kpi"><div class="v" style="color:var(--gold)">${s.csat_avg==null?'—':s.csat_avg}</div><div class="k">満足度(CSAT)</div></div>
    </div>
    <div class="rep-2col">
      <div class="rep-sec"><h4>■ 種別別（起票）</h4><table class="rep"><tbody>${kv(r.by_type,m.types,v=>v.icon+' '+v.label)}</tbody></table></div>
      <div class="rep-sec"><h4>■ 優先度別（起票）</h4><table class="rep"><tbody>${kv(r.by_priority,m.priorities,v=>v.label)}</tbody></table></div>
    </div>
    <div class="rep-2col">
      <div class="rep-sec"><h4>■ 分類別（起票）</h4><table class="rep"><tbody>${kv(r.by_category,m.categories)}</tbody></table></div>
      <div class="rep-sec"><h4>■ 問い合わせ経路別（起票）</h4><table class="rep"><tbody>${kv(r.by_channel,m.channels)}</tbody></table></div>
    </div>
    <div class="rep-sec"><h4>■ 期間内に起票（${r.opened.length}）</h4>${tbl(r.opened)}</div>
    <div class="rep-sec"><h4>■ 期間内に解決（${r.resolved.length}）</h4>${tbl(r.resolved)}</div>
    <div class="rep-sec"><h4>■ 期末時点で未解決・継続対応（${r.carry.length}）</h4>${tbl(r.carry)}</div>
  </div>`;
}

/* ============================================================ DIALOG / MODEL / PASSWORD */
function openDialog(html,cls=''){ const d=$('#dialog'); d.hidden=false; d.innerHTML=`<div class="dlg-box ${cls}">${html}</div>`; }
function closeDialog(){ $('#dialog').hidden=true; $('#dialog').innerHTML=''; }

function openModel(){
  const md=M().model;
  const rows=md.practices.map(p=>`<div class="model-row">
     <div class="model-name">${esc(p.name)}<span class="model-std">${esc(p.std)}</span></div>
     <div class="model-desc">${esc(p.desc)}</div></div>`).join('');
  openDialog(`<h3>🛡 準拠モデル — ${esc(M().app.standards)}</h3>
    <div class="t-meta" style="margin-bottom:12px;line-height:1.7">${esc(md.intro)}</div>
    <div class="model-list">${rows}</div>
    <div class="t-meta" style="margin-top:12px">優先度は <b style="color:var(--cyan)">影響度 × 緊急度</b> のマトリクスで P1〜P5 を自動決定します。</div>
    <div class="dlg-actions"><button class="btn-ok" id="md-ok">閉じる</button></div>`);
  $('#md-ok').onclick=closeDialog;
}
function openChangePw(){
  openDialog(`<h3>⚙ パスワード変更</h3>
    <div class="form-row"><label>現在のパスワード</label><input class="inp" type="password" id="pw-old"></div>
    <div class="form-row"><label>新しいパスワード（6文字以上）</label><input class="inp" type="password" id="pw-new"></div>
    <div class="dlg-actions"><button class="btn-ghost" id="pw-cancel">キャンセル</button><button class="btn-ok" id="pw-save">変更</button></div>`);
  $('#pw-cancel').onclick=closeDialog;
  $('#pw-save').onclick=async()=>{ try{ await api('changepw',{old:$('#pw-old').value, new:$('#pw-new').value});
    toast('パスワードを変更しました','ok'); closeDialog(); }catch(err){ toast(err.message,'bad'); } };
}

/* ============================================================ TUTORIAL */
function tourSteps(){
  if(isWriter()){
    return [
      {target:null, mission:'WELCOME', title:'やあ、ようこそ！👋',
       text:'ここは <span class="k">BESTERRA インシデント・コマンド</span> ── 社内ITのトラブルを記録して、みんなで片づけていくサービスデスクだよ。<br>ボクは案内役のNAVI。<span class="k">ITIL 4 / HDI</span> 準拠の使い方、サクッと案内するね！'},
      {target:'#statstrip', mission:'INSIGHT', title:'① まずは全体をチェック',
       text:'いちばん上のこのバーが <span class="k">状況パネル</span>。<br>未解決の数・要対応(P1/P2)・<span class="k">SLA超過</span>、種別や優先度の内訳がここで一発でわかるよ👀'},
      {target:'.tb-nav', mission:'STAGE', title:'② 画面は3つ',
       text:'<span class="k">DASHBOARD</span>＝全体ながめる ／ <span class="k">INCIDENTS</span>＝一覧と起票 ／ <span class="k">REPORT</span>＝レポート。<br>ここでパッと切り替えてね。'},
      {view:'incidents', target:'#btn-new', mission:'DEPLOY', title:'③ 困ったらここから起票！',
       text:'トラブルが来たら <span class="k">＋ 新規起票</span> をポチッ。<br>扱うのは4種類 ── <span class="k">問合せ(インシデント)</span>・<span class="k">リクエスト</span>(依頼)・<span class="k">計画・idea</span>(改善案)・<span class="k">その他</span>。<br>迷ったら「問合せ」でOK。優先度は <span class="k">影響度×緊急度</span> で勝手に決まるから安心して👍'},
      {view:'incidents', target:'#f-type', mission:'SCAN', title:'④ 探すのもカンタン',
       text:'種別・優先度・状態・分類・<span class="k">問い合わせ経路</span>で、過去のチケットをサクッと絞り込めるよ🔍'},
      {target:null, mission:'COMMAND', title:'⑤ 対応はクリックから',
       text:'一覧の行をクリックすると詳細が開くよ。<br>状態の更新・担当変更・<span class="k">一次解決(FCR)や満足度(CSAT)</span>を記録すると、全部タイムラインに残って <span class="k">Slackにも自動でお知らせ</span>が飛ぶ📣'},
      {target:'.nav-tab[data-view="report"]', mission:'REPORT', title:'⑥ レポートは自動でできる',
       text:'週次・月次の <span class="k">FCR率・SLA遵守率・CSAT・MTTR</span> を勝手に集計。<br>印刷やPDFにして、そのまま上に報告できちゃう📄'},
      {target:'#btn-model', mission:'STANDARD', title:'⑦ 準拠モデルも見れるよ',
       text:'この <span class="k">ITIL 4 / HDI 準拠</span> のバッジを押すと、どの基準に沿ってるか確認できるよ。'},
      {target:'#btn-help', mission:'GUIDE', title:'⑧ 困ったらいつでも呼んでね',
       text:'この <span class="k">❓</span> を押せば、この案内をもう一回見れるよ。隣の <span class="k">⚙</span> でパスワード変更もできる。'},
      {target:null, mission:'READY', title:'準備OK！いってらっしゃい🎉',
       text:'<div class="tour-confetti">🎉</div>以上！もうバッチリだね。<br>あとはよろしく頼んだよ ── 困ったらいつでもNAVIを呼んでね！'},
    ];
  }
  return [
    {target:null, mission:'WELCOME', title:'ようこそ！👋',
     text:'ここは <span class="k">ITIL 4 / HDI 準拠</span> の社内ITサービスデスク。<span class="k">インシデントの状況をサッと確認</span>できる画面だよ。要点だけ、パパっと案内するね！'},
    {target:'#statstrip', mission:'INSIGHT', title:'① 全体はここでチェック',
     text:'いちばん上のバーで、<span class="k">未解決の数・要対応・SLA超過・優先度の内訳</span>が一目でわかるよ👀'},
    {target:'.tb-nav', mission:'STAGE', title:'② 画面の切り替え',
     text:'<span class="k">DASHBOARD</span>で全体、<span class="k">REPORT</span>で週次・月次のレポート。ここで切り替えてね。'},
    {target:'.nav-tab[data-view="report"]', mission:'REPORT', title:'③ レポート（HDI指標つき）',
     text:'<span class="k">FCR率・SLA遵守率・CSAT・MTTR</span> 入りの集計を、<span class="k">印刷・PDF</span>でそのまま確認・保存できるよ📄'},
    {target:'#btn-model', mission:'STANDARD', title:'④ 準拠モデル',
     text:'<span class="k">ITIL 4 / HDI 準拠</span> バッジから、どの基準に沿ってるか見れるよ。'},
    {target:null, mission:'READY', title:'準備OK！',
     text:'<div class="tour-confetti">✅</div>以上だよ！いつでも全体の状況をのぞいてみてね👍'},
  ];
}
const Tour={ steps:[], i:0, key:'', _rz:null,
  async start(steps,key){ this.steps=steps; this.key=key||''; this.i=0; this.buildDOM(); await this.show(); },
  buildDOM(){ if($('#tour-mask')) return;
    const m=document.createElement('div'); m.className='tour-mask'; m.id='tour-mask';
    m.innerHTML=`<div class="tour-hole" id="tour-hole"></div><div class="tour-card" id="tour-card"></div><button class="tour-skip" id="tour-skip">スキップ ✕</button>`;
    document.body.appendChild(m); $('#tour-skip').onclick=()=>this.finish(true);
    this._rz=()=>tourPosition(this.steps[this.i]); addEventListener('resize',this._rz); },
  async show(){ const step=this.steps[this.i];
    if(step.view && State.view!==step.view){ switchView(step.view); await sleep(420); }
    tourRenderCard(step,this.i,this.steps.length,this);
    requestAnimationFrame(()=>{ tourPosition(step); const h=$('#tour-hole'); if(h) h.classList.toggle('pulse',!!step.target); }); },
  async next(){ if(this.i>=this.steps.length-1){ this.finish(true); return; } this.i++; await this.show(); },
  async back(){ if(this.i>0){ this.i--; await this.show(); } },
  finish(save){ if(save&&this.key) try{ localStorage.setItem(this.key,'1'); }catch(e){}
    if(this._rz) removeEventListener('resize',this._rz); const m=$('#tour-mask'); if(m) m.remove();
    if(State.view!=='dashboard') switchView('dashboard'); }
};
function tourRenderCard(step,idx,total,ctrl){
  const card=$('#tour-card'); if(!card) return;
  const pips=Array.from({length:total},(_,k)=>`<span class="tour-pip ${k<=idx?'on':''}"></span>`).join('');
  const last=idx===total-1;
  card.innerHTML=`<div class="tour-xp"><i style="width:${(idx+1)/total*100}%"></i></div>
    <div class="tour-navi"><div class="tour-ava">🤖</div>
      <div><div class="tour-who">NAVI <span style="color:var(--dim);font-weight:400">／ 案内AI</span></div>
        <div class="tour-mission">MISSION ${idx+1} / ${total}${step.mission?' · '+step.mission:''}</div></div></div>
    <div class="tour-body"><div class="tour-title">${step.title}</div>
      <div class="tour-text">${step.text} <span class="tour-caret">▌</span></div></div>
    <div class="tour-foot"><div class="tour-prog">${pips}</div>
      ${idx>0?`<button class="tour-btn" id="tour-back">◀ 戻る</button>`:''}
      <button class="tour-btn primary" id="tour-next">${last?'✔ 完了':'次へ ▶'}</button></div>`;
  const b=$('#tour-back'); if(b) b.onclick=()=>ctrl.back(); $('#tour-next').onclick=()=>ctrl.next();
}
function tourPosition(step){
  const hole=$('#tour-hole'), card=$('#tour-card'); if(!hole||!card) return;
  const el=step&&step.target?document.querySelector(step.target):null;
  if(!el){ hole.style.display='none'; card.classList.add('center'); card.style.left=''; card.style.top=''; return; }
  card.classList.remove('center');
  const r=el.getBoundingClientRect(), pad=8;
  hole.style.display='block'; hole.style.left=(r.left-pad)+'px'; hole.style.top=(r.top-pad)+'px';
  hole.style.width=(r.width+pad*2)+'px'; hole.style.height=(r.height+pad*2)+'px';
  const cw=card.offsetWidth, chh=card.offsetHeight; let top; const below=r.bottom+14, above=r.top-chh-14;
  if(below+chh<=innerHeight-8) top=below; else if(above>=8) top=above; else top=Math.max(8,(innerHeight-chh)/2);
  let left=r.left+r.width/2-cw/2; left=Math.max(10,Math.min(left,innerWidth-cw-10));
  card.style.left=left+'px'; card.style.top=top+'px';
}
function startTutorial(force){
  const key='inc_tour_'+(State.user?State.user.username:'x')+'_v2';
  if(!force){ try{ if(localStorage.getItem(key)) return; }catch(e){} }
  Tour.start(tourSteps(), key);
}

/* ============================================================ INIT */
/* ============================================================ THEME（明/暗） */
function applyTheme(t){
  const light = t==='light';
  document.body.classList.toggle('light', light);
  const b=$('#btn-theme'); if(b){ b.textContent=light?'🌙':'☀'; b.title=light?'暗い表示に切替':'明るい表示に切替'; }
}
function initTheme(){
  let t='dark'; try{ t=localStorage.getItem('inc-theme')||'dark'; }catch(e){}
  applyTheme(t);
  const b=$('#btn-theme'); if(b) b.onclick=()=>{
    const next=document.body.classList.contains('light')?'dark':'light';
    try{ localStorage.setItem('inc-theme',next); }catch(e){} applyTheme(next);
  };
}

(async function init(){
  initTheme();
  matrix(); clock(); initLogin(); bootSeq();
  try{ State.meta=await api('meta',{},'GET'); const me=await api('me',{},'GET');
    if(me.user){ State.user=me.user; enterApp(); } }catch(e){}
  document.body.classList.remove('booting');
  addEventListener('keydown',e=>{ if(e.key==='Escape'){ if(!$('#drawer').hidden) closeDrawer(); if(!$('#dialog').hidden) closeDialog(); if($('#tour-mask')) Tour.finish(true); } });
})();
