// Fluidseal HR — My Day (2026-10-02). Each picker signs in on their own PC and types what they did: orders and transfers
// picked, assemblies, machining, and an end-of-day note. Orders and transfers fill their line of the Ship Register (source
// "picker:<name>", locked for entry users; a Master can override) until Cindy submits the day. Gated Supabase functions
// public.svc_myday_get / svc_myday_save (schema svc) — the server finds the picker from the signed-in email.
const SUPA_URL = "https://hnmbjqhxvxakhdzgetxw.supabase.co";
const SUPA_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhubWJqcWh4dnhha2hkemdldHh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjUzNjQsImV4cCI6MjA5NTkwMTM2NH0.GSWI113EQ6ZaA1n_lxECqEmc952q14-tZ7dacZNbZf0";
const sb = supabase.createClient(SUPA_URL, SUPA_ANON);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FIELDS = [["orders", "Orders picked", "every order you picked"], ["transfers", "Transfers picked", "transfer picks to other branches"], ["assemblies", "Assemblies", "assemblies you built or picked for"], ["machining", "Machining", "machining jobs you handled"]];
let WHO = null, D = null, DAY = null, timer = null, saving = false;

async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { show("login"); return; }
  $("#userbox").innerHTML = `<span class="who">${esc(session.user.email)}</span> &nbsp; <button class="btn ghost" id="signout">Sign out</button>`;
  $("#signout").onclick = signout;
  const { data, error } = await sb.rpc("svc_whoami");
  if (error || !data || !data.signed_in) { deny("Could not confirm access", `Signed in as <b>${esc(session.user.email)}</b>. Sign out and in again.`); return; }
  WHO = data;
  if (!WHO.worker) {
    deny("Not switched on yet", `Signed in as <b>${esc(WHO.email)}</b>. My Day is switched on per person by Cindy or management. Ask Cindy to switch you on, then reload this page.`,
      WHO.entry ? `<p><a class="btn line" href="register.html">Open the Ship Register</a></p>` : "");
    return;
  }
  DAY = WHO.today;
  show("app");
  load();
}
function show(v) { for (const [id, k] of [["#loginview", "login"], ["#denyview", "deny"], ["#appview", "app"], ["#foot", "app"]]) $(id).classList.toggle("hidden", v !== k); }
function deny(t, html, extra = "") { $("#denytitle").textContent = t; $("#denymsg").innerHTML = html; $("#denyextra").innerHTML = extra; show("deny"); }
async function signout() { await sb.auth.signOut(); location.reload(); }
$("#signout2").onclick = signout;
$("#sendlink").onclick = async () => {
  const email = $("#email").value.trim(), msg = $("#loginmsg");
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) { msg.className = "msg err"; msg.textContent = "Enter a valid email."; return; }
  msg.className = "msg"; msg.textContent = "Sending…";
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split("#")[0] } });
  if (error) { msg.className = "msg err"; msg.textContent = error.message; } else { msg.className = "msg ok"; msg.textContent = "Check your email for the sign-in link, then come back to this page."; }
};
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN") { history.replaceState(null, "", location.pathname); boot(); } });

