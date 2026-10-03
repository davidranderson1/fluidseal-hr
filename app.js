const SUPA_URL = "https://hnmbjqhxvxakhdzgetxw.supabase.co";
const SUPA_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhubWJqcWh4dnhha2hkemdldHh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjUzNjQsImV4cCI6MjA5NTkwMTM2NH0.GSWI113EQ6ZaA1n_lxECqEmc952q14-tZ7dacZNbZf0";
const sb = supabase.createClient(SUPA_URL, SUPA_ANON);
const $=(s)=>document.querySelector(s);
let DATA=null, curDept="All", revOnly=false;

// ---------- auth ----------
async function boot(){
  const { data:{ session } } = await sb.auth.getSession();
  if(!session){ show('login'); return; }
  const email = session.user.email;
  const { data: who, error } = await sb.rpc('hr_whoami');
  const isViewer = who && who[0] && who[0].is_viewer;
  if(error || !isViewer){
    $('#denymsg').innerHTML = `Signed in as <b>${email}</b>, but this account isn't on the HR access list. Ask David to add you.`;
    show('deny'); renderUser(email); return;
  }
  renderUser(email);
  await loadAndRender();
}
function show(v){
  $('#loginview').classList.toggle('hidden', v!=='login');
  $('#denyview').classList.toggle('hidden', v!=='deny');
  $('#appview').classList.toggle('hidden', v!=='app');
  $('#foot').classList.toggle('hidden', v!=='app');
  $('#loading').classList.toggle('hidden', v!=='loading');
}
function renderUser(email){
  $('#userbox').innerHTML = `<span class="who">${email}</span> &nbsp; <button class="btn ghost" id="signout">Sign out</button>`;
  $('#signout').onclick = signout;
}
async function signout(){ await sb.auth.signOut(); location.reload(); }
$('#signout2').onclick = signout;
$('#sendlink').onclick = async ()=>{
  const email = $('#email').value.trim();
  const msg = $('#loginmsg');
  if(!/^[^@]+@[^@]+\.[^@]+$/.test(email)){ msg.className='msg err'; msg.textContent='Enter a valid email.'; return; }
  msg.className='msg'; msg.textContent='Sending…';
  const { error } = await sb.auth.signInWithOtp({ email, options:{ emailRedirectTo: location.href.split('#')[0] } });
  if(error){ msg.className='msg err'; msg.textContent=error.message; }
  else { msg.className='msg ok'; msg.textContent='Check your email for the sign-in link, then come back to this page.'; }
};
sb.auth.onAuthStateChange((ev)=>{ if(ev==='SIGNED_IN'){ history.replaceState(null,'',location.pathname); boot(); } });

// ---------- data ----------
const DEVICE_TITLE = 'Device - Machine';
function isHuman(e){ return e.title!==DEVICE_TITLE && (e.first_name||'')!=='Sales'; }
// date-only values ("2025-10-06") are calendar dates: parse them as local dates, never as UTC midnight
// (UTC parsing showed Oct 5 for an Oct 6 start in Mountain time)
function parseD(s){ if(!s) return null; const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s)); return m? new Date(+m[1],+m[2]-1,+m[3]) : new Date(s); }
function isoToday(){ const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; }
function esc(s){ return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
let REV_IDX={};
function reviewDue(r){ if(!r||!r.review_date) return false; const days=(parseD(r.review_date)-parseD(isoToday()))/86400000; return days<=30 && days>=-60; }
function tenure(startISO){
  if(!startISO) return '—';
  const d=parseD(startISO), n=new Date();
  let m=(n.getFullYear()-d.getFullYear())*12+(n.getMonth()-d.getMonth());
  if(n.getDate()<d.getDate()) m--;
  const y=Math.floor(m/12), mm=m%12; return (y?`${y}y `:'')+`${mm}m`;
}
async function loadAndRender(){
  show('loading');
  const [emp, periods, teamMembers, counts, revIdx, syncSt] = await Promise.all([
    sb.rpc('hr_employee_list'), sb.rpc('hr_register_periods'), sb.rpc('hr_team_member_list'), sb.rpc('hr_feedback_counts'), sb.rpc('hr_review_index'), sb.rpc('hr_sync_status')
  ]);
  REV_IDX={}; (revIdx.data||[]).forEach(r=>{ if(r.employee_id) REV_IDX[r.employee_id]=r; });
  const fbCounts={}; (counts.data||[]).forEach(r=>{ if(r.employee_id) fbCounts[r.employee_id]=Number(r.n); });
  const employees = emp.data||[];
  const period = (periods.data||[])[0];
  let regRows=[];
  if(period){ const rp = await sb.rpc('hr_register_people',{p_period:period.period}); regRows = rp.data||[]; }
  const regByEmp={}; regRows.forEach(r=>{ if(r.employee_id) regByEmp[r.employee_id]=r; });

  const humans = employees.filter(isHuman);
  const active = humans.filter(e=>e.status==='Active');
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-120);
  const departed = humans.filter(e=>e.status!=='Active'
    && ['Resigned','Terminated','Retired'].includes(e.status_reason||'')
    && e.employee_end_date && new Date(e.employee_end_date)>=cutoff);

  const norm = (e)=>{
    const r = regByEmp[e.employee_id];
    return {
      key: e.last_name.replace(/\s+/g,''),
      id: e.employee_id,
      first: e.first_name, last: e.last_name, title: e.title||'—',
      dept: e.department || e.department_text || 'Unassigned', departments: Array.isArray(e.departments)?e.departments:[],
      start: e.employee_start_date, end: e.employee_end_date,
      tenure: tenure(e.employee_start_date), p21: e.p21_user_role, email: e.work_email,
      status: e.status, reason: e.status_reason,
      review: reviewDue(REV_IDX[e.employee_id]) && e.status==='Active',
      reviewDate: (REV_IDX[e.employee_id]||{}).review_date||null, reviewKind: (REV_IDX[e.employee_id]||{}).review_kind||null,
      hasProfile: !!REV_IDX[e.employee_id],
      reg: r ? { type:r.role_type, total:Number(r.total), avg:Number(r.avg_active), active:r.active_days, worked:r.worked_days, series:r.series, note:r.note } : null,
    };
  };
  DATA = {
    active: active.map(norm), departed: departed.map(norm),
    period, teamMembers: teamMembers.data||[], fbCounts,
    syncedAt: employees.reduce((mx,e)=> e.synced_at>mx?e.synced_at:mx, ''),
    syncStatus: (syncSt&&!syncSt.error&&syncSt.data)||null,
  };
  show('app'); renderRoster();
}

