// Fluidseal HR — Service Score (Master view + My view). Every read and write goes through gated Supabase functions
// (public.svc_*, schema svc): the server decides who sees what from the signed-in email; this page never sends an identity.
const SUPA_URL = "https://hnmbjqhxvxakhdzgetxw.supabase.co";
const SUPA_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhubWJqcWh4dnhha2hkemdldHh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjUzNjQsImV4cCI6MjA5NTkwMTM2NH0.GSWI113EQ6ZaA1n_lxECqEmc952q14-tZ7dacZNbZf0";
const sb = supabase.createClient(SUPA_URL, SUPA_ANON);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const STAR_NAMES = { 5: "VA!! Very awesome", 4: "Strong", 3: "Solid", 2: "Slipping", 1: "Needs a hand" };
const LABELS_FALLBACK = { taker: { first: "In Dynamics first", right: "Right first time", ontime: "On time", left: "Nothing left behind", closed: "Closed properly" },
  maker: { followup: "Follow-up on time", win: "Winning", left: "Pipeline hygiene", cases: "Case ownership", closed: "Lost with a reason" },
  order: ["first", "right", "ontime", "left", "closed", "followup", "win", "cases"] };
const NOT_BUILT = { followup: "Waits on the follow-up dates (board item 8)", win: "Waits on the follow-up dates (board item 8)" };
let WHO = null, LABELS = LABELS_FALLBACK, LAST = null;
const ST = { view: "master", period: "week", date: null, kind: "taker", branch: null, person: null, slipFilter: "all" };

// ---------- auth ----------
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { show("login"); return; }
  renderUser(session.user.email);
  const { data, error } = await sb.rpc("svc_whoami");
  if (error || !data || !data.signed_in) { deny("No access", `Signed in as <b>${esc(session.user.email)}</b>, but the Service Score could not confirm your access. Try signing out and in again.`); return; }
  WHO = data;
  ST.date = lastWorkingDay(WHO.today);
  if (WHO.master) { ST.view = "master"; return loadMaster(); }
  if (WHO.person) {
    if (!WHO.my_open) {
      deny("Coming soon", `Hi ${esc(firstName(WHO.person))} — your Service Score card opens after the two-week trial. HR and sales management are checking the numbers first so the score is fair from day one.`,
        WHO.entry ? `<p><a class="btn" href="register.html">Open the Ship Register</a></p>` : "");
      return;
    }
    ST.view = "my"; ST.person = null; return loadCard();
  }
  if (WHO.entry) { deny("Ship Register", `Signed in as <b>${esc(WHO.email)}</b>. Your access is the nightly Ship Register.`, `<p><a class="btn" href="register.html">Open the Ship Register</a></p>`); return; }
  deny("No access", `Signed in as <b>${esc(WHO.email)}</b>. The Service Score is for the sales team, HR and sales management. Ask David if you think you should see it.`);
}
function show(v) {
  $("#loginview").classList.toggle("hidden", v !== "login");
  $("#denyview").classList.toggle("hidden", v !== "deny");
  $("#appview").classList.toggle("hidden", v !== "app");
  $("#foot").classList.toggle("hidden", v !== "app");
  $("#loading").classList.toggle("hidden", v !== "loading");
}
function deny(title, html, extra = "") { $("#denytitle").textContent = title; $("#denymsg").innerHTML = html; $("#denyextra").innerHTML = extra; show("deny"); }
function renderUser(email) {
  $("#userbox").innerHTML = `<span class="who">${esc(email)}</span> &nbsp; <button class="btn ghost" id="signout">Sign out</button>`;
  $("#signout").onclick = signout;
}
async function signout() { await sb.auth.signOut(); location.reload(); }
$("#signout2").onclick = signout;
$("#sendlink").onclick = async () => {
  const email = $("#email").value.trim(), msg = $("#loginmsg");
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) { msg.className = "msg err"; msg.textContent = "Enter a valid email."; return; }
  msg.className = "msg"; msg.textContent = "Sending…";
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split("#")[0] } });
  if (error) { msg.className = "msg err"; msg.textContent = error.message; }
  else { msg.className = "msg ok"; msg.textContent = "Check your email for the sign-in link, then come back to this page."; }
};
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN") { history.replaceState(null, "", location.pathname); boot(); } });

