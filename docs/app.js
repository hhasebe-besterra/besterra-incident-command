/* ============================================================
   BESTERRA // INCIDENT COMMAND — Supabase + GitHub Pages 版
   実績あるUIはそのまま、データ層のみ Supabase に差し替え
   ============================================================ */
'use strict';
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const EMAIL_DOMAIN = '@besterra.co.jp';

const State = { meta:null, user:null, view:'dashboard', incidents:[], employees:[], assignees:[] };

/* ---------- 静的マスタ（旧 config.php 相当） ---------- */
const META = {
  app:{ name:'BESTERRA // INCIDENT COMMAND', tag:'ベステラIT サービスデスク', standards:'ITIL 4 / HDI 準拠' },
  types:{
    incident:{label:'インシデント',short:'INC',icon:'⚠',desc:'計画外のサービス中断・品質低下（迅速な復旧が目的）'},
    request :{label:'サービス要求',short:'REQ',icon:'✉',desc:'アカウント・権限・機器など定型サービスの要求'},
    problem :{label:'問題',short:'PRB',icon:'🧩',desc:'複数インシデントの根本原因（再発防止が目的）'},
  },
  impact:{H:'高 / 全社・基幹',M:'中 / 部門・複数名',L:'低 / 個人・軽微'},
  urgency:{H:'高 / 即時',M:'中 / 当日中',L:'低 / 計画的'},
  priorities:{P1:{label:'P1 緊急',sla_hours:4},P2:{label:'P2 高',sla_hours:8},P3:{label:'P3 中',sla_hours:24},P4:{label:'P4 低',sla_hours:72},P5:{label:'P5 計画',sla_hours:168}},
  statuses:{NEW:'新規',IN_PROGRESS:'対応中',ON_HOLD:'保留',RESOLVED:'解決済',CLOSED:'完了'},
  open_statuses:['NEW','IN_PROGRESS','ON_HOLD'],
  categories:{NETWORK:'ネットワーク',SERVER:'サーバー / NAS',MAIL:'メール',PC:'PC / 端末',ACCOUNT:'アカウント / 権限',SAAS:'SaaS / クラウド',SECURITY:'セキュリティ',PRINTER:'複合機 / 印刷',OTHER:'その他'},
  channels:{phone:'電話',email:'メール',teams:'Teams / チャット',walkup:'口頭 / 来訪',self:'自己起票',monitoring:'監視検知'},
  model:{
    standards:'ITIL 4 / HDI 準拠',
    intro:'このサービスデスクは、ITサービスマネジメントの国際的フレームワーク ITIL 4 (2019) と、サポートセンター実務の世界標準 HDI に準拠して設計されています。',
    practices:[
      {name:'インシデント管理 / Incident Management', std:'ITIL 4', desc:'計画外のサービス中断・品質低下を、可能な限り迅速に通常運用へ復旧する。'},
      {name:'サービス要求管理 / Service Request Management', std:'ITIL 4', desc:'アカウント発行・権限・機器など、定型で低リスクな要求を確実に履行する。'},
      {name:'問題管理 / Problem Management', std:'ITIL 4', desc:'複数インシデントの根本原因を特定し、ワークアラウンド・既知のエラーとして管理し再発を防ぐ。'},
      {name:'サービスデスク / Service Desk', std:'ITIL 4 + HDI', desc:'単一窓口(SPOC)として全ての連絡を受け、記録・分類・優先度付け・エスカレーションを行う。'},
      {name:'サポート指標 / Support Metrics', std:'HDI', desc:'FCR(一次解決率)・CSAT(顧客満足度)・SLA遵守率・MTTR(平均解決時間)で品質を可視化する。'},
    ],
  },
};

/* ---------- Supabase クライアント ---------- */
const SUPA_OK = window.SUPA_URL && !String(window.SUPA_URL).startsWith('__');
const sb = SUPA_OK ? window.supabase.createClient(window.SUPA_URL, window.SUPA_ANON) : null;

/* ---------- 優先度・SLA ---------- */
function calcPriority(i,u){ const w={H:3,M:2,L:1}; const s=(w[i]||2)+(w[u]||2); return {6:'P1',5:'P2',4:'P3',3:'P4',2:'P5'}[s]||'P3'; }
function slaTarget(inc){ const h=META.priorities[inc.priority]&&META.priorities[inc.priority].sla_hours; if(h==null||!inc.created_at) return null; return new Date(new Date(inc.created_at).getTime()+h*3600*1000).toISOString(); }
function slaBreached(inc){ const t=slaTarget(inc); if(!t) return false; const end=inc.resolved_at||new Date().toISOString(); return new Date(end)>new Date(t); }

/* ---------- プロフィール ---------- */
async function getProfile(uid){
  const {data} = await sb.from('profiles').select('username,display_name,role').eq('id',uid).single();
  return data;
}

/* ============================================================
   API シム（旧 api.php の action 互換。戻り値の形を合わせる）
   ============================================================ */
