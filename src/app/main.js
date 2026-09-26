/* ---------- render ----------
   Every change redraws the whole view, which destroys whatever had focus. Tab
   from a bill's name to its amount and the change event fires, the view is
   rebuilt, and the field you were moving into is gone from under you. So the
   focused field is remembered by what it edits and the caret put back. */
function rememberFocus() {
  const el = document.activeElement, view = $('#view');
  if (!el || !view || !view.contains(el)) return null;
  const sel = el.dataset.set ? `[data-set="${CSS.escape(el.dataset.set)}"]`
    : el.dataset.hours ? `[data-hours="${el.dataset.hours}"][data-payday="${el.dataset.payday}"]`
    : el.id ? `#${CSS.escape(el.id)}` : null;
  if (!sel) return null;
  let start = null, end = null;
  try { start = el.selectionStart; end = el.selectionEnd; } catch (e) { }   // number inputs refuse
  return { sel, start, end };
}
function restoreFocus(f) {
  if (!f) return;
  const el = $('#view ' + f.sel); if (!el) return;
  el.focus({ preventScroll: true });
  if (f.start !== null && f.start !== undefined) { try { el.setSelectionRange(f.start, f.end); } catch (e) { } }
}
function buildTabs() {
  const n = $('#tabs');
  n.innerHTML = TABS.map(t => `<button role="tab" data-act="tab" data-tab="${t.k}" aria-selected="false" aria-controls="view">${svg(t.d)}<span>${t.l}</span></button>`).join('');
}
function render(keepScroll = true) {
  const y = window.scrollY, focus = rememberFocus();
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
  const u = $('#undoBtn'), last = hist.past[hist.past.length - 1];
  u.hidden = !last;
  u.setAttribute('aria-label', last ? `Undo ${last.label}` : 'Undo');
  u.title = last ? `Undo ${last.label}` : '';
  chartData = v.chart || null;
  drawChart();
  window.scrollTo(0, keepScroll ? y : 0);
  restoreFocus(focus);
}
/* undefined means "could not read that" — a lone minus sign, 9e999 — which is
   not the same as a box cleared on purpose, and must not wipe the figure. */
function parseInput(el) {
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'number') {
    if (el.validity && el.validity.badInput) return undefined;
    if (el.value === '') return null;
    const v = parseFloat(el.value);
    if (!isFinite(v)) return undefined;
    // 4.1 / 100 is 0.040999999999999995 in binary, which is what would get stored
    return el.dataset.kind === 'pct' ? Math.round(v * 1e4) / 1e6 : v;
  }
  return el.value === '' ? null : el.value;
}