// ---------- helpers ----------
function firstName(n) { return String(n || "").split(" ")[0]; }
function addDays(iso, n) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function lastWorkingDay(today) { let d = addDays(today, -1); while ([0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay())) d = addDays(d, -1); return d; }
function fmtDay(iso) { return new Date(iso + "T12:00:00Z").toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }); }
function fmtShort(iso) { return new Date(iso + "T12:00:00Z").toLocaleDateString("en-CA", { month: "2-digit", day: "2-digit", timeZone: "UTC" }).replace("-", "/"); }
function periodLabel(d) { return d.period === "day" ? fmtDay(d.from) : `${fmtDay(d.from)} – ${fmtDay(d.to)}`; }
function starsHtml(n) { if (!n) return `<span class="sub">not enough data</span>`; return `<span class="stars">${"★".repeat(n)}<span class="off">${"★".repeat(5 - n)}</span></span>`; }
function pctClass(p, target) { if (p == null) return "na"; if (p >= (target ?? 95)) return "good"; if (p >= (target ?? 95) - 10) return "warn"; return "bad"; }
function compLabel(kind, key) { return (LABELS[kind] && LABELS[kind][key]) || (LABELS.taker[key] || LABELS.maker[key] || key); }
function money(v) { return v == null ? "" : "$" + Math.round(Number(v)).toLocaleString("en-CA"); }
function creditTag(e) {
  if (e.excused) return `<span class="tag ex">excused</span>`;
  if (Number(e.credit) >= 1) return `<span class="tag ok">done right</span>`;
  if (Number(e.credit) > 0) return `<span class="tag part">part credit ${Math.round(e.credit * 100)}%</span>`;
  return `<span class="tag zero">missed</span>`;
}
async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args || {});
  if (error) throw new Error(error.message);
  return data;
}

// ---------- controls ----------
function renderControls(opts) {
  const per = ["day", "week", "month"].map((p) => `<button class="chip ${ST.period === p ? "active" : ""}" data-per="${p}">${p === "day" ? "Daily" : p === "week" ? "Weekly" : "Monthly"}</button>`).join("");
  let html = per + `<span class="sep"></span><input type="date" id="pdate" value="${ST.date}" max="${WHO.today}">`;
  if (opts.kinds) html += `<span class="sep"></span>` + [["taker", "Order takers"], ["maker", "Order makers"]].map(([k, l]) => `<button class="chip ${ST.kind === k ? "active" : ""}" data-kind="${k}">${l}</button>`).join("");
  if (opts.branches) html += `<span class="sep"></span>` + [[null, "Both branches"], ["Edmonton", "Edmonton"], ["Calgary", "Calgary"]].map(([b, l]) => `<button class="chip ${ST.branch === b ? "active" : ""}" data-br="${b ?? ""}">${l}</button>`).join("");
  $("#controls").innerHTML = html;
  $("#controls").querySelectorAll("[data-per]").forEach((c) => (c.onclick = () => { ST.period = c.dataset.per; reload(); }));
  $("#controls").querySelectorAll("[data-kind]").forEach((c) => (c.onclick = () => { ST.kind = c.dataset.kind; reload(); }));
  $("#controls").querySelectorAll("[data-br]").forEach((c) => (c.onclick = () => { ST.branch = c.dataset.br || null; reload(); }));
  $("#pdate").onchange = (e) => { if (e.target.value) { ST.date = e.target.value; reload(); } };
}
function reload() { if (ST.view === "master") loadMaster(); else loadCard(); }
function renderModeSwitch() {
  const sw = $("#modeswitch");
  if (!WHO.master) { sw.innerHTML = WHO.entry ? `<a class="backlink" href="register.html">Ship Register</a>` : ""; return; }
  const my = WHO.person ? `<button class="chip ${ST.view === "my" && !ST.person ? "active" : ""}" id="gomy">My view</button>` : "";
  sw.innerHTML = `<button class="chip ${ST.view === "master" ? "active" : ""}" id="gomaster">Master view</button>${my}<a class="backlink" href="register.html" style="margin-left:6px">Ship Register</a>`;
  $("#gomaster").onclick = () => { ST.view = "master"; ST.person = null; loadMaster(); };
  if ($("#gomy")) $("#gomy").onclick = () => { ST.view = "my"; ST.person = null; loadCard(); };
}
function renderBanner() {
  let h = "";
  if (WHO.shadow) {
    h = `<div class="banner"><span>🕶 <b>Shadow mode.</b> Only the Master list sees scores. Each person's My view opens when David ends the trial.</span>`;
    if (WHO.admin) h += `<button class="btn small" id="endshadow">End the trial — open My view</button>`;
    h += `</div>`;
  } else if (WHO.admin) {
    h = `<div class="banner"><span>My view is open to every scored person.</span><button class="btn small line" id="startshadow">Back to shadow mode</button></div>`;
  }
  $("#bannerbox").innerHTML = ST.view === "master" ? h : "";
  const flip = async (val) => {
    if (!WHO.rules) return;
    const rules = { ...WHO.rules, shadow: val };
    try { await rpc("svc_setting_set", { p_key: "rules", p_value: rules }); WHO.rules = rules; WHO.shadow = val; renderBanner(); }
    catch (e) { alertBox(e.message); }
  };
  if ($("#endshadow")) $("#endshadow").onclick = () => { if (confirm("Open every scored person's My view now?")) flip(false); };
  if ($("#startshadow")) $("#startshadow").onclick = () => flip(true);
}
function alertBox(m) { const b = document.createElement("div"); b.className = "banner"; b.innerHTML = `<b>Could not save:</b> ${esc(m)}`; $("#content").prepend(b); setTimeout(() => b.remove(), 8000); }