async function api(action, params={}){
  if(action==='meta') return {ok:true, app:META.app, model:META.model, types:META.types, impact:META.impact,
    urgency:META.urgency, priorities:META.priorities, statuses:META.statuses, categories:META.categories,
    channels:META.channels, open_statuses:META.open_statuses};
  if(!sb){
    if(action==='me') return {ok:true, user:null};
    throw new Error('Supabase未設定です（config.js に URL / anon key を設定してください）');
  }
  switch(action){
    case 'login': {
      const email = String(params.username||'').includes('@') ? params.username : params.username+EMAIL_DOMAIN;
      const {data,error} = await sb.auth.signInWithPassword({email, password:params.password});
      if(error) throw new Error('ACCESS DENIED — 認証失敗');
      const p = await getProfile(data.user.id);
      if(!p) throw new Error('プロフィール未登録（schema.sql 未投入の可能性）');
      return {ok:true, user:p};
    }
    case 'logout': await sb.auth.signOut(); return {ok:true};
    case 'me': {
      const {data:{session}} = await sb.auth.getSession();
      if(!session) return {ok:true, user:null};
      const p = await getProfile(session.user.id);
      return {ok:true, user:p||null};
    }
    case 'users': { const {data}=await sb.from('profiles').select('username,display_name,role'); return {ok:true, users:data||[]}; }
    case 'employees': { const r=await fetch('employees.json'); return {ok:true, employees: r.ok? await r.json():[]}; }
    case 'assignees': { const r=await fetch('assignees.json'); return {ok:true, assignees: r.ok? await r.json():[]}; }

    case 'list': {
      let qy=sb.from('incidents').select('*');
      if(params.scope==='open') qy=qy.in('status', META.open_statuses);
      ['type','priority','status','category','channel'].forEach(f=>{ if(params[f]) qy=qy.eq(f,params[f]); });
      const q=(params.q||'').trim();
      if(q){ const s=q.replace(/[,()%]/g,' '); qy=qy.or(`title.ilike.%${s}%,code.ilike.%${s}%,description.ilike.%${s}%,affected.ilike.%${s}%`); }
      const {data,error}=await qy.limit(500);
      if(error) throw new Error(error.message);
      const rows=(data||[]).map(r=>({...r, sla_target:slaTarget(r), sla_breached:slaBreached(r)}));
      rows.sort((a,b)=>{ const ao=['RESOLVED','CLOSED'].includes(a.status)?1:0, bo=['RESOLVED','CLOSED'].includes(b.status)?1:0;
        if(ao!==bo) return ao-bo; if(a.priority!==b.priority) return a.priority<b.priority?-1:1; return a.created_at<b.created_at?1:-1; });
      return {ok:true, incidents:rows};
    }
    case 'get': {
      const {data:inc,error}=await sb.from('incidents').select('*').eq('id',params.id).single();
      if(error) throw new Error('NOT FOUND');
      inc.sla_target=slaTarget(inc); inc.sla_breached=slaBreached(inc);
      const {data:ev}=await sb.from('events').select('*').eq('incident_id',params.id).order('id',{ascending:true});
      return {ok:true, incident:inc, events:ev||[]};
    }
    case 'create': {
      const type=META.types[params.type]?params.type:'incident';
      const impact=META.impact[params.impact]?params.impact:'M';
      const urgency=META.urgency[params.urgency]?params.urgency:'M';
      const priority=calcPriority(impact,urgency);
      const status=META.statuses[params.status]?params.status:'NEW';
      const ins={ type, title:params.title, description:params.description||'',
        category:META.categories[params.category]?params.category:'OTHER', impact, urgency, priority, status,
        channel:META.channels[params.channel]?params.channel:null, affected:params.affected||'',
        reporter:params.reporter||'', assignee:params.assignee||'', fcr:!!(+params.fcr),
        csat:(params.csat===''||params.csat==null)?null:+params.csat, workaround:params.workaround||'',
        root_cause:params.root_cause||'', known_error:!!(+params.known_error), linked:params.linked||'',
        created_by:State.user.display_name };
      const {data,error}=await sb.from('incidents').insert(ins).select('id,code').single();
      if(error) throw new Error(error.message);
      await sb.from('events').insert({incident_id:data.id, author:State.user.display_name, kind:'create',
        body:`${META.types[type].label}を起票（${priority} / ${META.statuses[status]}）`});
      return {ok:true, id:data.id, code:data.code};
    }
    case 'update': {
      const {data:cur,error}=await sb.from('incidents').select('*').eq('id',params.id).single();
      if(error) throw new Error('NOT FOUND');
      const set={}, changes=[];
      ['title','description','affected','reporter','assignee','workaround','root_cause','linked'].forEach(f=>{
        if(params[f]!==undefined && String(params[f]??'')!==String(cur[f]??'')){ set[f]=params[f]; if(f==='assignee') changes.push('担当 → '+(params[f]||'未割当')); }
      });
      let imp=cur.impact, urg=cur.urgency;
      if(params.impact && params.impact!==cur.impact){ set.impact=params.impact; imp=params.impact; }
      if(params.urgency && params.urgency!==cur.urgency){ set.urgency=params.urgency; urg=params.urgency; }
      const np=calcPriority(imp,urg); if(np!==cur.priority){ set.priority=np; changes.push(`優先度 ${cur.priority} → ${np}`); }
      if(params.fcr!==undefined){ const v=!!(+params.fcr); if(v!==cur.fcr) set.fcr=v; }
      if(params.known_error!==undefined){ const v=!!(+params.known_error); if(v!==cur.known_error) set.known_error=v; }
      if(params.csat!==undefined){ const v=(params.csat===''||params.csat==null)?null:+params.csat; if(v!==cur.csat) set.csat=v; }
      if(params.status && META.statuses[params.status] && params.status!==cur.status){
        set.status=params.status; changes.push(`ステータス ${META.statuses[cur.status]} → ${META.statuses[params.status]}`); }
      if(Object.keys(set).length){ const {error:ue}=await sb.from('incidents').update(set).eq('id',params.id); if(ue) throw new Error(ue.message); }
      else { await sb.from('incidents').update({updated_at:new Date().toISOString()}).eq('id',params.id); }
      const note=(params.note||'').trim();
      const body=[changes.join(' / '), note].filter(Boolean).join(changes.length&&note?'\n':'');
      if(body||changes.length){ await sb.from('events').insert({incident_id:params.id, author:State.user.display_name, kind:changes.length?'update':'note', body}); }
      return {ok:true};
    }
    case 'comment': {
      if(!(params.body||'').trim()) throw new Error('コメントが空です');
      await sb.from('events').insert({incident_id:params.id, author:State.user.display_name, kind:'note', body:params.body.trim()});
      await sb.from('incidents').update({updated_at:new Date().toISOString()}).eq('id',params.id);
      return {ok:true};
    }
    case 'delete': {
      const {error}=await sb.from('incidents').delete().eq('id',params.id);
      if(error) throw new Error(error.message);
      return {ok:true};
    }
    case 'stats': {
      const {data,error}=await sb.from('incidents').select('*'); if(error) throw new Error(error.message);
      const all=data||[];
      const cnt=(key,master)=>{ const o={}; Object.keys(master).forEach(k=>o[k]=0); all.forEach(r=>{ if(r[key]!=null&&r[key]!=='') o[r[key]]=(o[r[key]]||0)+1; }); return o; };
      const open=all.filter(r=>META.open_statuses.includes(r.status));
      return {ok:true, total:all.length, open:open.length,
        critical_open:open.filter(r=>['P1','P2'].includes(r.priority)).length,
        sla_risk:open.filter(r=>slaBreached(r)).length,
        by_type:cnt('type',META.types), by_priority:cnt('priority',META.priorities),
        by_status:cnt('status',META.statuses), by_category:cnt('category',META.categories)};
    }
    case 'report': {
      const {data,error}=await sb.from('incidents').select('*'); if(error) throw new Error(error.message);
      return {ok:true, report:buildReport(data||[], params.period==='month'?'month':'week', params.date)};
    }
    case 'changepw': {
      if(String(params.new||'').length<6) throw new Error('新パスワードは6文字以上にしてください');
      const {error}=await sb.auth.updateUser({password:params.new}); if(error) throw new Error(error.message);
      return {ok:true};
    }
    default: throw new Error('UNKNOWN ACTION: '+action);
  }
}

