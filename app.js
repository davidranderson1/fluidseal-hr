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
function tenure(startISO){
  if(!startISO) return '—';
  const d=new Date(startISO), n=new Date();
  let m=(n.getFullYear()-d.getFullYear())*12+(n.getMonth()-d.getMonth());
  if(n.getDate()<d.getDate()) m--;
  const y=Math.floor(m/12), mm=m%12; return (y?`${y}y `:'')+`${mm}m`;
}
async function loadAndRender(){
  show('loading');
  const [emp, periods, teamMembers, counts] = await Promise.all([
    sb.rpc('hr_employee_list'), sb.rpc('hr_register_periods'), sb.rpc('hr_team_member_list'), sb.rpc('hr_feedback_counts')
  ]);
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
      dept: e.department || e.department_text || 'Unassigned',
      start: e.employee_start_date, end: e.employee_end_date,
      tenure: tenure(e.employee_start_date), p21: e.p21_user_role, email: e.work_email,
      status: e.status, reason: e.status_reason,
      review: !!REVIEWS[e.last_name.replace(/\s+/g,'')] && e.status==='Active',
      reg: r ? { type:r.role_type, total:Number(r.total), avg:Number(r.avg_active), active:r.active_days, worked:r.worked_days, series:r.series, note:r.note } : null,
    };
  };
  DATA = {
    active: active.map(norm), departed: departed.map(norm),
    period, teamMembers: teamMembers.data||[], fbCounts,
    syncedAt: employees.reduce((mx,e)=> e.synced_at>mx?e.synced_at:mx, ''),
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
function fmtDate(d){ return d? new Date(d).toLocaleDateString('en-CA',{year:'numeric',month:'short',day:'numeric'}) : '—'; }
function card(e,gone){
  const badge = gone?`<span class="goneflag">${e.reason||'departed'}</span>`:(e.review?'<span class="duebadge">review due</span>':'');
  const meta = gone? `${e.title} · left ${fmtDate(e.end)}` : `${e.title} · ${e.tenure} tenure`;
  const fbn=(DATA&&DATA.fbCounts&&DATA.fbCounts[e.id])||0;
  const fbbtn=`<button class="fbbtn" data-fb="${e.id}" data-nm="${e.first} ${e.last}">💬 Feedback${fbn?`<span class="cnt">${fbn}</span>`:''}</button>`;
  return `<div class="ecard ${gone?'gone':(e.review?'due':'')}" data-id="${e.id}">${badge}
    <div class="nm">${e.first} ${e.last}</div><div class="rl">${e.dept}</div>
    <div class="meta">${meta}</div>${fmtReg(e.reg)}${fbbtn}</div>`;
}
function renderRoster(){
  const p=DATA.period||{};
  $('#syncbar').innerHTML=`<span class="syncdot"></span><span>Live from Dynamics · employees synced nightly (last: <b>${DATA.syncedAt?new Date(DATA.syncedAt).toLocaleString('en-CA'):'—'}</b>) · <b>${DATA.active.length}</b> active${DATA.departed.length?` · ${DATA.departed.length} recently departed`:''}</span><span class="spacer"></span><button class="btn" id="refresh">↻ Refresh</button>`;
  $('#refresh').onclick=loadAndRender;
  $('#kpis').innerHTML=[
    ['n',DATA.active.length,'Active employees'],
    ['n',(p.orders||0).toLocaleString(),'Orders shipped ('+(p.label||'')+')'],
    ['n',(p.items||0).toLocaleString(),'Items picked'],
    ['n',p.items_per_picker||'—','Items / picker / day'],
    ['n',p.cannot_locate_per_day||'—','Cannot-locate / day'],
    ['n',DATA.active.filter(e=>e.review).length,'Reviews due']
  ].map(k=>`<div class="kpi"><div class="n">${k[1]}</div><div class="l">${k[2]}</div></div>`).join('');
  $('#infoline').innerHTML=`Every active employee, grouped by department, live from Dynamics 365. Productivity from the ${p.label||''} Ship Register. Click anyone for their profile; the review-due employees carry the full deep-dive.`;

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
function training(list){const ic={done:'✓',prog:'◐',plan:'○'};return list.map(t=>`<div class="trainrow"><div class="ti ${t.s}">${ic[t.s]}</div><div class="tt"><b>${t.t}</b>${t.assess?'<span class="assessbadge">assessment done</span>':''}<span class="dt">${t.dt}</span><small>${t.d}</small></div></div>`).join('')+`<p class="notenote">No employee test/quiz scores exist in any system — training is on-the-job milestones and signed review forms.</p>`;}
function nvaBlock(n){
  if(n.acc===null) return `<div class="rating"><span class="score na">${n.grade}</span></div><p style="font-size:13px;color:var(--muted);margin-top:10px;">Non-picking role — no picking volume to score.</p>`;
  const rows=n.rows.length?`<table><thead><tr><th>Date</th><th>Type</th><th>Detail</th></tr></thead><tbody>`+n.rows.map(r=>`<tr><td class="date">${r.date}</td><td>${r.type} ${r.cust?'<span class="pill cust">reached customer</span>':''}</td><td>${r.txt}</td></tr>`).join('')+`</tbody></table>`:`<div class="empty">No NVAs as responsible.</div>`;
  const col=n.gcol==='good'?'good':(n.gcol==='warn'?'warn':'muted');
  return `<div class="gauge-wrap"><div class="gauge" style="--pct:${n.acc};--col:var(--${col})"><div><span>${n.acc}%</span><small>clean</small></div></div>
    <div class="gauge-txt"><div class="grade" style="color:var(--${n.gcol==='good'?'good':'warn'})">${n.grade}</div>
    <p style="margin:6px 0 0;color:var(--muted)"><b style="color:var(--ink)">${n.errors}</b> errors across <b style="color:var(--ink)">~${n.activity}</b> handling events = <b style="color:var(--ink)">${n.rate}%</b> error rate, <b style="color:var(--ink)">${n.custRate}%</b> customer-facing.</p></div></div>
    <div class="metric-row" style="margin-top:14px;">${metric(n.errors,'NVAs caused',n.errors>3?'bad':(n.errors>0?'warn':'good'))}${metric(n.cust,'Reached customer',n.cust>0?'bad':'good')}${metric(n.caught,'Discrepancies caught','good')}${metric(n.rate+'%','Error / handling',n.rate>25?'bad':(n.rate>12?'warn':'good'))}</div>
    <h3 style="margin-top:18px;">The errors</h3>${rows}`;
}
function vaBlock(list){return list.length?`<table><thead><tr><th>Date</th><th>Recognition</th></tr></thead><tbody>`+list.map(v=>`<tr><td class="date">${v.date}</td><td>${v.txt}</td></tr>`).join('')+`</tbody></table>`:`<div class="empty">No VA recognitions on record.</div>`;}
function notesBlock(list){return list.map(n=>`<div class="note"><div class="nd">${n.d.replace(/·\s*(\w+)$/,'· <span class="who2">$1</span>')}</div><div class="nx">${n.x}</div></div>`).join('');}
function dailyTable(r){
  if(!r||!r.series) return '';
  const labs=DATA.period&&DATA.period.period? null:null;
  let cells=''; r.series.forEach((v)=>{cells+=`<td class="date" style="text-align:center"><b style="color:var(--ink);font-size:14px">${v==null?'—':v}</b></td>`;});
  return `<div style="overflow-x:auto"><table><tbody><tr>${cells}</tr></tbody></table></div>`;
}
function openDetail(id){
  const e = DATA.active.find(x=>x.id===id) || DATA.departed.find(x=>x.id===id); if(!e) return;
  const k = e.key;
  const rv = REVIEWS[k] && (e.review || (e.reason)) ? REVIEWS[k] : null;
  const dv=$('#detailview'); let html=`<button class="backbtn" id="back">← Back to roster</button> <button class="backbtn" id="detailfb" style="background:var(--yellow);color:var(--black)">💬 Feedback</button>`;
  if(e.end) html+=`<div class="departbanner"><b>${e.reason||'Departed'} — last day ${fmtDate(e.end)}.</b> Kept for records; no longer on the active roster.</div>`;
  if(rv){
    html+=`<div class="card"><p class="empname">${e.first} ${e.last}</p><p class="emprole">${e.title} &middot; ${e.dept} &middot; <a href="mailto:${e.email||''}">${e.email||''}</a></p>
      <div class="goal"><b>Role &amp; goal</b>${rv.goal}</div>
      <div class="facts"><div><span>Start</span><b>${fmtDate(e.start)}</b></div><div><span>Tenure</span><b>${e.tenure}</b></div><div><span>P21 role</span><b>${e.p21||'—'}</b></div></div>
      <div style="margin-top:12px;font-size:12.5px;color:var(--muted);"><b style="color:var(--ink)">Review status:</b> ${rv.reviewStatus}</div></div>
      ${rv.regInsight?`<div class="card"><h3>Ship Register</h3><div class="reginsight">${rv.regInsight}</div>${e.reg&&e.reg.total?fmtReg(e.reg)+dailyTable(e.reg):''}</div>`:''}
      <div class="card"><h3>Department timeline</h3><div class="dept-badges">${rv.depts.map(x=>`<span class="deptbadge ${x.cur?'cur':''}">${x.n}</span>`).join(' ')}</div>${timeline(rv.timeline)}</div>
      <div class="two colwrap"><div class="card"><h3>Training &amp; assessments</h3>${training(rv.training)}</div>
      <div class="card"><h3>Attendance</h3><div class="rating"><span class="score ${rv.attendance.rating}">${rv.attendance.label}</span></div><div class="metric-row">${metric(rv.attendance.late,'Late',rv.attendance.late>3?'bad':(rv.attendance.late>0?'warn':'good'))}${metric(rv.attendance.absent,'Absences',rv.attendance.absent>0?'warn':'good')}${metric(rv.attendance.appt,'Planned','')}</div><p style="font-size:12.5px;color:var(--muted);margin-top:12px;">${rv.attendance.note}</p></div></div>
      <div class="card"><h3>Picking accuracy (volume-normalized)</h3>${nvaBlock(rv.nva)}</div>
      <div class="two colwrap"><div class="card"><h3>Very Awesome (VA)</h3>${vaBlock(rv.va)}</div><div class="card"><h3>HR notes</h3>${notesBlock(rv.notes)}</div></div>
      <div class="card"><h3>Overall assessment</h3><div class="assess"><p class="lead">${rv.assess.lead}</p>${rv.assess.body.map(b=>`<p>${b}</p>`).join('')}</div><div class="rec"><b>Recommendation</b>${rv.rec}</div></div>`;
  } else {
    html+=`<div class="card"><p class="empname">${e.first} ${e.last}</p><p class="emprole">${e.title} &middot; ${e.dept} Dept &middot; <a href="mailto:${e.email||''}">${e.email||''}</a></p>
      <div class="facts"><div><span>Start</span><b>${fmtDate(e.start)}</b></div><div><span>Tenure</span><b>${e.tenure}</b></div><div><span>P21 role</span><b>${e.p21||'—'}</b></div><div><span>Status</span><b>${e.status}${e.reason?' ('+e.reason+')':''}</b></div></div></div>
      <div class="card"><h3>Ship Register productivity</h3>${e.reg&&e.reg.total?`<div class="reginsight">${e.first} logged <b>${e.reg.total} ${e.reg.type==='pick'?'picks':'orders'}</b> — ${e.reg.avg}/day across ${e.reg.active} active days.</div>${fmtReg(e.reg)}${dailyTable(e.reg)}`:fmtReg(e.reg)}</div>
      <div class="card"><h3>Deeper review</h3><p style="font-size:13px;color:var(--muted)">Ongoing-review profile. Attendance, NVA accuracy, training and VA detail can be pulled from Dynamics for ${e.first} on request; the review-due employees carry that full detail now.</p></div>`;
  }
  $('#appview').classList.add('hidden'); $('#departsec')&&null;
  dv.classList.remove('hidden'); dv.innerHTML=html;
  $('#back').onclick=()=>{ dv.classList.add('hidden'); $('#appview').classList.remove('hidden'); window.scrollTo(0,0); };
  $('#detailfb').onclick=()=>openFeedback(e.id, `${e.first} ${e.last}`);
  window.scrollTo(0,0);
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

$('#foot').innerHTML=`Live from Dynamics 365 via a gated Supabase layer (HR-only). Employee, team and directory data refresh nightly; the Ship Register is loaded monthly. Access is limited to the HR allow-list. Picking accuracy normalizes NVA errors against handling volume. Name mapping notes: register "Suzie" → Elrica Barrett and the single "Kevin" picker → Kevin Blair are unconfirmed; CINDY/MERRYL share order code 675. — Fluidseal HR Portal`;
boot();
