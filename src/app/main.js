/* ---------- render ---------- */
function buildTabs() {
  const n = $('#tabs');
  n.innerHTML = TABS.map(t => `<button role="tab" data-act="tab" data-tab="${t.k}" aria-selected="false" aria-controls="view">${svg(t.d)}<span>${t.l}</span></button>`).join('');
}
function render(keepScroll = true) {
  const y = window.scrollY;
  let v;
  try { v = VIEWS[tab](); } catch (err) {
    console.error(err);
    v = { title: 'Something broke', sub: '', html: `<div class="card"><h2>That view wouldn't draw</h2>
      <div class="muted">Usually a backup with something missing in it. Your data is untouched — download it, then reset and restore.</div>
      <pre class="mono small errpre">${esc(String(err && err.message || err))}</pre>
      <div class="btnrow"><button class="btn" data-act="export">Download backup</button><button class="btn ghost" data-act="tab" data-tab="home">Back to Home</button>
      <button class="btn danger" data-act="reset">Reset everything</button></div></div>` };
  }
  $('#title').textContent = v.title; $('#sub').textContent = v.sub || ''; $('#view').innerHTML = v.html;
  document.querySelectorAll('.tabs button').forEach(b => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  $('#settingsBtn').classList.toggle('on', tab === 'settings');
  drawChart();
  window.scrollTo(0, keepScroll ? y : 0);
}
function parseInput(el) {
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'number') { if (el.value === '') return null; const v = parseFloat(el.value); if (isNaN(v)) return null; return el.dataset.kind === 'pct' ? v / 100 : v; }
  return el.value === '' ? null : el.value;
}