/* ---------- レポート集計（旧 report_lib.php 相当） ---------- */
function fmtDate(d){ const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())}`; }
function buildReport(all, period, ref){
  const base = ref ? new Date(ref+'T00:00:00') : new Date(); base.setHours(0,0,0,0);
  let start,end,label;
  if(period==='month'){ start=new Date(base.getFullYear(),base.getMonth(),1); end=new Date(base.getFullYear(),base.getMonth()+1,1); label=`${start.getFullYear()}年${start.getMonth()+1}月`; }
  else { const dow=(base.getDay()+6)%7; start=new Date(base); start.setDate(base.getDate()-dow); end=new Date(start); end.setDate(start.getDate()+7);
    const e2=new Date(end); e2.setDate(end.getDate()-1); label=`${fmtDate(start)} 〜 ${fmtDate(e2)}`; }
  const inRange=(d,s,e)=>{ const t=new Date(d).getTime(); return t>=s.getTime() && t<e.getTime(); };
  const opened=all.filter(r=>inRange(r.created_at,start,end));
  const resolved=all.filter(r=>r.resolved_at && inRange(r.resolved_at,start,end));
  const carry=all.filter(r=> new Date(r.created_at)<end && (!r.resolved_at || new Date(r.resolved_at)>=end) && META.open_statuses.includes(r.status));
  const durs=resolved.filter(r=>r.created_at&&r.resolved_at).map(r=>(new Date(r.resolved_at)-new Date(r.created_at))/1000).filter(x=>x>=0);
  const mttr=durs.length?durs.reduce((a,b)=>a+b,0)/durs.length:null;
  const resN=resolved.length;
  const fcr=resolved.filter(r=>r.fcr).length, slaOk=resolved.filter(r=>!slaBreached(r)).length;
  const csv=resolved.filter(r=>r.csat!=null&&r.csat!=='').map(r=>+r.csat);
  const by=(arr,key,master)=>{ const o={}; Object.keys(master).forEach(k=>o[k]=0); arr.forEach(r=>{ if(r[key]!=null&&r[key]!=='') o[r[key]]=(o[r[key]]||0)+1; }); return o; };
  return { period, label, start:start.toISOString(), end:end.toISOString(), generated_at:new Date().toISOString(),
    summary:{ opened:opened.length, resolved:resN, carry_open:carry.length, mttr_seconds:mttr,
      fcr_rate:resN?Math.round(fcr/resN*100):null, sla_rate:resN?Math.round(slaOk/resN*100):null,
      csat_avg:csv.length?Math.round(csv.reduce((a,b)=>a+b,0)/csv.length*10)/10:null },
    by_type:by(opened,'type',META.types), by_priority:by(opened,'priority',META.priorities),
    by_category:by(opened,'category',META.categories), by_channel:by(opened,'channel',META.channels),
    opened, resolved, carry };
}

/* ---------- toast ---------- */
function toast(msg, kind='info', ms=3200){
  const t=document.createElement('div'); t.className='toast '+kind; t.textContent=msg;
  $('#toasts').appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateY(8px)'; t.style.transition='.3s'; setTimeout(()=>t.remove(),320); }, ms);
}
/* ---------- matrix ---------- */
function matrix(){
  const c=$('#matrix'), x=c.getContext('2d'); let w,h,cols,drops;
  const glyphs='ｱｲｳｴｵｶｷｸ0123456789ABCDEF<>/\\[]{}#$%ITILHDI'.split('');
  function size(){ w=c.width=innerWidth; h=c.height=innerHeight; cols=Math.floor(w/16); drops=Array(cols).fill(0).map(()=>Math.random()*-50); }
  size(); addEventListener('resize', size);
  function draw(){ x.fillStyle='rgba(16,26,40,.10)'; x.fillRect(0,0,w,h); x.font='14px monospace';
    for(let i=0;i<cols;i++){ const ch=glyphs[Math.floor(Math.random()*glyphs.length)];
      x.fillStyle=Math.random()>.96?'rgba(62,230,255,.9)':'rgba(61,255,171,.5)'; x.fillText(ch,i*16,drops[i]*16);
      if(drops[i]*16>h && Math.random()>.975) drops[i]=0; drops[i]++; } requestAnimationFrame(draw); }
  draw();
}
function clock(){ const el=$('#clock'); const t=()=>el.textContent=new Date().toLocaleTimeString('ja-JP',{hour12:false}); t(); setInterval(t,1000); }
async function bootSeq(){
  const log=$('#boot-log');
  const lines=[['[ OK ] secure channel · supabase',90],['[ OK ] service desk core · ITIL 4 / HDI',120],
    ['[ OK ] practices: incident · request · problem',90],['[ .. ] auth handshake',150],
    ['<span class="dim">awaiting authentication ▒</span>',60]];
  log.innerHTML=''; for(const [t,d] of lines){ log.innerHTML+=t+'\n'; await sleep(d); }
}
function fmt(iso, withTime=true){ if(!iso) return '—'; const d=new Date(iso), p=n=>String(n).padStart(2,'0');
  const b=`${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())}`; return withTime?`${b} ${p(d.getHours())}:${p(d.getMinutes())}`:b; }
function ago(iso){ if(!iso) return ''; const s=(Date.now()-new Date(iso).getTime())/1000;
  if(s<60) return '今'; if(s<3600) return Math.floor(s/60)+'分前'; if(s<86400) return Math.floor(s/3600)+'時間前'; return Math.floor(s/86400)+'日前'; }
function dur(sec){ if(sec==null) return '—'; if(sec<3600) return Math.round(sec/60)+'分'; if(sec<86400) return (sec/3600).toFixed(1)+'時間'; return (sec/86400).toFixed(1)+'日'; }

const M = ()=>State.meta;
const prioBadge = p => `<span class="badge prio-${p}">${p}</span>`;
const statusChip = s => `<span class="st st-${s}"><i class="dot"></i>${M().statuses[s]||s}</span>`;
const typeChip = t => `<span class="type-chip type-${t}">${M().types[t]?M().types[t].icon:''} ${M().types[t]?M().types[t].label:t}</span>`;
const isWriter = () => State.user && State.user.role !== 'auditor';
function slaTag(inc){ if(['RESOLVED','CLOSED'].includes(inc.status)) return inc.sla_breached?`<span class="sla-tag bad">SLA超過</span>`:`<span class="sla-tag ok">SLA内</span>`;
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
  $('#tb-tag').textContent=M().app.tag; $('#btn-model').textContent=M().app.standards||'ITIL 4 / HDI 準拠';
  const r=State.user.role;
  $('#who').innerHTML=`<span class="uname">${esc(State.user.display_name)}</span><span class="role ${r}">${r.toUpperCase()}</span>`;
  fillSelect('#f-type', M().types, '種別: 全て', v=>v.label);
  fillSelect('#f-priority', M().priorities, '優先度: 全て', v=>v.label);
  fillSelect('#f-status', M().statuses, '状態: 全て');
  fillSelect('#f-cat', M().categories, '分類: 全て');
  fillSelect('#f-channel', M().channels, '経路: 全て');
  $('#rep-date').value=new Date().toISOString().slice(0,10);
  bindApp(); switchView('dashboard');
  api('employees').then(j=>{ State.employees=j.employees||[]; }).catch(()=>{});
  api('assignees').then(j=>{ State.assignees=j.assignees||[]; }).catch(()=>{});
  setTimeout(()=>startTutorial(false), 700);
}
function fillSelect(sel,map,allLabel,fn){ const el=$(sel); if(!el) return;
  el.innerHTML=`<option value="">${allLabel}</option>`+Object.entries(map).map(([k,v])=>`<option value="${k}">${esc(fn?fn(v):v)}</option>`).join(''); }

function deptLeaf(d){ if(!d) return ''; const p=d.split('/'); return p[p.length-1]; }
function attachEmpAutocomplete(input, srcFn){
  srcFn = srcFn || (()=>State.employees);
  const wrap=document.createElement('div'); wrap.className='ac-pop'; wrap.hidden=true;
  input.parentNode.appendChild(wrap); input.setAttribute('autocomplete','off');
  let active=-1, items=[];
  const close=()=>{ wrap.hidden=true; active=-1; };
  const pick=e=>{ input.value = e.d ? `${e.n}（${deptLeaf(e.d)}）` : e.n; close(); input.focus(); };
  const render=q=>{
    const s=q.trim().toLowerCase().replace(/\s+/g,''); const all=srcFn()||[];
    items = !s ? all.slice(0,30) : all.filter(e=>((e.n+e.k+(e.d||'')+(e.t||'')).toLowerCase().replace(/\s+/g,'')).includes(s)).slice(0,30);
    if(!items.length){ wrap.hidden=true; return; }
    wrap.innerHTML=items.map((e,i)=>`<div class="ac-item${i===active?' on':''}" data-i="${i}"><span class="ac-name">${esc(e.n)}</span><span class="ac-dept">${esc(e.d?deptLeaf(e.d):(e.t||'—'))}</span></div>`).join('');
    wrap.hidden=false;
    $$('.ac-item',wrap).forEach(el=>{ el.onmousedown=ev=>{ ev.preventDefault(); pick(items[+el.dataset.i]); }; });
  };
  input.addEventListener('focus',()=>render(input.value));
  input.addEventListener('input',()=>{ active=-1; render(input.value); });
  input.addEventListener('blur',()=>setTimeout(close,150));
  input.addEventListener('keydown',e=>{ if(wrap.hidden) return;
    if(e.key==='ArrowDown'){ e.preventDefault(); active=Math.min(active+1,items.length-1); render(input.value); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); active=Math.max(active-1,0); render(input.value); }
    else if(e.key==='Enter'){ if(active>=0){ e.preventDefault(); pick(items[active]); } }
    else if(e.key==='Escape'){ close(); } });
}

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
  $('#btn-rep-print').onclick=async()=>{ await runReport(); setTimeout(()=>window.print(),300); };
}
function switchView(v){
  State.view=v; $$('.nav-tab').forEach(t=>t.classList.toggle('active',t.dataset.view===v));
  $$('.view').forEach(s=>s.hidden=(s.id!=='view-'+v));
  if(v==='dashboard') loadDashboard(); if(v==='incidents') loadIncidents();
}

/* ============================================================ DASHBOARD */
async function loadDashboard(){
  const s=await api('stats'); renderStatStrip(s); renderDashCards(s);
  const list=(await api('list',{scope:'open'})).incidents;
  $('#dash-open').innerHTML=incTable(list); bindRows('#dash-open');
}
function renderStatStrip(s){
  const tcol={incident:'var(--cyan)',request:'var(--green)',problem:'var(--mag)'};
  const pcol={P1:'var(--sev1)',P2:'var(--sev2)',P3:'var(--sev3)',P4:'var(--green)',P5:'var(--sev4)'};
  const tbar=Object.entries(s.by_type).map(([k,v])=>`<span class="bar-item"><i class="dot" style="background:${tcol[k]||'#888'}"></i>${M().types[k].short} <b>${v}</b></span>`).join('');
  const pbar=Object.entries(s.by_priority).map(([k,v])=>`<span class="bar-item"><i class="dot" style="background:${pcol[k]}"></i>${k} <b>${v}</b></span>`).join('');
  $('#statstrip').innerHTML=`
    <div class="stat"><span class="k">TOTAL</span><span class="v cyan">${s.total}</span></div>
    <div class="stat"><span class="k">未解決 / OPEN</span><span class="v green">${s.open}</span></div>
    <div class="stat"><span class="k">要対応 P1-2</span><span class="v ${s.critical_open?'bad':'cyan'}">${s.critical_open}</span></div>
    <div class="stat"><span class="k">SLA超過</span><span class="v ${s.sla_risk?'bad':'green'}">${s.sla_risk}</span></div>
    <div class="stat mini"><span class="k">種別 / TYPE</span><div class="bars">${tbar}</div></div>
    <div class="stat mini"><span class="k">優先度 / PRIORITY</span><div class="bars">${pbar}</div></div>`;
}
function renderDashCards(s){
  const tcards=Object.entries(M().types).map(([k,v])=>`<div class="card type-card type-${k}"><div class="ttl">${v.icon} ${esc(v.label)}（累計）</div><div class="big">${s.by_type[k]||0}</div><div class="sub">${esc(v.desc)}</div></div>`).join('');
  const pmax=Math.max(1,...Object.values(s.by_priority));
  const pcol={P1:'var(--sev1)',P2:'var(--sev2)',P3:'var(--sev3)',P4:'var(--green)',P5:'var(--sev4)'};
  const prows=Object.entries(s.by_priority).map(([k,v])=>`<div class="mb-row"><span class="lbl">${esc(M().priorities[k].label)}</span><span class="mb-track"><span class="mb-fill" style="width:${v/pmax*100}%;background:${pcol[k]}"></span></span><span class="num">${v}</span></div>`).join('');
  const cmax=Math.max(1,...Object.values(s.by_category));
  const crows=Object.entries(s.by_category).map(([k,v])=>`<div class="mb-row"><span class="lbl">${esc(M().categories[k])}</span><span class="mb-track"><span class="mb-fill" style="width:${v/cmax*100}%;background:var(--cyan)"></span></span><span class="num">${v}</span></div>`).join('');
  $('#dash-cards').innerHTML=`${tcards}
    <div class="card" style="grid-column:span 2"><div class="ttl">▣ 優先度内訳（累計）</div><div class="minibars">${prows}</div></div>
    <div class="card" style="grid-column:span 2"><div class="ttl">▤ 分類別（累計）</div><div class="minibars">${crows}</div></div>`;
}

/* ============================================================ LIST */
function incTable(list){
  if(!list.length) return `<div class="empty">▢ 該当チケットなし — ALL CLEAR</div>`;
  const rows=list.map(i=>`<tr data-id="${i.id}"><td class="code">${esc(i.code)}</td><td>${typeChip(i.type)}</td><td>${prioBadge(i.priority)}</td><td>${statusChip(i.status)}</td>
      <td><div class="t-title">${esc(i.title)}</div><div class="t-meta">${esc(M().categories[i.category]||i.category)}${i.affected?' · '+esc(i.affected):''} ${slaTag(i)}</div></td>
      <td class="t-meta">${esc(i.assignee||'未割当')}</td><td class="t-meta" title="${esc(fmt(i.updated_at))}">${ago(i.updated_at)}</td></tr>`).join('');
  return `<table class="inc"><thead><tr><th>CODE</th><th>種別</th><th>優先</th><th>状態</th><th>件名 / 分類</th><th>担当</th><th>更新</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function bindRows(scope){ $$(`${scope} tr[data-id]`).forEach(tr=>tr.onclick=()=>openIncident(+tr.dataset.id)); }
