const SUPA_URL = "https://hnmbjqhxvxakhdzgetxw.supabase.co";
const SUPA_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhubWJqcWh4dnhha2hkemdldHh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjUzNjQsImV4cCI6MjA5NTkwMTM2NH0.GSWI113EQ6ZaA1n_lxECqEmc952q14-tZ7dacZNbZf0";
const sb = supabase.createClient(SUPA_URL, SUPA_ANON);
let D=null, WHO=null;
const ORG='https://fluidseal.crm.dynamics.com/main.aspx?pagetype=entityrecord&etn=';
// Dashboards, their territory buttons and per-person settings come from the server (hr.territory_config 'people'),
// so no names or assignments live in this public file.
let ALLPEOPLE=[];
let PEOPLE=ALLPEOPLE, P=null, OPT=null, VIEW={ent:'acc',flag:'all'}, SORT=null, FILT={}, LIMIT=150, LAST=null;
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>{v=Math.round(v||0);return (v<0?'−$':'$')+Math.abs(v).toLocaleString('en-CA')};
const mk=v=>Math.abs(v)>=1e6?'$'+(v/1e6).toFixed(2)+'M':Math.abs(v)>=1e4?'$'+Math.round(v/1e3).toLocaleString('en-CA')+'K':money(v);
let TODAY='', T0=null, FYS='', FYL='';
const days=s=>s?Math.round((T0-new Date(s+'T12:00:00'))/864e5):null;
const pct=(a,b)=>b?Math.round(100*a/b):null;
const nm=k=>D.names[k]||(k&&k.startsWith('u:')?k.slice(2):k||'');
const link=(etn,id,txt)=>id?`<a href="${ORG}${etn}&id=${esc(id)}" target="_blank" rel="noopener">${esc(txt)}</a>`:esc(txt);
const STL={good:'On target',warn:'Close',crit:'Needs action',info:'Context'};
const pill=s=>`<span class="pill ${s}"><i></i>${STL[s]}</span>`;
const st=(v,g,w,hi=true)=>v==null?'info':hi?(v>=g?'good':v>=w?'warn':'crit'):(v<=g?'good':v<=w?'warn':'crit');
function scope(){const T=OPT[2];const inT=t=>T===null?true:T.includes(t);const pk=P.k==='all'?null:P.k;return {T,inT,pk};}

/* ---------- controls ---------- */
function renderControls(){
  $('#people').innerHTML=PEOPLE.map(p=>`<button class="chipbtn" id="p-${p.k}" data-p="${p.k}" aria-pressed="${p===P}">${esc(p.n)}</button>`).join('');
  $('#terrs').innerHTML=P.o.map(o=>`<button class="chipbtn sub" id="t-${P.k}-${o[0]}" data-o="${o[0]}" aria-pressed="${o===OPT}">${esc(o[1])}</button>`).join('');
  document.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{P=PEOPLE.find(x=>x.k===b.dataset.p);OPT=P.o[0];save();renderAll();});
  document.querySelectorAll('[data-o]').forEach(b=>b.onclick=()=>{OPT=P.o.find(o=>o[0]===b.dataset.o);save();renderAll();});
  $('#whoname').textContent=P.n; $('#whotext').textContent=P.d+(OPT[2]?' · showing '+OPT[1]:'');
}
function save(){try{localStorage.setItem('terr1',JSON.stringify({p:P.k,o:OPT[0]}))}catch(e){}}

