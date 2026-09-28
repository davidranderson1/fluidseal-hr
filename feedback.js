const SUPA_URL = "https://hnmbjqhxvxakhdzgetxw.supabase.co";
const SUPA_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhubWJqcWh4dnhha2hkemdldHh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjUzNjQsImV4cCI6MjA5NTkwMTM2NH0.GSWI113EQ6ZaA1n_lxECqEmc952q14-tZ7dacZNbZf0";
const sb = supabase.createClient(SUPA_URL, SUPA_ANON);
const $ = (s) => document.querySelector(s);
let ME = null, IS_ADMIN = false, DATA = [], curFilter = 'all';

const esc = (s) => (s ?? '').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const escAttr = (s) => esc(s).replace(/"/g,'&quot;');
const STATUS = { idea:'Open', approved:'Approved', in_progress:'Building', shipped:'Shipped', declined:'Not now', deferred:'Later' };

// ---------- auth ----------
async function boot(){
  const { data:{ session } } = await sb.auth.getSession();
  if(!session){ show('login'); return; }
  ME = session.user.email;
  const { data: who, error } = await sb.rpc('hr_whoami');
  const row = who && who[0];
  if(error || !row || !row.is_viewer){
    $('#denymsg').innerHTML = `Signed in as <b>${esc(ME)}</b>, but this account isn't on the HR access list. Ask David to add you.`;
    show('deny'); renderUser(); return;
  }
  IS_ADMIN = !!row.is_admin;
  renderUser();
  await load();
}
function show(v){
  ['login','deny','app'].forEach(k=>$('#'+k+'view').classList.toggle('hidden', v!==k));
  $('#foot').classList.toggle('hidden', v!=='app');
  $('#loading').classList.toggle('hidden', v!=='loading');
}
function renderUser(){
  $('#userbox').innerHTML = `<span class="who">${esc(ME)}</span> &nbsp; <button class="btn ghost" id="signout">Sign out</button>`;
  $('#signout').onclick = signout;
}
async function signout(){ await sb.auth.signOut(); location.reload(); }
$('#signout2').onclick = signout;
$('#sendlink').onclick = async ()=>{
  const email = $('#email').value.trim(); const msg = $('#loginmsg');
  if(!/^[^@]+@[^@]+\.[^@]+$/.test(email)){ msg.className='msg err'; msg.textContent='Enter a valid email.'; return; }
  msg.className='msg'; msg.textContent='Sending…';
  const { error } = await sb.auth.signInWithOtp({ email, options:{ emailRedirectTo: location.href.split('#')[0] } });
  if(error){ msg.className='msg err'; msg.textContent=error.message; }
  else { msg.className='msg ok'; msg.textContent='Check your email for the sign-in link, then come back to this page.'; }
};
sb.auth.onAuthStateChange((ev)=>{ if(ev==='SIGNED_IN'){ history.replaceState(null,'',location.pathname); boot(); } });

// ---------- data ----------
async function load(){
  const { data, error } = await sb.rpc('hr_feature_board');
  if(error){ $('#board').innerHTML = `<p class="empty">Couldn't load the board: ${esc(error.message)}</p>`; show('app'); return; }
  DATA = (data||[]).map(r=>({ ...r, votes:Number(r.votes), top3:Number(r.top3), comments:Number(r.comments) }));
  show('app'); render();
}
const isPending = (f)=> f.source==='suggestion' && f.status==='idea' && !f.decided_at;

// ---------- render ----------
function render(){
  const total = DATA.length;
  const open = DATA.filter(f=>f.status==='idea').length;
  const building = DATA.filter(f=>f.status==='approved'||f.status==='in_progress').length;
  const shipped = DATA.filter(f=>f.status==='shipped').length;
  const myTop3 = DATA.filter(f=>f.i_top3).length;
  const pending = DATA.filter(isPending).length;

  $('#adminflag').innerHTML = IS_ADMIN ? `<span class="adminpill">Admin${pending?` · ${pending} pending`:''}</span>` : '';

  $('#kpis').innerHTML = [
    ['n', total, 'Ideas'],
    ['n', open, 'Open for votes'],
    ['n', building, 'Approved / building'],
    ['n', shipped, 'Shipped'],
    ['n', myTop3+' / 3', 'Your Top 3'],
  ].map(k=>`<div class="kpi"><div class="n">${k[1]}</div><div class="l">${k[2]}</div></div>`).join('');

  const counts = {
    all: DATA.filter(f=>f.status!=='shipped').length,
    idea: open, top3: myTop3,
    approved: DATA.filter(f=>f.status==='approved').length,
    in_progress: DATA.filter(f=>f.status==='in_progress').length,
    parked: DATA.filter(f=>f.status==='declined'||f.status==='deferred').length,
    pending,
  };
  const chips = [['all','All'],['idea','Open'],['top3','★ My Top 3'],['approved','Approved'],['in_progress','Building'],['parked','Parked']];
  if(IS_ADMIN) chips.push(['pending','Pending review']);
  $('#filters').innerHTML = chips.map(([k,l])=>`<button class="chip ${k==='top3'?'top':''} ${curFilter===k?'active':''}" data-f="${k}">${l}${counts[k]!=null?` <span class="c">${counts[k]}</span>`:''}</button>`).join('');
  $('#filters').querySelectorAll('.chip').forEach(c=>c.onclick=()=>{ curFilter=c.dataset.f; render(); });

  let list = DATA.slice().filter(f=>f.status!=='shipped');
  if(curFilter==='idea') list = list.filter(f=>f.status==='idea');
  else if(curFilter==='top3') list = list.filter(f=>f.i_top3);
  else if(curFilter==='approved') list = list.filter(f=>f.status==='approved');
  else if(curFilter==='in_progress') list = list.filter(f=>f.status==='in_progress');
  else if(curFilter==='parked') list = list.filter(f=>f.status==='declined'||f.status==='deferred');
  else if(curFilter==='pending') list = list.filter(isPending);
  list.sort((a,b)=> b.top3-a.top3 || b.votes-a.votes || new Date(a.created_at)-new Date(b.created_at));

  $('#board').innerHTML = list.length ? list.map(card).join('') : `<p class="empty">Nothing here yet. ${curFilter==='all'?'Be the first to add an idea above.':'Try another filter.'}</p>`;

  const shippedList = DATA.filter(f=>f.status==='shipped').sort((a,b)=> new Date(b.shipped_at||b.decided_at)-new Date(a.shipped_at||a.decided_at));
  const ss = $('#shippedsec');
  ss.innerHTML = `<summary>✅ What we shipped (${shippedList.length})</summary>` + (shippedList.length ? shippedList.map(card).join('') : `<p class="empty">Nothing shipped yet — vote up what you want first.</p>`);

  bindCards();
}

function card(f){
  const sLabel = STATUS[f.status] || 'Open';
  const badges = [];
  if(isPending(f)) badges.push('<span class="badge new">Pending review</span>');
  else if(f.status!=='idea') badges.push(`<span class="badge ${f.status}">${sLabel}</span>`);
  if(f.category) badges.push(`<span class="badge cat">${esc(f.category)}</span>`);
  const cls = f.status==='shipped' ? 'shippedcard' : (isPending(f) ? 'pending' : '');
  const who = f.source==='suggestion' ? `<span>💡 suggested by ${esc(f.created_by_name||f.created_by||'a teammate')}</span>` : '';
  return `<div class="fcard ${cls}" data-id="${f.id}">
    <div class="votecol">
      <button class="votebtn ${f.i_voted?'on':''}" data-act="vote"><span class="vn">${f.votes}</span><span class="vl">${f.i_voted?'voted':'vote'}</span></button>
      <button class="top3btn ${f.i_top3?'on':''}" data-act="top3" title="Mark as one of your top 3">${f.i_top3?'★ Top 3':'☆ Top 3'}</button>
    </div>
    <div class="fbody">
      <div class="fhead"><span class="fttl">${esc(f.title)}</span> ${badges.join(' ')}</div>
      ${f.detail?`<div class="fdetail">${esc(f.detail)}</div>`:''}
      <div class="fmeta">
        ${f.top3?`<span class="top3tag">★ ${f.top3} in top-3</span>`:''}
        ${who}
        <button class="linkbtn" data-act="comments">💬 ${f.comments} ${f.comments===1?'comment':'comments'}</button>
      </div>
      ${f.admin_note?`<div class="adminnote"><b>Note from David</b><br>${esc(f.admin_note)}</div>`:''}
      <div class="comments hidden" data-box></div>
      ${IS_ADMIN?adminCtl(f):''}
    </div>
  </div>`;
}
function adminCtl(f){
  const btns = ['idea','approved','in_progress','shipped','deferred','declined']
    .map(s=>`<button class="setbtn ${f.status===s?'cur':''}" data-act="set" data-s="${s}">${STATUS[s]}</button>`).join('');
  return `<div class="admin">
    <div class="lbl">Admin — set status (the team sees this)</div>
    <div class="setbtns">${btns}<button class="setbtn del" data-act="del">Delete</button></div>
    <input class="noteinput" data-note placeholder="Optional note to the team (why, or when it'll land)…" value="${escAttr(f.admin_note||'')}">
  </div>`;
}

function bindCards(){
  document.querySelectorAll('.fcard').forEach(cardEl=>{
    const id = Number(cardEl.dataset.id);
    cardEl.querySelectorAll('[data-act]').forEach(el=>{
      el.onclick = ()=>handle(el.dataset.act, id, cardEl, el);
    });
  });
}
async function handle(act, id, cardEl, el){
  const f = DATA.find(x=>x.id===id); if(!f) return;
  if(act==='vote'){ await rpc('hr_feature_vote',{p_feature_id:id,p_on:!f.i_voted}); await load(); }
  else if(act==='top3'){
    const { error } = await sb.rpc('hr_feature_top3',{p_feature_id:id,p_on:!f.i_top3});
    if(error){ alert(error.message.includes('top3_limit') ? "You've used all 3 of your Top-3 picks. Un-star one first." : error.message); return; }
    await load();
  }
  else if(act==='comments'){ toggleComments(id, cardEl); }
  else if(act==='set'){ await rpc('hr_feature_decide',{p_feature_id:id,p_status:el.dataset.s,p_note:cardEl.querySelector('[data-note]').value||''}); await load(); }
  else if(act==='del'){ if(confirm('Delete this idea for everyone? This cannot be undone.')){ await rpc('hr_feature_delete',{p_feature_id:id}); await load(); } }
}
async function rpc(fn, args){ const { error } = await sb.rpc(fn,args); if(error) alert(error.message); }

async function toggleComments(id, cardEl){
  const box = cardEl.querySelector('[data-box]');
  if(!box.classList.contains('hidden')){ box.classList.add('hidden'); return; }
  box.classList.remove('hidden'); box.innerHTML = '<p class="empty">Loading…</p>';
  const { data, error } = await sb.rpc('hr_feature_comments',{p_feature_id:id});
  const rows = data||[];
  const list = rows.length ? rows.map(c=>`<div class="cmt"><span class="cwho">${esc(c.author_name||c.author_email)}</span> <span class="cwhen">· ${new Date(c.created_at).toLocaleDateString('en-CA')}</span><br>${esc(c.body)}</div>`).join('') : '<p class="empty">No comments yet.</p>';
  box.innerHTML = (error?`<p class="empty">${esc(error.message)}</p>`:list) +
    `<div class="cmtform"><input data-ci maxlength="2000" placeholder="Add a comment…"><button class="btn" data-cadd>Post</button></div>`;
  box.querySelector('[data-cadd]').onclick = async ()=>{
    const inp = box.querySelector('[data-ci]'); const v = inp.value.trim(); if(!v) return;
    inp.disabled = true;
    const { error:e2 } = await sb.rpc('hr_feature_comment',{p_feature_id:id,p_body:v});
    if(e2){ alert(e2.message); inp.disabled=false; return; }
    await load();
    const again = document.querySelector(`.fcard[data-id="${id}"]`); if(again) toggleComments(id, again);
  };
}

// ---------- suggest ----------
$('#s_submit').onclick = async ()=>{
  const title = $('#s_title').value.trim(), detail = $('#s_detail').value.trim(), msg = $('#s_msg');
  if(!title){ msg.className='msg err'; msg.textContent='Give it a short title.'; return; }
  $('#s_submit').disabled = true; msg.className='msg'; msg.textContent='Submitting…';
  const { error } = await sb.rpc('hr_feature_suggest',{p_title:title,p_detail:detail});
  if(error){ msg.className='msg err'; msg.textContent=error.message; $('#s_submit').disabled=false; return; }
  try{ await sb.functions.invoke('hr-notify',{ body:{ title, detail, suggested_by:ME, url:location.href.split('#')[0] } }); }catch(e){ /* non-blocking */ }
  $('#s_title').value=''; $('#s_detail').value='';
  msg.className='msg ok'; msg.textContent='Thanks! It’s posted and sent to David for review.';
  $('#s_submit').disabled = false;
  await load();
};

$('#foot').innerHTML = 'Internal HR tool · Feature Review &amp; Suggestions. Votes and ideas are visible to the HR team; every suggestion is reviewed and approved by David before anything changes. — Fluidseal HR Portal';
boot();