async function loadIncidents(){
  const p={ q:$('#f-q').value.trim(), scope:$('#f-scope').value, type:$('#f-type').value,
    priority:$('#f-priority').value, status:$('#f-status').value, category:$('#f-cat').value, channel:$('#f-channel').value };
  const j=await api('list',p); State.incidents=j.incidents; $('#inc-list').innerHTML=incTable(j.incidents); bindRows('#inc-list');
}

/* ============================================================ DRAWER */
function openDrawer(html){ $('#modal-back').hidden=false; const d=$('#drawer'); d.hidden=false; d.innerHTML=html;
  $('#modal-back').onclick=closeDrawer; const x=$('#drawer .x'); if(x) x.onclick=closeDrawer; }
function closeDrawer(){ $('#drawer').hidden=true; $('#modal-back').hidden=true; $('#drawer').innerHTML=''; }
function opts(map, sel, fn){ return Object.entries(map).map(([k,v])=>`<option value="${k}" ${k===sel?'selected':''}>${esc(fn?fn(v):v)}</option>`).join(''); }

async function openIncident(id){
  const j=await api('get',{id}); const i=j.incident, ev=j.events, m=M();
  const tl=ev.map(e=>`<div class="tl-item ${esc(e.kind)}"><div class="tl-meta"><b>${esc(e.author)}</b> · ${esc(fmt(e.created_at))} · ${esc(e.kind)}</div><div class="tl-body">${esc(e.body)||'<span style="color:var(--dim)">—</span>'}</div></div>`).join('');
  const writer=isWriter(); const isProblem=i.type==='problem';
  const probView=(i.workaround||i.root_cause||i.known_error||isProblem)?`<div class="sec-h">▶ 問題管理 / PROBLEM</div>
    <div class="kv"><span class="k">既知のエラー</span><span class="v">${i.known_error?'✔ 登録済':'—'}</span>
      <span class="k">ワークアラウンド</span><span class="v">${esc(i.workaround||'—')}</span>
      <span class="k">根本原因</span><span class="v">${esc(i.root_cause||'—')}</span></div>`:'';
  const editPanel=writer?`
    <div class="sec-h">▶ 更新 / UPDATE</div>
    <div class="form-2"><div class="form-row"><label>影響度</label><select class="inp" id="e-impact">${opts(m.impact,i.impact)}</select></div>
      <div class="form-row"><label>緊急度</label><select class="inp" id="e-urgency">${opts(m.urgency,i.urgency)}</select></div></div>
    <div class="prio-preview">→ 優先度 <span id="e-prio">${prioBadge(i.priority)}</span> <span class="t-meta">（影響度×緊急度で自動決定）</span></div>
    <div class="form-2"><div class="form-row"><label>ステータス</label><select class="inp" id="e-status">${opts(m.statuses,i.status)}</select></div>
      <div class="form-row ac-host"><label>担当</label><input class="inp" id="e-assignee" value="${esc(i.assignee||'')}" placeholder="氏名・部署で検索"></div></div>
    <div class="form-2"><div class="form-row"><label>一次解決(FCR)</label><label class="chk"><input type="checkbox" id="e-fcr" ${i.fcr?'checked':''}> 初回対応で解決した</label></div>
      <div class="form-row"><label>満足度(CSAT)</label><select class="inp" id="e-csat"><option value="">未評価</option>${[5,4,3,2,1].map(n=>`<option value="${n}" ${String(i.csat)===String(n)?'selected':''}>${'★'.repeat(n)}（${n}）</option>`).join('')}</select></div></div>
    ${isProblem?`<div class="form-row"><label>ワークアラウンド（暫定対応）</label><textarea class="inp" id="e-wa">${esc(i.workaround||'')}</textarea></div>
      <div class="form-row"><label>根本原因</label><textarea class="inp" id="e-rc">${esc(i.root_cause||'')}</textarea></div>
      <div class="form-row"><label class="chk"><input type="checkbox" id="e-ke" ${i.known_error?'checked':''}> 既知のエラーとして登録</label></div>`:''}
    <div class="form-row"><label>関連チケット（コード）</label><input class="inp" id="e-linked" value="${esc(i.linked||'')}" placeholder="例: PRB-2026-0001"></div>
    <div class="form-row"><label>対応メモ / コメント（タイムラインに記録）</label><textarea class="inp" id="e-note" placeholder="調査・対応・連絡事項…"></textarea></div>
  `:`<div class="sec-h">▶ 閲覧モード（監査）</div><div class="t-meta">監査ロールのため編集はできません。</div>`;
  openDrawer(`
   <div class="dr-head"><span class="logo-mark sm">◤◢</span>
     <div><div class="t-meta">${esc(i.code)} · ${esc(m.categories[i.category]||i.category)}</div>
       <div class="dr-title">${esc(i.title)}</div><div>${typeChip(i.type)} ${prioBadge(i.priority)} ${statusChip(i.status)} ${slaTag(i)}</div></div>
     <button class="x">✕</button></div>
   <div class="dr-body">
     <div class="kv">
       <span class="k">影響度 × 緊急度</span><span class="v">${esc(m.impact[i.impact])} × ${esc(m.urgency[i.urgency])} → <b>${esc(m.priorities[i.priority].label)}</b></span>
       <span class="k">問い合わせ経路</span><span class="v">${esc(m.channels[i.channel]||'—')}</span>
       <span class="k">影響範囲</span><span class="v">${esc(i.affected||'—')}</span>
       <span class="k">申告/要求者</span><span class="v">${esc(i.reporter||'—')}</span>
       <span class="k">担当</span><span class="v">${esc(i.assignee||'未割当')}</span>
       <span class="k">一次解決(FCR)</span><span class="v">${i.fcr?'✔':'—'}　満足度: ${i.csat?('★'.repeat(i.csat)):'—'}</span>
       <span class="k">SLA目標</span><span class="v">${esc(fmt(i.sla_target))} ${i.sla_breached?'<span class="sla-tag bad">超過</span>':''}</span>
       <span class="k">起票者 / 日時</span><span class="v">${esc(i.created_by)} ・ ${esc(fmt(i.created_at))}</span>
       <span class="k">最終更新</span><span class="v">${esc(fmt(i.updated_at))}</span>
       <span class="k">解決日時</span><span class="v">${esc(i.resolved_at?fmt(i.resolved_at):'—')}</span>
       <span class="k">関連チケット</span><span class="v">${esc(i.linked||'—')}</span>
     </div>
     <div class="sec-h">▶ 詳細 / DESCRIPTION</div>
     <div class="tl-body">${esc(i.description)||'<span style="color:var(--dim)">—</span>'}</div>
     ${probView}${editPanel}
     <div class="sec-h">▶ タイムライン / TIMELINE (${ev.length})</div>
     <div class="timeline">${tl||'<div class="t-meta">記録なし</div>'}</div>
   </div>
   ${writer?`<div class="dr-foot"><button class="btn-ok" id="e-save">✓ 更新を記録</button><button class="btn-ghost" id="e-comment">＋ コメントのみ</button><button class="btn-del" id="e-delete">🗑 削除</button></div>`:''}
  `);
  if(writer){
    const upd=()=>{ $('#e-prio').innerHTML=prioBadge(calcPriority($('#e-impact').value,$('#e-urgency').value)); };
    $('#e-impact').onchange=upd; $('#e-urgency').onchange=upd; attachEmpAutocomplete($('#e-assignee'), ()=>State.assignees);
    $('#e-save').onclick=async()=>{
      const p={ id, impact:$('#e-impact').value, urgency:$('#e-urgency').value, status:$('#e-status').value,
        assignee:$('#e-assignee').value.trim(), fcr:$('#e-fcr').checked?1:0, csat:$('#e-csat').value, linked:$('#e-linked').value.trim(), note:$('#e-note').value.trim() };
      if(isProblem){ p.workaround=$('#e-wa').value.trim(); p.root_cause=$('#e-rc').value.trim(); p.known_error=$('#e-ke').checked?1:0; }
      try{ await api('update',p); toast(i.code+' を更新','ok'); closeDrawer(); refresh(); }catch(err){ toast(err.message,'bad'); } };
    $('#e-comment').onclick=async()=>{ const b=$('#e-note').value.trim(); if(!b) return toast('コメントを入力してください','bad');
      try{ await api('comment',{id, body:b}); toast('コメントを追加','ok'); closeDrawer(); refresh(); }catch(err){ toast(err.message,'bad'); } };
    $('#e-delete').onclick=()=>confirmDelete(i);
  }
}
function confirmDelete(i){
  openDialog(`<h3 style="color:var(--bad)">🗑 チケット削除</h3>
    <div class="t-meta" style="margin-bottom:12px">${esc(i.code)} «${esc(i.title)}» を削除します。<br><b style="color:var(--bad)">タイムライン記録ごと完全に削除され、元に戻せません。</b></div>
    <div class="form-row"><label>削除理由（任意）</label><input class="inp" id="del-reason" placeholder="例: 重複起票のため"></div>
    <div class="dlg-actions"><button class="btn-ghost" id="del-cancel">キャンセル</button><button class="btn-del" id="del-ok">完全に削除する</button></div>`);
  $('#del-cancel').onclick=closeDialog;
  $('#del-ok').onclick=async()=>{ try{ await api('delete',{id:i.id, reason:$('#del-reason').value.trim()});
    toast('削除しました — '+i.code,'ok'); closeDialog(); closeDrawer(); refresh(); }catch(err){ toast(err.message,'bad'); } };
}