/* ---------- events ---------- */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act, d = t.dataset;
  if (!S && a !== 'forgotPin') return;                 // still locked; nothing to act on
  // the second click of a double-click lands on whatever slid up under the pointer
  if (e.detail > 1 && a.startsWith('del')) return;
  if (a === 'tab') { tab = d.tab; if (d.sec) ui.moneyTab = d.sec;
    if (d.payday) { ui.payday = d.payday; ui.openYears[d.payday.slice(0, 4)] = true; }   // land on the one being asked about
    render(false); return; }
  if (a === 'moneyTab') { ui.moneyTab = d.v; render(false); return; }
  if (a === 'theme') { setTheme(d.v); return; }
  if (a === 'pick') { ui.payday = d.payday; ui.openYears[d.payday.slice(0, 4)] = true; render(false); return; }
  if (a === 'yeartoggle') { ui.openYears[d.y] = !ui.openYears[d.y]; render(); return; }
  if (a === 'undo') { undo(); return; }
  if (a === 'redo') { redo(); return; }
  if (a === 'hstep') { const h = S.pay.hours[d.payday] = S.pay.hours[d.payday] || {}; h[d.kind] = Math.max(0, C.r2(C.num(h[d.kind]) + (+d.d))); if (!h.ot && !h.sun) delete S.pay.hours[d.payday]; commit('the hours'); return; }
  if (a === 'toggle') { ui[d.key] = !ui[d.key]; render(); return; }
  if (a === 'shift') { S.money.dueShift = d.v; commit('the due-date setting'); return; }
  if (a === 'sign') {
    const wrap = t.closest('.signed'), el = wrap && wrap.querySelector('input');
    if (!el) return;
    const raw = el.value.trim();
    if (raw === '' || !isFinite(parseFloat(raw))) { el.focus(); toast('Type the amount first, then tap ±'); return; }
    setPath(S, el.dataset.set, -parseFloat(raw));
    if (el.dataset.set === 'money.balance') balanceFixed();
    commit('flipping the sign'); return;
  }
  if (a === 'morePeriods') { ui.flowPeriods = ui.flowPeriods >= 12 ? 4 : ui.flowPeriods + 4; render(); return; }
  if (a === 'set') { ui.set = d.set; ui.search = ''; render(); return; }
  if (a === 'tick') { const it = S[d.col][+d.i]; it.have = !it.have; commit(`${it.have ? 'ticking' : 'unticking'} ${it.card}`); return; }
  if (a === 'psm') { const it = S.psm[+d.i]; it[d.k] = !it[d.k]; commit('the magazine tick'); return; }
  if (a === 'grade') { const it = S[d.col][+d.i];
    const g = await dialog({ title: 'Grade', body: esc(it.card), ok: 'Save', input: it.grade || '' });
    if (g === null) return; it.grade = g; commit(`grading ${it.card}`); return; }
  if (a === 'cycle') { const j = S.house[+d.i]; const order = ['To do', 'In progress', 'Done']; j.status = order[(order.indexOf(j.status) + 1) % 3]; if (j.status === 'Done' && !j.dateDone) j.dateDone = C.today(); if (j.status === 'To do') j.dateDone = null; commit(`moving ${j.job || 'a job'} to ${j.status}`); return; }
  if (a === 'addJob') { S.house.push({ id: uid(), job: '', status: 'To do', dateDone: null, notes: '' }); ui.editJobs = true; commit('adding a job'); return; }
  if (a === 'delJob') { const j = S.house[+d.i]; if (await confirmDlg('Remove this job?', esc(j.job || ''))) { drop(S.house, j); removed(j.job || 'a job'); } return; }
  if (a === 'billChecked') {
    const b = S.money.bills.find(x => x.id === d.id); if (!b) return;
    b.reviewedOn = C.mkey(C.today());
    commit(`checking ${b.name || 'that bill'}`);
    toast(`${b.name || 'That bill'} left as it is`, UNDO);
    return;
  }
  if (a === 'billSkip') {
    const b = S.money.bills[+d.i]; if (!b) return;
    if (!Array.isArray(b.skip)) b.skip = [];
    const mo = +d.m, at = b.skip.indexOf(mo);
    if (at >= 0) b.skip.splice(at, 1); else { b.skip.push(mo); b.skip.sort((x, y) => x - y); }
    commit(`the months for ${b.name || 'that bill'}`);
    return;
  }
  if (a === 'addBill') { S.money.bills.push({ id: uid(), name: '', category: 'Other', amount: null, dueDay: null, started: C.mkey(C.today()), ended: null, link: null,
    skip: [], review: null, reviewedOn: null }); commit('adding a bill'); return; }
  if (a === 'delBill') { const b = S.money.bills[+d.i]; if (await confirmDlg('Remove this bill?', esc(b.name || ''))) { drop(S.money.bills, b); removed(b.name || 'a bill'); } return; }
  if (a === 'addMonth') { const k = nextMonthKey(); if (!S.money.months.some(x => x.month === k)) { S.money.months.push({ month: k, earnings: null, saved: null }); S.money.months.sort((a, b) => a.month.localeCompare(b.month)); commit(`adding ${C.fmtM(k)}`); toast('Added ' + C.fmtM(k)); } return; }
  /* Money in and out of the pot as it happens: the amount moved, not a new
     total. Typing the total again is how you lose track of what went in. */
  if (a === 'savMove') {
    const sv = S.money.savings, up = +d.d > 0;
    const v = await dialog({ title: up ? 'Add to savings' : 'Take out of savings',
      body: `${C.gbp(C.num(sv.balance))} in the pot now. Type what you are moving.`,
      ok: up ? 'Add' : 'Take out', input: '', inputType: 'number' });
    if (v === null) return;
    const amt = Math.abs(parseFloat(v));
    if (!amt || isNaN(amt)) { toast('Type an amount first'); return; }
    const was = C.num(sv.balance);
    sv.balance = C.r2(up ? was + amt : Math.max(0, was - amt));   // the pot cannot hold less than nothing
    const moved = C.r2(Math.abs(sv.balance - was));
    commit(up ? 'adding to savings' : 'taking from savings');
    toast(`${C.gbp(moved)} ${up ? 'into' : 'out of'} savings${!up && !sv.balance ? ', now empty' : ''}`, UNDO);
    return;
  }
  /* Bought one of the things on the list: its price comes out of the pot and it
     moves down to Already got. The figure is only a suggestion — what you
     actually paid is what leaves. */
  if (a === 'goalGot') {
    const sv = S.money.savings, g = sv.goals.find(x => x.id === d.id);
    if (!g) return;
    const name = g.name || 'it';
    const v = await dialog({ title: `Got ${name}?`,
      body: `${C.gbp(C.num(sv.balance))} in the pot. Change the figure if you paid something else.`,
      ok: 'Take it out', cancel: 'Not yet', input: C.num(g.cost) || '', inputType: 'number' });
    if (v === null) return;
    const amt = Math.abs(parseFloat(v));
    if (isNaN(amt)) { toast('Type what you paid'); return; }
    const was = C.num(sv.balance);
    sv.balance = C.r2(Math.max(0, was - amt));
    g.paid = C.r2(Math.min(amt, was));                   // what genuinely left the pot
    g.got = C.today();
    commit(`getting ${name}`);
    toast(`${C.gbp(g.paid)} out for ${name}`, UNDO);
    return;
  }
  if (a === 'addGoal') { S.money.savings.goals.push({ id: uid(), name: '', cost: null, got: null, paid: null }); ui.editGoals = true; commit('adding to the list'); return; }
  if (a === 'delGoal') { const sv = S.money.savings, g = sv.goals.find(x => x.id === d.id);
    if (g && await confirmDlg('Take this off the list?', esc(g.name || ''))) { drop(sv.goals, g); removed(g.name || 'it'); } return; }
  if (a === 'addDebt') { S.money.debts.push({ id: uid(), name: '', type: 'Short-term', balance: null, repayment: null, apr: null, notes: '' }); commit('adding a debt'); return; }
  if (a === 'delDebt') { const x = S.money.debts[+d.i]; if (await confirmDlg('Remove this debt?', esc(x.name || ''))) { drop(S.money.debts, x); removed(x.name || 'a debt'); } return; }
  if (a === 'addYear') { const Y = S.pay.taxYears, last = Y[Y.length - 1];
    Y.push(Object.assign({}, last, { from: (+String(last.from).slice(0, 4) + 1) + '-04-06' })); commit('adding a tax year'); return; }
  if (a === 'delYear') { if (S.pay.taxYears.length > 1) { S.pay.taxYears.splice(+d.i, 1); removed('a tax year'); } return; }
  if (a === 'addRise') { S.pay.rises.push({ from: '', salary: null, arrearsOn: '', otBackpay: true }); commit('adding a pay change'); return; }
  if (a === 'delRise') { S.pay.rises.splice(+d.i, 1); removed('a pay change'); return; }
  if (a === 'addFixed') { S.pay.fixed.push({ name: '', amount: null, treatment: 'After-tax', from: '', to: '' }); ui.editFixed = true; commit('adding an item'); return; }
  if (a === 'delFixed') { const f = S.pay.fixed[+d.i]; S.pay.fixed.splice(+d.i, 1); removed(f && f.name || 'an item'); return; }
  if (a === 'addGame') { const n = $('#g_name').value.trim(); if (!n) { toast('Type the game first'); $('#g_name').focus(); return; }
    S.games.push({ id: uid(), game: n, date: $('#g_date').value || null, notes: $('#g_notes').value.trim() });
    ui.game = { name: '', date: null, notes: '' }; commit(`adding ${n}`); toast('Added to log'); return; }
  if (a === 'delGame') { const g = S.games.find(x => x.id === d.id);
    if (await confirmDlg('Remove from the log?', esc(g ? g.game : ''))) { S.games = S.games.filter(x => x.id !== d.id); removed(g ? g.game : 'a game'); } return; }
  /* The card comes off the balance as it stands today — bills and pay carried
     since it was typed included — rather than off the old typed figure, and
     the reading keeps its date: the app moved this money, the bank did not
     say so. The next balance typed takes the adjustment with it. */
  if (a === 'amexClear') {
    const m = S.money, amt = Math.abs(C.num(m.amex));
    if (!amt) { toast('No card balance to clear'); return; }
    const hasBal = m.balance !== null && m.balance !== undefined && m.balance !== '';
    m.amexUndo = { amex: m.amex, adj: C.num(m.balanceAdj), at: C.today() };     // exactly what it takes to put back
    m.amex = 0;
    if (hasBal) m.balanceAdj = C.r2(C.num(m.balanceAdj) - amt);
    commit('paying the card');
    toast(hasBal ? `${C.gbp(amt)} off your balance — undo is right there` : 'Card cleared — there is no bank balance to take it off');
    return;
  }
  if (a === 'amexUndo') {
    const m = S.money, u = m.amexUndo;
    if (!u) return;
    m.amex = u.amex;
    if (u.adj !== undefined) m.balanceAdj = u.adj;
    else {                                             // saved by the version that rewrote the balance
      m.balance = u.balance; m.balanceOn = u.balanceOn;
      if (u.logLen != null) m.balanceLog.length = Math.min(u.logLen, m.balanceLog.length);
    }
    m.amexUndo = null;
    commit('putting the card back');
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
      S = clone(SEED); normalize(); commit('the reset'); toast(SEED.generic ? 'Cleared' : 'Reset to spreadsheet data', UNDO); } return; }
});
/* Something has just gone: say so, with the way back right there. */
function removed(what) { commit(`removing ${what}`); toast(`Removed ${what}`, UNDO); }
/* By identity, not index: a confirm dialog can sit open while the list changes under it. */
function drop(list, item) { const i = list.indexOf(item); if (i >= 0) list.splice(i, 1); }
/* What a field is called, for "Undo changing Buffer to keep back". */
function fieldLabel(el) {
  const f = el.closest('.field, .switch, label'), l = f && f.querySelector('label, .sl b, b');
  const txt = (l && l.textContent || el.getAttribute('aria-label') || '').trim();
  return txt ? `changing ${txt}` : 'the last edit';
}
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'importFile') { if (el.files[0]) importBackup(el.files[0]); el.value = ''; return; }
  if (el.dataset.hours) { const hv = C.num(el.value); if (!isFinite(hv)) { toast("That isn't a number — left as it was"); render(); return; }
    const h = S.pay.hours[el.dataset.payday] = S.pay.hours[el.dataset.payday] || {}; h[el.dataset.hours] = Math.max(0, C.r2(hv)); if (!h.ot && !h.sun) delete S.pay.hours[el.dataset.payday]; commit('the hours'); return; }
  const val = el.dataset.set ? parseInput(el) : null;
  // a figure the keyboard could not make sense of, or a date that must be there, is refused rather than wiped
  if (el.dataset.set && (val === undefined || (val === null && el.required))) {
    toast(val === undefined ? "That isn't a number — left as it was" : 'That needs a date — left as it was'); render(); return;
  }
  const amt = el.dataset.set && el.dataset.set.match(/^money\.bills\.(\d+)\.amount$/);
  if (amt) { billAmountChanged(+amt[1], val); return; }
  if (el.dataset.set) {
    /* New terms apply from today. Without this, typing the new rate when a fix
       ends re-ran the whole carry since the statement at that rate, and moved
       a mortgage by thousands for months already paid at the old one. A blank
       APR is different: that was never a rate, just a missing one, so filling
       it in reworks the carry from the statement, which is the honest figure. */
    const dt = el.dataset.set.match(/^money\.debts\.(\d+)\.(apr|repayment)$/);
    const dtd = dt && S.money.debts[+dt[1]];
    if (dtd) { const now = C.debtNow(dtd, S.money, C.today(), flowOpt());
      if (now.carried && !now.noRate) { dtd.balance = now.balance; dtd.balanceOn = C.today(); } }
    setPath(S, el.dataset.set, val);
    if (el.dataset.set === 'money.balance') balanceTyped();        // stamped, so a stale figure is obvious
    if (el.dataset.set === 'money.amex') S.money.amexUndo = null;
    // saying when a bill changes price is knowing its price now: the first check is next time round
    const rv = el.dataset.set.match(/^money\.bills\.(\d+)\.review$/);
    if (rv && S.money.bills[+rv[1]]) S.money.bills[+rv[1]].reviewedOn = C.mkey(C.today());
    // a debt balance is read off a statement, so stamp the day it was true
    const db = el.dataset.set.match(/^money\.debts\.(\d+)\.balance$/);
    if (db && S.money.debts[+db[1]]) S.money.debts[+db[1]].balanceOn = C.today();
    // a new rate answers a fixed term that has run out; the end date is then typed afresh
    const dr = el.dataset.set.match(/^money\.debts\.(\d+)\.apr$/);
    const dd = dr && S.money.debts[+dr[1]];
    if (dd && dd.rateEnds && dd.rateEnds <= C.mkey(C.today())) dd.rateEnds = null;
    commit(fieldLabel(el));
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'search') { ui.search = e.target.value; const l = $('#ticklist'); if (l) l.innerHTML = tickList(); return; }
  // a half-typed game survives the page being redrawn by an edit somewhere else on it
  const gk = { g_name: 'name', g_date: 'date', g_notes: 'notes' }[e.target.id];
  if (gk) ui.game[gk] = e.target.value;
});
/* Another copy of the app, in another tab, has saved. This one is out of date
   now: its next save would undo that change, or — if the other copy has just
   turned the PIN on — put the figures back on the device in the clear. */