function addDays(iso, n) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function isWeekend(iso) { return [0, 6].includes(new Date(iso + "T12:00:00Z").getUTCDay()); }
function prevWork(iso) { let d = addDays(iso, -1); while (isWeekend(d)) d = addDays(d, -1); return d; }
function fmtDay(iso) { return new Date(iso + "T12:00:00Z").toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }); }
function mmdd(iso) { return iso.slice(5, 7) + "/" + iso.slice(8, 10); }
function timeMt(iso) { try { return new Date(iso).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", timeZone: "America/Edmonton" }); } catch (e) { return ""; } }

async function load() {
  $("#content").innerHTML = `<div class="loading">Loading ${esc(DAY)}…</div>`;
  try { const { data, error } = await sb.rpc("svc_myday_get", { p_day: DAY }); if (error) throw error; D = data; }
  catch (e) { $("#content").innerHTML = `<div class="card"><div class="msg err">${esc(e.message)}</div></div>`; return; }
  render();
}
function avgOf(k) { const xs = (D.history || []).map((h) => h[k]).filter((v) => v != null).map(Number); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }
function render() {
  const w = D.worker, r = D.row || {}, first = String(w.name || "").split(" ")[0];
  const locked = !D.can_edit, submitted = D.register && D.register.status === "submitted";
  const yday = prevWork(D.today);
  let h = `<div class="card"><h2 class="hi">Hi ${esc(first)} 👋</h2><div class="sub">${esc(fmtDay(DAY))}${w.department ? " · " + esc(w.department) : ""}</div>
    <div class="days"><button class="chip ${DAY === D.today ? "active" : ""}" data-d="${D.today}">Today</button><button class="chip ${DAY === yday ? "active" : ""}" data-d="${yday}">${esc(fmtDay(yday).split(",")[0])}</button>
    <input type="date" id="dpick" value="${DAY}" max="${D.today}" min="${addDays(D.today, -7)}"></div></div>`;
  if ((w.priorities || []).length) h += `<div class="card"><h3>Your priorities</h3><div class="prio">${w.priorities.map((p, i) => `<span><b>${i + 1}</b>${esc(p)}</span>`).join("")}</div></div>`;
  if (submitted) h += `<div class="banner">Cindy has submitted the Ship Register for this day (${esc(timeMt(D.register.submitted_at))}). Your numbers are still saved here; the register keeps hers.</div>`;
  if (r.done) h += `<div class="banner done">✓ Done for the day at ${esc(timeMt(r.done_at))} — you can still fix a number or the note.</div>`;
  if (locked) h += `<div class="banner">Days older than a week are changed by Cindy.</div>`;
  h += `<div class="counters">` + FIELDS.map(([k, lbl, hint]) => {
    const a = avgOf(k), v = r[k];
    const vs = a != null && v != null && DAY !== D.today ? (v >= a ? `<b class="up">▲ ${Math.round(v - a)}</b> above` : `<b class="dn">▼ ${Math.round(a - v)}</b> below`) + ` your 4-week average (${Math.round(a)})` : a != null ? `your usual day (4-week average): ${Math.round(a)}` : "";
    return `<div class="ctr"><div class="lbl">${esc(lbl)}</div><div class="hint">${esc(hint)}</div>
      <div class="row"><button data-dec="${k}" aria-label="minus one" ${locked ? "disabled" : ""}>−</button>
      <input id="f_${k}" inputmode="numeric" value="${v == null ? "" : v}" placeholder="0" ${locked ? "readonly" : ""} aria-label="${esc(lbl)}">
      <button class="plus" data-inc="${k}" aria-label="plus one" ${locked ? "disabled" : ""}>+</button></div><div class="vs" id="vs_${k}">${vs}</div></div>`;
  }).join("") + `</div>`;
  h += `<div class="card" style="margin-top:14px"><h3>End-of-day note</h3>
    <textarea id="note" placeholder="Anything Cindy and management should know — what slowed you down, stock you couldn't find, help you needed, what's left for tomorrow" ${locked ? "readonly" : ""}>${esc(r.note || "")}</textarea>
    <div class="bar"><button class="btn" id="done" ${locked ? "disabled" : ""}>${r.done ? "Save" : "I'm done for today"}</button><span class="msg" id="msg">${r.updated_at ? "Saved " + esc(timeMt(r.updated_at)) : "Tap + as you go, or type the total — it saves by itself."}</span></div></div>`;
  const hist = D.history || [];
  if (hist.length) h += `<div class="card"><h3>Your last ${hist.length} working days</h3><div class="scroll"><table class="tbl"><thead><tr><th>Day</th><th class="num">Orders</th><th class="num">Transfers</th><th class="num">Assemblies</th><th class="num">Machining</th><th>Note</th></tr></thead><tbody>` +
    hist.map((x) => `<tr><td>${esc(fmtDay(x.day).split(",")[0].slice(0, 3))} ${esc(mmdd(x.day))}</td><td class="num">${x.orders ?? "—"}</td><td class="num">${x.transfers ?? "—"}</td><td class="num">${x.assemblies ?? "—"}</td><td class="num">${x.machining ?? "—"}</td><td class="sub">${esc(x.note || (x.mine ? "" : "from the Ship Register"))}</td></tr>`).join("") +
    `</tbody></table></div></div>`;
  $("#content").innerHTML = h;
  document.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => { DAY = b.dataset.d; load(); }));
  $("#dpick").onchange = (e) => { if (e.target.value) { DAY = e.target.value; load(); } };
  if (locked) return;
  const bump = (k, n) => { const i = $(`#f_${k}`); const v = Math.max(0, (parseInt(i.value, 10) || 0) + n); i.value = String(v); queue(); };
  document.querySelectorAll("[data-inc]").forEach((b) => (b.onclick = () => bump(b.dataset.inc, 1)));
  document.querySelectorAll("[data-dec]").forEach((b) => (b.onclick = () => bump(b.dataset.dec, -1)));
  FIELDS.forEach(([k]) => $(`#f_${k}`).addEventListener("input", (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, "").slice(0, 4); queue(); }));
  $("#note").addEventListener("input", () => queue(1500));
  $("#done").onclick = () => save(true);
}
function queue(ms = 800) { clearTimeout(timer); $("#msg").className = "msg"; $("#msg").textContent = "…"; timer = setTimeout(() => save(false), ms); }
async function save(done) {
  if (saving) { queue(400); return; }
  clearTimeout(timer); saving = true;
  const n = (k) => { const v = $(`#f_${k}`).value.trim(); return v === "" ? null : parseInt(v, 10); };
  try {
    const { data, error } = await sb.rpc("svc_myday_save", { p_day: DAY, p_orders: n("orders"), p_transfers: n("transfers"), p_assemblies: n("assemblies"), p_machining: n("machining"), p_note: $("#note").value, p_done: !!done });
    if (error) throw error;
    D = data;
    if (done) render();
    else { $("#msg").className = "msg ok"; $("#msg").textContent = "Saved " + timeMt(new Date().toISOString()); }
  } catch (e) { $("#msg").className = "msg err"; $("#msg").textContent = e.message || String(e); }
  finally { saving = false; }
}
boot();