/* ============================================================ NEW */
function openNew(){
  const m=M();
  openDrawer(`
   <div class="dr-head"><span class="logo-mark sm">◤◢</span><div><div class="t-meta">NEW TICKET</div><div class="dr-title">新規起票</div></div><button class="x">✕</button></div>
   <div class="dr-body">
     <div class="form-row"><label>種別 / TYPE</label><select class="inp" id="n-type">${opts(m.types,'incident',v=>v.icon+' '+v.label)}</select><div class="t-meta" id="n-typedesc"></div></div>
     <div class="form-row"><label>件名 / TITLE *</label><input class="inp" id="n-title" placeholder="例: 本社7F無線LANが断続的に切断"></div>
     <div class="form-2"><div class="form-row"><label>影響度 / IMPACT</label><select class="inp" id="n-impact">${opts(m.impact,'M')}</select></div>
       <div class="form-row"><label>緊急度 / URGENCY</label><select class="inp" id="n-urgency">${opts(m.urgency,'M')}</select></div></div>
     <div class="prio-preview">→ 優先度 <span id="n-prio">${prioBadge('P3')}</span> <span class="t-meta">（影響度×緊急度で自動決定）</span></div>
     <div class="form-2"><div class="form-row"><label>分類</label><select class="inp" id="n-cat">${opts(m.categories,'')}</select></div>
       <div class="form-row"><label>問い合わせ経路</label><select class="inp" id="n-channel"><option value="">—</option>${opts(m.channels,'phone')}</select></div></div>
     <div class="form-2"><div class="form-row"><label>初期ステータス</label><select class="inp" id="n-status">${opts(m.statuses,'NEW')}</select></div>
       <div class="form-row ac-host"><label>担当</label><input class="inp" id="n-assignee" placeholder="氏名・部署で検索（任意）"></div></div>
     <div class="form-2"><div class="form-row"><label>影響範囲 / システム</label><input class="inp" id="n-affected" placeholder="例: 本社7F / メールサーバー"></div>
       <div class="form-row ac-host"><label id="n-replbl">申告者 / 要求者</label><input class="inp" id="n-reporter" placeholder="氏名・部署で検索（自由入力も可）"></div></div>
     <div id="n-prob" class="hide">
       <div class="form-row"><label>ワークアラウンド（暫定対応）</label><textarea class="inp" id="n-wa" placeholder="暫定的な回避策…"></textarea></div>
       <div class="form-row"><label>根本原因</label><textarea class="inp" id="n-rc" placeholder="判明していれば…"></textarea></div>
       <div class="form-row"><label class="chk"><input type="checkbox" id="n-ke"> 既知のエラーとして登録</label></div></div>
     <div class="form-row"><label>関連チケット（コード・任意）</label><input class="inp" id="n-linked" placeholder="例: INC-2026-0003"></div>
     <div class="form-row"><label>詳細 / DESCRIPTION</label><textarea class="inp" id="n-desc" placeholder="事象・発生日時・再現条件・初動…"></textarea></div>
     <label class="chk"><input type="checkbox" id="n-fcr"> 初回対応で解決済み（FCR）</label>
   </div>
   <div class="dr-foot"><button class="btn-ok" id="n-save">▶ 起票する</button></div>`);
  const refreshType=()=>{ const t=$('#n-type').value; $('#n-typedesc').textContent=m.types[t].desc;
    $('#n-prob').classList.toggle('hide', t!=='problem'); $('#n-replbl').textContent= t==='request'?'要求者':(t==='problem'?'報告元':'申告者'); };
  const upd=()=>{ $('#n-prio').innerHTML=prioBadge(calcPriority($('#n-impact').value,$('#n-urgency').value)); };
  $('#n-type').onchange=refreshType; $('#n-impact').onchange=upd; $('#n-urgency').onchange=upd;
  refreshType(); attachEmpAutocomplete($('#n-reporter')); attachEmpAutocomplete($('#n-assignee'), ()=>State.assignees); $('#n-title').focus();
  $('#n-save').onclick=async()=>{
    const title=$('#n-title').value.trim(); if(!title) return toast('件名は必須です','bad');
    const p={ type:$('#n-type').value, title, impact:$('#n-impact').value, urgency:$('#n-urgency').value,
      category:$('#n-cat').value, channel:$('#n-channel').value, status:$('#n-status').value,
      assignee:$('#n-assignee').value.trim(), affected:$('#n-affected').value.trim(), reporter:$('#n-reporter').value.trim(),
      linked:$('#n-linked').value.trim(), description:$('#n-desc').value.trim(), fcr:$('#n-fcr').checked?1:0 };
    if($('#n-type').value==='problem'){ p.workaround=$('#n-wa').value.trim(); p.root_cause=$('#n-rc').value.trim(); p.known_error=$('#n-ke').checked?1:0; }
    try{ const j=await api('create',p); toast('起票完了 — '+j.code,'ok'); closeDrawer(); refresh(); }catch(err){ toast(err.message,'bad'); }
  };
}
function refresh(){ if(State.view==='dashboard') loadDashboard(); else if(State.view==='incidents') loadIncidents(); }

