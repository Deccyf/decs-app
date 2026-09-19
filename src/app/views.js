/* ---------- sparkline: projected balance between now and pay day ---------- */
function sparkline(series, overdraft) {
  if (!series || series.length < 2) return '';
  const w = 600, h = 66, pad = 5;
  const vals = series.map(s => s.bal);
  const lo0 = Math.min(...vals), hi0 = Math.max(...vals), neg = lo0 < 0;
  const floor = overdraft > 0 ? -overdraft : null;
  // scale to the data with a little headroom, and pull the overdraft limit into
  // view when the line gets near it — that is the number worth watching
  const room = (hi0 - lo0) * 0.18 || Math.max(Math.abs(hi0) * 0.08, 1);
  let min = lo0 - room, max = hi0 + room * 0.5;
  if (!neg) min = Math.max(0, min);
  if (floor !== null && floor < min && lo0 - floor < (hi0 - lo0) + room * 3) min = floor - room * 0.5;
  const span = (max - min) || 1;
  const X = i => pad + (w - pad * 2) * i / (series.length - 1);
  const Y = v => pad + (h - pad * 2) * (1 - (v - min) / span);
  // a reference line is only drawn if it falls inside the box; otherwise it used
  // to be painted far outside the svg and drift up the page
  const inBox = v => v > min && v < max;
  const guide = (v, colour, dash) => inBox(v)
    ? `<line x1="${pad}" y1="${Y(v).toFixed(1)}" x2="${w - pad}" y2="${Y(v).toFixed(1)}"
        stroke="${colour}" stroke-width="1" stroke-dasharray="${dash}" vector-effect="non-scaling-stroke" opacity=".75"/>`
    : '';
  const line = series.map((s, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(s.bal).toFixed(1)}`).join(' ');
  const area = `${line} L${X(series.length - 1).toFixed(1)} ${h - pad} L${pad} ${h - pad} Z`;
  const last = series[series.length - 1];
  const hue = floor !== null && lo0 < floor ? 'var(--bad)' : neg ? 'var(--coral)' : 'var(--teal)';
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img"
      aria-label="Projected balance from ${esc(C.fmtD(series[0].date))} to ${esc(C.fmtD(last.date))}">
    <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${hue}" stop-opacity=".28"/>
      <stop offset="100%" stop-color="${hue}" stop-opacity="0"/></linearGradient></defs>
    ${guide(0, 'var(--muted)', '3 3')}
    ${floor !== null ? guide(floor, 'var(--bad)', '4 4') : ''}
    <path d="${area}" fill="url(#sg)"/>
    <path d="${line}" fill="none" stroke="${hue}" stroke-width="2"
      stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${X(series.length - 1).toFixed(1)}" cy="${Y(last.bal).toFixed(1)}" r="3.2"
      fill="var(--card)" stroke="${hue}" stroke-width="2" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

/* ---------- the optional weekend / bank-holiday shift ---------- */
function flowOptions() {
  const m = S.money, opt = flowOpt();
  const sample = (() => {                       // show the rule working on the next Sunday
    let d = C.today(); for (let i = 0; i < 8 && C.dow(d) !== 0; i++) d = C.addDays(d, 1);
    const s = C.shiftDue(d, opt.shift, opt.bankHols);
    return s.moved ? `A bill dated ${C.fmtDow(d)} would be taken ${C.fmtDow(s.date)}.`
      : `A bill dated ${C.fmtDow(d)} would be taken that same day.`;
  })();
  return `<div class="eyebrow mt4">When a bill lands on a non-working day</div>
    ${segment('shift', m.dueShift, [{ v: 'exact', l: 'Take the date' }, { v: 'next', l: 'Next working day' }, { v: 'prev', l: 'Day before' }])}
    <div class="note">${esc(sample)}</div>
    ${toggle('money.bankHols', m.bankHols, 'Count bank holidays too', 'England & Wales dates, worked out in the app — Easter included.')}`;
}

/* Money had grown to seven cards and nearly eight screens on a phone — every
   feature landed there and each was right to, but together it was a wall.
   Four sections, each a screen or two: what is happening now, the bills, what
   is put away against what is owed, and the history you look at monthly. */
const MONEY_SECTIONS = [{ v: 'now', l: 'Now' }, { v: 'bills', l: 'Bills' }, { v: 'saving', l: 'Saving' }, { v: 'history', l: 'History' }];
const moneySwitcher = sec => `<div class="subnav">${segment('moneyTab', sec, MONEY_SECTIONS)}</div>`;

/* ---------- views ---------- */
const VIEWS = {
  home() {
    const m = C.moneyCalc(S.money, null, flowOpt()), p = C.payCalc(S.pay), g = C.gamesStats(S.games), cols = C.collections(S);
    const nx = p.rows[p.nextIdx] || null, tod = C.today();
    const fl = C.runway(S.money, p, flowOpt());
    const per = C.periodFlows(S.money, p, flowOpt(), 1)[0] || null;
    const pots = C.savingsCalc(S.money.savings, m.debts, null, S.money.netLongTerm);
    const yr = m.yearRow;
    let h = '';
    if (SEED.generic && !S.money.months.length && !S.money.bills.length && !S.games.length && !S.classic.length)
      h += `<div class="banner"><b>No data loaded yet.</b> Tap the gear at the top, then <b>Restore backup</b> and pick your backup file. Everything appears straight away.</div>`;
    if (!storageOK)
      h += `<div class="banner bad"><b>This device isn't keeping changes.</b> Your browser won't store data for a file opened directly. Anything you change is lost when you close the page — use Download backup before you leave, or host the file (GitHub Pages) so it can save.</div>`;

    /* Things that want a decision today, each with the one tap that deals with
       it. The card only exists when there is something in it. */
    const attn = [];
    if (fl.hasBal && fl.shortfall) attn.push(['bad', `<b>${fl.overdraft ? 'Past your overdraft.' : 'Short before pay day.'}</b> Down to ${C.gbp(fl.low.bal)} on ${esc(C.fmtDow(fl.low.date))}.`, 'now']);
    else if (fl.hasBal && fl.intoOverdraft) attn.push(['', `<b>Into your overdraft.</b> Down to ${C.gbp(fl.low.bal)} on ${esc(C.fmtDow(fl.low.date))}, ${C.gbp(fl.headroom)} of the limit spare.`, 'now']);
    if (fl.paydayPassed) attn.push(['', `<b>Pay day has been</b> since you typed your balance on ${esc(C.fmtDM(fl.typedOn))} — check the bank and retype it.`, 'now']);
    else if (fl.hasBal && fl.staleDays >= 7) attn.push(['', `<b>Balance is ${fl.staleDays} days old.</b> Only bills have come off it since — worth a check.`, 'now']);
    if (fl.amex && !fl.amexBefore && fl.days <= 3) attn.push(['', `<b>${C.gbp(fl.amex, 0)} on the card</b> to clear ${fl.days === 0 ? 'today' : 'on ' + esc(C.fmtDow(fl.to))}.`, 'now']);
    if (m.undated) attn.push(['', `<b>${m.undated === 1 ? 'One bill has' : m.undated + ' bills have'} no payment date</b>, so ${m.undated === 1 ? "it's" : "they're"} missing from the cash flow.`, 'bills']);
    C.priceHistory(S.money.bills).filter(x => x.last.month >= C.mkey(C.addMonths(tod, -1)))
      .forEach(x => attn.push(['', `<b>${esc(x.name)}</b> ${x.last.diff > 0 ? 'went up' : 'came down'} ${C.gbp(Math.abs(x.last.diff))} a month in ${esc(C.fmtMs(x.last.month))}.`, 'bills']));
    /* The figures live on this phone and nowhere else. Say so before it matters,
       not after — and only once there is something worth losing. */
    const anyData = S.money.bills.length || S.money.months.length || pots.goals.length || pots.balance || S.games.length || S.classic.length;
    const backupAge = S.backupOn ? C.daysBetween(S.backupOn, tod) : null;
    if (anyData && backupAge === null) attn.push(['', `<b>No backup yet.</b> Lose this phone and these figures go with it.`, 'settings']);
    else if (backupAge !== null && backupAge >= 30) attn.push(['', `<b>Last backup was ${backupAge} days ago.</b> Worth downloading a fresh one.`, 'settings']);
    m.reviews.forEach(b => attn.push(['', `<b>${esc(b.name || 'A bill')} changes in ${esc(C.MON[b.review - 1])}.</b> Check the new amount — it is still down as ${C.gbp(b.amt)}.`, 'bills']));
    if (attn.length) h += `<div class="card"><h2>Needs a look<span class="hint">${attn.length}</span></h2>${attn.map(([lvl, text, dest]) => {
      const gear = dest === 'settings';
      return `<button class="attnrow ${lvl}" data-act="tab" data-tab="${gear ? 'settings' : 'money'}"${gear ? '' : ` data-sec="${esc(dest)}"`}><span>${text}</span><i aria-hidden="true">›</i></button>`;
    }).join('')}</div>`;

    h += `<div class="tiles">
      ${fl.hasBal
        ? tile(fl.safe < 0 ? 'coral' : 'teal', 'Safe to spend', C.gbp(fl.safe, 0),
            fl.safe > 0 && fl.perDay != null && fl.days > 0 ? C.gbp(fl.perDay, 0) + ' a day for ' + fl.days + ' days'
              : fl.safe < 0 ? 'short before ' + esc(C.fmtDM(fl.to)) : 'pay day is today')
        : tile('teal', 'Disposable next period', per ? C.gbp(per.disposable, 0) : '–',
            per ? C.gbp(per.net, 0) + ' pay less ' + C.gbp(per.outgoings, 0) + ' bills' : 'add your pay details')}
      ${tile('navy', 'Next pay day', nx ? C.gbp(nx.net, 0) : '–', nx ? (fl.days === 0 ? 'today' : 'in ' + fl.days + ' day' + (fl.days === 1 ? '' : 's')) + ' · ' + esc(C.fmtDow(nx.payday)) : '')}
      ${tile('amber', 'Saved this year', C.gbp(yr && yr.saved, 0), yr && yr.rate != null ? C.pct(yr.rate) + ' of ' + yr.year + ' earnings' : '')}
      ${tile(pots.net < 0 ? 'coral' : 'forest', 'Savings less ' + (pots.withLong ? 'debt' : 'short-term debt'), C.gbp(pots.net, 0),
        pots.balance || pots.allTotal ? C.gbp(pots.balance, 0) + ' saved · ' + C.gbp(pots.debtTotal, 0) + ' owed' : 'nothing put away yet')}
    </div>`;

    /* the next seven days, with pay day in its place if it falls inside them */
    const week = C.addDays(tod, 7);
    const soon = fl.events.filter(e => e.date <= week);
    const payInWeek = !!nx && fl.to <= week;
    const later = fl.events.length - soon.length;
    h += `<div class="card"><h2>This week<span class="hint">${soon.length ? soon.length + ' leaving' : 'nothing leaving'}${payInWeek ? ' · pay lands' : ''}</span></h2>
      ${soon.length || payInWeek ? `<div class="ledger">${soon.map(e => ledgerRow(e)).join('')}${payInWeek ? `<div class="lrow pay"><div class="ld"><span>${esc(C.DOW[C.dow(fl.to)])}</span>${+fl.to.slice(8)}</div>
        <div class="ln"><b>Pay day</b><small>${esc(C.fmtM(C.mkey(fl.to)))}</small></div><div class="lv pos">+${C.gbp(fl.net)}</div></div>` : ''}</div>`
        : '<div class="empty">Nothing leaves in the next seven days.</div>'}
      ${later > 0 ? `<div class="note">${later} more before pay day — ${C.gbp(fl.outgoings - soon.reduce((a, e) => a + e.amount, 0))} of them, ${C.gbp(fl.outgoings)} altogether.</div>` : ''}
      <div class="btnrow"><button class="btn ghost sm" data-act="tab" data-tab="money" data-sec="now">Open cash flow</button></div></div>`;

    if (nx) h += `<div class="card"><div class="eyebrow">Next pay day · ${esc(C.fmtD(nx.payday))}</div>
      <div class="payhead"><div class="big">${C.gbp(nx.net)}</div><div class="muted">${nx.extraGross ? 'incl. ' + C.gbp(nx.extra) + ' from overtime' : 'no overtime logged yet'}</div></div>
      <div class="muted small lead">${nx.ot || 0} overtime hrs · ${nx.sun || 0} Sunday hrs · period ${esc(C.fmtDM(nx.start))} – ${esc(C.fmtDM(nx.end))}</div>
      <button class="btn teal" data-act="tab" data-tab="pay">Log hours</button></div>`;

    if (pots.balance || pots.goals.length || pots.got.length) {
      const focus = pots.next || pots.goals[0] || null;    // the next thing you cannot afford yet
      h += `<div class="card"><h2>Saving<span class="hint">${C.gbp(pots.balance, 0)} in the pot</span></h2>
        ${focus ? goalRow(focus) : '<div class="muted">Nothing on the list yet.</div>'}
        <div class="btnrow"><button class="btn ghost sm" data-act="tab" data-tab="money" data-sec="saving">Open savings</button></div></div>`;
    }

    const done = S.house.filter(j => j.status === 'Done').length, tot = S.house.length;
    const tracked = cols.filter(c => c.total), have = tracked.reduce((a, c) => a + c.have, 0), all = tracked.reduce((a, c) => a + c.total, 0);
    h += `<div class="card"><h2>Everything else</h2>
      <div class="stats"><div class="stat"><b>${g.thisYear}</b><span>games this year</span></div><div class="stat"><b>${tot ? done + '/' + tot : '–'}</b><span>house jobs</span></div><div class="stat"><b>${all ? C.pct(have / all) : '–'}</b><span>collections</span></div></div>
      ${g.last ? `<div class="row mt4"><div class="l"><b>${esc(g.last.game)}</b><small>last completed · ${g.daysSince} days ago</small></div></div>` : ''}
      <div class="btnrow"><button class="btn ghost sm" data-act="tab" data-tab="lists">Lists</button><button class="btn ghost sm" data-act="tab" data-tab="games">Games</button></div></div>`;

    return { title: `${S.name || 'Dec'}'s Tracker`, sub: C.fmtD(tod), html: h };
  },

  pay() {
    const p = C.payCalc(S.pay);
    let idx = ui.payday ? p.rows.findIndex(x => x.payday === ui.payday) : -1;
    if (idx < 0) idx = p.nextIdx;
    const r = p.rows[idx];
    if (!r) return { title: 'Pay', sub: '', html: `<div class="card"><h2>No pay schedule</h2><div class="muted">Add your salary and next pay day under Payslip settings below.</div></div>` + paySettings(p) };
    let h = '';
    if (PAY_ONLY && SEED.generic && !S.pay.salary) h += `<div class="banner"><b>No data loaded yet.</b> Tap the gear at the top, then <b>Restore backup</b> and pick your data file. Your pay settings and hours appear straight away.</div>`;
    if (PAY_ONLY && !storageOK) h += `<div class="banner bad"><b>This device isn't keeping changes.</b> Open this file in Chrome rather than a file viewer, or host it, so it can save.</div>`;
    h += payslipCard(r);
    h += payBoard(p, idx, r);
    h += hpaCard(p);
    h += paySettings(p);
    return { title: PAY_ONLY ? (SEED.title || 'Pay') : 'Pay', sub: `${C.gbp(p.hourly)}/hr · 4-weekly`, html: h };
  },

  money() {
    const opt = flowOpt(), m = C.moneyCalc(S.money, null, opt), p = C.payCalc(S.pay);
    const fl = C.runway(S.money, p, opt);
    const flows = C.periodFlows(S.money, p, opt, ui.flowPeriods);
    const cur = m.thisMonthKey;
    const months = m.months.filter(x => ui.showAllMonths || x.month <= C.addMonths(cur + '-01', 1).slice(0, 7)).slice().reverse();

    const sec = MONEY_SECTIONS.some(x => x.v === ui.moneyTab) ? ui.moneyTab : 'now';
    let h = moneySwitcher(sec);
    if (sec === 'now') {
    /* --- 1. cash flow to the next pay day --- */
    h += `<div class="card"><h2>Left until pay day<span class="hint">${fl.days} day${fl.days === 1 ? '' : 's'} · ${esc(C.fmtDM(fl.to))}</span></h2>`;
    if (fl.hasBal) {
      h += `<div class="flowhero"><div><div class="amt ${fl.safe < 0 ? 'neg' : ''}">${C.gbp(fl.safe)}</div>
          <div class="muted small">free to spend${fl.overdraft ? ', using your ' + C.gbp(fl.overdraft, 0) + ' overdraft' : ''}${fl.buffer ? ', keeping your ' + C.gbp(fl.buffer, 0) + ' buffer' : ''}</div></div>
        ${fl.perDay != null && fl.safe > 0 ? `<div class="per"><b>${C.gbp(fl.perDay)}</b>a day</div>` : ''}</div>
        <div class="sparkwrap">${sparkline(fl.series, fl.overdraft)}</div>
        <div class="results">
          <div class="r"><span>${fl.wasCarried ? 'Estimated balance today' : 'Balance today'}</span><span class="num">${C.gbp(fl.start)}</span></div>
          <div class="r"><span>${fl.events.length ? `${fl.events.length} bill${fl.events.length === 1 ? '' : 's'} still to leave` : 'No bills left before pay day'}</span><span class="num${fl.events.length ? ' neg' : ' muted'}">${fl.events.length ? '-' + C.gbp(fl.outgoings) : '—'}</span></div>
          ${fl.amexNow ? `<div class="r"><span>AMEX balance, taken off now</span><span class="num neg">-${C.gbp(fl.amexNow)}</span></div>` : ''}
          <div class="r"><span>Balance the morning of pay day</span><span class="num">${C.gbp(fl.atPayday)}</span></div>
          ${fl.net != null ? `<div class="r"><span>Pay in ${esc(C.fmtDM(fl.to))}</span><span class="num pos">+${C.gbp(fl.net)}</span></div>
          ${fl.amexOnPay ? `<div class="r"><span>AMEX cleared on pay day</span><span class="num neg">-${C.gbp(fl.amexOnPay)}</span></div>` : ''}
          <div class="r total"><span>Balance after pay</span><span class="num">${C.gbp(fl.afterPay)}</span></div>` : ''}
        </div>`;
      if (fl.shortfall) h += `<div class="banner bad"><b>${fl.overdraft ? 'Past your overdraft limit.' : 'Short before pay day.'}</b> The balance dips to ${C.gbp(fl.low.bal)} on ${esc(C.fmtD(fl.low.date))}${fl.overdraft ? ` — ${C.gbp(Math.abs(fl.headroom))} beyond your ${C.gbp(fl.overdraft, 0)} limit` : ''} — move something, or the direct debit bounces.</div>`;
      else if (fl.intoOverdraft) h += `<div class="banner"><b>Into your overdraft.</b> Lowest point is ${C.gbp(fl.low.bal)} on ${esc(C.fmtD(fl.low.date))} — ${C.gbp(fl.headroom)} of your ${C.gbp(fl.overdraft, 0)} limit still spare.</div>`;
      else if (fl.low && fl.buffer && fl.low.bal < fl.buffer) h += `<div class="banner"><b>It gets tight.</b> Lowest point is ${C.gbp(fl.low.bal)} on ${esc(C.fmtD(fl.low.date))}, under your ${C.gbp(fl.buffer, 0)} buffer.</div>`;
    } else {
      h += `<div class="banner info">Put today's bank balance in below and this works out what's genuinely free to spend before ${esc(C.fmtD(fl.to))} — bills counted on the day they actually leave.</div>
        <div class="results"><div class="r"><span>${fl.events.length ? `${fl.events.length} bill${fl.events.length === 1 ? '' : 's'} still to leave` : 'No bills left before pay day'}</span><span class="num${fl.events.length ? ' neg' : ' muted'}">${fl.events.length ? '-' + C.gbp(fl.outgoings) : '—'}</span></div>
        ${fl.net != null ? `<div class="r"><span>Pay in ${esc(C.fmtDM(fl.to))}</span><span class="num pos">+${C.gbp(fl.net)}</span></div>` : ''}</div>`;
    }
    h += `${fl.wasCarried ? `<div class="note mt2">Carried forward from the <b>${C.gbp(fl.typed)}</b> you entered on ${esc(C.fmtD(fl.typedOn))}${fl.carriedOut ? `, less <b>${C.gbp(fl.carriedOut)}</b> of bills` : ''}${fl.carriedIn ? `, plus <b>${C.gbp(fl.carriedIn)}</b> of pay` : ''} since.</div>` : ''}
      ${fl.wasCarried ? detailsBlock('carried', `What's come off since ${C.fmtDM(fl.typedOn)}`,
        `<div class="ledger">${fl.carried.map(e => ledgerRow(e, null, true)).join('')}${fl.carriedPays.map(r => `<div class="lrow gone"><div class="ld"><span>${esc(C.DOW[C.dow(r.payday)])}</span>${+r.payday.slice(8)}</div>
          <div class="ln"><b>Pay day</b><small>${esc(C.fmtM(C.mkey(r.payday)))}</small></div><div class="lv pos">+${C.gbp(r.net)}</div></div>`).join('')}</div>
         <div class="note">Only bills and pay are counted here. Day-to-day spending isn't — so retype your balance whenever you check the bank, and the running total starts again from that figure.</div>`) : ''}
      <div class="grid2 mt14">${field(fl.typedOn ? `Balance (${C.fmtDM(fl.typedOn)})` : 'Bank balance today', signedInp('money.balance', S.money.balance, 'placeholder="e.g. 1240.50"'))}${field('Buffer to keep back', inp('money.buffer', S.money.buffer))}
      ${field('Overdraft limit', inp('money.overdraft', S.money.overdraft, 'number', 'min="0" placeholder="0"'))}
      ${field('Room left at lowest', `<input type="text" value="${fl.hasBal && fl.low ? esc(C.gbp(fl.headroom)) : '–'}" disabled>`)}</div>
      <div class="sep"></div>
      <div class="eyebrow">American Express</div>
      <div class="grid2">${field('Card balance owed', inp('money.amex', S.money.amex, 'number', 'min="0" placeholder="0.00"'))}</div>
      ${toggle('money.amexBefore', S.money.amexBefore, 'Take it off before pay day',
        "Leave this off if you clear the card on pay day — it still comes off the balance after pay, just not out of what's free before it.")}
      <div class="btnrow">
        ${fl.amex ? `<button class="btn teal" data-act="amexClear">Pay now</button>` : ''}
        ${S.money.amexUndo ? `<button class="btn ghost" data-act="amexUndo">Undo, put ${C.gbp(Math.abs(C.num(S.money.amexUndo.amex)))} back</button>` : ''}
      </div>
      ${S.money.amexUndo ? `<div class="note">Paid ${esc(C.fmtD(S.money.amexUndo.at))}. The undo stays until you change the balance or the card yourself.</div>`
        : `<div class="note"><b>Pay now</b> records that you have paid it — ${fl.amex ? C.gbp(fl.amex) + ' off' : 'it comes off'} your balance and the card goes to zero. It doesn't make the payment, and nothing happens on its own: the figures above stay a projection until you press it.</div>`}
      ${fl.amex ? `<div class="note">${fl.amexBefore
        ? `The <b>${C.gbp(fl.amex)}</b> is counted against you now, so it is already out of the figure at the top.`
        : `The <b>${C.gbp(fl.amex)}</b> is left alone until ${esc(C.fmtDM(fl.to))}, then taken off what lands. It is not in the figure at the top.`}</div>` : ''}
      <div class="sep"></div>
      <div class="note">Your overdraft is the most you can go into minus before a payment bounces — leave it at 0 if you haven't got one. It counts as spendable room, so the figure above is what's free <i>including</i> it.
      Retype the balance whenever you check your bank — the running total restarts from whatever you enter, and bills come off again as the days pass. Overdrawn? Type the amount, then tap <b>+</b> beside it to flip it to <b>−</b>.</div>
      ${fl.paydayPassed ? `<div class="banner mt12"><b>Pay day has been since you typed this.</b> The figures above are worked forward from ${esc(C.fmtD(fl.typedOn))} — check your bank and retype it.${fl.amex ? ` Paid the card? Press <b>Pay now</b> under American Express.` : ''}</div>`
        : fl.staleDays >= 14 ? `<div class="banner mt12"><b>That balance is ${fl.staleDays} days old.</b> Only bills have come off it since — anything you've actually spent hasn't. Check your bank and retype it.</div>` : ''}
      ${m.undated ? `<div class="banner mt12"><b>${m.undated === 1 ? 'One bill has' : m.undated + ' bills have'} no payment date.</b> ${m.undated === 1 ? "It's" : "They're"} missing from these figures — add the day of the month ${m.undated === 1 ? 'it leaves' : 'each one leaves'} in <b>Bills</b>.</div>` : ''}
      ${fl.events.length ? `<div class="sep"></div><div class="eyebrow">Every payment between now and pay day</div><div class="ledger">${
        (() => { let bal = fl.hasBal ? fl.start : null;
          return fl.events.map(e => { if (bal !== null) bal = C.r2(bal - e.amount); return ledgerRow(e, bal); }).join('')
            + (fl.net != null ? `<div class="lrow pay"><div class="ld"><span>${esc(C.DOW[C.dow(fl.to)])}</span>${+fl.to.slice(8)}</div>
              <div class="ln"><b>Pay day</b><small>${esc(C.fmtM(C.mkey(fl.to)))}</small></div>
              <div class="lv pos">+${C.gbp(fl.net)}${fl.hasBal && !fl.amexOnPay ? `<small>${C.gbp(fl.afterPay)}</small>` : ''}</div></div>
              ${fl.amexOnPay ? `<div class="lrow"><div class="ld"><span>${esc(C.DOW[C.dow(fl.to)])}</span>${+fl.to.slice(8)}</div>
                <div class="ln"><b>AMEX cleared</b><small>card balance</small></div>
                <div class="lv">-${C.gbp(fl.amexOnPay)}${fl.hasBal ? `<small>${C.gbp(fl.afterPay)}</small>` : ''}</div></div>` : ''}` : ''); })()
      }</div>` : ''}
      <div class="sep"></div>${flowOptions()}</div>`;

    /* --- 1b. what the balance readings say has actually been spent --- */
    h += spendCard(C.spendLog(S.money, p, opt), fl);

    /* --- 2. disposable income per pay period --- */
    h += `<div class="card"><h2>Disposable by pay period<span class="hint">from bill dates</span></h2>
      <div class="muted small">You're paid every 28 days but bills come out monthly, so some periods carry two of the same bill and some carry none. This counts what actually leaves inside each period.</div>
      <div class="mt10">${flows.map(f => {
        const dupes = {}; f.events.forEach(e => { dupes[e.name] = (dupes[e.name] || 0) + 1; });
        const twice = Object.keys(dupes).filter(k => dupes[k] > 1);
        const share = f.net > 0 ? Math.min(f.outgoings / f.net, 1) : 0;
        return `<div class="perrow"><div><b>${esc(C.fmtDM(f.from))} – ${esc(C.fmtDM(f.to))}</b>
            <small class="meta">${C.gbp(f.net, 0)} in · ${C.gbp(f.outgoings, 0)} out · ${f.events.length} bills${twice.length ? ' · twice: ' + esc(twice.join(', ')) : ''}</small></div>
          <div class="num tr"><b class="strong ${f.disposable < 0 ? 'neg' : ''}">${C.gbp(f.disposable, 0)}</b>
            <div class="muted small">${C.pct(share)} on bills</div></div>
          <div class="pb">${bar(share, share > 0.85 ? 'coral' : share > 0.7 ? 'amber' : 'teal')}</div></div>`;
      }).join('') || '<div class="empty">Add bill payment dates and your pay details to see this.</div>'}</div>
      ${flows.length ? `<div class="btnrow"><button class="btn ghost sm" data-act="morePeriods">${ui.flowPeriods >= 12 ? 'Show fewer' : 'Show more periods'}</button></div>` : ''}
      ${flows.length ? `<div class="note">Average disposable across these ${flows.length} periods: <b>${C.gbp(C.r2(flows.reduce((a, f) => a + f.disposable, 0) / flows.length))}</b>. Bills that stop or start are honoured, and linked debt repayments follow the debt list.</div>` : ''}</div>`;

    }
    if (sec === 'history') {
    /* --- 3. history --- */
    h += `<div class="card"><h2>By year</h2><div class="tscroll"><table class="table"><tr><th>Year</th><th>Earnings</th><th>Bills</th><th>Disposable</th><th>Saved</th><th>Rate</th></tr>
      ${m.byYear.filter(y => y.n || y.saved).map(y => `<tr><td>${y.year}</td><td>${C.gbp(y.earnings, 0)}</td><td>${C.gbp(y.outgoings, 0)}</td><td>${C.gbp(y.disposable, 0)}</td><td>${C.gbp(y.saved, 0)}</td><td>${C.pct(y.rate)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No months filled in yet.</td></tr>'}</table></div>
      <div class="chartwrap"><canvas id="chart"></canvas></div><div class="chartkey"><span><i class="k-brand"></i>Earnings</span><span><i class="k-teal"></i>Disposable</span><span class="muted">last 12 months — swipe to see them all</span></div></div>`;
    h += `<div class="card"><h2>Month by month</h2><div class="muted small">Type earnings and what you actually saved. Bills and disposable work themselves out.</div>
      ${months.map(x => { const i = S.money.months.findIndex(q => q.month === x.month); return `<div class="mrow"><div class="mhead"><b>${esc(C.fmtM(x.month))}</b><span class="disp ${x.disposable < 0 ? 'neg' : ''}">${x.has ? C.gbp(x.disposable) : '<span class="muted semi">no earnings yet</span>'}</span></div>
        <div class="mgrid">${field('Earnings', inp(`money.months.${i}.earnings`, x.earnings))}${field('Actually saved', signedInp(`money.months.${i}.saved`, x.saved))}</div>
        ${x.has ? `<div class="note">Bills ${C.gbp(x.outgoings)} · potential savings ${C.gbp(x.potential)} (disposable minus the ${C.gbp(S.money.buffer, 0)} buffer)</div>` : ''}</div>`; }).join('') || '<div class="empty">No months yet.</div>'}
      <div class="btnrow"><button class="btn ghost sm" data-act="toggle" data-key="showAllMonths">${ui.showAllMonths ? 'Show fewer months' : 'Show all months'}</button><button class="btn sm" data-act="addMonth">Add ${esc(C.fmtM(nextMonthKey()))}</button></div></div>`;

    }
    if (sec === 'bills') {
    /* --- 4. bills --- */
    h += `<div class="card"><h2>Bills</h2><div class="row"><div class="l"><b>Active bills total</b><small>${m.active.length} bills · ${m.dated.length} with a payment date${m.anySkips ? ' · ' + C.gbp(m.yearTotal, 0) + ' a year' : ''}</small></div><div class="strong num">${C.gbp(m.activeTotal)}</div></div>
      ${m.reviews.map(b => `<div class="banner mt12"><b>${esc(b.name || 'A bill')} changes in ${esc(C.MON[b.review - 1])}.</b>
        Check what it has gone to and type the new amount — the old price is kept, so the history still adds up.
        <div class="btnrow"><button class="btn ghost sm" data-act="billChecked" data-id="${esc(b.id)}">Still ${C.gbp(b.amt)}</button></div></div>`).join('')}
      ${ui.editBills ? m.bills.map((b, i) => `<div class="erow">${field('Bill', inp(`money.bills.${i}.name`, b.name, 'text'))}${field('Category', sel(`money.bills.${i}.category`, b.category, CATS))}
          ${field(b.link ? 'Amount (linked to ' + b.link.toLowerCase() + ' debt repayments)' : 'Amount', b.link ? `<input type="text" value="${C.gbp(b.amt)}" disabled>` : inp(`money.bills.${i}.amount`, b.amount))}
          ${field('Day of month it leaves', inp(`money.bills.${i}.dueDay`, b.dueDay, 'number', 'min="1" max="31" step="1" placeholder="1–31"'))}
          ${field('Started', inp(`money.bills.${i}.started`, b.started, 'month'))}${field('Ended (blank = still paying)', inp(`money.bills.${i}.ended`, b.ended, 'month'))}
          ${field('Price changes in', selPairs(`money.bills.${i}.review`, b.review,
            [{ v: '', l: "Doesn't change" }].concat(C.MON.map((n, k) => ({ v: k + 1, l: n })))))}
          ${b.reviewedOn ? field('Last checked', `<input type="text" value="${esc(C.fmtM(b.reviewedOn))}" disabled>`) : ''}
          <div class="full"><label>Months it is paid${b.paidMonths < 12 ? ` · ${b.paidMonths} of 12` : ''}</label>${monthPicker(i, b.skip)}</div>
          <div class="full"><button class="btn danger sm" data-act="delBill" data-i="${i}">Remove ${esc(b.name || 'bill')}</button></div></div>`).join('') || '<div class="empty">No bills yet.</div>'
        : m.bills.map(b => `<div class="row"><div class="l"><b>${esc(b.name)}</b><small>${esc(b.category || '')}${C.num(b.dueDay) ? ' · ' + esc(C.ord(Math.round(C.num(b.dueDay)))) + ' of the month' : ' · <span class="warn">no date set</span>'}${b.ended ? ' · ended ' + esc(C.fmtM(b.ended)) : ''}${b.link ? ' · linked to debts' : ''}${b.paidMonths < 12 ? ' · ' + b.paidMonths + ' months a year' : ''}</small></div><div class="num ${b.ended ? 'muted' : ''}">${C.gbp(b.amt)}${b.paidMonths < 12 ? `<div class="muted small">${C.gbp(b.yearly, 0)} a year</div>` : ''}</div></div>`).join('') || '<div class="empty">No bills yet.</div>'}
      <div class="btnrow"><button class="btn ghost sm" data-act="toggle" data-key="editBills">${ui.editBills ? 'Done' : 'Edit bills'}</button>${ui.editBills ? '<button class="btn sm" data-act="addBill">Add bill</button>' : ''}</div>
      ${(() => { const cats = Object.entries(m.byCat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
        return cats.length > 1 ? `<div class="sep"></div><div class="eyebrow">Where it goes each month</div>
          ${cats.map(([k, v]) => `<div class="prow"><span><b>${esc(k)}</b></span><span class="num muted small">${C.gbp(v, 0)} · ${C.pct(v / m.activeTotal)}</span>${bar(v / m.activeTotal, 'teal')}</div>`).join('')}` : ''; })()}
      <div class="note">The day of the month is what makes the cash flow in <b>Now</b> work. Use 31 for "last day" — short months fall back to the 28th, 29th or 30th automatically. Change an amount and the app offers to keep the old price, which is what builds the Price changes card underneath.</div></div>`;

    /* --- 4b. what bills have done over time --- */
    const hist = C.priceHistory(S.money.bills);
    if (hist.length) {
      const monthly = C.r2(hist.reduce((a, x) => a + x.total, 0));
      const recent = hist.filter(x => x.last.month >= C.mkey(C.addMonths(C.today(), -12)));
      h += `<div class="card"><h2>Price changes<span class="hint">${hist.length} bill${hist.length === 1 ? '' : 's'}</span></h2>
        <div class="row"><div class="l"><b>${monthly >= 0 ? 'More' : 'Less'} than when you started tracking</b><small>across ${hist.length} bill${hist.length === 1 ? '' : 's'} that have changed price</small></div>
          <div class="num tr"><b class="strong ${monthly > 0 ? 'neg' : 'pos'}">${monthly > 0 ? '+' : ''}${C.gbp(monthly)}</b><div class="muted small">${monthly > 0 ? '+' : ''}${C.gbp(monthly * 12, 0)} a year</div></div></div>
        ${hist.map(x => `<div class="prow"><div><b>${esc(x.name)}</b>
            <small class="meta">${C.gbp(x.first)} ${esc(C.fmtMs(x.since))} → ${C.gbp(x.current)} now${x.changes.length > 1 ? ` · ${x.changes.length} changes` : ''}</small></div>
          <div class="num tr"><b class="${x.total > 0 ? 'neg' : 'pos'}">${x.total > 0 ? '+' : ''}${C.gbp(x.total)}</b>
            <div class="muted small">${esc(C.fmtMs(x.last.month))} ${x.last.diff > 0 ? '+' : ''}${C.gbp(x.last.diff)}</div></div>
          <div class="pb">${(() => { const w = hist.reduce((m, y) => Math.max(m, Math.abs(y.total)), 0) || 1;
            return bar(Math.abs(x.total) / w, x.total > 0 ? 'coral' : 'teal'); })()}</div></div>`).join('')}
        ${recent.length ? `<div class="note">${recent.length === 1 ? 'One bill has' : recent.length + ' bills have'} changed in the last year: ${esc(recent.map(x => x.name).join(', '))}.</div>` : ''}
        <div class="note">Built from the history you keep when a price changes. Edit a bill's amount and the app offers to keep the old one — that is what fills this in.</div></div>`;
    }

    }
    if (sec === 'saving') {
    /* --- 4c. the savings pot, and the list it has to stretch across --- */
    const sv = C.savingsCalc(S.money.savings, m.debts, null, S.money.netLongTerm);
    h += `<div class="card"><h2>Savings pot${sv.monthly ? `<span class="hint">${C.gbp(sv.monthly)} a month going in</span>` : ''}</h2>
      <div class="flowhero"><div><div class="amt">${C.gbp(sv.balance)}</div>
        <div class="muted small">put away${sv.goals.length ? ` · the list comes to ${C.gbp(sv.wanted, 0)}` : ''}</div></div></div>
      <div class="btnrow"><button class="btn teal" data-act="savMove" data-d="1">Add</button><button class="btn ghost" data-act="savMove" data-d="-1">Take out</button></div>
      <div class="grid2 mt10">${field('Going in each month', inp('money.savings.monthly', S.money.savings.monthly, 'number', 'placeholder="0"'))}</div>
      ${sv.allTotal ? `<div class="sep"></div><div class="row"><div class="l"><b>Savings less ${sv.withLong ? 'all' : 'short-term'} debt</b>
          <small>${sv.withLong ? 'what you would have if you cleared everything today'
            : sv.longTotal ? C.gbp(sv.longTotal, 0) + ' of long-term debt left out of this' : 'what you would have if you cleared everything today'}</small></div>
        <div class="strong num ${sv.net < 0 ? 'neg' : 'pos'}">${C.gbp(sv.net)}</div></div>
      ${sv.longTotal ? toggle('money.netLongTerm', S.money.netLongTerm, 'Count long-term debt too',
        'A mortgage is not getting cleared this year, so leaving it out keeps this figure about the debt you are actually chipping away at.') : ''}` : ''}
      <div class="note"><b>Add</b> and <b>Take out</b> move money as you go — type the amount that moved, not the new total.
      The pot sits outside the cash flow in <b>Now</b>: money already set aside, not money to spend before pay day. Use the buffer for what you keep in the current account.</div></div>`;

    /* --- 4d. what the pot is for --- */
    h += `<div class="card"><h2>Saving for${sv.goals.length ? `<span class="hint">${sv.affordable ? sv.affordable + ' you can get now' : sv.goals.length + ' thing' + (sv.goals.length === 1 ? '' : 's')}</span>` : ''}</h2>
      ${sv.goals.length ? `<div class="results">
        <div class="r"><span>Everything on the list</span><span class="num">${C.gbp(sv.wanted)}</span></div>
        <div class="r"><span>In the pot</span><span class="num">${C.gbp(sv.balance)}</span></div>
        <div class="r total"><span>${sv.toGo ? 'Still to save' : 'Spare after the lot'}</span>
          <span class="num ${sv.toGo ? 'neg' : 'pos'}">${C.gbp(sv.toGo || sv.spare)}</span></div></div>
        ${sv.months ? `<div class="note">At ${C.gbp(sv.monthly)} a month you would have the lot by ${esc(C.fmtM(C.mkey(sv.by)))}.</div>` : ''}
        <div class="sep"></div>` : ''}
      ${ui.editGoals ? S.money.savings.goals.map((g, i) => `<div class="erow"><div class="full">${field('Saving for', inp(`money.savings.goals.${i}.name`, g.name, 'text'))}</div>
          ${field('What it costs', inp(`money.savings.goals.${i}.cost`, g.cost))}${field('Got it on', inp(`money.savings.goals.${i}.got`, g.got, 'date'))}
          <div class="full"><button class="btn danger sm" data-act="delGoal" data-id="${esc(g.id)}">Remove ${esc(g.name || 'this')}</button></div></div>`).join('') || '<div class="empty">Nothing on the list yet.</div>'
        : sv.goals.map(g => goalRow(g, true)).join('') || '<div class="empty">Nothing on the list yet. Add what you are saving up for and the pot gets measured against it.</div>'}
      <div class="btnrow"><button class="btn ghost sm" data-act="toggle" data-key="editGoals">${ui.editGoals ? 'Done' : 'Edit list'}</button><button class="btn sm" data-act="addGoal">Add something</button></div>
      ${sv.got.length ? detailsBlock('gotlist', `Already got (${sv.got.length}) · ${C.gbp(sv.spent, 0)}`, sv.got.map(gotRow).join('')) : ''}
      <div class="note">Every price here is measured against the whole pot, because it is one pile of money. <b>Got it</b> takes what you paid out of the pot and moves the thing down to <b>Already got</b>.</div></div>`;

    /* --- 5. debt --- */
    h += `<div class="card"><h2>Debt</h2><div class="row"><div class="l"><b>Total owed</b><small>${C.gbp(m.repayTotal)} a month in repayments</small></div><div class="strong num">${C.gbp(m.debtTotal)}</div></div>
      ${ui.editDebts ? m.debts.map((d, i) => `<div class="erow">${field('Debt', inp(`money.debts.${i}.name`, d.name, 'text'))}${field('Type', sel(`money.debts.${i}.type`, d.type, ['Short-term', 'Long-term']))}
          ${field(d.now.on ? `Balance (${C.fmtDM(d.now.on)})` : 'Balance', inp(`money.debts.${i}.balance`, d.now.typed || null))}${field('Monthly repayment', inp(`money.debts.${i}.repayment`, d.repayment))}
          ${field('APR % (optional)', pctInp(`money.debts.${i}.apr`, d.apr))}${field('Balance true on', inp(`money.debts.${i}.balanceOn`, d.now.on, 'date'))}<div class="full"><button class="btn danger sm" data-act="delDebt" data-i="${i}">Remove ${esc(d.name || 'debt')}</button></div></div>`).join('') || '<div class="empty">No debts. Nice.</div>'
        : m.debts.map(d => `<div class="row"><div class="l"><b>${esc(d.name)}</b><small>${esc(d.type)} · ${C.gbp(d.repayment)}/month${d.payoff ? d.payoff.never ? ' · repayment below interest' : ' · clear by ' + esc(C.fmtM(d.payoff.date)) + (d.payoff.naive ? ' (no interest)' : '') : ''}${d.now.cleared ? ' · <b class="pos">cleared</b>' : ''}</small></div>
          <div class="num tr"><b>${C.gbp(d.balance)}</b>${d.now.carried ? `<div class="muted small">${C.gbp(d.now.typed, 0)} on ${esc(C.fmtDM(d.now.on))} · ${d.now.payments} paid</div>` : ''}</div></div>`).join('') || '<div class="empty">No debts. Nice.</div>'}
      <div class="btnrow"><button class="btn ghost sm" data-act="toggle" data-key="editDebts">${ui.editDebts ? 'Done' : 'Edit debts'}</button>${ui.editDebts ? '<button class="btn sm" data-act="addDebt">Add debt</button>' : ''}</div>
      <div class="note">Type a balance straight off the statement and the app carries it forward on its own: every repayment due since comes off it, and interest goes back on at a twelfth of the APR. The date it was true is kept underneath, so retype it when the next statement lands and it starts again from there.
      Repayment dates come from the bill that funds them where there is one, otherwise the same day each month.
      Clear-by dates count from today. Without an APR they assume no interest — fine for 0% deals, optimistic for a mortgage.</div></div>`;
    }
    return { title: 'Money', chart: sec === 'history' ? m.last12 : null, sub: fl.hasBal ? C.gbp(fl.safe, 0) + ' free · ' + fl.days + ' days to pay day' : (m.latest ? 'latest: ' + C.fmtM(m.latest.month) : ''), html: h };
  },

  lists() {
    const done = S.house.filter(j => j.status === 'Done').length, tot = S.house.length;
    let h = `<div class="card"><h2>House jobs</h2><div class="row"><div class="l"><b>${done} of ${tot} done</b></div><div class="num">${C.pct(tot ? done / tot : 0)}</div></div>${bar(tot ? done / tot : 0, 'amber')}
      <div class="mt4">${ui.editJobs ? S.house.map((j, i) => `<div class="erow"><div class="full">${field('Job', inp(`house.${i}.job`, j.job, 'text'))}</div>${field('Date done', inp(`house.${i}.dateDone`, j.dateDone, 'date'))}${field('Notes', inp(`house.${i}.notes`, j.notes, 'text'))}<div class="full"><button class="btn danger sm" data-act="delJob" data-i="${i}">Remove ${esc(j.job || 'job')}</button></div></div>`).join('') || '<div class="empty">No jobs yet.</div>'
        : S.house.map((j, i) => `<div class="row"><div class="l"><b class="${j.status === 'Done' ? 'done' : ''}">${esc(j.job)}</b><small>${j.dateDone ? esc(C.fmtD(j.dateDone)) : ''}${j.notes ? (j.dateDone ? ' · ' : '') + esc(j.notes) : ''}</small></div><button class="status ${j.status.replace(' ', '')}" data-act="cycle" data-i="${i}">${esc(j.status)}</button></div>`).join('') || '<div class="empty">No jobs yet.</div>'}</div>
      <div class="btnrow"><button class="btn ghost sm" data-act="toggle" data-key="editJobs">${ui.editJobs ? 'Done' : 'Edit jobs'}</button>${ui.editJobs ? '<button class="btn sm" data-act="addJob">Add job</button>' : ''}</div>
      <div class="note">Tap a status to move it on: To do → In progress → Done (sets today's date).</div></div>`;
    const cols = C.collections(S); const c = cols.find(x => x.key === ui.set) || cols[0];
    h += `<div class="card"><h2>Collections</h2><div class="chips">${cols.filter(x => x.key !== 'PSM demos').map(x => `<button class="chip ${x.key === c.key || (c.key === 'PSM demos' && x.key === 'PSM') ? 'on' : ''}" data-act="set" data-set="${esc(x.key)}">${esc(x.label)}</button>`).join('')}</div>
      ${c.key.startsWith('PSM') ? cols.filter(x => x.key.startsWith('PSM')).map(x => `<div class="prow"><span><b>${esc(x.label)}</b></span><span class="num muted small">${x.have} / ${x.total} · ${C.pct(x.pct)}</span>${bar(x.pct)}</div>`).join('') : `<div class="prow"><span><b>${esc(c.label)}</b></span><span class="num muted small">${c.have} / ${c.total} · ${C.pct(c.pct)}</span>${bar(c.pct)}</div>`}
      <div class="field searchbox"><input type="search" id="search" placeholder="Search…" aria-label="Search this collection" value="${esc(ui.search)}"></div>
      <div id="ticklist">${tickList()}</div></div>`;
    return { title: 'Lists', sub: 'house jobs · collections', html: h };
  },

  settings() {
    let h = `<div class="card"><h2>Appearance</h2>
      ${segment('theme', theme, [{ v: 'auto', l: 'Auto' }, { v: 'light', l: 'Light' }, { v: 'dark', l: 'Dark' }])}
      <div class="note">Auto follows your phone's own light or dark setting.</div></div>`;
    h += pinCard();
    h += backupCard('Backup', 'A backup is plain JSON: restore it on any phone, or keep it as insurance against the browser clearing its storage.');
    h += aboutCard();
    return { title: 'Settings', sub: storageOK ? 'saving on this device' : 'not saving on this device', html: h };
  },

  games() {
    const g = C.gamesStats(S.games);
    const years = [...new Set(S.games.map(x => (x.date || '').slice(0, 4) || 'undated'))].sort().reverse();
    let h = `<div class="card"><div class="stats"><div class="stat"><b>${g.thisYear}</b><span>this year</span></div><div class="stat"><b>${g.lastYear}</b><span>last year</span></div><div class="stat"><b>${g.total}</b><span>all time</span></div></div></div>`;
    h += `<div class="card"><h2>Completed a game?</h2><div class="grid2"><div class="field full"><label>Game</label><input type="text" id="g_name" placeholder="e.g. DOOM 64"></div>
      ${field('Date', `<input type="date" id="g_date" value="${C.today()}">`)}${field('Notes (optional)', `<input type="text" id="g_notes" placeholder="Easy · bad ending · again…">`)}</div>
      <div class="btnrow"><button class="btn teal" data-act="addGame">Add to log</button></div></div>`;
    h += `<div class="card"><h2>Goals</h2><div class="field"><textarea data-set="goals" rows="3" aria-label="Goals">${esc(S.goals || '')}</textarea></div></div>`;
    h += `<div class="card"><h2>Log</h2>${years.map(y => { const list = S.games.filter(x => ((x.date || '').slice(0, 4) || 'undated') === y).sort((a, b) => (b.date || '').localeCompare(a.date || '')); return `<div class="yearhead">${esc(y)} · ${list.length}</div>${list.map(x => `<div class="row"><div class="l"><b>${esc(x.game)}</b><small>${x.date ? esc(C.fmtD(x.date)) : 'no date'}${x.notes ? ' · ' + esc(x.notes) : ''}</small></div><button class="del" data-act="delGame" data-id="${esc(x.id)}" aria-label="Remove ${esc(x.game)}">×</button></div>`).join('')}`; }).join('') || '<div class="empty">Nothing logged yet.</div>'}</div>`;
    return { title: 'Games', sub: g.last ? 'last: ' + g.last.game : '', html: h };
  }
};
const CATS = ['Housing', 'Utilities', 'Insurance', 'Transport', 'Phone', 'Subscriptions', 'Health & Fitness', 'Debt & Finance', 'Other'];