addEventListener('storage', e => { if (e.key === KEY) location.reload(); });
document.addEventListener('toggle', e => { if (e.target.dataset && e.target.dataset.key) ui.open[e.target.dataset.key] = e.target.open; }, true);
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'g_name') { e.preventDefault(); $('#g_notes').focus(); return; }
  // Ctrl/Cmd+Z undoes, with Shift (or Ctrl+Y) redoes — but inside a field that is the browser's to handle
  if ((e.ctrlKey || e.metaKey) && !e.altKey && /^[zyZY]$/.test(e.key)) {
    if (!S || $('#dlg').open || typing(e.target)) return;
    e.preventDefault();
    if (e.key.toLowerCase() === 'y' || e.shiftKey) redo(); else undo();
  }
});
const typing = el => !!el && (el.isContentEditable || el.tagName === 'TEXTAREA'
  || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'range'].includes(el.type)));
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
    && b.started && b.started < thisMonth && (!b.ended || b.ended >= thisMonth) && !b.link;
  if (b.review) b.reviewedOn = thisMonth;                  // a new price answers this year's check
  if (!worthKeeping) { b.amount = next; commit(`changing ${b.name || 'a bill'}`); return; }
  const up = next > prev, diff = Math.abs(C.r2(next - prev));
  const keep = await dialog({
    title: `${b.name || 'That bill'} ${up ? 'has gone up' : 'has come down'}`,
    body: `${C.gbp(prev)} → ${C.gbp(next)} a month — ${up ? 'up' : 'down'} ${C.gbp(diff)}, or ${C.gbp(diff * 12, 0)} a year.`,
    ok: 'Keep the old price', cancel: 'Just change it'
  });
  // another change event may have handled this bill while the prompt was open
  if (S.money.bills[i] !== b || C.r2(C.num(b.amount)) !== C.r2(prev) || (b.ended && b.ended < thisMonth)) return;
  if (keep) {
    const lastMonth = b.ended || null;                 // a known final month carries over to the new price
    b.ended = C.mkey(C.addMonths(thisMonth + '-01', -1));
    S.money.bills.splice(i + 1, 0, { ...b, id: uid(), amount: next, started: thisMonth, ended: lastMonth, skip: [...(b.skip || [])] });
    toast(`Old price kept until ${C.fmtM(b.ended)}`);
  } else {
    b.amount = next;
  }
  commit(`the ${b.name || 'bill'} price change`);
}