// ---------- render ----------
function spark(series,color){
  const vals=(series||[]).map(v=>v==null?0:v); const max=Math.max(1,...vals); const w=88,h=26,n=(series||[]).length,bw=w/(n||1);
  let bars=''; (series||[]).forEach((v,i)=>{const val=v==null?0:v;const bh=val/max*(h-3);const gap=v==null;
    bars+=`<rect x="${(i*bw).toFixed(1)}" y="${(h-bh).toFixed(1)}" width="${(bw-1.2).toFixed(1)}" height="${Math.max(gap?0:1.2,bh).toFixed(1)}" rx="0.8" fill="${gap?'var(--line)':color}"/>`;});
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bars}</svg>`;
}
function fmtReg(r){
  if(!r) return `<div class="nostat">Not in the Ship Register — role isn't order- or pick-tracked.</div>`;
  if(!r.total) return `<div class="nostat">In register but 0 ${r.type==='pick'?'picks':'orders'} this period — off the ${r.type==='pick'?'pick':'order'} line.</div>`;
  const label=r.type==='pick'?'picks':'orders', col=r.type==='pick'?'var(--blue)':'var(--good)';
  return `<div class="regbar"><div><div class="regbig">${r.total}<small> ${label}</small></div><div class="regsub">${r.avg}/day · ${r.active}/${r.worked} days</div></div>${spark(r.series,col)}</div>`;
}
function fmtDate(d){ const x=parseD(d); return x? x.toLocaleDateString('en-CA',{year:'numeric',month:'short',day:'numeric'}) : '—'; }
function fmtShort(d){ const x=parseD(d); return x? x.toLocaleDateString('en-CA',{month:'short',day:'numeric'}) : ''; }
function fmtTs(ts){ if(!ts) return '—'; const d=new Date(ts); return isNaN(d)? '—' : d.toLocaleString('en-CA',{timeZone:'America/Edmonton',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})+' MT'; }
function otherDepts(e){ return (e.departments||[]).filter(x=>x&&x!==e.dept); }
async function syncNow(){
  const b=$('#syncnow'); if(!b||b.disabled) return;
  b.disabled=true; b.textContent='⟳ Syncing… (about 10 seconds)';
  let res; try{ res=await sb.functions.invoke('hr-review-sync',{body:{}}); }catch(err){ res={error:err}; }
  const ok=res&&!res.error&&res.data&&res.data.ok;
  if(!ok){
    let msg=(res&&res.data&&res.data.error)||'';
    try{ if(!msg&&res.error&&res.error.context&&res.error.context.json){ const j=await res.error.context.json(); msg=j&&j.error; } }catch(_){}
    b.disabled=false; b.textContent='⟳ Sync now'; alertBar('Sync did not finish: '+(msg||'please try again in a minute.')); return;
  }
  await loadAndRender();
  alertBar(`Synced from Dynamics — ${res.data.profiles_full} review profiles and ${res.data.employees} employees refreshed.`, true);
}
function alertBar(msg, good){ const el=$('#syncbar'); if(!el) return; const d=document.createElement('div'); d.style.cssText=`flex-basis:100%;margin-top:6px;font-weight:600;color:${good?'var(--good)':'var(--bad)'}`; d.textContent=msg; el.appendChild(d); }
function card(e,gone){
  const badge = gone?`<span class="goneflag">${e.reason||'departed'}</span>`:(e.review?`<span class="duebadge">review ${fmtShort(e.reviewDate)}</span>`:'');
  const meta = gone? `${e.title} · left ${fmtDate(e.end)}` : `${e.title} · ${e.tenure} tenure`;
  const fbn=(DATA&&DATA.fbCounts&&DATA.fbCounts[e.id])||0;
  const fbbtn=`<button class="fbbtn" data-fb="${e.id}" data-nm="${e.first} ${e.last}">💬 Feedback${fbn?`<span class="cnt">${fbn}</span>`:''}</button>`;
  return `<div class="ecard ${gone?'gone':(e.review?'due':'')}" data-id="${e.id}">${badge}
    <div class="nm">${e.first} ${e.last}</div><div class="rl">${e.dept}${otherDepts(e).length?` <span style="opacity:.8">+ ${otherDepts(e).map(esc).join(', ')}</span>`:''}</div>
    <div class="meta">${meta}</div>${fmtReg(e.reg)}${fbbtn}</div>`;
}
function renderRoster(){
  const p=DATA.period||{};
  const st=DATA.syncStatus||{}, lf=st.last_full||null, lr=st.last_run||null;
  const lastSync=lf?`<b>${fmtTs(lf.finished_at)}</b> (${lf.kind==='button'?'Sync now'+(lf.requested_by?' · '+esc(lf.requested_by):''):lf.kind==='monthly'?'monthly run':lf.kind==='manual'?'run by Claude':esc(lf.kind)})`:'<b>not yet</b>';
  const lastErr=lr&&lr.status==='error'?` · <span style="color:var(--bad)">last sync failed ${fmtTs(lr.started_at)}</span>`:'';
  $('#syncbar').innerHTML=`<span class="syncdot"></span><span>Live from Dynamics · roster synced nightly (last: <b>${DATA.syncedAt?fmtTs(DATA.syncedAt):'—'}</b>) · review profiles synced ${lastSync}${lastErr} · <b>${DATA.active.length}</b> active${DATA.departed.length?` · ${DATA.departed.length} recently departed`:''}</span><span class="spacer"></span><button class="btn" id="syncnow" title="Re-read Dynamics now: review dates, Departments, attendance, error log, Very Awesomes, training, projects and campaigns for every review profile (about 10 seconds). Runs by itself on the 1st of every month.">⟳ Sync now</button> <button class="btn" id="refresh">↻ Refresh</button>`;
  $('#refresh').onclick=loadAndRender;
  $('#syncnow').onclick=syncNow;
  $('#kpis').innerHTML=[
    ['n',DATA.active.length,'Active employees'],
    ['n',(p.orders||0).toLocaleString(),'Orders shipped ('+(p.label||'')+')'],
    ['n',(p.items||0).toLocaleString(),'Items picked'],
    ['n',p.items_per_picker||'—','Items / picker / day'],
    ['n',p.cannot_locate_per_day||'—','Cannot-locate / day'],
    ['n',DATA.active.filter(e=>e.review).length,'Reviews due (next 30 days)']
  ].map(k=>`<div class="kpi"><div class="n">${k[1]}</div><div class="l">${k[2]}</div></div>`).join('');
  const nProf=DATA.active.filter(e=>e.hasProfile).length;
  $('#infoline').innerHTML=`Every active employee, grouped by department, live from Dynamics 365. Productivity from the ${p.label||''} Ship Register. Click anyone for their review profile (${nProf} of ${DATA.active.length} prepared — attendance, error log, recognitions, HR timeline and a draft assessment).`;

  const depts=[...new Set(DATA.active.map(e=>e.dept))].sort();
  $('#controls').innerHTML=['All',...depts].map(d=>`<button class="chip ${d===curDept?'active':''}" data-d="${d}">${d}${d==='All'?' ('+DATA.active.length+')':''}</button>`).join('')
    +`<button class="chip rev ${revOnly?'active':''}" id="revchip">★ Reviews due only</button>`;
  $('#controls').querySelectorAll('.chip[data-d]').forEach(c=>c.onclick=()=>{curDept=c.dataset.d;renderRoster();});
  $('#revchip').onclick=()=>{revOnly=!revOnly;renderRoster();};

  let list=DATA.active.slice();
  if(curDept!=='All') list=list.filter(e=>e.dept===curDept);
  if(revOnly) list=list.filter(e=>e.review);
  const byDept={}; list.forEach(e=>{(byDept[e.dept]=byDept[e.dept]||[]).push(e);});
  let html='';
  Object.keys(byDept).sort().forEach(d=>{
    const items=byDept[d].sort((a,b)=>{const ra=a.reg?a.reg.total:-1,rb=b.reg?b.reg.total:-1;return rb-ra||a.last.localeCompare(b.last);});
    html+=`<div class="deptgroup"><div class="deptname">${d} <span style="color:var(--muted);font-weight:600">${items.length}</span></div><div class="grid">`+items.map(e=>card(e,false)).join('')+`</div></div>`;
  });
  $('#roster').innerHTML=html||`<p class="empty">No employees match this filter.</p>`;
  $('#roster').querySelectorAll('.ecard').forEach(c=>c.onclick=()=>openDetail(c.dataset.id));
  const ds=$('#departsec');
  if(DATA.departed.length){
    ds.innerHTML=`<summary>Recently departed (${DATA.departed.length})</summary><div class="grid" style="margin-top:6px">`+DATA.departed.map(e=>card(e,true)).join('')+`</div>`;
    ds.querySelectorAll('.ecard').forEach(c=>c.onclick=()=>openDetail(c.dataset.id));
  } else ds.innerHTML='';
  document.querySelectorAll('.fbbtn').forEach(b=>{ b.onclick=(ev)=>{ ev.stopPropagation(); openFeedback(b.dataset.fb, b.dataset.nm); }; });
  window.scrollTo(0,0);
}
function metric(n,l,cls){return `<div class="metric"><div class="n ${cls||''}">${n}</div><div class="l">${l}</div></div>`;}
function timeline(items){return `<div class="timeline">`+items.map(it=>`<div class="tl-item"><div class="tl-dot ${it.kind}"></div><div class="tl-date">${it.date}</div><div class="tl-title">${it.title}${it.dept?`<span class="tl-dept">${it.dept}</span>`:''}</div><div class="tl-desc">${it.desc}</div></div>`).join('')+`</div>`;}
function training(list){const ic={done:'✓',prog:'◐',plan:'○'};if(!list||!list.length) return `<div class="empty">No training notepads or review forms recorded in Dynamics for this period.</div>`;return list.map(t=>`<div class="trainrow"><div class="ti ${t.s}">${ic[t.s]||'○'}</div><div class="tt"><b>${t.t}</b>${t.assess?'<span class="assessbadge">assessment done</span>':''}<span class="dt">${t.dt||''}</span><small>${t.d||''}</small></div></div>`).join('')+`<p class="notenote">No employee test/quiz scores exist in any system — training is on-the-job milestones and signed review forms.</p>`;}
function nvaBlock(n){
  const rows=(n.rows||[]).length?`<table><thead><tr><th>Date</th><th>Type</th><th>Detail</th></tr></thead><tbody>`+n.rows.map(r=>`<tr><td class="date">${r.date}</td><td>${r.type} ${r.cust?'<span class="pill cust">reached customer</span>':''}</td><td>${r.txt}</td></tr>`).join('')+`</tbody></table>`:`<div class="empty">No NVAs of their own in this period.</div>`;
  const note=n.note?`<p class="notenote">${n.note}</p>`:'';
  if(n.acc===null||n.acc===undefined){
    if(!n.total && !n.errors && !n.caught && !(n.rows||[]).length) return `<div class="rating"><span class="score na">${n.grade||'No NVAs'}</span></div><p style="font-size:13px;color:var(--muted);margin-top:10px;">No NVAs as responsible and none caught in this period.</p>${note}`;
    return `<div class="rating"><span class="score ${n.gcol==='warn'?'warn':'na'}">${n.grade||'Error log'}</span></div>
      <div class="metric-row" style="margin-top:12px;">${metric(n.total!=null?n.total:n.errors,'NVAs naming them','')}${metric(n.errors,'Own process / picking / entry',n.errors>3?'bad':(n.errors>0?'warn':'good'))}${metric(n.cust,'Reached customer',n.cust>0?'bad':'good')}${metric(n.caught,'Discrepancies caught','good')}</div>
      <h3 style="margin-top:18px;">Their own errors (most recent)</h3>${rows}${note}`;
  }
  const col=n.gcol==='good'?'good':(n.gcol==='warn'?'warn':'muted');
  return `<div class="gauge-wrap"><div class="gauge" style="--pct:${n.acc};--col:var(--${col})"><div><span>${n.acc}%</span><small>clean</small></div></div>
    <div class="gauge-txt"><div class="grade" style="color:var(--${n.gcol==='good'?'good':'warn'})">${n.grade}</div>
    <p style="margin:6px 0 0;color:var(--muted)"><b style="color:var(--ink)">${n.errors}</b> errors across <b style="color:var(--ink)">~${n.activity}</b> handling events = <b style="color:var(--ink)">${n.rate}%</b> error rate, <b style="color:var(--ink)">${n.custRate}%</b> customer-facing.</p></div></div>
    <div class="metric-row" style="margin-top:14px;">${metric(n.errors,'NVAs caused',n.errors>3?'bad':(n.errors>0?'warn':'good'))}${metric(n.cust,'Reached customer',n.cust>0?'bad':'good')}${metric(n.caught,'Discrepancies caught','good')}${metric(n.rate+'%','Error / handling',n.rate>25?'bad':(n.rate>12?'warn':'good'))}</div>
    <h3 style="margin-top:18px;">The errors</h3>${rows}${note}`;
}
function vaBlock(list,given){const g=given?`<p class="notenote">Gave ${given} VA${given>1?'s':''} to colleagues in this period.</p>`:'';return (list&&list.length?`<table><thead><tr><th>Date</th><th>Recognition</th></tr></thead><tbody>`+list.map(v=>`<tr><td class="date">${v.date}</td><td>${v.txt}</td></tr>`).join('')+`</tbody></table>`:`<div class="empty">No VA recognitions on record.</div>`)+g;}
function notesBlock(list){if(!list||!list.length) return `<div class="empty">No review-relevant HR notes in this period.</div>`;return list.map(n=>`<div class="note"><div class="nd">${n.d.replace(/·\s*(\w+)$/,'· <span class="who2">$1</span>')}</div><div class="nx">${n.x}</div></div>`).join('');}
function dailyTable(r){
  if(!r||!r.series) return '';
  let cells=''; r.series.forEach((v)=>{cells+=`<td class="date" style="text-align:center"><b style="color:var(--ink);font-size:14px">${v==null?'—':v}</b></td>`;});
  return `<div style="overflow-x:auto"><table><tbody><tr>${cells}</tr></tbody></table></div>`;
}
// v2 profiles hold raw text from Dynamics (NVA, VA, notes): escape every string before it reaches the page
function escDeep(o){ if(typeof o==='string') return esc(o); if(Array.isArray(o)) return o.map(escDeep); if(o&&typeof o==='object'){ const r={}; for(const k in o) r[k]=escDeep(o[k]); return r; } return o; }
function attBlock(a){
  const rows=(a.rows||[]).length?`<details style="margin-top:10px"><summary style="cursor:pointer;font-size:12.5px;color:var(--muted)">Show the ${a.rows.length} entries</summary><table style="margin-top:6px"><thead><tr><th>Date</th><th>Type</th><th>Detail</th></tr></thead><tbody>`+a.rows.map(r=>`<tr><td class="date">${r.date}</td><td>${r.type}</td><td>${r.detail||''}</td></tr>`).join('')+`</tbody></table></details>`:'';
  const extra=(a.leave!=null)?metric(a.leave,'Left early',a.leave>3?'warn':''):'';
  return `<div class="rating"><span class="score ${a.rating}">${a.label}</span></div><div class="metric-row">${metric(a.late,'Late',a.late>3?'bad':(a.late>0?'warn':'good'))}${metric(a.absent,'Absences',a.absent>0?'warn':'good')}${extra}${metric(a.appt,'Planned','')}</div><p style="font-size:12.5px;color:var(--muted);margin-top:12px;">${a.note||''}</p>${rows}`;
}
function kpiBlock(k){
  if(!k) return '';
  const tbl=k.table?`<div style="overflow-x:auto;margin-top:10px"><table><thead><tr>${k.table.head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${k.table.rows.map(r=>`<tr>${r.map((c,i)=>i?`<td style="text-align:center"><b>${c}</b></td>`:`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'';
  return `<div class="card"><h3>${k.title}</h3><div class="metric-row">${(k.items||[]).map(i=>metric(i.n,i.l,i.cls)).join('')}</div>${k.insight?`<div class="reginsight" style="margin-top:12px">${k.insight}</div>`:''}${tbl}</div>`;
}
// Department averages for every department the person is in (Departments column, synced nightly), from the Ship Register's
// per-picker totals (Masters receive "everyone"). Average per day = total lines ÷ days worked across that department's pickers.
function deptAverages(e,rv,d){
  if(!d||!Array.isArray(d.everyone)||!d.everyone.length||!DATA) return [];
  const mine=(e.departments&&e.departments.length?e.departments:((rv&&rv.departments)||[])).filter(Boolean);
  if(!mine.length) return [];
  const staff=DATA.active.concat(DATA.departed||[]);
  const deptsOf=(nm)=>{ const n=String(nm||'').toLowerCase(); const p=staff.find(x=>n.includes((x.first+' '+x.last).toLowerCase())); return p?(p.departments&&p.departments.length?p.departments:[p.dept]):[]; };
  return mine.map(dn=>{
    const ms=d.everyone.filter(w=>Number(w.days_worked)>0 && deptsOf(w.name).includes(dn));
    const days=ms.reduce((a,w)=>a+Number(w.days_worked),0), tot=ms.reduce((a,w)=>a+Number(w.total),0);
    return { name:dn, people:ms.length, avg: days? Math.round(tot/days*10)/10 : null };
  }).filter(r=>r.people>0);
}
async function loadProd(e,rv){
  const el=document.getElementById('prodcard'); if(!el) return;
  const from=(rv.window&&rv.window.from)||'2025-10-01', to=isoToday();
  let res; try{ res=await sb.rpc('svc_worker_productivity',{p_email:e.email,p_from:from,p_to:to}); }catch(err){ res={error:err}; }
  const d=res&&res.data;
  if(!el.isConnected) return;
  if(res.error||!d||!d.me||!d.me.days_worked){ el.innerHTML=`<h3>Productivity — My Day and Ship Register</h3><div class="nostat">No My Day or Ship Register lines for ${esc(e.first)} in this period${res.error?' (the Ship Register is limited to its Masters)':''}.</div>`; return; }
  const days=(d.days||[]).map(x=>(x.orders||0)+(x.transfers||0)+(x.assemblies||0)+(x.machining||0));
  const notes=(d.days||[]).filter(x=>x.note).slice(-8).reverse();
  const peers=d.peers||{}, dep=d.department||{};
  const deptRows=deptAverages(e,rv,d);
  el.innerHTML=`<h3>Productivity — My Day and Ship Register (vs peers)</h3>
    <div class="metric-row">${metric(d.me.total,'Lines since '+fmtShort(d.from||from),'')}${metric(d.me.per_day,'Per working day',peers.avg_per_day&&d.me.per_day>=peers.avg_per_day?'good':'warn')}${metric(peers.rank?`${peers.rank} / ${peers.people}`:'—','Rank among pickers','')}${metric(peers.avg_per_day||'—','Picker average / day','')}${deptRows.length?'':metric(dep.avg_per_day||'—',(dep.name||'Department')+' average / day','')}</div>
    ${deptRows.length?`<h3 style="margin-top:14px">Compared with every department ${esc(e.first)} is in</h3><table><thead><tr><th>Department</th><th>Pickers</th><th>Average / day</th><th>${esc(e.first)} / day</th></tr></thead><tbody>${deptRows.map(r=>`<tr><td>${esc(r.name)}</td><td style="text-align:center">${r.people}</td><td style="text-align:center"><b>${r.avg}</b></td><td style="text-align:center;color:${d.me.per_day>=r.avg?'var(--good)':'var(--warn)'}"><b>${d.me.per_day}</b></td></tr>`).join('')}</tbody></table>`:''}
    <div class="regbar" style="margin-top:10px"><div><div class="regsub">${d.me.days_worked} days worked · ${esc(d.person&&d.person.department||'')}</div></div>${spark(days,'var(--blue)')}</div>
    ${notes.length?`<h3 style="margin-top:14px">End-of-day notes</h3><table><tbody>${notes.map(x=>`<tr><td class="date">${fmtShort(x.day)}</td><td>${esc(x.note)}</td></tr>`).join('')}</tbody></table>`:''}
    <p class="notenote">Live from the Ship Register (svc). Lines from My Day where entered, otherwise from the register; the register starts Sep 2026.</p>`;
}
// ---------- Projects and Campaigns layer (2026-10-03) ----------
// Back office: Dynamics Projects (recurring work with the procedure in the Description). Outside sales: Campaigns, campaign
// activities, marketing lists and the calls / visits tied to them. Built by the hr-review-sync edge function (projects.ts).
(function(){ const s=document.createElement('style'); s.textContent=`.pjchip{display:inline-block;font-size:11px;font-weight:800;padding:2px 8px;border-radius:6px;white-space:nowrap}
.pjchip.good{background:color-mix(in srgb,var(--good) 16%,transparent);color:var(--good)}.pjchip.warn{background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn)}.pjchip.bad{background:color-mix(in srgb,var(--bad) 15%,transparent);color:var(--bad)}.pjchip.na{background:var(--line);color:var(--muted)}
.pjwrap{overflow-x:auto;margin-top:10px}.pjtbl td a{color:inherit;font-weight:600;text-decoration:none;border-bottom:1px dotted var(--muted)}.pjtbl td a:hover{color:var(--blue)}
.pjhead{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.pjhead h3{margin:0}.pjgrade{font-size:13px;padding:3px 10px}
.pjscore{font-size:12.5px;color:var(--muted);margin-top:6px}.pjbp{margin-top:12px;background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:10px 14px;font-size:13px}
.pjbp summary,.pjmore summary{cursor:pointer;font-weight:700}.pjmore summary{font-size:12.5px;color:var(--muted);margin-top:8px}.pjbp ol{margin:8px 0 0 18px;padding:0}.pjbp li{margin:5px 0}`;
  document.head.appendChild(s); })();
const DYN='https://fluidseal.crm.dynamics.com/main.aspx?pagetype=entityrecord';
function dynLink(etn,id,txt){ return `<a href="${DYN}&etn=${etn}&id=${encodeURIComponent(id||'')}" target="_blank" rel="noopener" title="Open in Dynamics">${txt}</a>`; }
function pjChip(cls,t){ return `<span class="pjchip ${cls}">${t}</span>`; }
function pjGradeHead(title,b){ return `<div class="pjhead"><h3>${title}</h3><span class="score pjgrade ${b.gcol||'na'}">${b.grade||'No grade yet'}</span></div>`; }
function pjTable(head,rows,first){
  const tbl=(rs)=>`<div class="pjwrap"><table class="pjtbl"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rs.join('')}</tbody></table></div>`;
  if(rows.length<=first) return tbl(rows);
  return tbl(rows.slice(0,first))+`<details class="pjmore"><summary>Show all ${rows.length}</summary>${tbl(rows.slice(first))}</details>`;
}
const BP_PROJECTS=`<details class="pjbp"><summary>Best practice — how a project is worked in Dynamics</summary><ol>
<li><b>Start the day from My Projects</b>, sorted by Due Date: anything due today or earlier comes first.</li>
<li><b>Follow the project's Description</b> — the written procedure lives there. If it is missing or out of date, update it (or ask your manager) so anyone covering can do the task.</li>
<li><b>Log the work in a Note</b> when it is done: what was done, the date, your initials and the time it took (for example "sent ship register for Sept 29 · 09.30.26 · cc · 5–10 mins").</li>
<li><b>Move the Due Date to the next occurrence</b> for its Frequency (Daily: next working day · Weekly: next week · Monthly: same day next month). Dynamics records the change as a "Record Updated" note — that is how completion and on-time are measured here.</li>
<li><b>Running late?</b> Add a note with the reason before moving the date — never push a date without a note.</li>
<li><b>Not yours, or no longer needed?</b> Ask your manager to reassign it, change its Frequency or close it (Status Reason Complete 100%, then Deactivate). A project should never sit overdue.</li></ol></details>`;
const BP_CAMPAIGNS=`<details class="pjbp"><summary>Best practice — how a campaign is worked in Dynamics</summary><ol>
<li><b>Campaign = the plan</b>: one per territory year or market push, with Proposed Start and End dates. When it ends, set it Completed — or set the new dates if it carries on.</li>
<li><b>Marketing list = who</b>: build the account list (territory, market, zero-sales month, trip) and add it to the campaign.</li>
<li><b>Campaign activity = what and when</b>: the call, visit or email with a due date. Distribute it to the list so every account gets its own phone call or appointment.</li>
<li><b>Work every activity</b>: complete calls as Made or Received with the outcome in the note; reschedule with a reason; cancel only when the account does not apply.</li>
<li><b>Turn results into business</b>: open the Mining or Quote opportunity and set the account's Next Touch.</li>
<li><b>Review weekly</b>: open calls older than 30 days and campaign activities past due are cleared first.</li></ol></details>`;
function projectsCard(b,e){
  if(!b) return '';
  const rows=(b.list||[]).map(r=>{
    const st=r.inh?pjChip('na','handed over '+r.inh):(r.rec&&r.od>3?pjChip('bad',r.od>365?`${r.od} days behind · over a year`:`${r.od} days behind`):(r.od>0?pjChip('warn',`due ${r.od} day${r.od>1?'s':''} ago`):pjChip('good',r.rec?'on schedule':'open')));
    return `<tr><td>${dynLink('new_project',r.id,r.n)}${r.bp?'':' '+pjChip('warn','no procedure')}</td><td>${r.f}</td><td class="date">${r.due?fmtDate(r.due):'—'}</td><td>${st}</td><td class="date">${r.last?fmtDate(r.last):'—'}</td><td style="text-align:center">${r.exp?`${r.c90} / ${r.exp}`:(r.c90||'—')}</td></tr>`;
  });
  const p=b.parts||{};
  return `<div class="card" id="projcard">${pjGradeHead('Projects — managing assigned work',b)}
    ${b.score!=null?`<div class="pjscore">Score ${b.score} / 100 — on schedule ${p.schedule}% · on time ${p.ontime}% · cadence ${p.cadence==null?'n/a':p.cadence+'%'} · work log ${p.log}%</div>`:`<div class="pjscore">Not graded: fewer than 3 recurring projects of their own and fewer than 20 completions in the last 90 days.</div>`}
    <div class="metric-row">${(b.items||[]).map(i=>metric(i.n,i.l,i.cls)).join('')}</div>
    ${b.insight?`<div class="reginsight" style="margin-top:12px">${b.insight}</div>`:''}
    ${rows.length?pjTable(['Project','Frequency','Due','Status','Last done','Done 90 days / expected'],rows,12):`<div class="empty">No active projects assigned in Dynamics.</div>`}
    ${BP_PROJECTS}
    <p class="notenote">Read from Dynamics project notes since ${fmtDate(b.from)}. A completion = the Due Date moved forward (the "Record Updated" note); on time = moved on or before the old due date; behind = Due Date more than 3 days past. Score: on schedule 40 · on time 25 · cadence in the last 90 days (daily to monthly projects) 20 · work-log notes 15. Projects handed over in the last 30 days are shown but not graded. Check each item in Dynamics before the review.</p></div>`;
}
function campaignsCard(b,e){
  if(!b) return '';
  const acts=(b.acts||[]).map(a=>`<tr><td>${dynLink('campaignactivity',a.id,a.n)}</td><td>${a.c||''}</td><td class="date">${a.due?fmtDate(a.due):'—'}</td><td>${a.od>3?pjChip('bad',`${a.od} days past due`):a.od>0?pjChip('warn','due'):pjChip('good','on time')}</td></tr>`);
  const camps=(b.campaigns||[]).map(c=>`<tr><td>${dynLink('campaign',c.id,c.n)}</td><td>${c.s||''}</td><td class="date">${c.end?fmtDate(c.end):'—'}</td><td>${c.cur?pjChip('good','current'):pjChip('warn',c.end?'past end date':'no end date')}</td></tr>`);
  const lists=(b.lists||[]).map(l=>`<tr><td>${dynLink('list',l.id,l.n)}</td><td style="text-align:center">${l.m}</td><td class="date">${fmtDate(l.c)}</td><td class="date">${l.u?fmtDate(l.u):'not used'}</td></tr>`);
  const p=b.parts||{};
  return `<div class="card" id="campcard">${pjGradeHead('Campaigns — campaign activities, marketing lists and calls',b)}
    ${b.score!=null?`<div class="pjscore">Score ${b.score} / 100 — worked through ${p.followThrough}% · activities on time ${p.activities}% · campaigns current ${p.campaigns}% · momentum ${p.momentum}%</div>`:`<div class="pjscore">Not graded: fewer than 20 campaign calls and visits since ${fmtDate(b.from)}.</div>`}
    <div class="metric-row">${(b.items||[]).map(i=>metric(i.n,i.l,i.cls)).join('')}</div>
    ${b.insight?`<div class="reginsight" style="margin-top:12px">${b.insight}</div>`:''}
    ${acts.length?`<h3 style="margin-top:14px">Open campaign activities</h3>`+pjTable(['Campaign activity','Campaign','Due','Status'],acts,8):''}
    ${camps.length?`<details class="pjmore"><summary>Open campaigns (${camps.length})</summary>${pjTable(['Campaign','Status','End','Check'],camps,100)}</details>`:''}
    ${lists.length?`<details class="pjmore"><summary>Marketing lists built since ${fmtDate(b.from)} (${lists.length})</summary>${pjTable(['Marketing list','Accounts','Created','Last used'],lists,100)}</details>`:''}
    ${BP_CAMPAIGNS}
    <p class="notenote">Read from Dynamics campaigns, campaign activities, marketing lists and the phone calls, appointments and emails tied to campaign activities since ${fmtDate(b.from)}. Worked through = done ÷ (done + cancelled + open over 30 days); open calls pushed to a later date still count as open. Score: worked through 40 · campaign activities on time 25 · campaigns current 15 · activity in the last 90 days 20. Test records are left out. Check each item in Dynamics before the review.</p></div>`;
}
// v1 profiles are not escaped on load (escDeep runs for v2 only): escape the layer here for them
function layerCards(rv,e){
  const v2=(rv.v||1)>=2, pj=rv.projects?(v2?rv.projects:escDeep(rv.projects)):null, cp=rv.campaigns?(v2?rv.campaigns:escDeep(rv.campaigns)):null;
  if(!pj&&!cp) return '';
  const salesFirst=cp&&['outside','discovery'].includes(String(rv.role||''));
  return salesFirst? campaignsCard(cp,e)+projectsCard(pj,e) : projectsCard(pj,e)+campaignsCard(cp,e);
}
async function openDetail(id){
  const e = DATA.active.find(x=>x.id===id) || DATA.departed.find(x=>x.id===id); if(!e) return;
  const dv=$('#detailview');
  $('#appview').classList.add('hidden'); dv.classList.remove('hidden');
  dv.innerHTML=`<button class="backbtn" id="back">← Back to roster</button><div class="card"><p class="empname">${esc(e.first)} ${esc(e.last)}</p><p class="emprole">Loading review profile…</p></div>`;
  $('#back').onclick=()=>{ dv.classList.add('hidden'); $('#appview').classList.remove('hidden'); window.scrollTo(0,0); };
  window.scrollTo(0,0);
  let row=null; try{ const { data } = await sb.rpc('hr_review_profile',{p_employee_id:id}); row=(data||[])[0]||null; }catch(err){ row=null; }
  let rv=row&&row.profile; if(rv && (rv.v||1)>=2) rv=escDeep(rv);
  let html=`<button class="backbtn" id="back">← Back to roster</button> <button class="backbtn" id="detailfb" style="background:var(--yellow);color:var(--black)">💬 Feedback</button>`;
  if(e.end) html+=`<div class="departbanner"><b>${e.reason||'Departed'} — last day ${fmtDate(e.end)}.</b> Kept for records; no longer on the active roster.</div>`;
  if(rv){
    const nextRev=row.review_date?`${fmtDate(row.review_date)}${row.review_kind?' · '+esc(row.review_kind):''}`:'not set';
    if(rv.draft) html+=`<div class="departbanner" style="border-color:var(--line)">Draft review profile prepared by Claude from Dynamics (${esc(rv.built||'')}; data ${fmtDate(rv.window&&rv.window.from)} – ${fmtDate(rv.window&&rv.window.to)}).${rv.synced?` Attendance, error log, Very Awesomes, training, projects, campaigns, Departments and the review date re-synced from Dynamics ${fmtTs(rv.synced)}; the written assessment, insights and notes are as of ${esc(rv.built||'the build')}.`:''} Check each item in Dynamics before the meeting.</div>`;
    if(rv.flags&&rv.flags.length) html+=`<div class="departbanner"><b>Check before the review</b><ul style="margin:6px 0 0 18px;padding:0">${rv.flags.map(f=>`<li>${f}</li>`).join('')}</ul></div>`;
    html+=`<div class="card"><p class="empname">${esc(e.first)} ${esc(e.last)}</p><p class="emprole">${esc(e.title)} &middot; ${esc(e.dept)} &middot; <a href="mailto:${esc(e.email||'')}">${esc(e.email||'')}</a></p>
      ${rv.goal?`<div class="goal"><b>Role &amp; goal</b>${rv.goal}</div>`:''}
      <div class="facts"><div><span>Start</span><b>${fmtDate(e.start)}</b></div><div><span>Tenure</span><b>${e.tenure}</b></div><div><span>P21 role</span><b>${e.p21||'—'}</b></div><div><span>Next review</span><b>${nextRev}</b></div></div>
      ${rv.departments&&rv.departments.length?`<div class="dept-badges" style="margin-top:10px">${rv.departments.map(x=>`<span class="deptbadge ${x===rv.home?'cur':''}">${x}</span>`).join(' ')}</div>`:''}
      <div style="margin-top:12px;font-size:12.5px;color:var(--muted);"><b style="color:var(--ink)">Review status:</b> ${rv.reviewStatus||''}</div></div>`;
    html+=layerCards(rv,e);
    html+=kpiBlock(rv.kpis);
    if(rv.territory) html+=`<div class="card"><h3>Territory ${rv.territory.code}</h3><div class="reginsight">${rv.territory.note}</div></div>`;
    if(rv.regInsight||(e.reg&&e.reg.total)) html+=`<div class="card"><h3>Ship Register</h3>${rv.regInsight?`<div class="reginsight">${rv.regInsight}</div>`:''}${e.reg&&e.reg.total?fmtReg(e.reg)+dailyTable(e.reg):''}</div>`;
    if(rv.productivityCard) html+=`<div class="card" id="prodcard"><h3>Productivity — My Day and Ship Register</h3><div class="nostat">Loading…</div></div>`;
    html+=`<div class="card"><h3>Department timeline</h3><div class="dept-badges">${(rv.depts||[]).map(x=>`<span class="deptbadge ${x.cur?'cur':''}">${x.n}</span>`).join(' ')}</div>${timeline(rv.timeline||[])}</div>
      <div class="two colwrap"><div class="card"><h3>Training &amp; assessments</h3>${training(rv.training)}</div>
      <div class="card"><h3>Attendance</h3>${attBlock(rv.attendance||{})}</div></div>
      <div class="card"><h3>${(rv.nva&&rv.nva.title)||'Picking accuracy (volume-normalized)'}</h3>${nvaBlock(rv.nva||{})}</div>
      <div class="two colwrap"><div class="card"><h3>Very Awesome (VA)</h3>${vaBlock(rv.va,rv.vaGiven)}</div><div class="card"><h3>HR notes</h3>${notesBlock(rv.notes)}</div></div>
      <div class="card"><h3>Overall assessment${rv.draft?' <span class="assessbadge">draft</span>':''}</h3><div class="assess"><p class="lead">${(rv.assess&&rv.assess.lead)||''}</p>${((rv.assess&&rv.assess.body)||[]).map(b=>`<p>${b}</p>`).join('')}</div><div class="rec"><b>Recommendation</b>${rv.rec||''}</div></div>`;
  } else {
    html+=`<div class="card"><p class="empname">${esc(e.first)} ${esc(e.last)}</p><p class="emprole">${esc(e.title)} &middot; ${esc(e.dept)} Dept &middot; <a href="mailto:${esc(e.email||'')}">${esc(e.email||'')}</a></p>
      <div class="facts"><div><span>Start</span><b>${fmtDate(e.start)}</b></div><div><span>Tenure</span><b>${e.tenure}</b></div><div><span>P21 role</span><b>${e.p21||'—'}</b></div><div><span>Status</span><b>${e.status}${e.reason?' ('+e.reason+')':''}</b></div></div></div>
      <div class="card"><h3>Ship Register productivity</h3>${e.reg&&e.reg.total?`<div class="reginsight">${e.first} logged <b>${e.reg.total} ${e.reg.type==='pick'?'picks':'orders'}</b> — ${e.reg.avg}/day across ${e.reg.active} active days.</div>${fmtReg(e.reg)}${dailyTable(e.reg)}`:fmtReg(e.reg)}</div>
      <div class="card"><h3>Review profile</h3><p style="font-size:13px;color:var(--muted)">No review profile is available for ${esc(e.first)} on this account.</p></div>`;
  }
  dv.innerHTML=html;
  $('#back').onclick=()=>{ dv.classList.add('hidden'); $('#appview').classList.remove('hidden'); window.scrollTo(0,0); };
  $('#detailfb').onclick=()=>openFeedback(e.id, `${e.first} ${e.last}`);
  if(rv&&rv.productivityCard) loadProd(e,rv);
}
// ---------- feedback (per-employee, mirrored to the Dynamics notepad) ----------
let FB_EMP=null;
function fbEsc(s){ return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fbStat(s){ return s==='created'?'in Dynamics':(s==='failed'?'sync pending':'saving…'); }
// turn the rich editor's HTML into clean plain text: real line breaks, "• " / "1." list markers
function fbChildText(node){ return [...node.childNodes].map(fbNodeText).join(''); }
function fbNodeText(node){
  if(node.nodeType===3) return node.nodeValue.replace(/ /g,' ');
  if(node.nodeType!==1) return '';
  const tag=node.tagName.toLowerCase();
  if(tag==='br') return '\n';
  if(tag==='ul'||tag==='ol'){
    const items=[...node.children].filter(c=>c.tagName.toLowerCase()==='li');
    return '\n'+items.map((li,i)=>(tag==='ul'?'• ':(i+1)+'. ')+fbChildText(li).replace(/\s*\n\s*/g,' ').trim()).join('\n')+'\n';
  }
  if(tag==='div'||tag==='p') return fbChildText(node)+'\n';
  return fbChildText(node);
}
function fbEditorText(root){ return fbChildText(root).replace(/\n{3,}/g,'\n\n').replace(/[ \t]+\n/g,'\n').replace(/^\s+|\s+$/g,''); }
async function openFeedback(id,name){
  if(!id) return;
  FB_EMP=id;
  $('#fbtitle').textContent=name||'Feedback';
  $('#fbsub').textContent='Saved to this employee’s Dynamics notepad (reason: Feedback).';
  $('#fbtopic').value=''; $('#fbtext').innerHTML=''; $('#fbmsg').textContent=''; $('#fbmsg').className='msg';
  $('#fblist').innerHTML='<div class="empty">Loading…</div>';
  $('#fbmodal').classList.remove('hidden');
  await loadFeedback(id);
}
async function loadFeedback(id){
  const { data, error } = await sb.rpc('hr_feedback_list',{p_employee_id:id});
  if(error){ $('#fblist').innerHTML='<div class="empty">Couldn’t load feedback.</div>'; return; }
  const rows=data||[];
  $('#fblist').innerHTML = rows.length ? rows.map(r=>{
    const when=new Date(r.created_at).toLocaleDateString('en-CA',{year:'numeric',month:'short',day:'numeric'});
    return `<div class="fbitem"><div class="m">${when} · ${fbEsc(r.author_name||r.author_email||'HR')}<span class="st ${r.dynamics_status}">${fbStat(r.dynamics_status)}</span></div>${r.topic?`<div class="t"><b>${fbEsc(r.topic)}</b></div>`:''}<div class="t">${fbEsc(r.body)}</div></div>`;
  }).join('') : '<div class="empty">No feedback yet — be the first to add some.</div>';
}
function closeFeedback(){ $('#fbmodal').classList.add('hidden'); FB_EMP=null; }
$('#fbclose').onclick=closeFeedback;
$('#fbmodal').onclick=(ev)=>{ if(ev.target.id==='fbmodal') closeFeedback(); };
$('#fbsubmit').onclick=async ()=>{
  if(!FB_EMP) return;
  const body=fbEditorText($('#fbtext')), topic=$('#fbtopic').value.trim(), msg=$('#fbmsg');
  if(!body){ msg.className='msg err'; msg.textContent='Write some feedback first.'; return; }
  $('#fbsubmit').disabled=true; msg.className='msg'; msg.textContent='Saving…';
  let res; try{ res=await sb.functions.invoke('hr-feedback',{ body:{ employee_id:FB_EMP, topic, body } }); }catch(e){ res={ error:e }; }
  $('#fbsubmit').disabled=false;
  const d=res&&res.data;
  if((res&&res.error) || !d || (d.ok===false && !d.saved)){ msg.className='msg err'; msg.textContent='Could not save — please try again.'; return; }
  if(d.ok===false && d.saved){ msg.className='msg ok'; msg.textContent='Saved ✓ — Dynamics sync is pending; it will appear on the notepad shortly.'; }
  else { msg.className='msg ok'; msg.textContent='Saved to the notepad ✓'; }
  $('#fbtopic').value=''; $('#fbtext').innerHTML='';
  if(DATA&&DATA.fbCounts){ DATA.fbCounts[FB_EMP]=(DATA.fbCounts[FB_EMP]||0)+1;
    document.querySelectorAll(`.fbbtn[data-fb="${FB_EMP}"]`).forEach(b=>{ b.innerHTML=`💬 Feedback<span class="cnt">${DATA.fbCounts[FB_EMP]}</span>`; }); }
  await loadFeedback(FB_EMP);
};
document.querySelectorAll('.fbtb').forEach(btn=>{
  btn.addEventListener('mousedown',(ev)=>ev.preventDefault());
  btn.addEventListener('click',(ev)=>{ ev.preventDefault(); $('#fbtext').focus(); try{ document.execCommand(btn.dataset.cmd,false,null); }catch(e){} });
});

$('#foot').innerHTML=`Live from Dynamics 365 via a gated Supabase layer (HR-only). Employee, team and directory data refresh nightly; the Ship Register is loaded monthly; review profiles are prepared from Dynamics, re-synced on the 1st of every month or with Sync now, and served only to signed-in HR viewers. Access is limited to the HR allow-list. Picking accuracy normalizes NVA errors against handling volume. Projects (back office) and Campaigns (outside sales) are read from Dynamics project notes, campaign activities, marketing lists and the calls tied to them. Name mapping notes: register "Suzie" → Elrica Barrett and the single "Kevin" picker → Kevin Blair are unconfirmed; CINDY/MERRYL share order code 675. — Fluidseal HR Portal`;
boot();
