/* ===== calc: pure functions, no DOM ===== */
const C = (() => {
  const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
  const num = v => (v === null || v === undefined || v === '' || isNaN(+v)) ? 0 : +v;
  const i2d = s => new Date(s + 'T00:00:00Z');
  const d2i = d => d.toISOString().slice(0, 10);
  const dim = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const addDays = (s, n) => d2i(new Date(i2d(s).getTime() + n * 86400000));
  const addMonths = (s, n) => {
    const d = i2d(s); const m = d.getUTCMonth() + n;
    const y = d.getUTCFullYear() + Math.floor(m / 12); const mm = ((m % 12) + 12) % 12;
    return d2i(new Date(Date.UTC(y, mm, Math.min(d.getUTCDate(), dim(y, mm)))));
  };
  const daysBetween = (a, b) => Math.round((i2d(b) - i2d(a)) / 86400000);
  const today = () => { const d = new Date(); return d2i(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))); };
  const mkey = s => s.slice(0, 7);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dow = s => i2d(s).getUTCDay();
  /* The spaces inside a date are non-breaking, so "12 Mar 2027" wraps as a
     whole rather than leaving "12" at the end of one line and "Mar 2027" on the
     next. A regex \s still matches them. */
  const NB = '\u00a0';
  const fmtD = s => { if (!s) return ''; const d = i2d(s); return `${d.getUTCDate()}${NB}${MON[d.getUTCMonth()]}${NB}${d.getUTCFullYear()}`; };
  const fmtDM = s => { const d = i2d(s); return `${String(d.getUTCDate()).padStart(2, '0')}${NB}${MON[d.getUTCMonth()]}`; };
  const fmtDow = s => `${DOW[dow(s)]}${NB}${fmtDM(s)}`;
  const fmtM = k => `${MON[+k.slice(5, 7) - 1]}${NB}${k.slice(0, 4)}`;
  const fmtMs = k => `${MON[+k.slice(5, 7) - 1]}${NB}${k.slice(2, 4)}`;
  const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  // made once and kept: toLocaleString with options builds a new formatter for every figure on the page
  const nfs = {};
  const nf = dp => nfs[dp] || (nfs[dp] = new Intl.NumberFormat('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp }));
  const gbp = (v, dp = 2) => {
    if (v === null || v === undefined || v === '' || isNaN(v)) return '–';
    return (v < 0 ? '-£' : '£') + nf(dp).format(Math.abs(v));
  };
  const pct = v => (v === null || v === undefined || isNaN(v)) ? '–' : Math.round(v * 100) + '%';
  /* An interest rate is not a savings percentage: 4.1% rounded to 4% is a
     different mortgage. Trailing zeros still go, so 5% stays 5%. */
  const rate = v => (v === null || v === undefined || isNaN(v)) ? '–' : +(v * 100).toFixed(2) + '%';

  /* ---------- working days & UK bank holidays ----------
     Direct debits and standing orders only move on working days. A bill dated a
     Sunday is normally taken the next working day, so the calendar date on the
     bank statement drifts. All of this is computed offline: no network, no list
     to keep up to date. England & Wales dates. */
  const easter = y => {                                   // Meeus/Jones/Butcher
    const a = y % 19, b = Math.floor(y / 100), c = y % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mo = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return d2i(new Date(Date.UTC(y, mo - 1, day)));
  };
  const bhCache = {};
  function bankHolidays(y) {
    if (bhCache[y]) return bhCache[y];
    const out = new Set();
    const nextFree = s => { while (dow(s) === 0 || dow(s) === 6 || out.has(s)) s = addDays(s, 1); return s; };
    const onOrAfter = (s, w) => { while (dow(s) !== w) s = addDays(s, 1); return s; };
    const onOrBefore = (s, w) => { while (dow(s) !== w) s = addDays(s, -1); return s; };
    const es = easter(y);
    out.add(nextFree(`${y}-01-01`));                      // New Year's Day (+ substitute)
    out.add(addDays(es, -2));                             // Good Friday
    out.add(addDays(es, 1));                              // Easter Monday
    out.add(onOrAfter(`${y}-05-01`, 1));                  // Early May
    out.add(onOrBefore(`${y}-05-31`, 1));                 // Spring
    out.add(onOrBefore(`${y}-08-31`, 1));                 // Summer
    out.add(nextFree(`${y}-12-25`));                      // Christmas (+ substitute)
    out.add(nextFree(`${y}-12-26`));                      // Boxing Day (+ substitute)
    bhCache[y] = out;
    return out;
  }
  const isBankHol = s => bankHolidays(+s.slice(0, 4)).has(s);
  const isWorkingDay = (s, bh) => { const w = dow(s); return w !== 0 && w !== 6 && !(bh && isBankHol(s)); };
  const whyNot = (s, bh) => (bh && isBankHol(s)) ? 'bank holiday' : dow(s) === 0 ? 'Sunday' : dow(s) === 6 ? 'Saturday' : '';
  /* shift: 'exact' leaves the date alone, 'next' pushes a weekend/bank-holiday
     date forward to the next working day, 'prev' pulls it back. */
  function shiftDue(s, shift, bh) {
    if (shift !== 'next' && shift !== 'prev') return { date: s, nominal: s, moved: false, why: '' };
    const why = whyNot(s, bh);
    if (!why) return { date: s, nominal: s, moved: false, why: '' };
    const step = shift === 'prev' ? -1 : 1;
    let d = s;
    for (let i = 0; i < 12 && !isWorkingDay(d, bh); i++) d = addDays(d, step);
    return { date: d, nominal: s, moved: d !== s, why };
  }

  /* ---------- pay ---------- */
  const TAXKEYS = ['personalAllowance', 'basicRate', 'basicBand', 'higherRate', 'higherBand', 'addRate', 'niPT', 'niUEL', 'niMain', 'niUpper'];
  // the allowance is the tax code's number × 10 + 9, which is what HMRC's own tables use: 1257L is 12,579
  const TAXDEF = { personalAllowance: 12579, basicRate: 0.2, basicBand: 37700, higherRate: 0.4, higherBand: 125140,
    addRate: 0.45, niPT: 12570, niUEL: 50270, niMain: 0.08, niUpper: 0.02 };
  // the 6 April a day's tax year started on
  const aprilStart = day => { const y = +day.slice(0, 4); return day >= `${y}-04-06` ? `${y}-04-06` : `${y - 1}-04-06`; };
  // a real day: 2026-02-31 would otherwise quietly become 3 March, and 2026-13-01 throws
  const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(i2d(s)) && d2i(i2d(s)) === s;
  const isMonth = s => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
  function payCalc(p, tod) {
    tod = tod || today();
    const t = p.tax || {};
    const blank = v => v === null || v === undefined || v === '';
    /* A cleared box must not take the whole tab down with it: no hours made the
       hourly rate Infinity and every figure NaN, and no pay day threw. Each falls
       back to what a fresh install starts with. */
    const weeks = num(p.weeksYear) || 52.1667, hoursWk = num(p.hoursWeek) || 35;
    const ped = blank(p.periodEndDays) ? 6 : num(p.periodEndDays);
    // idx is the rise's place in the list as typed, which is what the settings edit
    const rises = (p.rises || []).map((x, idx) => x && isDate(x.from) && num(x.salary) > 0 ? Object.assign({}, x, { idx }) : null)
      .filter(Boolean).sort((a, b) => a.from.localeCompare(b.from));
    /* The salary in payment across a pay period. A rise with a backpay date only
       enters normal pay from that pay day — the shortfall before it is paid as
       backpay — unless it is in `forced`, which is how that shortfall is measured.
       Worked from the dates the salary changes on rather than day by day. */
    const avgSalary = (start, payday, forced) => {
      const end = addDays(start, 28);
      let s = num(p.salary), d = start, total = 0;
      rises.forEach(r => {
        if (r.arrearsOn && payday < r.arrearsOn && !(forced && forced.has(r))) return;
        if (r.from >= end) return;
        if (r.from > d) { total += s * daysBetween(d, r.from); d = r.from; }
        s = num(r.salary);
      });
      return (total + s * daysBetween(d, end)) / 28;
    };
    const basicOf = sal => r2(sal / weeks * 4);
    const hourlyOf = sal => r2(sal / weeks / hoursWk);
    // fixed items can have a start and an end; a period is charged for the days the item was in force
    const itemsOn = start => {
      const out = { allow: 0, sacr: 0, after: 0 }, last = addDays(start, 27);
      (p.fixed || []).forEach(it => {
        const amt = it ? num(it.amount) : 0;
        if (!amt) return;                    // named or not, an amount is an amount
        const a = it.from && it.from > start ? it.from : start, b = it.to && it.to < last ? it.to : last;
        const days = a <= b ? daysBetween(a, b) + 1 : 0;
        if (!days) return;
        const v = amt * days / 28;
        if (it.treatment === 'Allowance') out.allow += v;
        else if (it.treatment === 'Sacrifice') out.sacr += v;
        else out.after += v;
      });
      return { allow: r2(out.allow), sacr: r2(out.sacr), after: r2(out.after) };
    };
    // one rate set per tax year; the entry in force on a pay day is the latest one starting on or before it
    /* A blank rate must never read as zero — num() would turn a cleared basic
       rate into 0% tax and overstate net pay by hundreds. Fall back to the last
       year that had a figure, then to HMRC's published defaults. */
    const listed = (p.taxYears || []).filter(y => y && typeof y === 'object');
    const years = (listed.length ? listed : [Object.assign({ from: t.taxYearStart, personalAllowance: p.personalAllowance }, t)])
      .slice().sort((a, b) => String(a.from).localeCompare(String(b.from)))
      .map((y, i, arr) => {
        const out = Object.assign({}, y);
        TAXKEYS.forEach(k => {
          if (!blank(out[k])) return;
          for (let j = i - 1; j >= 0; j--) if (!blank(arr[j][k])) { out[k] = arr[j][k]; return; }
          out[k] = TAXDEF[k];
        });
        return out;
      });
    const ratesOn = day => { let e = years[0]; years.forEach(x => { if (day >= x.from) e = x; }); return e; };
    // HMRC method: free pay and bands proportioned to the tax week, taxable pay floored to whole pounds
    const taxOn = (cum, wk, e) => {
      const free = Math.round(num(e.personalAllowance) * wk / 52 * 100) / 100;
      const a = Math.floor(cum - free);
      if (a <= 0) return 0;
      const b1 = num(e.basicBand) * wk / 52, b2 = num(e.higherBand) * wk / 52;
      return r2(num(e.basicRate) * Math.min(a, b1) + num(e.higherRate) * Math.min(Math.max(a - b1, 0), b2 - b1) + num(e.addRate) * Math.max(a - b2, 0));
    };
    /* HMRC works NI thresholds out per week, rounded up to the whole pound, and
       multiplies up for longer periods. Dividing the annual figure by 13 lands
       a pound under the published 4-weekly threshold, which is enough to stop
       the pennies matching the payslip. */
    const niOn = (x, e) => {
      const PT = Math.ceil(num(e.niPT) / 52) * 4, UEL = Math.ceil(num(e.niUEL) / 52) * 4;
      return num(e.niMain) * Math.min(Math.max(x - PT, 0), UEL - PT) + num(e.niUpper) * Math.max(x - UEL, 0);
    };
    const nowRates = ratesOn(tod);
    const paye = x => taxOn(x, 4, nowRates);
    const ni = x => niOn(x, nowRates);
    /* The stored pay day is an anchor — roll it on in 28-day steps so the
       schedule never goes stale. Pay day itself counts as gone: BACS credits
       land in the small hours, so by the time anyone opens this the money is in
       and the pay day worth showing is the one four weeks out. */
    const anchor = isDate(p.nextPayDay) ? p.nextPayDay : tod;
    const next = addDays(anchor, 28 * (Math.floor(daysBetween(anchor, tod) / 28) + 1));
    const onOrAfter = d => addDays(next, 28 * Math.ceil(daysBetween(next, d) / 28));
    /* What is shown: this year plus the next four, and last year only while its
       EU holiday pay is still an estimate — once what was paid is recorded, that
       year drops off. But never less than the whole of the current tax year,
       whose totals are on screen: recording last year's figure in March used to
       cut the year down to its last three pay days. */
    const prevYear = +tod.slice(0, 4) - 1;
    const prevDone = !blank((p.hpaHistory || {})[String(prevYear)]);
    const Y0 = prevDone ? prevYear + 1 : prevYear, YEND = +tod.slice(0, 4) + 4;
    const hpaFrom = onOrAfter(addDays(`${Y0}-01-01`, ped));
    const taxFrom = onOrAfter(aprilStart(tod));
    const shownFrom = hpaFrom < taxFrom ? hpaFrom : taxFrom;
    /* Cumulative tax needs the tax year from its first pay day, so a schedule
       starting in January works out April to December too, then leaves those
       pay days out of what it returns. */
    const calcFrom = onOrAfter(aprilStart(shownFrom));
    const rows = [];
    for (let i = 0; i < 120; i++) {
      const payday = addDays(calcFrom, 28 * i);
      const end = addDays(payday, -ped), start = addDays(end, -27);
      if (+end.slice(0, 4) > YEND) break;
      const h = (p.hours && p.hours[payday]) || {};
      const ot = num(h.ot), sun = num(h.sun);
      const sal = avgSalary(start, payday), rowBasic = basicOf(sal), rowHourly = hourlyOf(sal);
      const fix = itemsOn(start);
      const sunRate = p.sundayAtT ? rowHourly : num(p.sundayRate);
      const otPay = r2(ot * rowHourly), sunPay = r2(sun * sunRate);
      rows.push({ payday, start, end, ot, sun, otPay, sunPay, basic: rowBasic, hourly: rowHourly, salary: sal,
        allow: fix.allow, sacr: fix.sacr, after: fix.after,
        refYear: end.slice(0, 4), taxYear: aprilStart(payday), rates: ratesOn(payday), hpaPay: 0, backpay: 0, backpayOt: 0,
        past: payday <= tod, next: payday === next, warm: payday < shownFrom });
    }
    // backpay: for a rise with a backpay date, the shortfall on every period between the effective date and that pay day
    const riseCalc = rises.map((r, k) => {
      const out = { idx: r.idx, from: r.from, salary: num(r.salary), arrearsOn: r.arrearsOn || null, otBackpay: !!r.otBackpay, basic: 0, ot: 0, total: 0, periods: 0 };
      if (!r.arrearsOn) return out;
      /* Each rise is measured against the ones before it rather than against the
         old salary, or two rises backdated over the same months would both be
         paid from the bottom and the overlap counted twice. */
      const before = new Set(rises.slice(0, k)), upTo = new Set(rises.slice(0, k + 1));
      rows.forEach(row => {
        if (row.payday >= r.arrearsOn || row.end < r.from) return;
        const paid = avgSalary(row.start, row.payday, before), due = avgSalary(row.start, row.payday, upTo);
        if (due <= paid) return;
        out.periods++;
        out.basic += basicOf(due) - basicOf(paid);
        if (r.otBackpay) out.ot += (row.ot + (p.sundayAtT ? row.sun : 0)) * (hourlyOf(due) - hourlyOf(paid));
      });
      out.basic = r2(out.basic); out.ot = r2(out.ot); out.total = r2(out.basic + out.ot);
      const target = rows.find(x => x.payday === r.arrearsOn) || rows.find(x => x.payday >= r.arrearsOn);
      if (target && out.total) { target.backpay = r2(target.backpay + out.total); target.backpayOt = r2(target.backpayOt + out.ot); }
      return out;
    });

    // EU holiday pay (Southeastern HPA): 4/52 of the calendar year's qualifying pay, paid on the first pay day in March of the next year
    const curRow = rows.find(r => r.payday === next) || rows.find(r => !r.past) || rows[0]
      || { allow: 0, sacr: 0, after: 0, basic: basicOf(num(p.salary)), hourly: hourlyOf(num(p.salary)) };
    // the rate being paid now, rises included, rather than the salary first typed
    const basic = curRow.basic, hourly = curRow.hourly;
    const allow = curRow.allow, sacr = curRow.sacr, after = curRow.after;
    const basicOnlyTaxable = basic + allow - sacr;
    const marginalNet = x => x - (paye(basicOnlyTaxable + x) - paye(basicOnlyTaxable)) - (ni(basicOnlyTaxable + x) - ni(basicOnlyTaxable));
    const hist = p.hpaHistory || {};
    const hpaYears = {};
    rows.forEach(r => { if (r.payday < hpaFrom) return; const y = hpaYears[r.refYear] = hpaYears[r.refYear] || { year: r.refYear, qualifying: 0, periods: 0, logged: 0 }; y.qualifying += r.otPay + r.sunPay + r.backpayOt; y.periods++; if (r.ot || r.sun) y.logged++; });
    const allYears = new Set([...Object.keys(hpaYears), ...Object.keys(hist)]);
    const hpa = [...allYears].sort().map(y => {
      const est = hpaYears[y] ? r2(hpaYears[y].qualifying * 4 / 52) : null;
      const received = hist[y] != null && hist[y] !== '' ? num(hist[y]) : null;
      // March of the year after, and only March: an old year's figure kept for the
      // record must not be paid again on whatever pay day happens to come next
      const payRow = rows.find(r => r.payday.slice(0, 7) === `${+y + 1}-03`);
      const gross = received != null ? received : est;
      if (payRow && gross) payRow.hpaPay = gross;
      return { year: y, qualifying: hpaYears[y] ? hpaYears[y].qualifying : null, periods: hpaYears[y] ? hpaYears[y].periods : 0, logged: hpaYears[y] ? hpaYears[y].logged : 0,
        est, received, gross, net: gross ? marginalNet(gross) : 0, payday: payRow ? payRow.payday : null };
    });
    let n = 0, cum = 0, paid = 0, curYear = null;
    rows.forEach(r => {
      if (r.taxYear !== curYear) { curYear = r.taxYear; n = 0; cum = 0; paid = 0; }   // new tax year, start again
      const e = r.rates;
      const extraGross = r.otPay + r.sunPay;
      const taxable = r2(r.basic + r.allow + r.otPay + r.sunPay + r.hpaPay + r.backpay - r.sacr);
      let tax, marginal;
      n++;
      /* A week 1 / month 1 code has every period stand alone. So does a 14th pay
         day in one tax year — HMRC's "week 56" — which is taxed on its own four
         weeks and leaves the year's running totals where they were, rather than
         being taxed with no allowance at all. */
      if (p.nonCumulative || n > 13) {
        tax = taxOn(taxable, 4, e);
        marginal = tax - taxOn(taxable - extraGross, 4, e);
      } else {                                          // cumulative: tax due on the year to date, less tax already paid
        cum = r2(cum + taxable);
        const wk = 4 * n, due = taxOn(cum, wk, e);
        tax = r2(due - paid);
        marginal = due - taxOn(r2(cum - extraGross), wk, e);
        paid = due;
      }
      const nic = niOn(taxable, e);
      Object.assign(r, { extraGross, taxable, paye: tax, ni: nic,
        net: taxable - tax - nic - r.after,
        extra: extraGross ? extraGross - marginal - (nic - niOn(taxable - extraGross, e)) : 0 });
      r.keep = extraGross ? r.extra / extraGross : null;
      /* A payslip beats a projection. The breakdown above stays exactly as it
         was worked out, because that is what explains the figure, but once the
         real net is typed in it is the one everything downstream spends. The
         payslip lands a few days early, so this works for a pay day that has
         not happened yet as readily as one that has. */
      const typed = (p.actual || {})[r.payday];
      r.projected = r.net;                             // kept unrounded, exactly as net has always been
      r.actual = typed === null || typed === undefined || typed === '' ? null : r2(num(typed));
      if (r.actual !== null) r.net = r.actual;
      r.diff = r.actual === null ? null : r2(r.actual - r.projected);
    });
    /* The payslip turns up a few days before the money does, so there is a
       window where the real figure is known and the projection is the worse of
       the two. One pay day is asked about at a time: the one coming, once it is
       inside that window, or the one just gone if it went by without a figure. */
    // nought is a setting, not a blank: it means only ask once pay day has been
    const leadSet = p.payslipLead;
    const lead = leadSet === null || leadSet === undefined || leadSet === ''
      ? 4 : Math.max(0, Math.round(num(leadSet)));
    const shown = rows.filter(r => !r.warm);
    // nothing to ask about until there is a salary to have a payslip for
    const wants = num(p.salary) ? shown.filter(r => r.actual === null) : [];
    const needsPayslip = wants.find(r => !r.past && daysBetween(tod, r.payday) <= lead)
      // a few days the other side too, for a pay day that went by without one,
      // then it stops: a reminder that never goes away is just wallpaper
      || wants.slice().reverse().find(r => r.past && daysBetween(r.payday, tod) <= 3)
      || null;
    const thisTaxYear = aprilStart(tod);
    const yr = rows.filter(r => r.taxYear === thisTaxYear);
    const tot = k => yr.reduce((a, r) => a + num(r[k]), 0);
    const totals = { ot: r2(tot('ot')), sun: r2(tot('sun')), otPay: tot('otPay'), sunPay: tot('sunPay'), hpaPay: tot('hpaPay'), backpay: tot('backpay'), taxable: tot('taxable'), paye: tot('paye'), ni: tot('ni'), net: tot('net'), extra: tot('extra'), extraGross: tot('extraGross') };
    totals.keep = totals.extraGross ? totals.extra / totals.extraGross : null;
    // how the projection has been doing against the payslips that replaced it
    totals.projected = tot('projected');
    totals.actuals = yr.filter(r => r.actual !== null).length;
    // taken off the totals rather than summing the rounded per-row differences
    totals.diff = r2(tot('net') - tot('projected'));
    /* Above £100,000 HMRC takes £1 of personal allowance away for every £2
       earned over it, and issues a smaller tax code to collect it. Payroll does
       not work the taper out — it just applies whatever code it is given, and
       neither does this app, because the allowance here IS the code. So all it
       can do is say when the code on file has clearly not been updated. */
    const paNow = num(ratesOn(tod).personalAllowance);
    const paShould = Math.max(0, TAXDEF.personalAllowance - Math.max(0, (totals.taxable - 100000) / 2));
    const paCheck = { taxable: totals.taxable, allowance: paNow, should: r2(paShould),
      stale: totals.taxable > 100000 && paNow > paShould };
    let nextIdx = shown.findIndex(r => r.next); if (nextIdx < 0) nextIdx = Math.max(shown.findIndex(r => !r.past), 0);
    return { basic, hourly, allow, sacr, after, rows: shown, totals, nextIdx, hpa, rises: riseCalc, years, paCheck,
      payslipLead: lead, needsPayslip, nextPayDay: next, taxYear: `${thisTaxYear.slice(0, 4)}/${addMonths(thisTaxYear, 12).slice(2, 4)}` };
  }

  /* ---------- money ---------- */
  /* What a bill takes on a given day. A plain bill is its price. A bill linked
     to a type of debt is the repayments on that debt — but only on debts that
     still owe something by then, so a card that clears stops being paid for
     instead of going on costing its repayment every month for ever. Without a
     day, or a debt with no date to carry from, it is the full repayment, as it
     always was. */
  // anything not marked Long-term is short-term, everywhere: the list, the bill that pays it, the totals
  const debtType = d => d.type === 'Long-term' ? 'Long-term' : 'Short-term';
  function billAmount(b, debts, on, m, opt) {
    if (b.link) return r2(debts.filter(d => debtType(d) === b.link).reduce((a, d) => a + debtDue(d, m, on, opt), 0));
    return num(b.amount);
  }
  function debtDue(d, m, on, opt) {
    const pay = num(d.repayment);
    if (!pay || !on || !m || !d.balanceOn || on <= d.balanceOn) return pay;
    const before = debtNow(d, m, addDays(on, -1), opt);
    if (before.balance <= 0) return 0;
    // the last payment is only what is left, interest included — worked the same way debtNow works it
    return Math.min(pay, r2(before.balance + r2(before.balance * (num(d.apr) / 12))));
  }
  // the bill that pays a debt, where there is one, says which day the money leaves
  function fundingBill(d, m, tod) {
    return (m.bills || []).find(b => b.link && b.link === debtType(d)
      && (!isMonth(b.ended) || b.ended >= mkey(tod)) && num(b.dueDay) >= 1) || null;
  }
  /* The days a debt's repayments really leave from here on: the funding bill's
     dates where there is one — moved off weekends, missing its months off — and
     monthly from the day the balance was true where there is not, which is how
     debtNow carries it. The clear date is the last of these, not a count of
     months added to the first. */
  function payDates(d, m, n, tod, opt) {
    const from = isDate(d.balanceOn) && d.balanceOn > tod ? d.balanceOn : tod;
    const bill = fundingBill(d, m, tod);
    if (bill) {
      const perYear = 12 - (bill.skip || []).length;
      return perYear > 0 ? billDates(bill, addDays(from, 1), addMonths(from, Math.ceil(n * 12 / perYear) + 2), opt).slice(0, n).map(s => s.date) : [];
    }
    const anchor = isDate(d.balanceOn) ? d.balanceOn : from, out = [];
    let k = Math.max(1, (+from.slice(0, 4) - +anchor.slice(0, 4)) * 12 + (+from.slice(5, 7) - +anchor.slice(5, 7)) - 1);
    for (; out.length < n; k++) { const x = addMonths(anchor, k); if (x > from) out.push(x); }
    return out;
  }
  function moneyCalc(m, tod, opt) {
    tod = tod || today();
    opt = opt || { shift: 'exact', bankHols: false };
    const debts = m.debts || [];
    /* Some bills change price on a date you already know — council tax every
       April, insurance on its renewal month. Nothing can look the new figure up,
       but the app can stop it going stale quietly by asking once a year. */
    const thisKey = mkey(tod);
    const debtCalc = debts.map(d => {
      const now = debtNow(d, m, tod, opt);
      // a fixed rate runs out on a month you already know; after that the figures here are guesswork
      const rateDue = /^\d{4}-\d{2}$/.test(d.rateEnds || '') && d.rateEnds <= thisKey ? d.rateEnds : null;
      const payoff = debtPayoff({ ...d, balance: now.balance }, tod);
      /* The formula counts the payments; the real schedule says which day the
         last of them leaves, so the clear date lands in the right month — not a
         month late when the payment day is later in the month than today, nor
         when the last one is moved off a weekend or skips a month. */
      if (payoff && payoff.months && !payoff.never && payoff.months <= 1200) {
        const dates = payDates(d, m, payoff.months, tod, opt);
        if (dates.length === payoff.months) payoff.date = dates[dates.length - 1];
      }
      return { ...d, balance: now.balance, now, rateDue, payoff };
    });
    const bills = (m.bills || []).map(b => {
      const amt = billAmount(b, debts, tod, m, opt), months = 12 - (b.skip || []).length;
      /* A last-payment month can be behind you (a bill that has finished, or the
         old price in a history split) or ahead (a phone contract with its final
         month known). Until it comes the bill is live and counts; after it, the
         bill drops out on its own. The count is of real payment dates, and runs
         a week past the month, since a last payment dated the 31st can be moved
         off a weekend into the month after. */
      const ended = isMonth(b.ended) ? b.ended : null, dated = num(b.dueDay) >= 1;
      const left = ended && dated ? billDates(b, addDays(tod, 1), addDays(addMonths(ended + '-01', 1), 6), opt).length : null;
      const finished = !!ended && ended < thisKey && !left;
      // one that has not started yet is not costing anything yet
      const notYet = isMonth(b.started) && b.started > thisKey;
      // a linked bill ends when the last of its debts clears; one already cleared has no say
      const linked = b.link ? debtCalc.filter(d => debtType(d) === b.link && num(d.repayment) && !(d.now.on && d.balance <= 0)) : null;
      const clears = linked && linked.length && linked.every(d => d.payoff && d.payoff.date)
        ? linked.map(d => d.payoff.date).sort().pop() : null;
      /* The price check runs from the month the price changes, for six months —
         across a year end too, so a December change is not forgotten on New
         Year's Day — and then lets go, as every nudge here does. */
      const mo = Math.round(num(b.review));
      let due = null;
      if (mo >= 1 && mo <= 12) {
        const y = +tod.slice(0, 4), pad = String(mo).padStart(2, '0');
        const last = `${y}-${pad}` <= thisKey ? `${y}-${pad}` : `${y - 1}-${pad}`;
        if (mkey(addMonths(last + '-01', 6)) > thisKey && !(isMonth(b.started) && b.started > last)) due = last;
      }
      // a bill paid ten months of the year costs less over a year than twelve times its price
      return { ...b, amt, paidMonths: months, yearly: r2(amt * months), finished, notYet, left, clears,
        dueReview: due && (!b.reviewedOn || b.reviewedOn < due) ? due : null };
    });
    const active = bills.filter(b => !b.finished && !b.notYet);
    const activeTotal = active.reduce((a, b) => a + b.amt, 0);
    const yearTotal = r2(active.reduce((a, b) => a + b.yearly, 0));
    const anySkips = active.some(b => b.paidMonths < 12);
    const dated = active.filter(b => num(b.dueDay) >= 1);
    const byCat = {}; active.forEach(b => { byCat[b.category || 'Other'] = (byCat[b.category || 'Other'] || 0) + b.amt; });
    const months = (m.months || []).map(x => {
      const has = x.earnings !== null && x.earnings !== undefined && x.earnings !== '';
      const out = has ? bills.filter(b => (b.started || '0000-00') <= x.month && (!b.ended || b.ended >= x.month)
        && !(b.skip || []).includes(+x.month.slice(5, 7)))
        .reduce((a, b) => a + (b.link ? billAmount(b, debts, x.month + '-01', m, opt) : b.amt), 0) : null;
      const disp = has ? num(x.earnings) - out : null;
      const pot = has ? Math.max(disp - num(m.buffer), 0) : null;
      return { ...x, has, outgoings: out, disposable: disp, potential: pot, savedN: num(x.saved) };
    });
    const byYear = {};
    months.forEach(x => { const y = x.month.slice(0, 4); const o = byYear[y] = byYear[y] || { year: y, earnings: 0, outgoings: 0, disposable: 0, potential: 0, saved: 0, savedE: 0, n: 0 };
      if (x.has) { o.earnings += num(x.earnings); o.outgoings += x.outgoings; o.disposable += x.disposable; o.potential += x.potential; o.n++; o.savedE += x.savedN; }
      o.saved += x.savedN; });
    // a rate compares like with like: savings from the months whose earnings are in
    Object.values(byYear).forEach(o => o.rate = o.earnings ? o.savedE / o.earnings : null);
    const withData = months.filter(x => x.has);
    const latest = withData.length ? withData[withData.length - 1] : null;
    const ly = latest ? latest.month.slice(0, 4) : tod.slice(0, 4);
    const yearRow = byYear[tod.slice(0, 4)] || byYear[ly] || null;
    const thisMonthKey = mkey(tod);
    const debtTotal = debtCalc.reduce((a, d) => a + num(d.balance), 0);
    // a cleared debt is not costing anything any more
    const repayTotal = debtCalc.reduce((a, d) => a + (d.now.on && d.balance <= 0 ? 0 : num(d.repayment)), 0);
    const st = debtCalc.filter(d => debtType(d) === 'Short-term');
    const stClear = st.map(d => d.payoff).filter(x => x && x.date).map(x => x.date).sort().pop() || null;
    return { bills, active, activeTotal, yearTotal, anySkips, reviews: active.filter(b => b.dueReview),
      rateReviews: debtCalc.filter(d => d.rateDue), noRateDebts: debtCalc.filter(d => d.now.noRate),
      dated, undated: active.length - dated.length, byCat, months,
      byYear: Object.values(byYear).sort((a, b) => a.year.localeCompare(b.year)), latest, yearRow, thisMonthKey,
      debts: debtCalc, debtTotal, repayTotal, stClear, last12: last12(months, latest) };
  }
  function last12(months, latest) {
    if (!latest) return [];
    const idx = months.findIndex(x => x.month === latest.month);
    const out = [];
    for (let i = Math.max(0, idx - 11); i <= idx; i++) out.push(months[i]);
    return out;
  }
  /* A debt balance typed off a statement, brought up to date.
     The repayment leaves every month whether or not the app is opened, so a
     balance typed weeks ago is already wrong. This works it forward the way the
     bank balance is worked forward: the typed figure stands, every payment due
     since comes off it, and interest goes on at a twelfth of the APR. Retype it
     when the next statement lands and the projection starts again from there. */
  function debtNow(d, m, tod, opt) {
    tod = tod || today();
    const typed = r2(num(d.balance)), on = d.balanceOn || null, pay = num(d.repayment);
    /* A blank APR is not the same as nought per cent. Left blank, the whole
       repayment would come off the balance and a mortgage would look like it
       was clearing twice as fast as it is, so it is flagged rather than
       guessed at. Type 0 for a genuine 0% deal and the flag goes. */
    const noRate = d.apr === null || d.apr === undefined || d.apr === '';
    const out = { typed, on, balance: typed, paid: 0, interest: 0, payments: 0,
      carried: false, cleared: false, noRate: false };
    if (!typed || !on || on >= tod || !pay) return out;
    const bill = fundingBill(d, m, tod);
    const dates = bill
      ? billDates(bill, addDays(on, 1), tod, opt || { shift: 'exact', bankHols: false })
      : (() => { const a = []; for (let i = 1; i <= 240; i++) { const x = addMonths(on, i); if (x > tod) break; a.push({ date: x }); } return a; })();
    const r = num(d.apr) / 12;
    let bal = typed;
    dates.forEach(() => {
      if (bal <= 0) return;
      const int = r2(bal * r);
      const took = Math.min(pay, r2(bal + int));
      bal = r2(bal + int - took);
      out.interest = r2(out.interest + int);
      out.paid = r2(out.paid + took);
      out.payments++;
    });
    out.balance = Math.max(0, bal);
    out.carried = out.payments > 0;
    out.noRate = out.carried && noRate;
    out.cleared = out.balance === 0 && out.carried;
    return out;
  }
  function debtPayoff(d, tod) {
    const B = num(d.balance), P = num(d.repayment);
    if (!(B > 0) || !(P > 0)) return null;
    if (!d.apr) return { months: Math.ceil(B / P), date: addMonths(tod, Math.ceil(B / P)), naive: true };
    const r = num(d.apr) / 12; const k = 1 - r * B / P;
    if (k <= 0) return { never: true };
    const n = Math.ceil(-Math.log(k) / Math.log(1 + r));
    return { months: n, date: addMonths(tod, n), naive: false };
  }

  /* ---------- bill dates & cash flow ----------
     A monthly bill leaves on the same day every month. Day 29–31 falls back to the
     last day of a short month, which is what banks do. The shift option then moves
     anything landing on a weekend or bank holiday. */
  function billDates(b, from, to, opt) {
    const day = Math.round(num(b.dueDay));
    if (!(day >= 1) || from > to) return [];
    opt = opt || { shift: 'exact', bankHols: false };
    // a month either side of the window, since a moved date can cross into it; walked as numbers,
    // with no cap — a mortgage's 25 years of payments used to stop counting after 80 months
    const started = isMonth(b.started) ? b.started : '0000-00', ended = isMonth(b.ended) ? b.ended : null;
    const skip = b.skip || [], out = [];
    let y = +from.slice(0, 4), mo = +from.slice(5, 7) - 2;
    if (mo < 0) { mo += 12; y--; }
    const endY = +to.slice(0, 4) + (to.slice(5, 7) === '12' ? 1 : 0), endMo = +to.slice(5, 7) % 12;
    for (; y < endY || (y === endY && mo <= endMo); mo === 11 ? (mo = 0, y++) : mo++) {
      const mk = `${y}-${String(mo + 1).padStart(2, '0')}`;
      // council tax over ten instalments, a gym frozen for the winter: months off
      if (started > mk || (ended && ended < mk) || skip.includes(mo + 1)) continue;
      const s = shiftDue(`${mk}-${String(Math.min(day, dim(y, mo))).padStart(2, '0')}`, opt.shift, opt.bankHols);
      if (s.date >= from && s.date <= to) out.push(s);
    }
    return out;
  }
  /* Every bill payment falling in a window, oldest first. */
  function billEvents(m, from, to, opt) {
    const debts = m.debts || [];
    const out = [];
    (m.bills || []).forEach(b => {
      const fixed = b.link ? null : num(b.amount);        // a linked bill is worked out per payment
      if (fixed === 0) return;
      billDates(b, from, to, opt).forEach(d => {
        const amount = fixed === null ? billAmount(b, debts, d.date, m, opt) : fixed;
        if (amount) out.push({ date: d.date, nominal: d.nominal, moved: d.moved, why: d.why,
          name: b.name || 'Bill', category: b.category || 'Other', amount });
      });
    });
    return out.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount || a.name.localeCompare(b.name));
  }
  /* Runway from today to the next pay day: what still has to leave, where the
     balance dips lowest, and what is genuinely free to spend. */
  function runway(m, p, opt, tod) {
    tod = tod || today();
    const to = p.nextPayDay;
    const payRow = p.rows[p.nextIdx] || null;
    /* Up to the day before pay day. A bill dated pay day itself leaves in the
       same early-morning batch the pay lands in, so it comes out of the pay:
       counting it before made a month's rent on pay day read as a shortfall,
       and the period that starts that day counted it a second time. */
    const events = billEvents(m, addDays(tod, 1), addDays(to, -1), opt);
    const onPay = billEvents(m, to, to, opt);
    const onPayOut = r2(onPay.reduce((a, e) => a + e.amount, 0));
    const out = events.reduce((a, e) => a + e.amount, 0);
    const hasBal = m.balance !== null && m.balance !== undefined && m.balance !== '';
    const typed = hasBal ? num(m.balance) : null;
    /* Carry the typed figure forward over everything that has left, or landed,
       since the day it was true — today included. Direct debits clear in the
       early-morning batch, so by the time anyone looks, a payment dated today
       has almost always gone; counting it as still to come would overstate the
       balance, and overstating is the dangerous direction for a figure whose
       job is warning you that you are short.

       When the balance was typed today the window is empty by construction:
       what you just read off your bank supersedes everything up to now. */
    const typedOn = hasBal && m.balanceOn && m.balanceOn < tod ? m.balanceOn : null;
    const carried = typedOn ? billEvents(m, addDays(typedOn, 1), tod, opt) : [];
    const carriedOut = r2(carried.reduce((a, e) => a + e.amount, 0));
    /* Pay dated today has landed, the same way a direct debit dated today has
       gone. Counting it as still to come left pay day reading like the day
       before it, with the money only turning up once the date rolled again.
       The one pay day never carried is the one still being shown as coming:
       payCalc rolls past today, so the two can only meet if a caller hands in a
       schedule of its own, and then the pay row wins. */
    const carriedPays = typedOn ? p.rows.filter(r => r.payday > typedOn && r.payday <= tod && r.payday < to) : [];
    const carriedIn = r2(carriedPays.reduce((a, r) => a + num(r.net), 0));
    /* Money the app itself has moved since the balance was typed — the card
       cleared with Pay now. It rides on top of the typed figure rather than
       replacing it, so the reading keeps its date and the bills carried since
       still come off; the next reading typed takes it along with it. */
    const adj = hasBal ? r2(num(m.balanceAdj)) : 0;
    const start = hasBal ? r2(typed - carriedOut + carriedIn + adj) : null;
    const days = Math.max(daysBetween(tod, to), 0);
    /* A credit card balance gets paid whichever way the tick is set — it only
       decides whether it eats into the money before pay day or comes off when
       pay lands. Either way the balance after pay works out the same. */
    const amex = Math.abs(num(m.amex));
    const amexBefore = !!m.amexBefore;
    const amexNow = amexBefore ? amex : 0, amexOnPay = amexBefore ? 0 : amex;
    // running balance, one point per day, so the dip between bills is visible
    const series = [];
    if (hasBal) {
      let bal = r2(start - amexNow), ei = 0;
      for (let i = 0; i <= days; i++) {
        const d = addDays(tod, i);
        while (ei < events.length && events[ei].date <= d) bal = r2(bal - events[ei++].amount);
        series.push({ date: d, bal });
      }
    }
    const atPayday = hasBal ? r2(start - out - amexNow) : null;
    const buffer = num(m.buffer);
    // an arranged overdraft is real spending room, so the floor is -limit rather
    // than zero; going under zero is worth flagging, going under the limit is the
    // one that actually bounces a direct debit
    const overdraft = Math.abs(num(m.overdraft));
    const low = series.length ? series.reduce((a, x) => x.bal < a.bal ? x : a, series[0]) : null;
    return {
      from: tod, to, days, events, outgoings: r2(out), start, hasBal, atPayday, buffer, series, low,
      typed, typedOn, carried, carriedOut, carriedIn, carriedPays, adj, onPay, onPayOut,
      staleDays: typedOn ? daysBetween(typedOn, tod) : 0,
      wasCarried: !!typedOn && (carried.length > 0 || carriedPays.length > 0),
      overdraft, headroom: hasBal && low ? r2(low.bal + overdraft) : null,
      intoOverdraft: hasBal && low ? low.bal < 0 && low.bal >= -overdraft : false,
      safe: hasBal ? r2(atPayday + overdraft - buffer) : null,
      perDay: hasBal && days > 0 ? r2((atPayday + overdraft - buffer) / days) : null,
      net: payRow ? payRow.net : null,
      amex, amexBefore, amexNow, amexOnPay, paydayPassed: carriedPays.length > 0,
      afterPay: hasBal && payRow ? r2(atPayday + payRow.net - amexOnPay - onPayOut) : null,
      shortfall: hasBal && low ? low.bal < -overdraft : false
    };
  }
  /* Disposable income per 28-day pay period: pay in, every bill actually due in
     that window out. With 4-weekly pay and monthly bills the count varies — some
     periods carry two of a bill, some none — which is the whole point. */
  function periodFlows(m, p, opt, n) {
    const rows = p.rows, out = [];
    const start = Math.max(0, p.nextIdx);
    for (let i = start; i < Math.min(rows.length - 1, start + (n || 6)); i++) {
      const r = rows[i], from = r.payday, to = addDays(rows[i + 1].payday, -1);
      const events = billEvents(m, from, to, opt);
      const outg = r2(events.reduce((a, e) => a + e.amount, 0));
      out.push({ payday: r.payday, from, to, net: r.net, events, outgoings: outg,
        disposable: r2(r.net - outg), days: daysBetween(from, to) + 1,
        potential: r2(Math.max(r.net - outg - num(m.buffer), 0)) });
    }
    return out;
  }

  /* ---------- savings pots ----------
     A pot is a balance you have put aside, optionally with something you are
     saving towards and what you put in each month. Everything else follows from
     those three numbers, so nothing needs keeping in step by hand. */
  /* One pot of money, and a list of what it is for.
     Savings are not really separate piles — it is one balance, and the things
     being saved for are a shopping list it has to stretch across. So every goal
     is measured against the whole balance: what it costs, whether there is
     enough for it yet, and how long until there is. Buying one takes its price
     out of the pot and moves it to the got list. */
  function savingsCalc(sav, debts, tod, withLong) {
    sav = sav || {};
    tod = tod || today();
    const balance = r2(num(sav.balance)), monthly = num(sav.monthly);
    const all = (sav.goals || []).map(g => ({ ...g, cost: num(g.cost), paid: num(g.paid),
      paidSet: g.paid !== null && g.paid !== undefined && g.paid !== '' }));
    const got = all.filter(g => g.got).sort((a, b) => String(b.got).localeCompare(String(a.got)));
    const goals = all.filter(g => !g.got).map(g => {
      const short = r2(Math.max(g.cost - balance, 0));
      const months = (short > 0 && monthly > 0) ? Math.ceil(short / monthly) : null;
      return { ...g, short, covered: g.cost > 0 && balance >= g.cost,
        pct: g.cost > 0 ? Math.min(balance / g.cost, 1) : null,
        months, by: months ? addMonths(tod, months) : null,
        // nothing going in and not there yet: it is not arriving on its own
        stalled: short > 0 && !monthly };
    // what you could have next first, then whatever is closest to affordable; no price yet goes last
    }).sort((a, b) => (b.cost > 0) - (a.cost > 0) || a.short - b.short || a.cost - b.cost);
    const wanted = r2(goals.reduce((a, g) => a + g.cost, 0));
    const toGo = r2(Math.max(wanted - balance, 0));
    const allMonths = (toGo > 0 && monthly > 0) ? Math.ceil(toGo / monthly) : null;
    /* A mortgage dwarfs everything else and is not getting cleared this decade,
       so counting it turns the net figure into one big number that never moves.
       Long-term debt is opt-in; anything without a type counts, since only an
       explicit "Long-term" is being set aside. */
    const list = debts || [];
    const longTotal = r2(list.filter(d => d.type === 'Long-term').reduce((a, d) => a + num(d.balance), 0));
    const allTotal = r2(list.reduce((a, d) => a + num(d.balance), 0));
    const debtTotal = withLong ? allTotal : r2(allTotal - longTotal);
    return { balance, monthly, goals, got, wanted, toGo,
      spare: r2(balance - wanted),
      months: allMonths, by: allMonths ? addMonths(tod, allMonths) : null,
      next: goals.find(g => g.cost > 0 && !g.covered) || null,
      affordable: goals.filter(g => g.covered).length,
      spent: r2(got.reduce((a, g) => a + (g.paidSet ? g.paid : g.cost), 0)),
      debtTotal, longTotal, allTotal, withLong: !!withLong, net: r2(balance - debtTotal) };
  }

  /* ---------- bill price history ----------
     Keeping history means one bill is several rows: the old amount with an
     "ended" month, then a new row starting the month after. Chain those rows
     back together by name to see what a bill has actually done over time. */
  function priceHistory(bills, tod) {
    const thisKey = mkey(tod || today());
    const byName = {};
    (bills || []).forEach(b => {
      if (b.link) return;                          // linked bills track the debts, not a price
      const k = String(b.name || '').trim().toLowerCase();
      if (!k || !b.started) return;
      (byName[k] = byName[k] || []).push(b);
    });
    const out = [];
    Object.values(byName).forEach(list => {
      if (list.length < 2) return;
      const rows = list.slice().sort((a, b) => String(a.started).localeCompare(String(b.started)));
      const changes = [];
      for (let i = 1; i < rows.length; i++) {
        const from = num(rows[i - 1].amount), to = num(rows[i].amount);
        if (!from || !to || r2(from) === r2(to)) continue;
        changes.push({ month: rows[i].started, from, to, diff: r2(to - from), pct: (to - from) / from });
      }
      if (!changes.length) return;
      const first = num(rows[0].amount), latest = rows[rows.length - 1];
      if (isMonth(latest.ended) && latest.ended < thisKey) return;      // finished altogether
      out.push({ name: latest.name, category: latest.category, current: num(latest.amount),
        first, since: rows[0].started, changes, last: changes[changes.length - 1],
        total: r2(num(latest.amount) - first), rows: rows.length });
    });
    return out.sort((a, b) => b.last.month.localeCompare(a.last.month));
  }

  /* ---------- collections & games ---------- */
  /* Day-to-day spending, read off the balance readings rather than typed.
     Every balance read off the bank is logged with its date. Between one
     reading and the next the app already knows what the bills should have
     taken and what pay should have landed, so whatever the two cannot explain
     is what was actually spent — shopping, fuel, the pub. `adj` carries any
     amount the app itself took off at that point (clearing the card), so a
     modelled payment is not mistaken for spending. */
  function spendLog(m, p, opt, tod) {
    tod = tod || today();
    const has = v => v !== null && v !== undefined && v !== '';
    const log = (m.balanceLog || [])
      .filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.on) && has(x.balance))
      .slice().sort((a, b) => a.on.localeCompare(b.on));
    const windows = [];
    // every bill across the whole log at once, then dealt into the windows in order:
    // a full log used to work the bill dates out afresh for each of 119 windows
    const span = log.length > 1 ? billEvents(m, addDays(log[0].on, 1), log[log.length - 1].on, opt) : [];
    let ei = 0;
    for (let i = 1; i < log.length; i++) {
      const a = log[i - 1], b = log[i], days = daysBetween(a.on, b.on);
      if (days <= 0) continue;
      while (ei < span.length && span[ei].date <= a.on) ei++;
      let sum = 0;
      for (let j = ei; j < span.length && span[j].date <= b.on; j++) sum += span[j].amount;
      const bills = r2(sum);
      const pay = r2(((p && p.rows) || []).filter(r => r.payday > a.on && r.payday <= b.on)
        .reduce((s, r) => s + num(r.net), 0));
      const adj = num(b.adj);
      const expected = r2(num(a.balance) - bills + pay + adj);
      const spent = r2(expected - num(b.balance));
      windows.push({ from: a.on, to: b.on, days, bills, pay, adj, expected,
      /* Flagged if a pay day touches either end, not just the middle. A balance
         read on pay day morning, before the money lands, throws the whole lot
         into the window after it — one stretch then looks like a spree and the
         next like a windfall. Neither is worth averaging. */
        balance: r2(num(b.balance)), spent, perDay: r2(spent / days),
        hasPay: ((p && p.rows) || []).some(r => r.payday >= a.on && r.payday <= b.on) });
    }
    /* A window with a pay day in it is not evidence of anything: the pay used
       here is this app's estimate, so any few pounds it has the payslip wrong
       by land in the same figure as the shopping. Those windows are still shown
       — they are real money — but they are kept out of the average, and an
       average over several windows beats the latest one anyway, since one week
       with a car service in it is not what a normal week costs. */
    const clean = windows.filter(w => !w.hasPay);
    const recent = clean.slice(-8);
    const days = recent.reduce((s, w) => s + w.days, 0);
    const spent = r2(recent.reduce((s, w) => s + w.spent, 0));
    const lastOn = log.length ? log[log.length - 1].on : null;
    return { windows, list: windows.slice(-8), recent, clean,
      last: clean[clean.length - 1] || null, readings: log.length,
      days, spent, perDay: days > 0 ? r2(spent / days) : null,
      lastOn, since: lastOn ? daysBetween(lastOn, tod) : null };
  }

  function progress(items, pred) { const t = items.length, h = items.filter(pred).length; return { have: h, total: t, pct: t ? h / t : 0 }; }
  function collections(s) {
    const known = ['Base Set', 'Jungle', 'Fossil', 'Base Set 2', 'Movie Promo'];
    const seen = [...new Set((s.classic || []).map(c => c.set).filter(Boolean))];
    const sets = [...known, ...seen.filter(x => !known.includes(x))];
    const out = sets.map(n => ({ key: n, label: n, ...progress((s.classic || []).filter(c => c.set === n), c => c.have) }));
    out.push({ key: 'Mega Evolution', label: 'Mega Evolution', ...progress(s.mega || [], c => c.have) });
    out.push({ key: 'PSM', label: 'PSM mags', ...progress(s.psm || [], p => p.mag) });
    out.push({ key: 'PSM demos', label: 'PSM demos', ...progress(s.psm || [], p => p.demo) });
    return out;
  }
  function gamesStats(games, tod) {
    tod = tod || today();
    const y = +tod.slice(0, 4);
    const byYear = {}; (games || []).forEach(g => { if (g.date) byYear[g.date.slice(0, 4)] = (byYear[g.date.slice(0, 4)] || 0) + 1; });
    const dated = (games || []).filter(g => g.date && g.date <= tod).sort((a, b) => a.date.localeCompare(b.date));
    const last = dated.length ? dated[dated.length - 1] : null;
    return { thisYear: byYear[y] || 0, lastYear: byYear[y - 1] || 0, byYear, last, daysSince: last ? daysBetween(last.date, tod) : null, total: (games || []).length };
  }

  return { r2, num, isDate, isMonth, addDays, addMonths, daysBetween, today, mkey, dow, fmtD, fmtDM, fmtDow, fmtM, fmtMs, ord, gbp, pct, rate,
    easter, bankHolidays, isBankHol, isWorkingDay, shiftDue, billDates, billEvents, runway, periodFlows,
    payCalc, moneyCalc, debtPayoff, debtNow, priceHistory, savingsCalc, spendLog, collections, gamesStats, MON, DOW };
})();