/* ---------- backup ---------- */
function exportBackup() {
  S.backupOn = C.today();                              // stamped before it is written, so the file records its own date
  const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `decs-tracker-${C.today()}.json`; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  save(); historyMark(); render();                     // downloading is not an edit, so keep it out of undo
  toast('Backup downloaded');
}
function importBackup(file) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const o = JSON.parse(rd.result);
      if (!o || typeof o !== 'object' || !o.pay || !o.money) throw new Error('not a backup');
      // shaped on its way in, and only then put in place: a file that will not take shape changes nothing
      const was = S;
      try { S = o; normalize(); } catch (err) { S = was; throw err; }
      commit('restoring the backup'); toast('Backup restored', UNDO);
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
  try { raw = localStorage.getItem(KEY); } catch (e) { }     // readable even when it is too full to write
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
  try { normalize(); }
  catch (err) {
    /* What was stored will not take shape. Keep it — aside if it was in the
       clear, untouched if it was sealed — and start from the defaults. */
    console.error(err);
    if (!cryptoKey) { try { localStorage.setItem(KEY + ':unreadable', JSON.stringify(S)); } catch (e) { saveFrozen = true; } }
    else saveFrozen = true;
    unreadable = true; S = clone(SEED); normalize();
  }
  save();
  historyMark();                                       // undo starts from here
  if (PAY_ONLY) { tab = 'pay'; $('#tabs').closest('nav').style.display = 'none'; document.body.classList.add('notabs'); }
  lastDay = C.today();
  render(false);
  askPersist().then(v => { if (v !== null && tab === 'settings') render(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => { });
})();
