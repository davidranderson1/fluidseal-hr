// Fluidseal HR — digital Ship Register. Nightly entry for the people Cindy adds, the month grid that mirrors the
// Ship Register email, and what the system fills for you. All reads and writes go through gated Supabase functions
// (public.svc_sr_*, schema svc); the server checks access from the signed-in email.
const SUPA_URL = "https://hnmbjqhxvxakhdzgetxw.supabase.co";
const SUPA_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhubWJqcWh4dnhha2hkemdldHh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjUzNjQsImV4cCI6MjA5NTkwMTM2NH0.GSWI113EQ6ZaA1n_lxECqEmc952q14-tZ7dacZNbZf0";
const sb = supabase.createClient(SUPA_URL, SUPA_ANON);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let WHO = null, CAT = [], DAY = null, PREV = null, MONTH = null;
const ST = { tab: "entry", day: null, month: null };

// ---------- auth ----------
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { show("login"); return; }
  renderUser(session.user.email);
  const { data, error } = await sb.rpc("svc_whoami");
  if (error || !data || !data.signed_in) { deny("No access", `Signed in as <b>${esc(session.user.email)}</b>, but access could not be confirmed. Try signing out and in again.`); return; }
  WHO = data;
  if (!WHO.entry) { deny("No access", `Signed in as <b>${esc(WHO.email)}</b>. The Ship Register is open to the people Cindy adds for the nightly entry, HR and sales management.`); return; }
  try { CAT = await rpc("svc_sr_catalog"); } catch (e) { deny("Could not load", esc(e.message)); return; }
  ST.day = lastEntryDay(WHO.today);
  ST.month = String(ST.day).slice(0, 7);
  show("app");
  renderShell();
  go(ST.tab);
}
function show(v) {
  $("#loginview").classList.toggle("hidden", v !== "login");
  $("#denyview").classList.toggle("hidden", v !== "deny");
  $("#appview").classList.toggle("hidden", v !== "app");
  $("#foot").classList.toggle("hidden", v !== "app");
  $("#loading").classList.toggle("hidden", v !== "loading");
}
function deny(title, html, extra = "") { $("#denytitle").textContent = title; $("#denymsg").innerHTML = html; $("#denyextra").innerHTML = extra; show("deny"); }
function renderUser(email) { $("#userbox").innerHTML = `<span class="who">${esc(email)}</span> &nbsp; <button class="btn ghost" id="signout">Sign out</button>`; $("#signout").onclick = signout; }
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
async function rpc(name, args) { const { data, error } = await sb.rpc(name, args || {}); if (error) throw new Error(error.message); return data; }
function addDays(iso, n) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function isWeekend(iso) { return [0, 6].includes(new Date(iso + "T12:00:00Z").getUTCDay()); }
function lastEntryDay(today) { let d = today; while (isWeekend(d)) d = addDays(d, -1); return d; }
function stepDay(iso, dir) { let d = addDays(iso, dir); while (isWeekend(d)) d = addDays(d, dir); return d; }
function fmtDay(iso) { return new Date(iso + "T12:00:00Z").toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }); }
function mmddyy(iso) { const [y, m, d] = iso.split("-"); return `${m}/${d}/${y.slice(2)}`; }
function mmdd(iso) { const [, m, d] = iso.split("-"); return `${m}/${d}`; }
function fmtNum(m, v) {
  if (v == null || v === "") return "";
  if (m.kind === "text") return String(v);
  const n = Number(v); if (Number.isNaN(n)) return String(v);
  if (m.kind === "pct") return n.toFixed(2) + "%";
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
function sections() { const out = []; for (const m of CAT) { let s = out.find((x) => x.name === m.section); if (!s) { s = { name: m.section, items: [] }; out.push(s); } s.items.push(m); } return out; }
function planBadge(m) {
  if (m.plan === "computed") return `<span class="badge computed">worked out</span>`;
  if (m.plan === "carry") return `<span class="badge carry">carried</span>`;
  if (m.plan === "auto") return `<span class="badge auto">Dynamics check</span>`;
  return "";
}

// ---------- shell ----------
function renderShell() {
  $("#pagetitle").textContent = "Ship Register";
  $("#modeflag").innerHTML = `<span class="pill">${WHO.master ? "Master" : "Entry"}</span>`;
  $("#modeswitch").innerHTML = (WHO.master || WHO.person ? `<a class="backlink" href="service.html">Service Score</a>` : "");
  $("#intro").innerHTML = `The digital copy of the nightly Ship Register email. Enter the day's numbers once — lines marked <span class="badge computed">worked out</span> fill themselves, <span class="badge carry">carried</span> lines start from the last day, and <span class="badge auto">Dynamics check</span> shows what Dynamics saw. September is loaded from Cindy's email of 09/29.`;
  $("#bannerbox").innerHTML = "";
  $("#controls").innerHTML = [["entry", "Tonight's entry"], ["month", "Month (email layout)"], ["plan", "What you can stop typing"]].map(([k, l]) => `<button class="chip" data-tab="${k}">${l}</button>`).join("");
  $("#controls").querySelectorAll("[data-tab]").forEach((c) => (c.onclick = () => go(c.dataset.tab)));
  $("#foot").innerHTML = `Ship Register — stored in a gated Supabase layer (schema svc). Only the people on the Ship Register list, HR and sales management can open it. Entry users can change the last 7 days; older days and CLOSED days are changed by a Master user. — Fluidseal HR Portal`;
}
function go(tab) {
  ST.tab = tab;
  $("#controls").querySelectorAll("[data-tab]").forEach((c) => c.classList.toggle("active", c.dataset.tab === tab));
  if (tab === "entry") loadEntry(); else if (tab === "month") loadMonth(); else loadPlan();
}

// ---------- entry ----------
async function loadEntry() {
  $("#content").innerHTML = `<div class="loading">Loading ${esc(ST.day)}…</div>`;
  try {
    DAY = await rpc("svc_sr_get", { p_day: ST.day });
    PREV = DAY.previous_day ? await rpc("svc_sr_get", { p_day: DAY.previous_day }) : null;
  } catch (e) { $("#content").innerHTML = `<div class="card"><div class="msg err">${esc(e.message)}</div></div>`; return; }
  const closed = DAY.status === "closed";
  const locked = !DAY.can_edit || (closed && !WHO.master);
  let h = `<div class="card"><div class="controls" style="margin:0">
      <button class="chip" id="dprev">◀</button><input type="date" id="dpick" value="${ST.day}" max="${WHO.today}"><button class="chip" id="dnext" ${ST.day >= WHO.today ? "disabled" : ""}>▶</button>
      <b style="font-size:15px;margin-left:6px">${esc(fmtDay(ST.day))}</b>
      <span class="status ${esc(DAY.status)}">${DAY.status === "new" ? "not started" : esc(DAY.status)}</span>
      ${DAY.submitted_by ? `<span class="sub">submitted by ${esc(DAY.submitted_by)}</span>` : DAY.updated_by ? `<span class="sub">last saved by ${esc(DAY.updated_by)}</span>` : ""}
    </div>${DAY.note ? `<div class="sub" style="margin-top:6px">Note: ${esc(DAY.note)}</div>` : ""}
    ${closed ? `<div class="banner" style="margin:10px 0 0"><b>CLOSED</b> — this day shows CLOSED in the register.${WHO.master ? " Reopen it below to enter numbers." : ""}</div>` : ""}
    ${!DAY.can_edit ? `<div class="banner" style="margin:10px 0 0">Days older than a week can only be changed by a Master user.</div>` : ""}
    <ul class="checks" id="checks"></ul></div>`;
  h += `<div class="entry">`;
  for (const s of sections()) {
    h += `<div class="card"><h3>${esc(s.name)}</h3>`;
    for (const m of s.items) {
      const v = DAY.values[m.key], carry = DAY.carry[m.key], sugg = (DAY.suggest[m.key] || [])[0], pv = PREV && PREV.values[m.key];
      let val = v ? (m.kind === "text" ? v.txt : v.num) : null, carried = false;
      if (val == null && m.plan === "carry" && carry && !closed) { val = m.kind === "text" ? carry.txt : carry.num; carried = true; }
      const hints = [];
      if (m.plan === "computed") hints.push(`<span class="badge computed">worked out</span>`);
      if (carried) hints.push(`<span class="badge carry">carried from ${esc(mmdd(carry.day))}</span>`);
      else if (m.plan === "carry") hints.push(`<span class="badge carry">carried line</span>`);
      if (sugg) hints.push(`<span class="badge auto">Dynamics: ${esc(fmtNum(m, sugg.num))}</span>${m.plan !== "computed" && !locked ? ` <button class="linkbtn" data-use="${m.key}" data-val="${esc(sugg.num)}">use it</button>` : ""}`);
      if (pv) hints.push(`<span>last day: ${esc(fmtNum(m, m.kind === "text" ? pv.txt : pv.num))}</span>`);
      if (v && String(v.source || "").startsWith("import")) hints.push(`<span>from the email</span>`);
      h += `<div class="erow" title="${esc(m.source_note || "")}"><label for="f_${m.key}">${esc(m.label)}${m.code ? `<span class="code">${esc(m.code)}</span>` : ""}</label>
        <input id="f_${m.key}" data-key="${m.key}" data-kind="${m.kind}" ${m.plan === "computed" || locked ? "readonly" : ""} ${m.kind === "text" ? "" : 'inputmode="decimal"'} value="${esc(val == null ? "" : fmtNum(m, val).replace("%", ""))}" data-orig="${esc(val == null ? "" : String(val))}" data-carried="${carried ? 1 : 0}">
        ${hints.length ? `<div class="hint">${hints.join(" · ")}</div>` : ""}</div>`;
    }
    h += `</div>`;
  }
  h += `</div>`;
  h += `<div class="stick"><input class="inp" id="dnote" placeholder="Note for this day (optional)" style="flex:1;min-width:200px" ${locked ? "disabled" : ""}>
    <button class="btn line" id="savedraft" ${locked ? "disabled" : ""}>Save draft</button>
    <button class="btn" id="submitday" ${locked ? "disabled" : ""}>Submit the day</button>
    ${WHO.master ? (closed ? `<button class="btn line" id="reopen">Reopen day</button>` : `<button class="btn line" id="markclosed">Mark CLOSED (holiday)</button>`) : ""}
    <span class="msg" id="savemsg"></span></div>`;
  $("#content").innerHTML = h;
  $("#dprev").onclick = () => { ST.day = stepDay(ST.day, -1); loadEntry(); };
  $("#dnext").onclick = () => { const n = stepDay(ST.day, 1); if (n <= WHO.today) { ST.day = n; loadEntry(); } };
  $("#dpick").onchange = (e) => { if (e.target.value) { ST.day = e.target.value; loadEntry(); } };
  document.querySelectorAll("#content input[data-key]").forEach((i) => i.addEventListener("input", () => { i.classList.toggle("changed", i.value !== i.dataset.orig); recompute(); }));
  document.querySelectorAll("[data-use]").forEach((b) => (b.onclick = () => { const i = $(`#f_${b.dataset.use}`); i.value = b.dataset.val; i.classList.add("changed"); recompute(); }));
  if ($("#savedraft")) $("#savedraft").onclick = () => save(false);
  if ($("#submitday")) $("#submitday").onclick = () => save(true);
  if ($("#markclosed")) $("#markclosed").onclick = () => setStatus("closed");
  if ($("#reopen")) $("#reopen").onclick = () => setStatus("draft");
  recompute();
}
function num(key) { const i = $(`#f_${key}`); if (!i || i.value.trim() === "") return null; const n = Number(i.value.replace(/[%,]/g, "")); return Number.isNaN(n) ? null : n; }
function recompute() {
  for (const m of CAT.filter((x) => x.plan === "computed" && x.formula)) {
    const [op, arg] = m.formula.split(":"); let v = null;
    if (op === "copy") v = num(arg);
    else if (op === "sum") { const ks = CAT.filter((x) => x.key.startsWith(arg) && x.plan !== "computed").map((x) => num(x.key)).filter((x) => x != null); v = ks.length ? ks.reduce((a, b) => a + b, 0) : null; }
    else if (op === "pct" || op === "div") { const [a, b] = arg.split(","); const x = num(a), y = num(b); if (x != null && y) v = op === "pct" ? Math.round((10000 * x) / y) / 100 : Math.round((100 * x) / y) / 100; }
    const i = $(`#f_${m.key}`); if (i) i.value = v == null ? "" : String(v);
  }
  const checks = [];
  const ot = num("order_takers"), ed = num("edmonton_orders"), cg = num("calgary_orders");
  if (ot != null && ed != null && cg != null && ed + cg !== ot) checks.push(`<span class="badge warn">check</span> Edmonton ${ed} + Calgary ${cg} = ${ed + cg}, but the taker lines add up to ${ot}.`);
  const to = num("total_orders"), ph = num("total_pick_holds");
  if (to != null && ph != null && ph > to) checks.push(`<span class="badge warn">check</span> Pick & Holds (${ph}) is more than Total Orders (${to}).`);
  const blanks = CAT.filter((m) => m.plan !== "computed" && m.key !== "taker_778" && !m.key.startsWith("xfer_")).filter((m) => { const i = $(`#f_${m.key}`); return i && i.value.trim() === ""; });
  if (blanks.length && DAY && DAY.status !== "closed") checks.push(`${blanks.length} line${blanks.length === 1 ? "" : "s"} still blank: ${blanks.slice(0, 8).map((m) => esc(["Daily", "Picking", "Order Takers", "Kits & Machinist", "Cycle Counts"].includes(m.section) ? m.label : m.section + " " + m.label)).join(", ")}${blanks.length > 8 ? " …" : ""}.`);
  const c = $("#checks"); if (c) c.innerHTML = checks.map((x) => `<li>${x}</li>`).join("");
}
async function save(submit) {
  const msg = $("#savemsg"); msg.className = "msg"; msg.textContent = "Saving…";
  const vals = {};
  document.querySelectorAll("#content input[data-key]").forEach((i) => { const m = CAT.find((x) => x.key === i.dataset.key); if (m && m.plan !== "computed") vals[m.key] = i.value.trim() === "" ? null : i.value.trim(); });
  try {
    await rpc("svc_sr_save", { p_day: ST.day, p_values: vals, p_submit: submit, p_note: $("#dnote").value.trim() || null });
    msg.className = "msg ok"; msg.textContent = submit ? "Submitted ✓" : "Saved ✓";
    setTimeout(loadEntry, 700);
  } catch (e) { msg.className = "msg err"; msg.textContent = e.message; }
}
async function setStatus(status) {
  const msg = $("#savemsg");
  try { await rpc("svc_sr_set_status", { p_day: ST.day, p_status: status, p_note: status === "closed" ? ($("#dnote").value.trim() || "CLOSED") : null }); loadEntry(); }
  catch (e) { msg.className = "msg err"; msg.textContent = e.message; }
}

// ---------- month grid (mirrors the email) ----------
async function loadMonth() {
  $("#content").innerHTML = `<div class="loading">Loading ${esc(ST.month)}…</div>`;
  try { MONTH = await rpc("svc_sr_month", { p_month: ST.month + "-01" }); } catch (e) { $("#content").innerHTML = `<div class="card"><div class="msg err">${esc(e.message)}</div></div>`; return; }
  const cols = []; for (let d = MONTH.from; d <= MONTH.to; d = addDays(d, 1)) if (!isWeekend(d)) cols.push(d);
  const V = {}; for (const [d, k, n, t, src] of MONTH.values) (V[d] = V[d] || {})[k] = { n, t, src };
  const S = {}; for (const d of MONTH.days) S[d.day] = d;
  let h = `<div class="card"><div class="controls" style="margin-bottom:10px"><input type="month" id="mpick" value="${ST.month}">
    <button class="btn small" id="copyout">Copy table for Outlook</button><button class="btn small line" id="csv">Download CSV</button><span class="msg" id="mmsg"></span></div>
    <div class="scroll"><table class="srgrid" id="srgrid">${gridHtml(cols, V, S, false)}</table></div>
    <p class="sub" style="margin-top:8px">Same rows and weekly blocks as the Ship Register email. Shaded = typed on this page; <i>italic</i> = worked out; plain = imported from the email. Click a date to open that day.</p></div>`;
  $("#content").innerHTML = h;
  $("#mpick").onchange = (e) => { if (e.target.value) { ST.month = e.target.value; loadMonth(); } };
  document.querySelectorAll("#srgrid th[data-day]").forEach((t) => (t.onclick = () => { ST.day = t.dataset.day; go("entry"); }));
  $("#copyout").onclick = async () => {
    const html = `<table border="1" cellpadding="3" cellspacing="0" style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt">${gridHtml(cols, V, S, true)}</table>`;
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([toCsv(cols, V, S, "\t")], { type: "text/plain" }) })]);
      else { const box = document.createElement("div"); box.innerHTML = html; box.style.position = "fixed"; box.style.left = "-9999px"; document.body.appendChild(box); const r = document.createRange(); r.selectNode(box); getSelection().removeAllRanges(); getSelection().addRange(r); document.execCommand("copy"); box.remove(); }
      $("#mmsg").className = "msg ok"; $("#mmsg").textContent = "Copied — paste into the email.";
    } catch (e) { $("#mmsg").className = "msg err"; $("#mmsg").textContent = "Copy blocked by the browser: " + e.message; }
  };
  $("#csv").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([toCsv(cols, V, S, ",")], { type: "text/csv" })); a.download = `ship-register-${ST.month}.csv`; a.click(); };
}
function gridHtml(cols, V, S, plain) {
  const isFri = (d) => new Date(d + "T12:00:00Z").getUTCDay() === 5;
  let h = `<thead><tr><th></th><th>TAKER</th>`;
  for (const d of cols) { h += `<th data-day="${d}" class="${d === WHO.today && !plain ? "today" : ""}" style="cursor:pointer">${mmddyy(d)}</th>`; if (isFri(d)) h += `<th class="gap"></th>`; }
  h += `</tr></thead><tbody>`;
  let sec = null;
  for (const m of CAT) {
    if (m.section !== sec) { sec = m.section; if (!["Daily"].includes(sec)) h += `<tr class="sec"><td class="lab" colspan="2">${esc(sec)}</td>${cols.map((d) => `<td></td>${isFri(d) ? '<td class="gap"></td>' : ""}`).join("")}</tr>`; }
    h += `<tr><td class="lab">${esc(m.label)}</td><td class="code">${esc(m.code || "")}</td>`;
    for (const d of cols) {
      const st = S[d];
      if (st && st.status === "closed") h += `<td class="closed">CLOSED</td>`;
      else { const c = (V[d] || {})[m.key]; const v = c ? (m.kind === "text" ? c.t : c.n) : null; const cls = !c || plain ? "" : c.src === "computed" ? "comp" : c.src === "manual" ? "man" : ""; h += `<td class="${cls}">${esc(fmtNum(m, v))}</td>`; }
      if (isFri(d)) h += `<td class="gap"></td>`;
    }
    h += `</tr>`;
  }
  return h + `</tbody>`;
}
function toCsv(cols, V, S, sep) {
  const q = (s) => (sep === "," && /[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  const rows = [["Line", "Code", ...cols.map(mmddyy)]];
  for (const m of CAT) rows.push([m.section === "Daily" ? m.label : `${m.section} — ${m.label}`, m.code || "", ...cols.map((d) => (S[d] && S[d].status === "closed" ? "CLOSED" : fmtNum(m, (V[d] || {})[m.key] ? (m.kind === "text" ? V[d][m.key].t : V[d][m.key].n) : null)))]);
  return rows.map((r) => r.map(q).join(sep)).join("\n");
}

// ---------- what you can stop typing ----------
async function loadPlan() {
  $("#content").innerHTML = `<div class="loading">Reading the month…</div>`;
  let mo;
  try { mo = await rpc("svc_sr_month", { p_month: ST.month + "-01" }); } catch (e) { $("#content").innerHTML = `<div class="card"><div class="msg err">${esc(e.message)}</div></div>`; return; }
  const open = new Set(mo.days.filter((d) => d.status !== "closed" && d.day.slice(0, 7) === ST.month).map((d) => d.day));
  const byKey = {}; for (const [d, k, n, t] of mo.values) if (open.has(d)) (byKey[k] = byKey[k] || []).push(n ?? t);
  const zero = CAT.filter((m) => m.plan !== "computed" && (byKey[m.key] || []).length >= 5 && byKey[m.key].every((v) => Number(v) === 0));
  const steady = CAT.filter((m) => m.plan === "carry" && (byKey[m.key] || []).length >= 5 && new Set(byKey[m.key].map(String)).size === 1);
  const li = (arr) => arr.map((m) => `<li><b>${esc(m.section === "Daily" ? m.label : m.section + " · " + m.label)}</b>${m.code ? " " + esc(m.code) : ""} <span class="sub">${esc(m.source_note || "")}</span></li>`).join("");
  let h = `<div class="card"><h3>1 · Worked out for you — never typed (${CAT.filter((m) => m.plan === "computed").length} lines)</h3><ul>${li(CAT.filter((m) => m.plan === "computed"))}</ul>
    <p class="sub">Checked against every September day in the email: the page's arithmetic matches all 21 days exactly.</p></div>`;
  h += `<div class="card"><h3>2 · Carried from the last day — confirm, change only when it changes (${CAT.filter((m) => m.plan === "carry").length} lines)</h3><ul>${li(CAT.filter((m) => m.plan === "carry"))}</ul>
    ${steady.length ? `<p class="sub">Did not change once in ${esc(ST.month)}: ${steady.map((m) => esc(m.section + " " + m.label)).join(", ")}.</p>` : ""}</div>`;
  h += `<div class="card"><h3>3 · Zero every day in ${esc(ST.month)} — candidates to drop (Cindy and David decide)</h3>${zero.length ? `<ul>${li(zero)}</ul>` : `<div class="empty">None this month.</div>`}</div>`;
  h += `<div class="card"><h3>4 · Could come from a report instead of typing</h3><table class="tbl"><thead><tr><th>Lines</th><th>Where the number comes from</th><th>What we need</th></tr></thead><tbody>
    <tr><td>The taker lines (Marion 650 … David 771), EDMONTON ORDERS, CALGARY ORDERS</td><td>A P21 report by taker. They are not new orders (the order register gives 82 Edmonton / 40 Calgary for 09/29, the sheet 99 / 52) and not Dynamics shipments (Dynamics Shipped stage for 09/29 gives 136, the sheet 151)</td><td>Cindy names the P21 report; it gets sent nightly to the intake mailbox like the order registers — then these 11 lines fill themselves</td></tr>
    <tr><td>Total Orders, Total Pick &amp; Holds, Total Items</td><td>P21 (pick tickets / lines for the day)</td><td>The same: name the report, send it nightly</td></tr>
    <tr><td>Overdue Orders, Orders Over $250, Cannot Locate</td><td>P21 open-order and cannot-locate lists</td><td>One report each, or drop the lines that stay at 0</td></tr>
    <tr><td>M-Machine-Orders New / Complete / Incomplete All</td><td>P21 machining work orders; Dynamics machining lines are a cross-check only (September: about 3 lines off per day)</td><td>The P21 machining report sent nightly; until then the Dynamics number shows beside the box</td></tr>
    <tr><td>Picker lines, Transfer Picks, Orders not Picked, Pick &amp; Hold not picked</td><td>The paper "Picking – Productivity Report" tally sheet — not in any system</td><td>Keep typing these (about 24 numbers), or scan the sheet to the intake mailbox for a read-and-confirm step later</td></tr>
    </tbody></table></div>`;
  if (WHO.master) {
    h += `<div class="card" id="whocard"><h3>Who can enter the Ship Register</h3><div id="acclist"><div class="empty">Loading…</div></div>
      <div class="rowform"><input id="acc_email" placeholder="name@sealsonline.com"><input id="acc_name" placeholder="Full name"><button class="btn small" id="acc_add">Add as Ship Register entry</button><span class="msg" id="acc_msg"></span></div>
      <p class="sub">Entry people can type and submit the last 7 days. Masters (HR and sales management) can change any day and mark CLOSED days.</p></div>`;
  }
  $("#content").innerHTML = h;
  if (WHO.master) wireAccess();
}
async function wireAccess() {
  const load = async () => {
    try {
      const list = await rpc("svc_access_list");
      $("#acclist").innerHTML = `<table class="tbl"><thead><tr><th>Email</th><th>Name</th><th>Access</th><th></th></tr></thead><tbody>` + list.filter((a) => a.active).map((a) =>
        `<tr><td>${esc(a.email)}</td><td>${esc(a.full_name || "")}</td><td>${a.role === "entry" ? "Ship Register entry" : esc(a.role)}</td><td>${a.role === "entry" ? `<button class="linkbtn" data-rm="${esc(a.email)}">Remove</button>` : ""}</td></tr>`).join("") + `</tbody></table>`;
      document.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = async () => { try { await rpc("svc_access_set", { p_email: b.dataset.rm, p_role: "entry", p_full_name: null, p_active: false }); load(); } catch (e) { $("#acc_msg").className = "msg err"; $("#acc_msg").textContent = e.message; } }));
    } catch (e) { $("#acclist").innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  };
  $("#acc_add").onclick = async () => {
    const m = $("#acc_msg");
    try { await rpc("svc_access_set", { p_email: $("#acc_email").value, p_role: "entry", p_full_name: $("#acc_name").value, p_active: true }); m.className = "msg ok"; m.textContent = "Added ✓ — they sign in on this page with their email"; $("#acc_email").value = ""; $("#acc_name").value = ""; load(); }
    catch (e) { m.className = "msg err"; m.textContent = e.message; }
  };
  load();
}
boot();