// ---------- Master view ----------
async function loadMaster() {
  show("loading");
  let d;
  try { d = await rpc("svc_board", { p_period: ST.period, p_date: ST.date, p_kind: ST.kind, p_branch: ST.branch }); }
  catch (e) { deny("Could not load", esc(e.message)); return; }
  LAST = d; LABELS = d.labels || LABELS_FALLBACK;
  show("app");
  $("#pagetitle").textContent = "Service Score";
  $("#modeflag").innerHTML = `<span class="pill">Master view</span>`;
  $("#intro").innerHTML = `${esc(periodLabel(d))} · ${ST.kind === "taker" ? "order takers" : "order makers"}${ST.branch ? " · " + esc(ST.branch) : ""}. Scores are rates — the share of the work done right — so a busy desk is never punished for being busy. Latest data: ${d.last_data_day ? esc(fmtDay(d.last_data_day)) : "none yet"}.`;
  renderModeSwitch(); renderBanner(); renderControls({ kinds: true, branches: true });
  const team = d.team[ST.kind];
  const comps = team.components.slice().sort((a, b) => LABELS.order.indexOf(a.key) - LABELS.order.indexOf(b.key));
  const tg = (d.targets || {})[ST.kind] || {};
  let h = `<div class="kpis"><div class="kpi"><div class="n">${team.score ?? "—"}</div><div class="l">Team Service Score</div><div class="s">${starsHtml(team.stars)}</div></div>`;
  for (const c of comps) {
    h += `<div class="kpi"><div class="n pct ${pctClass(c.pct, tg[c.key])}">${c.pct == null ? "—" : c.pct + "%"}</div><div class="l">${esc(compLabel(ST.kind, c.key))}</div><div class="s">${c.n ? `${c.ok} of ${c.n} · target ${tg[c.key] ?? "—"}%` : esc(NOT_BUILT[c.key] || "no records in this period")}</div></div>`;
  }
  h += `</div>`;
  h += stageStrip(d);
  // people
  h += `<div class="card"><h3>${ST.kind === "taker" ? "Order takers" : "Order makers"} — click a name for the full card</h3><div class="scroll"><table class="tbl"><thead><tr><th>Person</th><th>Service Score</th>`;
  for (const c of comps) h += `<th class="num">${esc(compLabel(ST.kind, c.key))}<div class="sub" style="text-transform:none">weight ${c.weight}</div></th>`;
  h += `<th class="num">Records</th><th class="num">Misses</th><th class="num">Value</th></tr></thead><tbody>`;
  const people = d.people.filter((p) => p.kind === ST.kind);
  if (!people.length) h += `<tr><td colspan="${comps.length + 5}" class="empty">Nobody in this group for the period.</td></tr>`;
  for (const p of people) {
    h += `<tr class="click" data-person="${esc(p.person)}"><td><b>${esc(p.person)}</b><div class="sub">${esc(p.branch || "")}${p.taker_no ? " · taker " + esc(p.taker_no) : ""}${p.scored ? "" : " · not scored"}</div></td>`;
    h += `<td><div class="big">${p.score ?? "—"}</div>${starsHtml(p.stars)}${p.stars ? `<div class="sub">${esc(STAR_NAMES[p.stars])}</div>` : ""}</td>`;
    for (const c of comps) {
      const pc = (p.components || []).find((x) => x.key === c.key) || {};
      h += `<td class="num"><span class="pct ${pc.counted ? pctClass(pc.pct, tg[c.key]) : "na"}">${pc.pct == null ? "—" : pc.pct + "%"}</span><div class="sub">${pc.n ? `${pc.ok}/${pc.n}` : ""}${pc.n && !pc.counted ? " · too few" : ""}</div></td>`;
    }
    h += `<td class="num">${p.records}</td><td class="num">${p.misses ? `<b>${p.misses}</b>` : "0"}</td><td class="num">${money(p.value)}</td></tr>`;
  }
  h += `</tbody></table></div><p class="sub" style="margin-top:8px">Value = P21 sales on the registers in the period (context only, never part of the score). A part with fewer than 5 records in the period (1 on a single day) shows "too few" and drops out; the other weights stretch to 100.</p></div>`;
  // why notes waiting
  if (d.whys && d.whys.length) {
    h += `<div class="card"><h3>"Tell us why" notes waiting for a decision (${d.whys.length})</h3>`;
    for (const w of d.whys) h += missRow(w.event, { why: w, decide: true });
    h += `</div>`;
  }
  // slips
  const slipKeys = [...new Set(d.slips.map((s) => s.component))];
  h += `<div class="card"><h3>Where service slipped — each miss opens its record (${d.slips.length}${d.slips.length >= 300 ? "+" : ""})</h3>`;
  h += `<div class="controls">` + ["all", ...slipKeys].map((k) => `<button class="chip ${ST.slipFilter === k ? "active" : ""}" data-sf="${k}">${k === "all" ? "All" : esc(compLabel(ST.kind, k))}</button>`).join("") + `</div><div id="sliplist">`;
  const slips = d.slips.filter((s) => ST.slipFilter === "all" || s.component === ST.slipFilter);
  h += slips.length ? slips.slice(0, 150).map((e) => missRow(e, { excuse: true })).join("") : `<div class="empty">No misses in this period.</div>`;
  if (slips.length > 150) h += `<div class="sub">Showing 150 of ${slips.length}. Narrow the period or open a person's card for the rest.</div>`;
  h += `</div></div>`;
  h += howBuilt(d);
  h += adminPanel();
  $("#content").innerHTML = h;
  $("#content").querySelectorAll("tr[data-person]").forEach((r) => (r.onclick = () => { ST.view = "person"; ST.person = r.dataset.person; loadCard(); }));
  $("#content").querySelectorAll("[data-sf]").forEach((c) => (c.onclick = () => { ST.slipFilter = c.dataset.sf; loadMaster(); }));
  wireMissRows();
  wireAdmin();
  $("#foot").innerHTML = footText();
}
function stageStrip(d) {
  const t = d.team.taker, m = d.team.maker;
  const pc = (card, k) => { const c = (card.components || []).find((x) => x.key === k); return c && c.pct != null ? c.pct + "%" : null; };
  const rating = (d.ratings || []).map((r) => `${esc(r.branch)} ${r.stars ?? "—"}★ (${r.reviews ?? "?"})`).join(" · ");
  const st = [
    ["1", "Request logged", pc(t, "first"), "Order takers · in Dynamics first"],
    ["2", "Cart worked up", pc(t, "ontime"), "Order takers · cart to quote in a day"],
    ["3", "Quote right", pc(t, "right"), "Order takers · matches P21"],
    ["4", "Follow up & win", null, "Order makers · waits on item 8"],
    ["5", "Nothing left behind", pc(t, "left"), "Everyone · open carts and cases on time"],
    ["6", "Picked, checked, shipped", null, "Warehouse · see the Ship Register"],
    ["7", "Owned to the end", pc(t, "closed") || pc(m, "cases"), pc(t, "closed") ? "Order takers · cases closed properly" : "Order makers · cases kept on time"],
    ["8", "Five-star review", rating || null, "Google reviews by branch"],
  ];
  return `<div class="card"><h3>The service game — pass rate at each stage, request to five-star review</h3><div class="stages">` +
    st.map(([n, name, v, o]) => `<div class="stage ${v ? "" : "na"}"><div class="sn">STAGE ${n}</div><div class="st">${esc(name)}</div><div class="sv">${v ? v : n === "6" ? `<a href="register.html">Ship Register →</a>` : "not measured yet"}</div><div class="so">${esc(o)}</div></div>`).join("") + `</div></div>`;
}
function howBuilt(d) {
  const w = (d.weights || {})[ST.kind] || {};
  const rows = Object.entries(w).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(compLabel(ST.kind, k))}</td><td class="num">${v}</td><td class="num">${((d.targets || {})[ST.kind] || {})[k] ?? "—"}%</td><td class="sub">${esc(NOT_BUILT[k] || "")}</td></tr>`).join("");
  return `<details class="more card"><summary>How the score is built</summary>
    <p class="sub">Each part is the share of the work done right. Volume sits beside the score, never inside it. Registers that did not arrive never count against anyone; a Master can excuse any miss (a system outage, a sourcing wait).</p>
    <table class="tbl"><thead><tr><th>Part</th><th class="num">Weight</th><th class="num">Target</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <table class="tbl" style="margin-top:12px"><thead><tr><th>Score</th><th>Stars</th><th>Name</th></tr></thead><tbody>
    <tr><td>100</td><td>${starsHtml(5)}</td><td>VA!! Very awesome</td></tr><tr><td>95–99</td><td>${starsHtml(4)}</td><td>Strong</td></tr>
    <tr><td>90–94</td><td>${starsHtml(3)}</td><td>Solid</td></tr><tr><td>80–89</td><td>${starsHtml(2)}</td><td>Slipping</td></tr><tr><td>under 80</td><td>${starsHtml(1)}</td><td>Needs a hand</td></tr></tbody></table></details>`;
}

// ---------- misses (shared) ----------
function missRow(e, o = {}) {
  if (!e) return "";
  const why = o.why || (e.why && e.why.status === "open" ? e.why : null);
  let h = `<div class="miss" data-ev="${e.id}"><div class="d">${esc(fmtDay(e.day))}</div><div class="b">`;
  h += `<div><span class="w">${esc(e.person)}</span> · ${esc(compLabel(LAST && LAST.kind ? LAST.kind : ST.kind, e.component))} ${creditTag(e)}</div>`;
  h += `<div>${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.label || e.ref)}</a>` : esc(e.label || e.ref)}${e.value != null ? ` <span class="sub">${money(e.value)}</span>` : ""}</div>`;
  h += `<div class="sub">${esc(e.detail || "")}</div>`;
  if (why) h += `<div class="whynote"><b>Why:</b> ${esc(why.body)} <span class="sub">— ${esc(why.email || "")}</span></div>`;
  else if (e.why && e.why.status !== "open") h += `<div class="sub">Note ${esc(e.why.status)}: ${esc(e.why.body)}</div>`;
  if (e.excused) h += `<div class="sub">Excused by ${esc(e.excused_by || "")}${e.excused_note ? ": " + esc(e.excused_note) : ""}</div>`;
  const canExcuse = WHO.master && (o.excuse || o.decide);
  if (canExcuse || o.tellwhy) {
    h += `<div class="rowform">`;
    if (o.tellwhy && !e.excused && Number(e.credit) < 1) h += `<input placeholder="Tell us why (a manager can excuse it)" data-whyin="${e.id}"><button class="btn small" data-why="${e.id}">Send</button>`;
    if (canExcuse && !e.excused) h += `<input placeholder="Excuse note (optional)" data-exin="${e.id}"><button class="btn small" data-ex="${e.id}">Excuse</button>`;
    if (o.decide) h += `<button class="btn small line" data-keep="${e.id}">Keep the miss</button>`;
    if (canExcuse && e.excused) h += `<button class="btn small line" data-unex="${e.id}">Undo excuse</button>`;
    h += `<span class="msg" data-msg="${e.id}"></span></div>`;
  }
  return h + `</div></div>`;
}
function wireMissRows() {
  const done = (id, t, ok) => { const m = document.querySelector(`[data-msg="${id}"]`); if (m) { m.className = "msg " + (ok ? "ok" : "err"); m.textContent = t; } };
  document.querySelectorAll("[data-ex]").forEach((b) => (b.onclick = async () => {
    const id = Number(b.dataset.ex), note = (document.querySelector(`[data-exin="${id}"]`) || {}).value || null;
    try { await rpc("svc_excuse", { p_event_id: id, p_excuse: true, p_note: note }); done(id, "Excused ✓", true); setTimeout(reload, 600); } catch (e) { done(id, e.message, false); }
  }));
  document.querySelectorAll("[data-unex]").forEach((b) => (b.onclick = async () => {
    const id = Number(b.dataset.unex);
    try { await rpc("svc_excuse", { p_event_id: id, p_excuse: false }); done(id, "Back to a miss", true); setTimeout(reload, 600); } catch (e) { done(id, e.message, false); }
  }));
  document.querySelectorAll("[data-keep]").forEach((b) => (b.onclick = async () => {
    const id = Number(b.dataset.keep);
    try { await rpc("svc_excuse", { p_event_id: id, p_excuse: false, p_note: null }); done(id, "Kept ✓", true); setTimeout(reload, 600); } catch (e) { done(id, e.message, false); }
  }));
  document.querySelectorAll("[data-why]").forEach((b) => (b.onclick = async () => {
    const id = Number(b.dataset.why), inp = document.querySelector(`[data-whyin="${id}"]`), body = inp ? inp.value.trim() : "";
    if (body.length < 3) { done(id, "Write a short reason first.", false); return; }
    try { await rpc("svc_why", { p_event_id: id, p_body: body }); done(id, "Sent ✓ — a manager will decide", true); if (inp) inp.value = ""; } catch (e) { done(id, e.message, false); }
  }));
}