/* ---------- data views ---------- */
function data(){
  const {inT,pk}=scope();
  const acc=D.acc.filter(a=>inT(a.t));
  /* The person's own records (Manager or owner) join in on their full view only; a single territory button shows that territory's accounts alone. */
  const own=pk&&OPT===P.o[0];
  const qOpen=D.q.filter(x=>x.s==='o'&&(inT(x.t)||(own&&x.m===pk)));
  const mOpen=D.m.filter(x=>x.op&&(inT(x.t)||(own&&x.o===pk)));
  const cOpen=D.cs.filter(x=>x.op&&(inT(x.t)||(own&&x.o===pk)));
  return {acc,qOpen,mOpen,cOpen};
}
const AFLAGS=[['all','Every account with an action','Accounts','any next best action'],['atrisk','Recover at-risk accounts','Accounts','A or B, down 25%+, no touch in 30 days'],['expq','Chase expired quotes','Accounts','open quotes past expiry'],['ntover','Next Touch overdue','Accounts','A or B accounts'],['neglect','Neglected buyers','Accounts','no touch of any kind in 90 days'],['lapsed','Win back','Accounts','bought $2,500+ last year, nothing this year'],['agedcase','Aged cases','Accounts','case open over 30 days'],['stalemine','Stale Mining','Accounts','Mining older than 90 days'],['zero','$0 accounts','Accounts','no sales in 12 months, no touch in 6']];
const OTHER=[['q','exp','Quotes past expiry','Quotes','still open'],['q','sent7','Quotes sent over 7 days','Quotes','status 4 or 5, not yet expired'],['q','big','Open quotes $10K and over','Quotes','largest first'],['m','old','Mining over 90 days','Mining','open, oldest first'],['m','all','All open Mining','Mining','owned or on the accounts'],['c','old','Cases over 30 days','Cases','open, oldest first'],['c','fu','Follow Up By passed','Cases','open cases']];
function counts(dv){
  const c={};for(const f of AFLAGS) c['acc:'+f[0]]=dv.acc.filter(a=>a.fl&&(f[0]==='all'||a.fl.includes(f[0]))).length;
  c['q:exp']=dv.qOpen.filter(x=>x.e&&x.e<TODAY).length; c['q:sent7']=dv.qOpen.filter(x=>(x.sl||'').match(/^(4|5)/)&&days(x.c)>7&&!(x.e&&x.e<TODAY)).length; c['q:big']=dv.qOpen.filter(x=>x.v>=10000).length;
  c['m:old']=dv.mOpen.filter(x=>days(x.c)>90).length; c['m:all']=dv.mOpen.length;
  c['c:old']=dv.cOpen.filter(x=>days(x.c)>30).length; c['c:fu']=dv.cOpen.filter(x=>x.f&&x.f<TODAY).length;
  return c;
}
function renderButtons(dv){
  const c=counts(dv);const sev=(n,crit,warn)=>n>=crit?'crit':n>=warn?'warn':'good';
  let h=`<div class="grp">Accounts</div>`;
  for(const f of AFLAGS){const key='acc:'+f[0],n=c[key];h+=`<button class="abtn ${f[0]==='all'?'':sev(n,10,1)}" id="b-acc-${f[0]}" data-ent="acc" data-flag="${f[0]}" aria-pressed="${VIEW.ent==='acc'&&VIEW.flag===f[0]}"><span class="c">${n.toLocaleString('en-CA')}</span><span class="l">${f[1]}</span><span class="s">${f[3]}</span></button>`;}
  h+=`<div class="grp">Quotes · Mining · Cases</div>`;
  for(const o of OTHER){const key=o[0]+':'+o[1],n=c[key];h+=`<button class="abtn ${o[1]==='all'?'':sev(n,10,1)}" id="b-${o[0]}-${o[1]}" data-ent="${o[0]}" data-flag="${o[1]}" aria-pressed="${VIEW.ent===o[0]&&VIEW.flag===o[1]}"><span class="c">${n.toLocaleString('en-CA')}</span><span class="l">${o[2]}</span><span class="s">${o[4]}</span></button>`;}
  $('#abtns').innerHTML=h;
  document.querySelectorAll('.abtn').forEach(b=>b.onclick=()=>{VIEW={ent:b.dataset.ent,flag:b.dataset.flag};SORT=null;FILT={};LIMIT=150;renderButtons(data());renderTable();});
}
/* ---------- action table ---------- */
const COLS={
 acc:[['act','Next best action','text',r=>`<div class="actcell">${esc(r.act||'')}</div>`],['n','Account','text',r=>`${link('account',r.i,r.n)}<div class="note">${esc(r.c||'')}${r.ci?' · '+esc(r.ci):''}</div>`],['t','Territory','cat',r=>r.t??'—'],['o','Owner','cat',r=>esc(nm(r.o))],['tr','Tier','cat',r=>r.tr==='D'?'$0':r.tr],['s','Status','cat',r=>esc(r.s||'')],['l','Sales 12 mo','num',r=>money(r.l)],['chg','Change vs last year','num',r=>{const c=(r.f6||0)-(r.f5||0);return `<span class="${c<0?'neg':'pos'}">${c>=0?'+':''}${money(c)}</span>`}],['lv','Last visit','date',r=>dcell(r.lv)],['lc','Last call','date',r=>dcell(r.lc)],['lt','Last Touch','date',r=>dcell(r.lt)],['nt','Next Touch','date',r=>dcell(r.nt,true)],['eq','Expired quotes','num',r=>r.eq?`${r.eq} · ${mk(r.ev)}`:''],['oc','Open cases','num',r=>r.oc||''],['om','Open Mining','num',r=>r.om||'']],
 q:[['p','Quote','text',r=>`${link('quote',r.i,r.p||'(no number)')}<div class="note">${esc(r.n)}</div>`],['a','Account','text',r=>link('account',r.ai,r.a)],['t','Territory','cat',r=>r.t??'—'],['m','Manager','cat',r=>esc(nm(r.m))],['k','Taker','cat',r=>esc(r.k)],['sl','Status','cat',r=>esc(r.sl)],['v','Value','num',r=>money(r.v)],['e','Expires','date',r=>dcell(r.e,true)],['pd','Days past expiry','num',r=>{const d=days(r.e);return d>0?`<span class="over">${d}</span>`:''}],['f','Manager email logged','cat',r=>r.f?'Yes':'No']],
 m:[['n','Mining record','text',r=>link('opportunity',r.i,r.n)],['a','Account','text',r=>link('account',r.ai,r.a)],['t','Territory','cat',r=>r.t??'—'],['o','Owner','cat',r=>esc(nm(r.o))],['s','Status','cat',r=>esc(r.s)],['c','Opened','date',r=>dcell(r.c)],['age','Age, days','num',r=>`<span class="${days(r.c)>90?'over':''}">${days(r.c)}</span>`],['v','Estimated value','num',r=>r.v?money(r.v):''],['q','Quote on the account within 60 days','cat',r=>r.q?'Yes':'No']],
 c:[['n','Case','text',r=>link('incident',r.i,r.n)],['a','Account','text',r=>link('account',r.ai,r.a)],['t','Territory','cat',r=>r.t??'—'],['o','Owner','cat',r=>esc(nm(r.o))],['k','Type','cat',r=>esc(r.k)],['s','Status','cat',r=>esc(r.s)],['c','Opened','date',r=>dcell(r.c)],['age','Age, days','num',r=>`<span class="${days(r.c)>30?'over':''}">${days(r.c)}</span>`],['f','Follow Up By','date',r=>dcell(r.f,true)]]
};
function dcell(s,future){if(!s) return '<span class="note">—</span>';const d=days(s);return `<span class="dt ${future&&d>0?'over':''}">${s}</span>`;}
function val(r,k){if(k==='chg') return (r.f6||0)-(r.f5||0); if(k==='age') return days(r.c); if(k==='pd') return days(r.e)||0; if(k==='o'||k==='m') return nm(r[k]); if(k==='tr') return r.tr==='D'?'$0':r.tr; if(k==='f'||k==='q') return r[k]?'Yes':'No'; return r[k];}
function rowsFor(){
  const dv=data();let rows,title;
  if(VIEW.ent==='acc'){const f=AFLAGS.find(x=>x[0]===VIEW.flag);rows=dv.acc.filter(a=>a.fl&&(VIEW.flag==='all'||a.fl.includes(VIEW.flag)));
    if(VIEW.flag!=='all'){rows=rows.map(a=>({...a,act:actFor(a,VIEW.flag)}));}
    rows.sort((a,b)=>(b.pr||0)-(a.pr||0)); title=f[1];}
  else if(VIEW.ent==='q'){rows=dv.qOpen.slice();const o=OTHER.find(x=>x[0]==='q'&&x[1]===VIEW.flag);title=o[2];
    if(VIEW.flag==='exp') rows=rows.filter(x=>x.e&&x.e<TODAY); if(VIEW.flag==='sent7') rows=rows.filter(x=>(x.sl||'').match(/^(4|5)/)&&days(x.c)>7&&!(x.e&&x.e<TODAY)); if(VIEW.flag==='big') rows=rows.filter(x=>x.v>=10000);
    rows.sort((a,b)=>b.v-a.v);}
  else if(VIEW.ent==='m'){rows=dv.mOpen.slice();title=OTHER.find(x=>x[0]==='m'&&x[1]===VIEW.flag)[2];if(VIEW.flag==='old') rows=rows.filter(x=>days(x.c)>90);rows.sort((a,b)=>a.c<b.c?-1:1);}
  else {rows=dv.cOpen.slice();title=OTHER.find(x=>x[0]==='c'&&x[1]===VIEW.flag)[2];if(VIEW.flag==='old') rows=rows.filter(x=>days(x.c)>30);if(VIEW.flag==='fu') rows=rows.filter(x=>x.f&&x.f<TODAY);rows.sort((a,b)=>a.c<b.c?-1:1);}
  return {rows,title};
}
function actFor(a,flag){
  if(flag==='atrisk'){const d=a.lv||a.lc;return `Visit or call: down ${Math.round(100*(1-(a.f6||0)/a.f5))}% (${money(a.f5-(a.f6||0))} below last year)${d?', last touch '+days(d)+' days ago':', no logged visit or call'}`;}
  if(flag==='expq') return `Chase or close ${a.eq} expired quote${a.eq>1?'s':''} (${money(a.ev)})`;
  if(flag==='ntover') return `Next Touch ${days(a.nt)} days overdue`;
  if(flag==='lapsed') return `Win back: ${money(a.f5)} last year, nothing this year`;
  if(flag==='agedcase') return `Close ${a.ac} case${a.ac>1?'s':''} open over 30 days`;
  if(flag==='stalemine') return `Move ${a.sm} Mining record${a.sm>1?'s':''} older than 90 days`;
  return a.act||'';
}
function renderTable(){
  const {rows,title}=rowsFor();const cols=COLS[VIEW.ent];
  let r=rows.filter(x=>cols.every(([k,,t])=>{const f=FILT[k];if(!f) return true;const v=val(x,k);if(t==='cat') return String(v??'—')===f;if(t==='num') return (Number(v)||0)>=Number(f);return String(v??'').toLowerCase().includes(f.toLowerCase());}));
  if(SORT){const [k,dir]=SORT;r.sort((a,b)=>{let x=val(a,k),y=val(b,k);if(x==null||x==='') return 1;if(y==null||y==='') return -1;return (x>y?1:x<y?-1:0)*dir;});}
  LAST={rows:r,cols,title};
  $('#ttitle').textContent=title; $('#tcount').textContent=`${r.length.toLocaleString('en-CA')} rows${r.length>LIMIT?' · showing '+LIMIT:''}`;
  const uniq=k=>[...new Set(rows.map(x=>String(val(x,k)??'—')))].sort();
  let h='<thead><tr>'+cols.map(([k,l,t])=>`<th class="sort ${t==='num'?'num':''}" data-k="${k}">${l}<span class="ar">${SORT&&SORT[0]===k?(SORT[1]>0?'▲':'▼'):''}</span></th>`).join('')+'</tr><tr class="f">'+cols.map(([k,l,t])=>{
    const id=`f-${VIEW.ent}-${k}`;const v=FILT[k]||'';
    if(t==='cat') return `<th><select id="${id}" data-fk="${k}" aria-label="Filter ${l}"><option value="">All</option>${uniq(k).map(u=>`<option ${u===v?'selected':''}>${esc(u)}</option>`).join('')}</select></th>`;
    if(t==='num') return `<th><input id="${id}" data-fk="${k}" inputmode="numeric" placeholder="at least" value="${esc(v)}" aria-label="Minimum ${l}"></th>`;
    if(t==='text') return `<th><input id="${id}" data-fk="${k}" placeholder="contains" value="${esc(v)}" aria-label="Filter ${l}"></th>`;
    return '<th></th>';}).join('')+'</tr></thead><tbody>';
  h+=r.slice(0,LIMIT).map(x=>'<tr>'+cols.map(([k,,t,f])=>`<td class="${t==='num'?'num':''}">${f(x)}</td>`).join('')+'</tr>').join('')||`<tr><td colspan="${cols.length}" class="note">Nothing here for this selection.</td></tr>`;
  $('#atable').innerHTML=h+'</tbody>';
  $('#tmore').innerHTML=r.length>LIMIT?`<button id="morebtn">Show 150 more</button><span class="note">Filters and sorting apply to every row, not only the ones shown.</span>`:'';
  if($('#morebtn')) $('#morebtn').onclick=()=>{LIMIT+=150;renderTable();};
  document.querySelectorAll('#atable th.sort').forEach(th=>th.onclick=()=>{const k=th.dataset.k;SORT=SORT&&SORT[0]===k?[k,-SORT[1]]:[k,COLS[VIEW.ent].find(c=>c[0]===k)[2]==='num'?-1:1];renderTable();});
  document.querySelectorAll('#atable [data-fk]').forEach(el=>{const ev=el.tagName==='SELECT'?'change':'input';el.addEventListener(ev,()=>{FILT[el.dataset.fk]=el.value;clearTimeout(window.__ft);window.__ft=setTimeout(()=>{const id=el.id,pos=el.selectionStart;renderTable();const n=document.getElementById(id);if(n){n.focus();if(pos!=null&&n.setSelectionRange)try{n.setSelectionRange(pos,pos)}catch(e){}}},ev==='input'?250:0);});});
}
/* ---------- scorecard ---------- */
function kpis(){
  const {T,inT,pk}=scope();const dv=data();const acc=dv.acc;
  const fl=Object.entries(D.fl).filter(([t])=>T===null||T.includes(+t));
  const f26=fl.reduce((s,[,v])=>s+v.m26.reduce((a,b)=>a+b,0),0), f25=fl.reduce((s,[,v])=>s+v.m25.reduce((a,b)=>a+b,0),0);
  const LI=D.fy.months.length-1; const s26=fl.reduce((s,[,v])=>s+v.m26[LI],0), s25=fl.reduce((s,[,v])=>s+v.m25[LI],0);
  const tier=t=>acc.filter(a=>a.tr===t);const A=tier('A'),B=tier('B');
  const vis=(a,n)=>{const d=[a.lv,a.lc].filter(Boolean).sort().pop();return d&&days(d)<=n;};
  const atrisk=acc.filter(a=>a.fl&&a.fl.includes('atrisk')),neg=acc.filter(a=>a.fl&&a.fl.includes('neglect')),lap=acc.filter(a=>a.fl&&a.fl.includes('lapsed'));
  const ntov=[...A,...B].filter(a=>a.nt&&a.nt<TODAY).length;
  const act=pk?D.act[pk]:null;
  const qMine=D.q.filter(x=>pk?x.m===pk:inT(x.t)); const fy=x=>x.c>=FYS;
  const qm=qMine.filter(fy),won=qm.filter(x=>x.s==='w'),lost=qm.filter(x=>x.s==='l');
  const qOnAcc=D.q.filter(x=>x.s==='o'&&inT(x.t)&&(!pk||x.m!==pk)&&x.e&&x.e<TODAY);
  const qMineExp=qMine.filter(x=>x.s==='o'&&x.e&&x.e<TODAY);
  const mAll=D.m.filter(x=>pk?x.cb===pk:inT(x.t)),mFy=mAll.filter(x=>x.c>=FYS),mOpen=D.m.filter(x=>x.op&&(pk?x.o===pk:inT(x.t)));
  const cOwn=D.cs.filter(x=>pk&&x.o===pk&&x.op),cAcc=D.cs.filter(x=>inT(x.t)&&(!pk||x.o!==pk));
  const svc=cAcc.filter(x=>x.k==='Service issue'&&x.c>=FYS&&x.rd!=null);
  const g=f25?Math.round(1000*(f26-f25)/f25)/10:null, gs=s25?Math.round(100*(s26-s25)/s25):null;
  const R=[];const add=(p,l,v,sub,s,tg,bench,url,cap)=>R.push({p,l,v,sub,s,tg,bench,url,cap});
  add('Results',`Sales, ${mlab(D.fy.months[0])} to ${mlab(D.fy.months[D.fy.months.length-1])} vs same months last year`,g==null?'—':(g>=0?'+':'')+g+'%',`${mk(f26)} vs ${mk(f25)}`,st(g,5,0),'+5% (budget file 002)');
  add('Results',`${mlab(D.fy.last)} invoiced vs ${mlab(D.fy.last)} last year`,gs==null?'—':(gs>=0?'+':'')+gs+'%',`${mk(s26)} vs ${mk(s25)}`,'info','Context');
  add('Results','Buying accounts (sales in the last 12 months)',acc.filter(a=>a.l>0).length.toLocaleString('en-CA'),`of ${acc.length.toLocaleString('en-CA')} accounts`,'info','Grow each year','50 to 75 accounts per field rep is the distribution norm','https://distributionstrategy.com/wp-content/uploads/2024/10/Distribution-Strategy-Group-2021-State-of-Sales-FINAL.pdf');
  add('Results','At-risk A/B accounts with no touch in 30 days',atrisk.length,`${mk(atrisk.reduce((s,a)=>s+a.f5-(a.f6||0),0))} below last year`,st(atrisk.length,0,10,false),'0','Declining spend is the early churn signal','https://www.proton.ai/blog/distribution-churn-prediction');
  add('Results','Lapsed accounts (bought $2,500+ last year, nothing this year)',lap.length,`${mk(lap.reduce((s,a)=>s+a.f5,0))} last year`,st(lap.length,0,3,false),'0');
  const a30=pct(A.filter(a=>vis(a,30)).length,A.length),b90=pct(B.filter(a=>vis(a,90)).length,B.length);
  add('Account coverage','A accounts visited or called in 30 days',a30==null?'—':a30+'%',`${A.filter(a=>vis(a,30)).length} of ${A.length}`,st(a30,80,50),'80%','A accounts weekly to monthly','https://mapmycustomers.com/blog/the-definitive-guide-to-sales-territory-management','cap');
  add('Account coverage','B accounts visited or called in 90 days',b90==null?'—':b90+'%',`${B.filter(a=>vis(a,90)).length} of ${B.length}`,st(b90,80,50),'80%','B accounts monthly to quarterly','https://mapmycustomers.com/blog/the-definitive-guide-to-sales-territory-management','cap');
  const ntp=pct(ntov,A.length+B.length);
  add('Account coverage','Next Touch overdue on A and B accounts',ntp==null?'—':ntp+'%',`${ntov} of ${A.length+B.length}`,st(ntp,10,25,false),'10% or less','Top performers keep a dated next step','https://5242563.fs1.hubspotusercontent-na1.net/hubfs/5242563/2024%20B2B%20Sales%20Benchmarks%20-%20Ebsta%20x%20Pavilion.pdf','cap');
  add('Account coverage','Neglected buyers (no touch of any kind in 90 days)',neg.length,`${mk(neg.reduce((s,a)=>s+a.l,0))} sales in 12 months`,st(neg.length,0,10,false),'0');
  add('Account coverage','$0 accounts in the territory',acc.filter(a=>a.tr==='D').length.toLocaleString('en-CA'),'no sales in 12 months','info','Reassign or plan','More than 20% of field accounts can move to lower-cost coverage','https://www.inddist.com/sales/article/22889299/embrace-the-rise-of-inside-sales');
  if(act){const wa=act.wa.slice(0,12).reduce((a,b)=>a+b,0)/12,wc=act.wc.slice(0,12).reduce((a,b)=>a+b,0)/12;
    add('Activity','Appointments per week (last 12 weeks)',wa.toFixed(1),`${act.fa} since ${FYL}`,P.tgt?st(wa,15,10):'info',P.tgt?'15 a week':'Context','3 to 4 face-to-face contacts a day (consultant estimate)','https://distributionstrategy.com/wp-content/uploads/2024/10/InsideSales-Value-Creation-Distribution-Strategy-Group.pdf');
    add('Activity','Completed phone calls per week (last 12 weeks)',wc.toFixed(1),`${act.cm} since ${FYL} · ${act.co} still open`,'info','Context');
    const lp=pct(act.la,act.fa);add('Activity','Appointments linked to an account',lp==null?'—':lp+'%',act.fa?`${act.la} of ${act.fa}`:'no appointments',act.fa?st(lp,95,70):'info','100%','','','cap');
    add('Activity','Past appointments still open',act.so,'status Scheduled, date passed',st(act.so,0,10,false),'0','','','cap');}
  const mp=Math.round(10*mFy.length/11)/10,mcv=mFy.filter(x=>x.cv).length,mq=pct(mcv,mFy.length),mo=mOpen.filter(x=>days(x.c)>90).length;
  add('Mining to quote','Opportunities opened per month (Mining, converted or not)',mp,`${mFy.length} since ${FYL}`,P.tgt?st(mp,8,5):'info','8 a month (proposed)');
  add('Mining to quote','Converted into a quote or order',mq==null?'—':mq+'%',`${mcv} of ${mFy.length} opened since ${FYL}`,mFy.length?st(mq,50,35):'info','50% (proposed)');
  add('Mining to quote','Open Mining older than 90 days',mo,`of ${mOpen.length} open`,st(mo,0,10,false),'0 (convert, decline or expire)','','','cap');
  add('Quote follow-up',pk?'Quotes where '+P.n.split(' ')[0]+' is Manager':'Quotes in these territories',qm.length.toLocaleString('en-CA'),`${mk(qm.reduce((s,x)=>s+x.v,0))} since ${FYL}`,'info','Context');
  const wn=pct(won.length,won.length+lost.length),wv=pct(won.reduce((s,x)=>s+x.v,0),won.concat(lost).reduce((s,x)=>s+x.v,0));
  add('Quote follow-up','Win rate on closed quotes',wn==null?'—':wn+'%',`by value ${wv??'—'}% · ${won.length} won, ${lost.length} lost or cancelled`,'info','At or above own 12 months','Average 47%, top sellers 62% (cross-industry)','https://www.rainsalestraining.com/blog/average-sales-win-rates-how-do-you-compare');
  if(pk) add('Quote follow-up','Open quotes past expiry, '+P.n.split(' ')[0]+' is Manager',qMineExp.length,mk(qMineExp.reduce((s,x)=>s+x.v,0)),st(qMineExp.length,0,5,false),'0');
  add('Quote follow-up','Open quotes past expiry on accounts in these territories',qOnAcc.length,mk(qOnAcc.reduce((s,x)=>s+x.v,0)),st(qOnAcc.length,0,10,false),'0');
  if(pk&&P.fu){const t=pct(qm.filter(x=>x.f).length,qm.length);add('Quote follow-up','Follow-up email logged on quotes brought in',t==null?'—':t+'%',`${qm.filter(x=>x.f).length} of ${qm.length}`,st(t,90,50),'100% within 3 working days','Structured follow-up lifts close rates 25 to 30% (vendor claim)','https://gosmp.com/top-distribution-sales-priority-closing-more-open-bids-and-quotes/','cap');}
  if(pk) add('Service cases','Open cases owned, older than 30 days',cOwn.filter(x=>days(x.c)>30).length,`of ${cOwn.length} open`,st(cOwn.filter(x=>days(x.c)>30).length,0,3,false),'0');
  const ca90=cAcc.filter(x=>x.op&&days(x.c)>90).length;add('Service cases','Open cases on these accounts, older than 90 days',ca90,`of ${cAcc.filter(x=>x.op).length} open`,st(ca90,0,5,false),'0');
  const s30=pct(svc.filter(x=>x.rd<=30).length,svc.length);add('Service cases','Service issues resolved within 30 days',s30==null?'—':s30+'%',`${svc.length} resolved since ${FYL}`,svc.length?st(s30,90,75):'info','90% (board item 88)');
  return R;
}
function renderKPI(){
  const R=kpis();let last='',h=`<thead><tr><th style="min-width:260px">Measure</th><th style="min-width:170px">${esc(P.n)}${OPT[2]?' · '+esc(OPT[1]):''}</th><th style="min-width:140px">Target</th><th style="min-width:220px">Benchmark</th></tr></thead><tbody>`;
  for(const r of R){if(r.p!==last){h+=`<tr class="pillar"><td colspan="4"><span>■</span> ${esc(r.p)}</td></tr>`;last=r.p;}
    h+=`<tr><td><b>${esc(r.l)}</b>${r.cap?' <span class="tag">Capture</span>':''}</td><td><div class="kv"><div class="row"><span class="v">${esc(String(r.v))}</span>${pill(r.s)}</div><div class="s">${esc(r.sub)}</div></div></td><td>${esc(r.tg)}</td><td style="font-size:12px">${r.bench?(r.url?`<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.bench)}</a>`:esc(r.bench)):'<span class="note">No published benchmark</span>'}</td></tr>`;}
  $('#kpi').innerHTML=h+'</tbody>';
}
function renderTiers(){
  const acc=data().acc;const vis=(a,n)=>{const d=[a.lv,a.lc].filter(Boolean).sort().pop();return d&&days(d)<=n;};
  const rows=[['A','A · top 20%'],['B','B · next 30%'],['C','C · other buyers'],['D','$0 · no sales']].map(([k,l])=>{const t=acc.filter(a=>a.tr===k);const n=t.length;const pc=x=>n?Math.round(100*x/n)+'%':'—';const nt=t.filter(a=>a.nt&&a.nt<TODAY).length;
    return `<tr><td><b>${l}</b></td><td class="num">${n.toLocaleString('en-CA')}</td><td class="num">${mk(t.reduce((s,a)=>s+a.l,0))}</td><td class="num">${pc(t.filter(a=>vis(a,30)).length)}</td><td class="num">${pc(t.filter(a=>vis(a,90)).length)}</td><td class="num">${pc(t.filter(a=>a.lt&&days(a.lt)<=90).length)}</td><td class="num ${n&&nt/n>.25?'over':''}">${pc(nt)}</td></tr>`}).join('');
  const sts={};acc.forEach(a=>{const s=a.s||'(blank)';sts[s]=(sts[s]||0)+1});
  $('#tiertbl').innerHTML=`<thead><tr><th>Tier</th><th class="num">Accounts</th><th class="num">Sales 12 mo</th><th class="num">Visited or called 30 d</th><th class="num">90 d</th><th class="num">Last Touch 90 d</th><th class="num">Next Touch overdue</th></tr></thead><tbody>${rows}<tr><td colspan="7" class="note">Account Status: ${Object.entries(sts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<span class="chip">${esc(k)} ${v}</span>`).join(' ')}</td></tr></tbody>`;
}
/* ---------- charts ---------- */
function tipAt(box,html,x,y){let t=box.querySelector('.tip');if(!t){t=document.createElement('div');t.className='tip';box.appendChild(t);}t.innerHTML=html;t.hidden=false;const bw=box.clientWidth;t.style.left=Math.max(0,Math.min(bw-t.offsetWidth,x+12))+'px';t.style.top=Math.max(0,y-10)+'px';}
function tipOff(box){const t=box.querySelector('.tip');if(t)t.hidden=true;}
function renderActivity(){
  const pk=scope().pk;const box=$('#apchart');
  if(!pk){$('#actlede').textContent='Pick a person to see their appointments and calls.';box.innerHTML='';$('#apleg').innerHTML='';$('#acttbl').innerHTML='';return;}
  const a=D.act[pk];if(!a){$('#actlede').textContent='No activity records in Dynamics for this person.';box.innerHTML='';$('#apleg').innerHTML='';$('#acttbl').innerHTML='';return;}$('#actlede').textContent='Appointments and completed phone calls per week owned by '+P.n+'. The shaded band is 15 to 20 face-to-face contacts a week, the field-rep norm.';
  const L=D.w13,n=L.length,W=860,H=280,ml=40,mr=120,mt=14,mb=36;const ser=[['Appointments',a.wa,'var(--s1)'],['Completed calls',a.wc,'var(--s2)']];
  const ymax=Math.max(25,Math.ceil(Math.max(...a.wa,...a.wc)/5)*5);const x=i=>ml+i*(W-ml-mr)/(n-1),y=v=>mt+(H-mt-mb)*(1-v/ymax);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly appointments and calls"><rect x="${ml}" y="${y(20)}" width="${W-ml-mr}" height="${y(15)-y(20)}" fill="var(--band)"/>`;
  const step=ymax>60?20:ymax>30?10:5;
  for(let t=0;t<=ymax;t+=step) s+=`<line x1="${ml}" x2="${W-mr}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line2)"/><text x="${ml-8}" y="${y(t)+4}" text-anchor="end" font-size="11" fill="var(--muted)">${t}</text>`;
  L.forEach((l,i)=>{if(i%2===0||i===n-1){const d=new Date(l+'T12:00:00');s+=`<text x="${x(i)}" y="${H-mb+18}" text-anchor="middle" font-size="11" fill="var(--muted)">${i===n-1?'This week':d.toLocaleDateString('en-CA',{month:'short',day:'numeric'})}</text>`;}});
  s+=`<line x1="${ml}" x2="${W-mr}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)"/>`;
  ser.forEach(([lab,v,col],j)=>{s+=`<polyline fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${v.map((d,i)=>x(i)+','+y(d)).join(' ')}"/><circle cx="${x(n-1)}" cy="${y(v[n-1])}" r="4" fill="${col}" stroke="var(--surface)" stroke-width="2"/><text x="${x(n-1)+10}" y="${y(v[n-1])+(j?12:-4)}" font-size="12" font-weight="600" fill="var(--fg)">${lab} · avg ${(v.slice(0,12).reduce((p,q)=>p+q,0)/12).toFixed(1)}</text>`;});
  s+=`<line id="xh" x1="0" x2="0" y1="${mt}" y2="${H-mb}" stroke="var(--muted)" visibility="hidden"/><rect x="${ml}" y="${mt}" width="${W-ml-mr}" height="${H-mt-mb}" fill="transparent" id="aphit"/></svg>`;
  box.innerHTML=s;$('#apleg').innerHTML=ser.map(([l,,c])=>`<span><span class="sw" style="background:${c}"></span>${l}</span>`).join('')+`<span><span class="bandsw"></span>15–20 a week</span>`;
  const svg=box.querySelector('svg'),xh=box.querySelector('#xh');
  box.querySelector('#aphit').addEventListener('pointermove',ev=>{const rc=svg.getBoundingClientRect();let i=Math.round(((ev.clientX-rc.left)*W/rc.width-ml)/((W-ml-mr)/(n-1)));i=Math.max(0,Math.min(n-1,i));xh.setAttribute('x1',x(i));xh.setAttribute('x2',x(i));xh.setAttribute('visibility','visible');
    tipAt(box,`<div class="h">Week of ${new Date(L[i]+'T12:00:00').toLocaleDateString('en-CA',{month:'short',day:'numeric'})}</div><div><b>${a.wa[i]}</b> appointments</div><div><b>${a.wc[i]}</b> completed calls</div>`,x(i)*rc.width/W,ev.clientY-rc.top);});
  box.querySelector('#aphit').addEventListener('pointerleave',()=>{xh.setAttribute('visibility','hidden');tipOff(box);});
  const rows=[[`Appointments since ${FYL}`,a.fa],['Linked to a record (Regarding)',a.fa?`${a.la} (${pct(a.la,a.fa)}%)`:'—'],['Linked or matched to an account',a.fa?`${a.ma} (${pct(a.ma,a.fa)}%)`:'—'],['Past appointments still open',a.so],['Booked ahead',a.up],[`Completed phone calls since ${FYL}`,a.cm],['Phone calls still open',a.co],[`Phone calls cancelled since ${FYL}`,a.cx+(P.cxnote&&a.cx>=(P.cxmin||0)?' <span class="note">('+esc(P.cxnote)+')</span>':'')],[`Emails sent from Dynamics since ${FYL}`,a.em]];
  $('#acttbl').innerHTML='<thead><tr><th>Activity</th><th class="num">'+esc(P.n)+'</th></tr></thead><tbody>'+rows.map(([l,v])=>`<tr><td>${l}</td><td class="num">${v}</td></tr>`).join('')+'</tbody>';
}
let MONTHS=[];
function renderOrders(){
  const {T}=scope();const ts=Object.keys(D.ord).filter(t=>T===null||T.includes(+t));
  const sumD=(a,b)=>{let n=0,v=0;for(const t of ts){for(const [d,x] of Object.entries(D.ord[t].d)) if(d>=a&&d<=b){n+=x[0];v+=x[1];}}return [n,v];};
  const sumM=m=>{let n=0,v=0;for(const t of ts){const x=D.ord[t].m[m];if(x){n+=x[0];v+=x[1];}}return [n,v];};
  const flM=i=>i<0?0:Object.entries(D.fl).filter(([t])=>T===null||T.includes(+t)).reduce((s,[,v])=>s+(v.m26[i]||0),0);
  const fi=m=>D.fy.months.indexOf(m); const L1=D.fy.last, L0=D.fy.months[D.fy.months.length-2]||L1; const mon=monday(TODAY);
  const tile=(l,v,s)=>`<div class="tile"><div class="l">${l}</div><div class="n">${mk(v[1])}</div><div class="s">${v[0]} orders${s?' · '+s:''}</div></div>`;
  $('#ordtiles').innerHTML=tile('Today, so far',sumD(TODAY,TODAY))+tile('Yesterday',sumD(addD(TODAY,-1),addD(TODAY,-1)))+tile('This week',sumD(mon,TODAY),'Monday to today')+tile('Last week',sumD(addD(mon,-7),addD(mon,-1)))+tile(mlab(L1),sumM(L1),'invoiced '+mk(flM(fi(L1))))+tile(mlab(L0),sumM(L0),'invoiced '+mk(flM(fi(L0))));
  $('#ordtitle').textContent=`Orders in Dynamics against invoiced sales, ${mlab(MONTHS[0])} to ${mlab(MONTHS[MONTHS.length-1])}`;
  const vals=MONTHS.map(m=>[sumM(m)[1],flM(fi(m)),sumM(m)[0]]);
  const box=$('#ordchart'),W=860,H=250,ml=52,mr=10,mt=12,mb=30;const mx=Math.max(1,...vals.flatMap(v=>[v[0],v[1]]));const ymax=Math.ceil(mx/(mx>1e6?250000:50000))*(mx>1e6?250000:50000);
  const bw=(W-ml-mr)/MONTHS.length,y=v=>mt+(H-mt-mb)*(1-v/ymax);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Orders against invoiced sales by month">`;
  for(let k=0;k<=4;k++){const v=ymax*k/4;s+=`<line x1="${ml}" x2="${W-mr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line2)"/><text x="${ml-6}" y="${y(v)+4}" text-anchor="end" font-size="10.5" fill="var(--muted)">${v?mk(v):'0'}</text>`;}
  MONTHS.forEach((m,i)=>{const [o,f]=vals[i];const cx=ml+i*bw,w=bw*0.5,bx=cx+(bw-w)/2,top=y(o),hg=Math.max(1,y(0)-top),r=Math.min(4,hg/2);
    s+=`<path d="M${bx},${y(0)} V${top+r} Q${bx},${top} ${bx+r},${top} H${bx+w-r} Q${bx+w},${top} ${bx+w},${top+r} V${y(0)} Z" fill="var(--s1)"/><line x1="${cx+bw*.14}" x2="${cx+bw*.86}" y1="${y(f)}" y2="${y(f)}" stroke="var(--fg)" stroke-width="2.5" stroke-linecap="round"/><text x="${cx+bw/2}" y="${H-mb+16}" text-anchor="middle" font-size="10.5" fill="var(--muted)">${new Date(m+'-15T12:00:00').toLocaleDateString('en-CA',{month:'short'})}</text><rect class="hit" data-i="${i}" x="${cx}" y="${mt}" width="${bw}" height="${H-mt-mb}" fill="transparent"/>`;});
  s+=`<line x1="${ml}" x2="${W-mr}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)"/></svg>`;box.innerHTML=s;const svg=box.querySelector('svg');
  box.querySelectorAll('.hit').forEach(h=>{h.addEventListener('pointermove',ev=>{const i=+h.dataset.i,[o,f,c]=vals[i],rc=svg.getBoundingClientRect(),gp=f?Math.round(100*(o-f)/f):0;tipAt(box,`<div class="h">${new Date(MONTHS[i]+'-15T12:00:00').toLocaleDateString('en-CA',{month:'long'})}</div><div><b>${money(o)}</b> orders (${c})</div><div><b>${money(f)}</b> invoiced</div><div>${gp>=0?'+':''}${gp}%</div>`,ev.clientX-rc.left,ev.clientY-rc.top);});h.addEventListener('pointerleave',()=>tipOff(box));});
  $('#ordleg').innerHTML=`<span><span class="sw" style="background:var(--s1);height:10px"></span>Orders in Dynamics</span><span><span class="tick"></span>Invoiced (Financial Lines)</span>`;
  const rows=MONTHS.map((m,i)=>{const [o,f,c]=vals[i];const g=o-f,p=f?Math.round(100*g/f):null;const ok=p!=null&&Math.abs(p)<=10;return {m,o,f,c,g,p,ok};}).sort((a,b)=>(a.ok-b.ok)||Math.abs(b.g)-Math.abs(a.g));
  $('#recon').innerHTML='<thead><tr><th>Month</th><th class="num">Orders in Dynamics</th><th class="num">Invoiced (Financial Lines)</th><th class="num">Gap</th><th class="num">Gap %</th><th>Status and likely cause</th></tr></thead><tbody>'+rows.map(r=>`<tr><td class="nw">${new Date(r.m+'-15T12:00:00').toLocaleDateString('en-CA',{month:'short',year:'numeric'})}</td><td class="num">${money(r.o)} <span class="note">(${r.c})</span></td><td class="num">${money(r.f)}</td><td class="num ${r.g<0?'neg':''}">${money(r.g)}</td><td class="num">${r.p==null?'—':(r.p>=0?'+':'')+r.p+'%'}</td><td>${r.ok?pill('good'):pill(r.p!=null&&Math.abs(r.p)>25?'crit':'warn')} <span class="note">${r.ok?'Within 10%':r.g<0?'Invoiced more than ordered in Dynamics: orders keyed only in P21, missing values, or earlier orders invoiced':'Ordered in Dynamics but not yet invoiced, or a duplicate order record'}</span></td></tr>`).join('')+'</tbody>';
}
function renderTime(){
  /* Each dashboard shows only its own person; the All dashboard shows the dashboard people side by side. */
  const T=D.tt, pk=scope().pk;
  const keys=pk?(T[pk]?[pk]:[]):PEOPLE.map(p=>p.k).filter(k=>T[k]);
  $('#ttlede').textContent=pk?`Time tracking for ${P.n}. Some people log exceptions only (late, absent, vacation), not daily sign-in and sign-out, so day length may be blank.`:'Time tracking for each dashboard, side by side. Some people log exceptions only (late, absent, vacation), not daily sign-in and sign-out, so their day lengths cannot be compared.';
  if(!keys.length){$('#ttbl').innerHTML=`<tbody><tr><td class="note">No time tracking records${pk?' for '+esc(P.n):''} in Dynamics.</td></tr></tbody>`;return;}
  const rows=[[`Days with a sign-in logged since ${FYL}`,k=>T[k].sd],['Sign-ins flagged Late',k=>T[k].late],['Days flagged Absent',k=>T[k].ab],['Leaving early',k=>T[k].ea],['Median sign-in time',k=>T[k].mi||'—'],['Median day, sign-in to sign-out',k=>T[k].dh?T[k].dh+' h':'—'],[`Time tracking records since ${FYL}`,k=>T[k].rec]];
  $('#ttbl').innerHTML=`<thead><tr><th>Time tracking</th>${keys.map(k=>`<th class="num">${esc(nm(k))}</th>`).join('')}</tr></thead><tbody>`+rows.map(([l,f])=>`<tr><td>${l}</td>${keys.map(k=>`<td class="num">${f(k)}</td>`).join('')}</tr>`).join('')+'</tbody>';
}
function renderAll(){renderControls();const dv=data();renderButtons(dv);renderTable();renderKPI();renderTiers();renderActivity();renderOrders();renderTime();}
/* ---------- export: portal admin only (checked on the server: the data call says admin) ---------- */
const csvq=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
function exportList(){
  if(!LAST||!WHO||!WHO.admin) return; const {rows,cols}=LAST;
  const head=cols.map(c=>c[1]).concat(['Dynamics id']);
  const lines=[head.map(csvq).join(',')].concat(rows.map(x=>cols.map(([k])=>{let v=val(x,k);if(k==='n'&&VIEW.ent==='acc'&&x.c) v=v+' ('+x.c+')';return csvq(v);}).concat([csvq(x.i||'')]).join(',')));
  const blob=new Blob([String.fromCharCode(0xFEFF)+lines.join('\r\n')],{type:'text/csv'});const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=`territory-${P.k}-${OPT[0]}-${VIEW.ent}-${VIEW.flag}-${TODAY}.csv`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
}
/* ---------- dates ---------- */
function addD(iso,n){const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function monday(iso){const d=new Date(iso+'T12:00:00Z');return addD(iso,-((d.getUTCDay()+6)%7));}
const mlab=m=>new Date(m+'-15T12:00:00').toLocaleDateString('en-CA',{month:'long',year:'numeric'});
/* ---------- sign-in and load ---------- */
function gate(v){for(const id of ['loginview','denyview','loading','appview','foot'])$('#'+id).hidden=!(id===v||(v==='appview'&&id==='foot'));document.querySelector('nav.sticky').hidden=v!=='appview';}
function deny(title,html){$('#denytitle').textContent=title;$('#denymsg').innerHTML=html;gate('denyview');}
function renderUser(email){$('#userbox').innerHTML=`<span class="who">${esc(email)}</span><button class="so" id="signout">Sign out</button>`;$('#signout').onclick=signout;}
async function signout(){await sb.auth.signOut();location.reload();}
$('#signout2').onclick=signout;
$('#sendlink').onclick=async()=>{
  const email=$('#email').value.trim(),msg=$('#loginmsg');
  if(!/^[^@]+@[^@]+\.[^@]+$/.test(email)){msg.className='msg err';msg.textContent='Enter a valid email.';return;}
  msg.className='msg';msg.textContent='Sending…';
  const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:location.href.split('#')[0]}});
  if(error){msg.className='msg err';msg.textContent=error.message;}
  else{msg.className='msg ok';msg.textContent='Check your email for the sign-in link, then come back to this page.';}
};
sb.auth.onAuthStateChange(ev=>{if(ev==='SIGNED_IN'){history.replaceState(null,'',location.pathname);boot();}});
function peopleFor(){
  if(WHO.admin) return ALLPEOPLE;
  const t=(WHO.territories||[]).slice().sort((a,b)=>a-b); const base=ALLPEOPLE.find(p=>p.k===WHO.person);
  if(base){const o=base.o.filter(x=>x[2]&&x[2].every(n=>t.includes(n)));if(o.length) return [{...base,o}];}
  return [{k:WHO.person||'me',n:WHO.name||WHO.email,d:'Your territories',o:[['all','All',t],...(t.length>1?t.map(n=>[String(n),String(n),[n]]):[])]}];
}
let BOOTING=false;
async function boot(){
  if(BOOTING) return; BOOTING=true;
  try{
    const {data:{session}}=await sb.auth.getSession();
    if(!session){gate('loginview');return;}
    renderUser(session.user.email); gate('loading');
    const {data:w,error:we}=await sb.rpc('hr_territory_whoami');
    if(we||!w||!w.signed_in){deny('No access',`Signed in as <b>${esc(session.user.email)}</b>, but the scorecard could not confirm your access. Sign out and in again.`);return;}
    WHO=w;
    if(!w.allowed){deny('No access',`Signed in as <b>${esc(w.email)}</b>. The Territory Scorecard opens for people with a Territory Manager entry on their Dynamics user. Ask David if you think you should see it.`);return;}
    const {data,error}=await sb.rpc('hr_territory_data');
    if(error){deny('Could not load',error.message==='no_data'?'The first nightly read has not finished yet. Try again in a few minutes.':esc(error.message));return;}
    D=data; WHO.admin=!!(D.viewer&&D.viewer.admin);
    TODAY=D.today; T0=new Date(TODAY+'T12:00:00'); FYS=D.fy.start; FYL=new Date(FYS+'T12:00:00').toLocaleDateString('en-CA',{month:'long',day:'numeric'});
    MONTHS=D.fy.months.filter(m=>m>='2026-01');
    ALLPEOPLE=(D.people||[]).map(p=>({...p,o:p.o.map(o=>[o[0],o[1],o[2]??null])}));
    PEOPLE=peopleFor(); P=PEOPLE[0]; OPT=P.o[0];
    try{const s=JSON.parse(localStorage.getItem('terr1')||'null');if(s){const p=PEOPLE.find(x=>x.k===s.p);if(p){P=p;OPT=p.o.find(o=>o[0]===s.o)||p.o[0];}}}catch(e){}
    $('#asof').textContent='Data '+D.asof;
    $('#footnote').textContent=`Read from Dynamics 365 every morning · last read ${new Date(w.built_at).toLocaleString('en-CA',{timeZone:'America/Edmonton',dateStyle:'medium',timeStyle:'short'})} MT`+(w.last_error?` · last refresh failed: ${w.last_error.error||''}`:'');
    if(WHO.admin){const b=$('#expbtn');b.hidden=false;b.onclick=exportList;$('#adminrow').hidden=false;
      $('#refreshbtn').onclick=async()=>{$('#refreshnote').textContent='Asking Dynamics…';const {error}=await sb.rpc('hr_territory_refresh');$('#refreshnote').textContent=error?error.message:'Refresh started. It takes about two minutes; reload the page after that.';};}
    gate('appview'); renderAll();
  } finally { BOOTING=false; }
}
boot();