/* ---------- events ---------- */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act, d = t.dataset;
  if (!S && a !== 'forgotPin') return;                 // still locked; nothing to act on
  if (a === 'tab') { tab = d.tab; if (d.sec) ui.moneyTab = d.sec; render(false); return; }
  if (a === 'moneyTab') { ui.moneyTab = d.v; render(false); return; }
  if (a === 'theme') { setTheme(d.v); return; }
  if (a === 'pick') { ui.payday = d.payday; ui.openYears[d.payday.slice(0, 4)] = true; render(false); return; }
  if (a === 'yeartoggle') { ui.openYears[d.y] = !ui.openYears[d.y]; render(); return; }
  if (a === 'hstep') { const h = S.pay.hours[d.payday] = S.pay.hours[d.payday] || {}; h[d.kind] = Math.max(0, C.num(h[d.kind]) + (+d.d)); if (!h.ot && !h.sun) delete S.pay.hours[d.payday]; commit(); return; }
  if (a === 'toggle') { ui[d.key] = !ui[d.key]; render(); return; }
  if (a === 'shift') { S.money.dueShift = d.v; commit(); return; }
  if (a === 'sign') {
    const wrap = t.closest('.signed'), el = wrap && wrap.querySelector('input');
    if (!el) return;
    const raw = el.value.trim();
    if (raw === '' || isNaN(parseFloat(raw))) { el.focus(); toast('Type the amount first, then tap ±'); return; }
    setPath(S, el.dataset.set, -parseFloat(raw));
    if (el.dataset.set === 'money.balance') { S.money.balanceOn = C.today(); S.money.amexUndo = null; }
    commit(); return;
  }
  if (a === 'morePeriods') { ui.flowPeriods = ui.flowPeriods >= 12 ? 4 : ui.flowPeriods + 4; render(); return; }
  if (a === 'set') { ui.set = d.set; ui.search = ''; render(); return; }
  if (a === 'tick') { const it = S[d.col][+d.i]; it.have = !it.have; commit(); return; }
  if (a === 'psm') { const it = S.psm[+d.i]; it[d.k] = !it[d.k]; commit(); return; }
  if (a === 'grade') { const it = S[d.col][+d.i];
    const g = await dialog({ title: 'Grade', body: esc(it.card), ok: 'Save', input: it.grade || '' });
    if (g === null) return; it.grade = g; commit(); return; }
  if (a === 'cycle') { const j = S.house[+d.i]; const order = ['To do', 'In progress', 'Done']; j.status = order[(order.indexOf(j.status) + 1) % 3]; if (j.status === 'Done' && !j.dateDone) j.dateDone = C.today(); if (j.status === 'To do') j.dateDone = null; commit(); return; }
  if (a === 'addJob') { S.house.push({ id: uid(), job: '', status: 'To do', dateDone: null, notes: '' }); ui.editJobs = true; commit(); return; }
  if (a === 'delJob') { if (await confirmDlg('Remove this job?', esc(S.house[+d.i].job || ''))) { S.house.splice(+d.i, 1); commit(); } return; }
  if (a === 'addBill') { S.money.bills.push({ id: uid(), name: '', category: 'Other', amount: null, dueDay: null, started: C.mkey(C.today()), ended: null, link: null }); commit(); return; }
  if (a === 'delBill') { if (await confirmDlg('Remove this bill?', esc(S.money.bills[+d.i].name || ''))) { S.money.bills.splice(+d.i, 1); commit(); } return; }
  if (a === 'addMonth') { const k = nextMonthKey(); if (!S.money.months.some(x => x.month === k)) { S.money.months.push({ month: k, earnings: null, saved: null }); S.money.months.sort((a, b) => a.month.localeCompare(b.month)); commit(); toast('Added ' + C.fmtM(k)); } return; }
  if (a === 'addPot') { S.money.pots.push({ id: uid(), name: '', balance: null, target: null, monthly: null }); ui.editPots = true; commit(); return; }
  if (a === 'delPot') { if (await confirmDlg('Remove this pot?', esc(S.money.pots[+d.i].name || ''))) { S.money.pots.splice(+d.i, 1); commit(); } return; }
  if (a === 'addDebt') { S.money.debts.push({ id: uid(), name: '', type: 'Short-term', balance: null, repayment: null, apr: null, notes: '' }); commit(); return; }
  if (a === 'delDebt') { if (await confirmDlg('Remove this debt?', esc(S.money.debts[+d.i].name || ''))) { S.money.debts.splice(+d.i, 1); commit(); } return; }
  if (a === 'addYear') { const Y = S.pay.taxYears, last = Y[Y.length - 1];
    Y.push(Object.assign({}, last, { from: (+String(last.from).slice(0, 4) + 1) + '-04-06' })); commit(); return; }
  if (a === 'delYear') { if (S.pay.taxYears.length > 1) S.pay.taxYears.splice(+d.i, 1); commit(); return; }
  if (a === 'addRise') { S.pay.rises.push({ from: '', salary: null, arrearsOn: '', otBackpay: true }); commit(); return; }
  if (a === 'delRise') { S.pay.rises.splice(+d.i, 1); commit(); return; }
  if (a === 'addFixed') { S.pay.fixed.push({ name: '', amount: null, treatment: 'After-tax', from: '', to: '' }); ui.editFixed = true; commit(); return; }
  if (a === 'delFixed') { S.pay.fixed.splice(+d.i, 1); commit(); return; }
  if (a === 'addGame') { const n = $('#g_name').value.trim(); if (!n) { toast('Type the game first'); $('#g_name').focus(); return; }
    S.games.push({ id: uid(), game: n, date: $('#g_date').value || null, notes: $('#g_notes').value.trim() }); commit(); toast('Added to log'); return; }
  if (a === 'delGame') { const g = S.games.find(x => x.id === d.id);
    if (await confirmDlg('Remove from the log?', esc(g ? g.game : ''))) { S.games = S.games.filter(x => x.id !== d.id); commit(); } return; }
  if (a === 'amexClear') {
    const amt = Math.abs(C.num(S.money.amex));
    if (!amt) { toast('No card balance to clear'); return; }
    // snapshot first so this is exactly reversible
    S.money.amexUndo = { balance: S.money.balance, balanceOn: S.money.balanceOn, amex: S.money.amex, at: C.today() };
    S.money.balance = C.r2(C.num(S.money.balance) - amt);
    S.money.balanceOn = C.today();
    S.money.amex = 0;
    commit();
    toast(`${C.gbp(amt)} off your balance — undo is right there`);
    return;
  }
  if (a === 'amexUndo') {
    const u = S.money.amexUndo;
    if (!u) return;
    S.money.balance = u.balance; S.money.balanceOn = u.balanceOn; S.money.amex = u.amex;
    S.money.amexUndo = null;
    commit();
    toast('Put back');
    return;
  }
  if (a === 'setPin') { setPin(); return; }
  if (a === 'changePin') { changePin(); return; }
  if (a === 'clearPin') { clearPin(); return; }
  if (a === 'forgotPin') {
    const yes = await dialog({ title: 'There is no way back in',
      body: 'The figures on this device are encrypted with your PIN and cannot be recovered without it. You can clear this device and restore a backup instead — everything in the backup comes back.',
      ok: 'Clear and start again', danger: true });
    if (!yes) return;
    try { localStorage.removeItem(KEY); } catch (e) { }
    location.reload();
    return;
  }
  if (a === 'import') { $('#importFile').click(); return; }
  if (a === 'export') { exportBackup(); return; }
  if (a === 'copy') { (navigator.clipboard ? navigator.clipboard.writeText(JSON.stringify(S)) : Promise.reject()).then(() => toast('Backup copied — paste it somewhere safe'), () => toast('Copy not available here')); return; }
  if (a === 'reset') { if (await confirmDlg(SEED.generic ? 'Clear everything on this device?' : 'Reset to the spreadsheet data?',
      SEED.generic ? 'Restore a backup to get it back.' : 'Your changes on this device will be lost.', 'Yes, clear it')) {
      S = clone(SEED); normalize(); commit(); toast(SEED.generic ? 'Cleared' : 'Reset to spreadsheet data'); } return; }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'importFile') { if (el.files[0]) importBackup(el.files[0]); el.value = ''; return; }
  if (el.dataset.hours) { const h = S.pay.hours[el.dataset.payday] = S.pay.hours[el.dataset.payday] || {}; h[el.dataset.hours] = Math.max(0, C.num(el.value)); if (!h.ot && !h.sun) delete S.pay.hours[el.dataset.payday]; commit(); return; }
  const amt = el.dataset.set && el.dataset.set.match(/^money\.bills\.(\d+)\.amount$/);
  if (amt) { billAmountChanged(+amt[1], parseInput(el)); return; }
  if (el.dataset.set) {
    setPath(S, el.dataset.set, parseInput(el));
    if (el.dataset.set === 'money.balance') S.money.balanceOn = C.today();   // stamp it so a stale figure is obvious
    if (el.dataset.set === 'money.balance' || el.dataset.set === 'money.amex') S.money.amexUndo = null;
    commit();
  }
});
document.addEventListener('input', e => { if (e.target.id === 'search') { ui.search = e.target.value; const l = $('#ticklist'); if (l) l.innerHTML = tickList(); } });
document.addEventListener('toggle', e => { if (e.target.dataset && e.target.dataset.key) ui.open[e.target.dataset.key] = e.target.open; }, true);
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'g_name') { e.preventDefault(); $('#g_notes').focus(); } });
addEventListener('scroll', () => { $('#hdr').classList.toggle('stuck', window.scrollY > 4); }, { passive: true });
let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(drawChart, 150); });
/* Left open overnight, or resumed from the background, the figures would still
   be yesterday's. Redraw whenever the day actually turns over. */