// ---------- card (My view, or a Master opening a person) ----------
async function loadCard() {
  show("loading");
  let d;
  try { d = await rpc("svc_card_detail", { p_person: ST.person, p_period: ST.period, p_date: ST.date }); }
  catch (e) { deny("Could not load", esc(e.message)); return; }
  LAST = d; LABELS = d.labels || LABELS_FALLBACK;
  show("app");
  const self = d.self && !ST.person;
  $("#pagetitle").textContent = self ? "My Service Score" : d.person;
  $("#modeflag").innerHTML = `<span class="pill">${self ? "My view" : "Master view · " + esc(d.person)}</span>`;
  $("#intro").innerHTML = self ? `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, ${esc(firstName(d.person))}. ${esc(periodLabel(d))}.` :
    `${esc(d.branch || "")} · ${d.kind === "taker" ? "order taker" : "order maker"}${d.taker_no ? " · taker " + esc(d.taker_no) : ""} · ${esc(periodLabel(d))}. Every view of a person's card is logged.`;
  renderModeSwitch(); renderBanner(); renderControls({});
  if (ST.person && WHO.master) $("#controls").insertAdjacentHTML("afterbegin", `<button class="chip" id="backboard">← All ${d.kind === "taker" ? "order takers" : "order makers"}</button><span class="sep"></span>`);
  if ($("#backboard")) $("#backboard").onclick = () => { ST.view = "master"; ST.person = null; ST.kind = d.kind; loadMaster(); };
  const c = d.card, prev = d.previous, tg = (d.targets || {})[d.kind] || {};
  const comps = (c.components || []).slice().sort((a, b) => LABELS.order.indexOf(a.key) - LABELS.order.indexOf(b.key));
  let h = `<div class="grid2"><div class="card"><div class="hero"><div class="score">${c.score ?? "—"}</div><div><div>${starsHtml(c.stars)}</div><div class="lbl">${c.stars ? esc(STAR_NAMES[c.stars]) : "Not enough data yet"}</div>
    <div class="sub">${prev && prev.score != null ? `Previous ${d.period}: ${prev.score}` : ""}</div></div></div></div>`;
  h += `<div class="card"><h3>Fix these today — keeps tomorrow at five stars</h3>`;
  h += d.fix && d.fix.length ? d.fix.map((e) => missRow(e, { tellwhy: d.self, excuse: WHO.master })).join("") : `<div class="empty">Nothing to fix from the latest day. Nice work.</div>`;
  h += `</div></div>`;
  h += `<div class="card"><h3>The parts of the score</h3>`;
  for (const x of comps) {
    const counted = x.counted;
    h += `<div class="comp"><div><b>${esc(compLabel(d.kind, x.key))}</b> <span class="sub">weight ${x.weight} · target ${tg[x.key] ?? "—"}%</span></div>
      <div class="pct ${counted ? pctClass(x.pct, tg[x.key]) : "na"}">${x.pct == null ? "—" : x.pct + "%"}</div>
      <div class="bar"><i style="width:${x.pct ?? 0}%"></i></div>
      <div class="sub" style="grid-column:1/-1">${x.n ? `${x.ok} of ${x.n} done right${counted ? "" : " — too few records to count this period"}` : esc(NOT_BUILT[x.key] || "No records in this period")}</div></div>`;
  }
  h += `</div>`;
  if (d.trend && d.trend.length) {
    h += `<div class="card"><h3>Your last 30 days</h3><div class="days">` + d.trend.map((t) => {
      const s = t.score == null ? null : t.score >= 100 ? 5 : t.score >= 95 ? 4 : t.score >= 90 ? 3 : t.score >= 80 ? 2 : 1;
      return `<div class="dayc ${s === 5 ? "five" : ""}" title="${esc(t.day)} · ${t.score ?? "—"}"><div class="dd">${esc(fmtShort(t.day))}</div><div class="dn">${s ?? "—"}</div></div>`;
    }).join("") + `</div><p class="sub" style="margin-top:8px">Number = stars that day. Yellow = five-star day. A day with no register is simply missing — it never counts against you.</p></div>`;
  }
  const misses = d.events.filter((e) => Number(e.credit) < 1 && !e.excused);
  h += `<div class="card"><h3>Misses in this period (${misses.length})</h3>` + (misses.length ? misses.slice(0, 200).map((e) => missRow(e, { tellwhy: d.self, excuse: WHO.master })).join("") : `<div class="empty">None.</div>`) + `</div>`;
  const good = d.events.filter((e) => Number(e.credit) >= 1 || e.excused);
  h += `<details class="more card"><summary>Everything done right in this period (${good.length})</summary>` +
    (good.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>Day</th><th>Part</th><th>Record</th><th>Detail</th></tr></thead><tbody>` +
      good.slice(0, 400).map((e) => `<tr><td>${esc(fmtShort(e.day))}</td><td>${esc(compLabel(d.kind, e.component))}</td><td>${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.label || e.ref)}</a>` : esc(e.label || e.ref)}</td><td class="sub">${esc(e.detail || "")}</td></tr>`).join("") + `</tbody></table></div>` : `<div class="empty">None.</div>`) + `</details>`;
  h += `<div class="card"><h3>How to earn five stars</h3><p style="font-size:13px;margin:0">${d.kind === "taker"
    ? "Start every request in the cart before you quote it in P21. Match the customer, the taker and the value. Quote within a working day. Keep every open cart and case ahead of its required or follow-up date. Close cases with a real note, the corrective action and who was responsible."
    : "Follow up on every quote before the customer has to chase. Keep your carts and quotes current. Own your cases to the end and close lost quotes with a reason."}</p>
    <p class="sub" style="margin-top:10px">Only you, HR and sales management can see this card. Something here wrong? Use "Tell us why" on the miss — a manager reads it and can excuse it.</p></div>`;
  $("#content").innerHTML = h;
  wireMissRows();
  $("#foot").innerHTML = footText();
}