/* ============================================================ REPORT */
async function runReport(){
  try{ const j=await api('report',{period:$('#rep-period').value, date:$('#rep-date').value}); $('#rep-out').innerHTML=renderReport(j.report); }
  catch(err){ toast(err.message,'bad'); }
}
function renderReport(r){
  const m=M(), s=r.summary;
  const tbl=list=> list.length?`<table class="rep"><thead><tr><th>CODE</th><th>種別</th><th>優先</th><th>件名</th><th>状態</th><th>担当</th></tr></thead><tbody>`+
    list.map(i=>`<tr><td class="code">${esc(i.code)}</td><td>${typeChip(i.type)}</td><td>${prioBadge(i.priority)}</td><td>${esc(i.title)}</td><td>${statusChip(i.status)}</td><td class="t-meta">${esc(i.assignee||'—')}</td></tr>`).join('')+`</tbody></table>`:`<div class="t-meta" style="padding:10px">該当なし</div>`;
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
    <div class="rep-2col"><div class="rep-sec"><h4>■ 種別別（起票）</h4><table class="rep"><tbody>${kv(r.by_type,m.types,v=>v.icon+' '+v.label)}</tbody></table></div>
      <div class="rep-sec"><h4>■ 優先度別（起票）</h4><table class="rep"><tbody>${kv(r.by_priority,m.priorities,v=>v.label)}</tbody></table></div></div>
    <div class="rep-2col"><div class="rep-sec"><h4>■ 分類別（起票）</h4><table class="rep"><tbody>${kv(r.by_category,m.categories)}</tbody></table></div>
      <div class="rep-sec"><h4>■ 問い合わせ経路別（起票）</h4><table class="rep"><tbody>${kv(r.by_channel,m.channels)}</tbody></table></div></div>
    <div class="rep-sec"><h4>■ 期間内に起票（${r.opened.length}）</h4>${tbl(r.opened)}</div>
    <div class="rep-sec"><h4>■ 期間内に解決（${r.resolved.length}）</h4>${tbl(r.resolved)}</div>
    <div class="rep-sec"><h4>■ 期末時点で未解決・継続対応（${r.carry.length}）</h4>${tbl(r.carry)}</div>
  </div>`;
}

/* ============================================================ DIALOG / MODEL / PASSWORD */
function openDialog(html){ const d=$('#dialog'); d.hidden=false; d.innerHTML=`<div class="dlg-box">${html}</div>`; }
function closeDialog(){ $('#dialog').hidden=true; $('#dialog').innerHTML=''; }
function openModel(){
  const md=M().model;
  const rows=md.practices.map(p=>`<div class="model-row"><div class="model-name">${esc(p.name)}<span class="model-std">${esc(p.std)}</span></div><div class="model-desc">${esc(p.desc)}</div></div>`).join('');
  openDialog(`<h3>🛡 準拠モデル — ${esc(M().app.standards)}</h3>
    <div class="t-meta" style="margin-bottom:12px;line-height:1.7">${esc(md.intro)}</div>
    <div class="model-list">${rows}</div>
    <div class="t-meta" style="margin-top:12px">優先度は <b style="color:var(--cyan)">影響度 × 緊急度</b> のマトリクスで P1〜P5 を自動決定します。</div>
    <div class="dlg-actions"><button class="btn-ok" id="md-ok">閉じる</button></div>`);
  $('#md-ok').onclick=closeDialog;
}
function openChangePw(){
  openDialog(`<h3>⚙ パスワード変更</h3>
    <div class="form-row"><label>新しいパスワード（6文字以上）</label><input class="inp" type="password" id="pw-new"></div>
    <div class="dlg-actions"><button class="btn-ghost" id="pw-cancel">キャンセル</button><button class="btn-ok" id="pw-save">変更</button></div>`);
  $('#pw-cancel').onclick=closeDialog;
  $('#pw-save').onclick=async()=>{ try{ await api('changepw',{new:$('#pw-new').value}); toast('パスワードを変更しました','ok'); closeDialog(); }catch(err){ toast(err.message,'bad'); } };
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
       text:'トラブルが来たら <span class="k">＋ 新規起票</span> をポチッ。<br>扱うのは3種類 ── <span class="k">インシデント</span>(障害)・<span class="k">サービス要求</span>(定型の依頼)・<span class="k">問題</span>(根本原因)。<br>優先度は <span class="k">影響度×緊急度</span> で勝手に決まるから安心して👍'},
      {view:'incidents', target:'#f-type', mission:'SCAN', title:'④ 探すのもカンタン',
       text:'種別・優先度・状態・分類・<span class="k">問い合わせ経路</span>で、過去のチケットをサクッと絞り込めるよ🔍'},
      {target:null, mission:'COMMAND', title:'⑤ 対応はクリックから',
       text:'一覧の行をクリックすると詳細が開くよ。<br>状態の更新・担当変更・<span class="k">一次解決(FCR)や満足度(CSAT)</span>を記録すると、全部タイムラインに残るよ📣'},
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
  buildDOM(){ if($('#tour-mask')) return; const m=document.createElement('div'); m.className='tour-mask'; m.id='tour-mask';
    m.innerHTML=`<div class="tour-hole" id="tour-hole"></div><div class="tour-card" id="tour-card"></div><button class="tour-skip" id="tour-skip">スキップ ✕</button>`;
    document.body.appendChild(m); $('#tour-skip').onclick=()=>this.finish(true);
    this._rz=()=>tourPosition(this.steps[this.i]); addEventListener('resize',this._rz); },
  async show(){ const step=this.steps[this.i]; if(step.view && State.view!==step.view){ switchView(step.view); await sleep(420); }
    tourRenderCard(step,this.i,this.steps.length,this);
    requestAnimationFrame(()=>{ tourPosition(step); const h=$('#tour-hole'); if(h) h.classList.toggle('pulse',!!step.target); }); },
  async next(){ if(this.i>=this.steps.length-1){ this.finish(true); return; } this.i++; await this.show(); },
  async back(){ if(this.i>0){ this.i--; await this.show(); } },
  finish(save){ if(save&&this.key) try{ localStorage.setItem(this.key,'1'); }catch(e){} if(this._rz) removeEventListener('resize',this._rz);
    const m=$('#tour-mask'); if(m) m.remove(); if(State.view!=='dashboard') switchView('dashboard'); } };
function tourRenderCard(step,idx,total,ctrl){
  const card=$('#tour-card'); if(!card) return;
  const pips=Array.from({length:total},(_,k)=>`<span class="tour-pip ${k<=idx?'on':''}"></span>`).join(''); const last=idx===total-1;
  card.innerHTML=`<div class="tour-xp"><i style="width:${(idx+1)/total*100}%"></i></div>
    <div class="tour-navi"><div class="tour-ava">🤖</div><div><div class="tour-who">NAVI <span style="color:var(--dim);font-weight:400">／ 案内AI</span></div>
      <div class="tour-mission">MISSION ${idx+1} / ${total}${step.mission?' · '+step.mission:''}</div></div></div>
    <div class="tour-body"><div class="tour-title">${step.title}</div><div class="tour-text">${step.text} <span class="tour-caret">▌</span></div></div>
    <div class="tour-foot"><div class="tour-prog">${pips}</div>${idx>0?`<button class="tour-btn" id="tour-back">◀ 戻る</button>`:''}<button class="tour-btn primary" id="tour-next">${last?'✔ 完了':'次へ ▶'}</button></div>`;
  const b=$('#tour-back'); if(b) b.onclick=()=>ctrl.back(); $('#tour-next').onclick=()=>ctrl.next();
}
function tourPosition(step){
  const hole=$('#tour-hole'), card=$('#tour-card'); if(!hole||!card) return;
  const el=step&&step.target?document.querySelector(step.target):null;
  if(!el){ hole.style.display='none'; card.classList.add('center'); card.style.left=''; card.style.top=''; return; }
  card.classList.remove('center'); const r=el.getBoundingClientRect(), pad=8;
  hole.style.display='block'; hole.style.left=(r.left-pad)+'px'; hole.style.top=(r.top-pad)+'px'; hole.style.width=(r.width+pad*2)+'px'; hole.style.height=(r.height+pad*2)+'px';
  const cw=card.offsetWidth, chh=card.offsetHeight; let top; const below=r.bottom+14, above=r.top-chh-14;
  if(below+chh<=innerHeight-8) top=below; else if(above>=8) top=above; else top=Math.max(8,(innerHeight-chh)/2);
  let left=r.left+r.width/2-cw/2; left=Math.max(10,Math.min(left,innerWidth-cw-10)); card.style.left=left+'px'; card.style.top=top+'px';
}
function startTutorial(force){ const key='inc_tour_'+(State.user?State.user.username:'x')+'_v2';
  if(!force){ try{ if(localStorage.getItem(key)) return; }catch(e){} } Tour.start(tourSteps(), key); }

/* ============================================================ INIT */
(async function init(){
  matrix(); clock(); initLogin(); bootSeq();
  if(!SUPA_OK){ $('#li-msg').className='login-msg bad'; $('#li-msg').textContent='> Supabase未設定（config.js に URL / anon key を設定）'; }
  try{ State.meta=(await api('meta')); const me=await api('me'); if(me.user){ State.user=me.user; enterApp(); } }catch(e){}
  document.body.classList.remove('booting');
  addEventListener('keydown',e=>{ if(e.key==='Escape'){ if(!$('#drawer').hidden) closeDrawer(); if(!$('#dialog').hidden) closeDialog(); if($('#tour-mask')) Tour.finish(true); } });
})();