let lastDay = null;
function dayWatch() { if (!S) return; const d = C.today(); if (d !== lastDay) { lastDay = d; render(); } }
const AUTOLOCK_MS = 5 * 60 * 1000;
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  // away long enough with a PIN set: reload so the lock screen comes back
  if (pinIsSet() && hiddenAt && Date.now() - hiddenAt > AUTOLOCK_MS) { location.reload(); return; }
  dayWatch();
});
addEventListener('focus', dayWatch);
setInterval(dayWatch, 60000);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (theme === 'auto') { applyTheme(); drawChart(); } });

/* A bill's price changing is worth recording, not overwriting — that is the
   only way the app can ever tell you what a bill has done over time. Offer the
   split rather than doing it silently, since sometimes you are just fixing a typo. */
async function billAmountChanged(i, next) {
  const b = S.money.bills[i];
  if (!b) return;
  const prev = C.num(b.amount), thisMonth = C.mkey(C.today());
  const worthKeeping = prev && next !== null && C.r2(next) !== C.r2(prev)
    && b.started && b.started < thisMonth && !b.ended && !b.link;
  if (!worthKeeping) { b.amount = next; commit(); return; }
  const up = next > prev, diff = Math.abs(C.r2(next - prev));
  const keep = await dialog({
    title: `${b.name || 'That bill'} ${up ? 'has gone up' : 'has come down'}`,
    body: `${C.gbp(prev)} → ${C.gbp(next)} a month — ${up ? 'up' : 'down'} ${C.gbp(diff)}, or ${C.gbp(diff * 12, 0)} a year.`,
    ok: 'Keep the old price', cancel: 'Just change it'
  });
  // another change event may have handled this bill while the prompt was open
  if (S.money.bills[i] !== b || C.r2(C.num(b.amount)) !== C.r2(prev) || b.ended) return;
  if (keep) {
    b.ended = C.mkey(C.addMonths(thisMonth + '-01', -1));
    S.money.bills.splice(i + 1, 0, { ...b, id: uid(), amount: next, started: thisMonth, ended: null });
    toast(`Old price kept until ${C.fmtM(b.ended)}`);
  } else {
    b.amount = next;
  }
  commit();
}

/* ---------- backup ---------- */
function exportBackup() {
  const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `decs-tracker-${C.today()}.json`; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); toast('Backup downloaded');
}
function importBackup(file) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const o = JSON.parse(rd.result);
      if (!o || typeof o !== 'object' || !o.pay || !o.money) throw new Error('not a backup');
      S = o; normalize(); commit(); toast('Backup restored');
    } catch (e) { toast("That file isn't a backup from this app"); }
  };
  rd.onerror = () => toast("Couldn't read that file");
  rd.readAsText(file);
}

/* ---------- boot ---------- */
(async function boot() {
  try { const t = localStorage.getItem(THEME_KEY); if (t === 'light' || t === 'dark' || t === 'auto') theme = t; } catch (e) { }
  applyTheme();
  buildTabs();
  storageOK = probeStorage();
  let raw = null;
  if (storageOK) { try { raw = localStorage.getItem(KEY); } catch (e) { } }
  const blob = encBlob(raw);
  if (blob) {
    if (!CRYPTO_OK) {                                  // encrypted, but this browser cannot decrypt
      document.body.classList.add('locked');
      $('#lock').hidden = false;
      $('#lockHint').textContent = 'This browser cannot decrypt the saved data. Open the app over https, or restore a backup.';
      $('#pinIn').hidden = true; $('#lockGo').hidden = true;
      return;
    }
    await unlockScreen(blob);                          // resolves once the PIN opens it
  } else {
    S = load();
  }
  normalize();
  save();
  if (PAY_ONLY) { tab = 'pay'; $('#tabs').style.display = 'none'; document.body.classList.add('notabs'); }
  lastDay = C.today();
  render(false);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => { });
})();
