/* ---------- components ---------- */
function ledgerRow(e, runningBal, gone) {
  return `<div class="lrow${gone ? ' gone' : ''}"><div class="ld"><span>${esc(C.DOW[C.dow(e.date)])}</span>${+e.date.slice(8)}</div>
    <div class="ln"><b>${esc(e.name)}</b><small>${esc(e.category)}${e.date === C.today() ? '<span class="moved today">today</span>' : ''}${e.moved ? `<span class="moved">${esc(e.why)} → moved</span>` : ''}</small></div>
    <div class="lv">-${C.gbp(e.amount)}${runningBal !== null && runningBal !== undefined ? `<small class="${runningBal < 0 ? 'neg' : ''}">${C.gbp(runningBal)}</small>` : ''}</div></div>`;
}
function potRow(p) {
  return `<div class="prow"><div><b>${esc(p.name || 'Pot')}</b>
      <small class="meta">${p.target
        ? (p.done ? 'target of ' + C.gbp(p.target, 0) + ' reached'
          : C.gbp(p.toGo) + ' to go of ' + C.gbp(p.target, 0)
            + (p.by ? ' · there by ' + esc(C.fmtM(C.mkey(p.by))) : p.stalled ? ' · nothing going in' : ''))
        : (p.monthly ? C.gbp(p.monthly) + ' a month, no target set' : 'no target set')}</small></div>
    <div class="num tr"><b>${C.gbp(p.balance)}</b>${p.target ? `<div class="muted small">${C.pct(p.pct)}</div>` : ''}</div>
    ${p.target ? `<div class="pb">${bar(p.pct, p.done ? '' : 'teal')}</div>` : ''}</div>`;
}
/* ---- the Pay tab, in pieces ---- */
const resRow = (l, v, cls = '') => `<div class="r ${cls}"><span>${esc(l)}</span><span class="num">${v}</span></div>`;
function payslipCard(r) {
  return `<div class="card"><div class="eyebrow">${r.next ? 'Next pay day' : r.past ? 'Paid' : 'Pay day'}${r.next ? '<span class="tag">NEXT</span>' : ''}</div>
      <div class="payhead"><div class="big">${esc(C.fmtD(r.payday))}</div><div class="muted mono">${esc(C.fmtDM(r.start))} – ${esc(C.fmtDM(r.end))}</div></div>
      <div class="hours">${stepper('Overtime hours', r.payday, 'ot', r.ot)}${stepper('Sunday hours', r.payday, 'sun', r.sun)}</div>
      <div class="results">
        ${resRow('Basic pay', C.gbp(r.basic))}${r.allow ? resRow('Allowances', C.gbp(r.allow)) : ''}
        ${resRow('Overtime pay', C.gbp(r.otPay))}${resRow(SUN, C.gbp(r.sunPay))}${r.backpay ? resRow('Backpay (estimate)', C.gbp(r.backpay)) : ''}${r.hpaPay ? resRow('EU Holiday Pay' + (S.pay.hpaHistory[String(+r.refYear - 1)] != null && S.pay.hpaHistory[String(+r.refYear - 1)] !== '' ? '' : ' (estimate)'), C.gbp(r.hpaPay)) : ''}${r.sacr ? resRow('Salary sacrifice', '-' + C.gbp(r.sacr)) : ''}
        ${resRow('Taxable pay', C.gbp(r.taxable))}${resRow('PAYE', '-' + C.gbp(r.paye))}${resRow('National Insurance', '-' + C.gbp(r.ni))}${r.after ? resRow('After-tax deductions', '-' + C.gbp(r.after)) : ''}
        ${resRow('Net pay', C.gbp(r.net), 'total')}
        ${resRow('Extra from overtime', r.extraGross ? C.gbp(r.extra) + '<small>you keep ' + C.pct(r.keep) + '</small>' : '–', 'extra')}
      </div></div>`;
}
/* Every pay day in the schedule, grouped by year; the selected one is highlighted */
function payBoard(p, idx, r) {
  const groups = [];
  p.rows.forEach((x, i) => { const y = x.payday.slice(0, 4); let g = groups[groups.length - 1];
    if (!g || g.y !== y) groups.push(g = { y, rows: [] }); g.rows.push({ x, i }); });
  const thisYear = C.today().slice(0, 4), selYear = r.payday.slice(0, 4);
  groups.forEach(g => { if (ui.openYears[g.y] === undefined) ui.openYears[g.y] = (g.y === thisYear || g.y === selYear); });
  const years = groups.map(g => {
    const open = !!ui.openYears[g.y], logged = g.rows.filter(({ x }) => x.ot || x.sun).length;
    const head = `<button class="yearhdr" data-act="yeartoggle" data-y="${g.y}" aria-expanded="${open}"><span>${g.y}</span><span class="ym">${logged ? logged + ' with hours · ' : ''}${g.rows.length} pay days<i aria-hidden="true">${open ? '−' : '+'}</i></span></button>`;
    if (!open) return head;
    return head + g.rows.map(({ x, i }) => `<button class="brow ${x.past ? 'past' : ''} ${x.next ? 'nextpd' : ''} ${i === idx ? 'sel' : ''}" data-act="pick" data-payday="${x.payday}"${i === idx ? ' aria-current="true"' : ''}>
      <span class="bl"><span class="d">${esc(C.fmtD(x.payday))}${x.next ? '<span class="tag">NEXT</span>' : ''}</span><span class="pr">${esc(C.fmtDM(x.start))} – ${esc(C.fmtDM(x.end))}</span></span>
      <span class="h">${x.ot || x.sun ? `${x.ot ? x.ot + 'h overtime' : ''}${x.ot && x.sun ? ' · ' : ''}${x.sun ? x.sun + 'h Sunday' : ''}` : '<span class="muted">—</span>'}${x.hpaPay ? '<span class="muted small">+ EU Holiday Pay ' + C.gbp(x.hpaPay, 0) + '</span>' : ''}${x.backpay ? '<span class="muted small">+ backpay ' + C.gbp(x.backpay, 0) + '</span>' : ''}</span>
      <span class="n">${C.gbp(x.net, 0)}${x.extraGross ? `<span class="muted small">+${C.gbp(x.extra, 0)}</span>` : ''}</span></button>`).join('');
  }).join('');
  return `<div class="card board"><h2>Pay days</h2><div class="muted small mb4">Tap a year to open or close it, then tap a pay day to log hours for it.</div>
    ${years}
    <div class="row mt8"><div class="l"><b>Tax year ${esc(p.taxYear)}</b><small>${p.totals.ot}h overtime · ${p.totals.sun}h Sunday · ${C.gbp(p.totals.extraGross, 0)} gross extra</small></div><div class="num tr"><b>${C.gbp(p.totals.net, 0)}</b><div class="muted small">+${C.gbp(p.totals.extra, 0)} overtime</div></div></div>
  </div>`;
}
function hpaCard(p) {
  return `<div class="card"><h2>EU Holiday Pay</h2><div class="muted small mb4">Southeastern's Holiday Pay Adjustment: 4/52 of a calendar year's overtime and Sunday pay, paid on the first pay day in March of the next year. Taxed and NI'd like normal pay.</div>
    ${p.hpa.filter(y => y.received != null || y.qualifying > 0 || y.year === C.today().slice(0, 4)).map(y => `<div class="row"><div class="l"><b>${esc(y.year)}</b><small>${y.received != null ? 'received ' + (y.payday ? esc(C.fmtD(y.payday)) : '') : (y.qualifying != null ? C.gbp(y.qualifying) + ' qualifying · ' + y.logged + ' of ' + y.periods + ' periods with hours · due ' + (y.payday ? esc(C.fmtD(y.payday)) : 'March ' + (+y.year + 1)) : '')}</small></div>
      <div class="num tr"><b>${C.gbp(y.gross)}</b>${y.gross ? `<div class="muted small">≈ ${C.gbp(y.net, 0)} after tax</div>` : ''}</div></div>`).join('') || '<div class="empty">Log some hours and the estimate appears here.</div>'}
    <div class="note">What counts: overtime, rest day working, Sunday working/premiums, night and higher-grade payments. Basic pay and London Allowance don't. The estimate only covers periods with hours logged here.</div></div>`;
}
function stepper(label, payday, kind, val) {
  return `<div class="field"><label>${esc(label)}</label><div class="step">
    <button data-act="hstep" data-payday="${payday}" data-kind="${kind}" data-d="-1" aria-label="One fewer ${esc(label)}">−</button>
    <input type="number" inputmode="decimal" step="0.5" min="0" value="${val || ''}" placeholder="0" data-hours="${kind}" data-payday="${payday}" aria-label="${esc(label)}">
    <button data-act="hstep" data-payday="${payday}" data-kind="${kind}" data-d="1" aria-label="One more ${esc(label)}">+</button></div></div>`;
}
function nextMonthKey() {
  const ms = S.money.months;
  const last = ms.length ? ms.map(x => x.month).sort().pop() : null;
  return last ? C.mkey(C.addMonths(last + '-01', 1)) : C.mkey(C.today());
}
function pinCard() {
  if (!CRYPTO_OK) return '';
  return `<div class="card"><h2>PIN lock<span class="hint">${pinIsSet() ? 'on' : 'off'}</span></h2>
    <div class="row"><div class="l"><b>${pinIsSet() ? 'Encrypted on this device' : 'Not set'}</b><small>${pinIsSet()
      ? 'The PIN is needed to open the app, and again after five minutes in the background.'
      : 'Anyone who can unlock this phone can read your figures.'}</small></div>
      <div class="btnrow end">${pinIsSet()
        ? '<button class="btn ghost sm" data-act="changePin">Change</button><button class="btn danger sm" data-act="clearPin">Turn off</button>'
        : '<button class="btn sm" data-act="setPin">Set a PIN</button>'}</div></div>
    <div class="note">${pinIsSet()
      ? 'A downloaded backup is <b>not</b> encrypted, so it can be restored on a new phone. Keep the file somewhere safe.'
      : 'Encrypts everything stored on this device with a PIN only you know. If you forget it the data cannot be recovered, so a backup is downloaded first.'}</div></div>`;
}
function aboutCard() {
  const m = S.money;
  const counts = [[m.bills.length, 'bill'], [m.months.length, 'month'], [m.pots.length, 'pot'], [m.debts.length, 'debt'],
    [S.house.length, 'house job'], [S.classic.length + S.mega.length, 'card'], [S.psm.length, 'magazine'], [S.games.length, 'game']]
    .filter(([n]) => n).map(([n, w]) => `${n} ${w}${n === 1 ? '' : 's'}`).join(' · ');
  return `<div class="card"><h2>About</h2>
    <div class="row"><div class="l"><b>${esc(document.title)}</b><small>${storageOK ? 'Saving on this device.' : 'Not saving on this device.'}${pinIsSet() ? ' Encrypted.' : ''}</small></div></div>
    <div class="row"><div class="l"><b>On this device</b><small>${counts || 'Nothing yet — restore a backup or start typing.'}</small></div></div>
    <div class="row"><div class="l"><b>Undo</b><small>The arrow in the header takes back the last change — a removed bill, a mistyped figure, even a reset — up to ${UNDO_MAX} steps, until the app is closed. Ctrl+Z on a keyboard.</small></div></div>
    <div class="note">Built from Dec's Excel Stuff v2 — same rules, same figures. Tax and NI rates are 2026/27 (HMRC, England/Wales/NI); update them in Pay → Payslip settings each April.</div></div>`;
}
function backupCard(heading, note) {
  return `<div class="card"><h2>${esc(heading)}</h2>
    <div class="muted">${storageOK ? 'Changes save automatically on this device.' : 'Not saving on this device.'} A backup is a small file you can restore on any phone or after a reset.</div>
    <div class="btnrow"><button class="btn" data-act="export">Download backup</button><button class="btn ghost" data-act="copy">Copy backup</button>
      <button class="btn ghost" data-act="import">Restore backup</button>
      <button class="btn danger" data-act="reset">${SEED.generic ? 'Clear all data' : 'Reset to spreadsheet data'}</button></div>
    <input type="file" accept=".json,application/json" id="importFile" hidden>
    <div class="note">${note}</div></div>`;
}
function paySettings(p) {
  const P = S.pay;
  return `<div class="card"><h2>Payslip settings</h2><div class="muted small">From your payslip. Hourly rate = salary ÷ weeks ÷ hours (${C.gbp(p.hourly)}/hr, basic ${C.gbp(p.basic)} a period). When your pay changes, add a line under Pay rises rather than editing the salary — that keeps past pay days as they were.</div>
    ${detailsBlock('yourpay', 'Your pay', `<div class="grid2">
      ${field('Annual basic salary', inp('pay.salary', P.salary))}${field('Contracted hours / week', inp('pay.hoursWeek', P.hoursWeek))}
      ${field('Weeks per year (payroll)', inp('pay.weeksYear', P.weeksYear))}${P.sundayAtT ? field('Sunday hours', '<input type="text" value="paid at plain time" disabled>') : field('Sunday premium £/hr', inp('pay.sundayRate', P.sundayRate))}
      ${field('Next pay day', inp('pay.nextPayDay', P.nextPayDay, 'date'))}${field('Period ends (days before pay)', inp('pay.periodEndDays', P.periodEndDays))}
      ${field('Tax code (note only)', inp('pay.taxCode', P.taxCode, 'text'))}
      ${(() => { const y = String(+C.today().slice(0, 4) - 1); return field('EU Holiday Pay received for ' + y + ' (£)', inp('pay.hpaHistory.' + y, P.hpaHistory[y])); })()}
    </div>`)}
    ${detailsBlock('rises', 'Pay rises & backpay', risesList(p))}
    ${detailsBlock('fixed', 'Every period (allowances, sacrifice, deductions)', fixedList(p))}
    ${detailsBlock('tax', 'Tax years (HMRC rates)', taxYearList(p))}
  </div>`;
}
function taxYearList(p) {
  const Y = S.pay.taxYears;
  const rows = Y.map((x, i) => {
    const y = +String(x.from).slice(0, 4);
    const live = p.rows.some(r => r.taxYear === x.from);
    return `<div class="erow"><div class="full"><b>${y}/${String(y + 1).slice(2)}</b> ${live ? '<span class="muted small">— in use</span>' : ''}</div>
      ${field('Starts', inp(`pay.taxYears.${i}.from`, x.from, 'date'))}${field('Personal allowance (code ×10+9)', inp(`pay.taxYears.${i}.personalAllowance`, x.personalAllowance))}
      ${field('Basic rate', pctInp(`pay.taxYears.${i}.basicRate`, x.basicRate))}${field('Basic band up to', inp(`pay.taxYears.${i}.basicBand`, x.basicBand))}
      ${field('Higher rate', pctInp(`pay.taxYears.${i}.higherRate`, x.higherRate))}${field('Higher band up to', inp(`pay.taxYears.${i}.higherBand`, x.higherBand))}
      ${field('Additional rate', pctInp(`pay.taxYears.${i}.addRate`, x.addRate))}${field('NI threshold (year)', inp(`pay.taxYears.${i}.niPT`, x.niPT))}
      ${field('NI upper limit (year)', inp(`pay.taxYears.${i}.niUEL`, x.niUEL))}${field('NI main rate', pctInp(`pay.taxYears.${i}.niMain`, x.niMain))}
      ${field('NI rate above limit', pctInp(`pay.taxYears.${i}.niUpper`, x.niUpper))}
      ${Y.length > 1 ? `<div class="full"><button class="btn danger sm" data-act="delYear" data-i="${i}">Remove ${y}/${String(y + 1).slice(2)}</button></div>` : ''}</div>`;
  }).join('');
  return `${rows}<div class="btnrow"><button class="btn sm" data-act="addYear">Add next tax year</button></div>
    <div class="note">Each pay day uses the year in force on it, and the tax count starts again every 6 April — so old pay days keep their old rates. Adding a year copies the last one; change the personal allowance to your new tax code (its number × 10 + 9) and any rates the Budget moves. Annual figures are divided by 13 for each period, with NI thresholds rounded as HMRC does.</div>`;
}
function risesList(p) {
  const R = S.pay.rises || [];
  const rows = R.map((x, i) => {
    const c = p.rises[i] || {};
    const note = !x.from || !x.salary ? 'Fill in the date and the new salary.'
      : !x.arrearsOn ? 'Applies from ' + esc(C.fmtD(x.from)) + ' — no backpay. A period spanning that date is split by day.'
      : c.total ? 'Estimated backpay ' + C.gbp(c.total) + ' on ' + esc(C.fmtD(x.arrearsOn)) + ' — basic ' + C.gbp(c.basic) + (c.ot ? ' + overtime ' + C.gbp(c.ot) : '') + ' across ' + c.periods + ' pay ' + (c.periods === 1 ? 'day' : 'days') + '.'
      : 'No pay days to back-pay yet.';
    return `<div class="erow">${field('Effective from', inp(`pay.rises.${i}.from`, x.from, 'date'))}${field('New annual salary', inp(`pay.rises.${i}.salary`, x.salary))}
      ${field('Backpay paid on (blank = no backpay)', inp(`pay.rises.${i}.arrearsOn`, x.arrearsOn, 'date'))}
      <div class="field"><label>Backpay on overtime too</label><label class="check"><input type="checkbox" data-set="pay.rises.${i}.otBackpay" ${x.otBackpay ? 'checked' : ''}><span>Include the hours I logged</span></label></div>
      <div class="full muted small">${note}</div><div class="full"><button class="btn danger sm" data-act="delRise" data-i="${i}">Remove this pay change</button></div></div>`;
  }).join('') || '<div class="muted small">No pay changes recorded. Your salary has been the same throughout.</div>';
  return `${rows}<div class="btnrow"><button class="btn sm" data-act="addRise">Add a pay change</button></div>
    <div class="note">Pay days before the change keep the old figures. If the rise was agreed late, put the date it was backdated to in the first box and the pay day the arrears land in the third — the shortfall on every period in between is worked out for you and added to that pay day. Tick the box to include the overtime hours you logged. Pension on backpay isn't modelled, so expect a few pounds either way.</div>`;
}
function fixedList(p) {
  const F = S.pay.fixed;
  const span = f => (f.from ? 'from ' + esc(C.fmtD(f.from)) : '') + (f.to ? (f.from ? ' ' : '') + 'until ' + esc(C.fmtD(f.to)) : '');
  const rows = ui.editFixed ? F.map((f, i) => `<div class="erow"><div class="full">${field('Item', inp(`pay.fixed.${i}.name`, f.name, 'text'))}</div>
      ${field('£ per period', inp(`pay.fixed.${i}.amount`, f.amount))}${field('Treatment', sel(`pay.fixed.${i}.treatment`, f.treatment, ['Allowance', 'Sacrifice', 'After-tax']))}
      ${field('Started (blank = always)', inp(`pay.fixed.${i}.from`, f.from, 'date'))}${field('Ended (blank = ongoing)', inp(`pay.fixed.${i}.to`, f.to, 'date'))}
      <div class="full"><button class="btn danger sm" data-act="delFixed" data-i="${i}">Remove ${esc(f.name || 'item')}</button></div></div>`).join('') || '<div class="empty">Nothing here yet.</div>'
    : F.map(f => `<div class="row"><div class="l"><b>${esc(f.name)}</b><small>${esc(f.treatment)}${span(f) ? ' · ' + span(f) : ''}</small></div><div class="num">${C.gbp(f.amount)}</div></div>`).join('') || '<div class="empty">Nothing here yet.</div>';
  return `${rows}<div class="btnrow"><button class="btn ghost sm" data-act="toggle" data-key="editFixed">${ui.editFixed ? 'Done' : 'Edit items'}</button>${ui.editFixed ? '<button class="btn sm" data-act="addFixed">Add item</button>' : ''}</div>
    <div class="note">Allowance = taxed with pay · Sacrifice = off before tax and NI · After-tax = off net pay. On the next pay day: allowances ${C.gbp(p.allow)}, sacrifice ${C.gbp(p.sacr)}, after-tax ${C.gbp(p.after)}.</div>
    <div class="note">Leave both dates blank for something that has always been there. Add dates for anything that starts or stops — a tech scheme, a holiday purchase — and only the pay days it covers change. A date falling mid-period is split by day, which is exactly what payroll did to the pension in May, so to change an amount, end the old line the day before and start a new one.</div>`;
}
function recent(n) {
  const list = S.games.filter(g => g.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, n);
  return list.length ? `<div class="eyebrow mt12">Recent completions</div>${list.map(g => `<div class="row"><div class="l"><b>${esc(g.game)}</b></div><span class="muted small">${esc(C.fmtD(g.date))}</span></div>`).join('')}` : '';
}
function tickList() {
  const q = ui.search.trim().toLowerCase();
  const match = s => !q || String(s).toLowerCase().includes(q);
  if (ui.set === 'PSM' || ui.set === 'PSM demos') {
    const rows = S.psm.map((p, i) => ({ p, i })).filter(({ p }) => match(`${p.issue} ${p.titles} ${p.released || ''}`));
    return rows.map(({ p, i }) => `<div class="psm"><div><b>Issue ${esc(p.issue)}</b> <span class="muted small">${p.released ? esc(C.fmtM(p.released)) : ''}${p.demoNo != null && p.demoNo !== '' ? ' · demo ' + esc(p.demoNo) : ''}</span><div class="t">${esc(p.titles)}</div></div>
      <button class="box ${p.mag ? 'on' : ''}" data-act="psm" data-i="${i}" data-k="mag" aria-pressed="${!!p.mag}" aria-label="Magazine ${esc(p.issue)}">MAG</button>
      <button class="box ${p.demo ? 'on' : ''}" data-act="psm" data-i="${i}" data-k="demo" aria-pressed="${!!p.demo}" aria-label="Demo disc ${esc(p.issue)}">DISC</button></div>`).join('') || '<div class="empty">No matches.</div>';
  }
  const col = ui.set === 'Mega Evolution' ? 'mega' : 'classic';
  const items = S[col].map((c, i) => ({ c, i })).filter(({ c }) => (col === 'mega' || c.set === ui.set) && match(`${c.no || ''} ${c.card}`));
  return items.map(({ c, i }) => `<div class="tick ${c.have ? 'on' : ''}"><button class="box" data-act="tick" data-col="${col}" data-i="${i}" aria-pressed="${!!c.have}" aria-label="${esc(c.card)}">${c.have ? '✓' : ''}</button>
    <div class="name" data-act="tick" data-col="${col}" data-i="${i}">${c.no ? `<span class="mono muted">${esc(c.no)}</span> ` : ''}${esc(c.card)}</div>
    <button class="g ${c.grade ? 'has' : ''}" data-act="grade" data-col="${col}" data-i="${i}" aria-label="Grade for ${esc(c.card)}">${c.grade ? esc(c.grade) : 'grade'}</button></div>`).join('') || '<div class="empty">No matches.</div>';
}