// ---------- admin (Master list) ----------
function adminPanel() {
  return `<details class="more card" id="adminsec"><summary>Access and Google reviews (Master list)</summary>
    <h3 style="margin-top:10px">Who can open what</h3><div id="acclist" class="scroll"><div class="empty">Loading…</div></div>
    <div class="rowform"><input id="acc_email" placeholder="name@sealsonline.com"><input id="acc_name" placeholder="Full name">
      <select id="acc_role"><option value="entry">Ship Register entry</option>${WHO.admin ? `<option value="master">Master (sees every score)</option><option value="admin">Admin</option>` : ""}</select>
      <button class="btn small" id="acc_add">Add</button><span class="msg" id="acc_msg"></span></div>
    <p class="sub">Everyone on the sales team sees their own card through their work email — they do not need to be listed here. ${WHO.admin ? "" : "Only David can add Master or Admin access."}</p>
    <h3 style="margin-top:18px">Google reviews by branch (monthly)</h3>
    <div class="rowform"><input type="month" id="rt_month" value="${esc(String(WHO.today).slice(0, 7))}"><select id="rt_branch"><option>Edmonton</option><option>Calgary</option></select>
      <input id="rt_stars" placeholder="Rating, e.g. 4.9" inputmode="decimal"><input id="rt_reviews" placeholder="Total reviews" inputmode="numeric"><input id="rt_new5" placeholder="New five-star this month" inputmode="numeric">
      <button class="btn small" id="rt_save">Save</button><span class="msg" id="rt_msg"></span></div></details>`;
}
async function wireAdmin() {
  const sec = $("#adminsec"); if (!sec) return;
  const load = async () => {
    try {
      const list = await rpc("svc_access_list");
      $("#acclist").innerHTML = `<table class="tbl"><thead><tr><th>Email</th><th>Name</th><th>Access</th><th>Active</th><th></th></tr></thead><tbody>` + list.map((a) =>
        `<tr><td>${esc(a.email)}</td><td>${esc(a.full_name || "")}</td><td>${esc(a.role === "entry" ? "Ship Register entry" : a.role)}</td><td>${a.active ? "yes" : "no"}</td><td>${(WHO.admin || a.role === "entry") && a.email !== WHO.email ? `<button class="linkbtn" data-acc="${esc(a.email)}" data-role="${esc(a.role)}" data-on="${a.active ? 0 : 1}">${a.active ? "Remove" : "Restore"}</button>` : ""}</td></tr>`).join("") + `</tbody></table>`;
      document.querySelectorAll("[data-acc]").forEach((b) => (b.onclick = async () => {
        try { await rpc("svc_access_set", { p_email: b.dataset.acc, p_role: b.dataset.role, p_full_name: null, p_active: b.dataset.on === "1" }); load(); } catch (e) { $("#acc_msg").className = "msg err"; $("#acc_msg").textContent = e.message; }
      }));
    } catch (e) { $("#acclist").innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  };
  sec.addEventListener("toggle", () => { if (sec.open) load(); });
  $("#acc_add").onclick = async () => {
    const m = $("#acc_msg");
    try { await rpc("svc_access_set", { p_email: $("#acc_email").value, p_role: $("#acc_role").value, p_full_name: $("#acc_name").value, p_active: true }); m.className = "msg ok"; m.textContent = "Added ✓"; $("#acc_email").value = ""; $("#acc_name").value = ""; load(); }
    catch (e) { m.className = "msg err"; m.textContent = e.message; }
  };
  $("#rt_save").onclick = async () => {
    const m = $("#rt_msg");
    try {
      await rpc("svc_rating_set", { p_month: $("#rt_month").value + "-01", p_branch: $("#rt_branch").value, p_stars: Number($("#rt_stars").value) || null, p_reviews: parseInt($("#rt_reviews").value) || null, p_new_five: parseInt($("#rt_new5").value) || null });
      m.className = "msg ok"; m.textContent = "Saved ✓";
    } catch (e) { m.className = "msg err"; m.textContent = e.message; }
  };
}
function footText() {
  return `Service Score — built from the morning Quote check and Order check (P21 registers against Dynamics), a nightly Dynamics snapshot (open carts, cases, cart-to-quote time, case close-out, NVAs) and the monthly Google rating. Gated Supabase layer: the page never sends an identity — the server reads it from your sign-in. ${WHO && WHO.shadow ? "Shadow mode: Master list only." : ""} — Fluidseal HR Portal`;
}
boot();
