const { test } = require('node:test');
const assert = require('node:assert');
const { calc } = require('./extract.js');
const C = calc();

/* A payslip's worth of settings, matching the app's own defaults. */
const pay = extra => Object.assign({
  salary: 41200, hoursWeek: 35, weeksYear: 52.1667, sundayRate: 3.7, nextPayDay: '2026-08-28',
  periodEndDays: 6, personalAllowance: 12570, fixed: [], hours: {}, hpaHistory: {}, rises: [],
  tax: { basicRate: .2, basicBand: 37700, higherRate: .4, higherBand: 125140, addRate: .45,
    niPT: 12570, niUEL: 50270, niMain: .08, niUpper: .02, taxYearStart: '2026-04-06' }
}, extra);

const bills = (...b) => ({ buffer: 0, dueShift: 'next', bankHols: true, months: [], debts: [], bills: b });
const OPT = { shift: 'next', bankHols: true };
const EXACT = { shift: 'exact', bankHols: false };

/* ---------------------------------------------------------------- dates -- */
test('Easter matches the published Gregorian dates', () => {
  assert.equal(C.easter(2024), '2024-03-31');
  assert.equal(C.easter(2025), '2025-04-20');
  assert.equal(C.easter(2026), '2026-04-05');
  assert.equal(C.easter(2027), '2027-03-28');
  assert.equal(C.easter(2030), '2030-04-21');
});

test('bank holidays match gov.uk for England & Wales, substitutes included', () => {
  const set = y => [...C.bankHolidays(y)].sort();
  assert.deepEqual(set(2025),
    ['2025-01-01','2025-04-18','2025-04-21','2025-05-05','2025-05-26','2025-08-25','2025-12-25','2025-12-26']);
  // Boxing Day 2026 is a Saturday, so it moves to Monday 28th
  assert.deepEqual(set(2026),
    ['2026-01-01','2026-04-03','2026-04-06','2026-05-04','2026-05-25','2026-08-31','2026-12-25','2026-12-28']);
  // Christmas 2027 is a Saturday and Boxing Day a Sunday: 27th and 28th
  assert.deepEqual(set(2027),
    ['2027-01-01','2027-03-26','2027-03-29','2027-05-03','2027-05-31','2027-08-30','2027-12-27','2027-12-28']);
  assert.ok(C.bankHolidays(2022).has('2022-01-03'), 'New Year 2022 fell on a Saturday');
});

test('a bill on a non-working day shifts the way the option says', () => {
  assert.equal(C.dow('2026-09-13'), 0, '13 Sep 2026 is a Sunday');
  assert.equal(C.shiftDue('2026-09-13', 'next', true).date, '2026-09-14');
  assert.equal(C.shiftDue('2026-09-13', 'prev', true).date, '2026-09-11');
  assert.equal(C.shiftDue('2026-09-13', 'exact', true).date, '2026-09-13');
  assert.equal(C.shiftDue('2026-09-13', 'next', true).why, 'Sunday');
  assert.equal(C.shiftDue('2026-09-14', 'next', true).moved, false);
  // Christmas 2026: Fri 25th is a holiday, then a weekend, then the substitute Monday
  assert.equal(C.shiftDue('2026-12-25', 'next', true).date, '2026-12-29');
  assert.equal(C.shiftDue('2026-12-25', 'next', false).date, '2026-12-25');
});

/* ------------------------------------------------------------- bill dates -- */
test('a monthly bill falls back to the last day of a short month', () => {
  const b = { name: 'Rent', dueDay: 31, amount: 100 };
  assert.deepEqual(C.billDates(b, '2027-01-01', '2027-04-30', EXACT).map(x => x.date),
    ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  assert.deepEqual(C.billDates({ ...b, dueDay: 29 }, '2028-02-01', '2028-02-29', EXACT).map(x => x.date),
    ['2028-02-29'], 'leap February');
});

test('started and ended months bound a bill', () => {
  const b = { name: 'X', dueDay: 15, amount: 10, started: '2026-03', ended: '2026-05' };
  assert.deepEqual(C.billDates(b, '2026-01-01', '2026-12-31', EXACT).map(x => x.date),
    ['2026-03-15', '2026-04-15', '2026-05-15']);
});

test('an undated bill is left out rather than guessed at', () => {
  const m = bills({ id: '1', name: 'Gym', amount: 32, dueDay: null });
  assert.deepEqual(C.billEvents(m, '2026-09-01', '2026-09-30', OPT), []);
  assert.equal(C.moneyCalc(m, '2026-09-09').undated, 1);
});

test('a bill linked to debts follows the debt repayments', () => {
  const m = { buffer: 0, months: [], bills: [{ id: 'l', name: 'Loans', link: 'Short-term', dueDay: 5 }],
    debts: [{ type: 'Short-term', repayment: 80 }, { type: 'Short-term', repayment: 45 }, { type: 'Long-term', repayment: 900 }] };
  assert.deepEqual(C.billEvents(m, '2026-09-01', '2026-09-30', EXACT).map(e => e.amount), [125]);
});

/* ----------------------------------------------------------------- runway -- */
test('runway counts what is left before pay day and what is free to spend', () => {
  const m = Object.assign(bills(
    { id: '1', name: 'Rent', category: 'Housing', amount: 600, dueDay: 1 },
    { id: '2', name: 'Netflix', category: 'Subs', amount: 12, dueDay: 13 },
    { id: '3', name: 'Council', category: 'Housing', amount: 150, dueDay: 20 }
  ), { buffer: 200, balance: 1000, balanceOn: '2026-09-10' });
  const p = { nextPayDay: '2026-09-25', nextIdx: 0, rows: [{ payday: '2026-09-25', net: 1800 }] };
  const r = C.runway(m, p, OPT, '2026-09-10');
  assert.deepEqual(r.events.map(e => [e.name, e.date, e.moved]),
    [['Netflix', '2026-09-14', true], ['Council', '2026-09-21', true]], 'Sundays pushed to Monday; the 1st already gone');
  assert.equal(r.outgoings, 162);
  assert.equal(r.atPayday, 838);
  assert.equal(r.safe, 638, 'less the £200 buffer');
  assert.equal(r.days, 15);
  assert.equal(r.afterPay, 2638);
  assert.equal(r.series.length, 16, 'one point per day, inclusive');
  assert.equal(r.shortfall, false);
});

test('runway names the day the balance goes under', () => {
  const m = Object.assign(bills(
    { id: '1', name: 'Netflix', amount: 12, dueDay: 13 },
    { id: '2', name: 'Council', amount: 150, dueDay: 20 }
  ), { buffer: 200, balance: 100, balanceOn: '2026-09-10' });
  const p = { nextPayDay: '2026-09-25', nextIdx: 0, rows: [{ payday: '2026-09-25', net: 1800 }] };
  const r = C.runway(m, p, OPT, '2026-09-10');
  assert.equal(r.shortfall, true);
  assert.equal(r.low.bal, -62);
  assert.equal(r.low.date, '2026-09-21');
});

/* --------------------------------------------------------- carry forward -- */
const carryMoney = (balance, balanceOn) => Object.assign(bills(
  { id: '1', name: 'Rent', amount: 780, dueDay: 1 },
  { id: '2', name: 'Council', amount: 168, dueDay: 13 },
  { id: '3', name: 'Energy', amount: 96, dueDay: 20 }
), { buffer: 300, balance, balanceOn });
const runAt = (m, d) => C.runway(m, C.payCalc(pay(), d), OPT, d);

test('the typed balance is carried forward as bills leave', () => {
  const m = carryMoney(1000, '2026-09-09');
  assert.equal(runAt(m, '2026-09-09').start, 1000);
  assert.equal(runAt(m, '2026-09-15').start, 832, 'Council gone');
  assert.equal(runAt(m, '2026-09-22').start, 736, 'Energy gone too');
});

test('a bill is counted once, on the day it leaves', () => {
  const m = carryMoney(1000, '2026-09-09');
  const before = runAt(m, '2026-09-13');         // Council is due Sun 13, so it shifts to Mon 14
  assert.deepEqual(before.carried.map(e => e.name), [], 'nothing gone yet');
  assert.deepEqual(before.events.map(e => e.name), ['Council', 'Energy'], 'both still ahead');
  assert.equal(before.start, 1000);

  const onTheDay = runAt(m, '2026-09-14');
  assert.deepEqual(onTheDay.carried.map(e => e.name), ['Council'], 'counted on the day it leaves');
  assert.deepEqual(onTheDay.events.map(e => e.name), ['Energy'], 'and not also listed as still to come');
  assert.equal(onTheDay.start, 832);

  assert.equal(runAt(m, '2026-09-15').start, 832, 'counted exactly once');
});

test('the projected pay-day balance holds steady as bills go out', () => {
  const m = carryMoney(1000, '2026-09-09');
  const at = ['2026-09-09', '2026-09-15', '2026-09-22'].map(d => runAt(m, d).atPayday);
  assert.deepEqual(at, [736, 736, 736], 'it used to climb 736 -> 904 -> 1000');
});

test('a pay day inside the carry window is added back', () => {
  const r = runAt(carryMoney(500, '2026-09-20'), '2026-09-28');
  assert.deepEqual(r.carriedPays.map(x => x.payday), ['2026-09-25']);
  assert.equal(r.carriedOut, 96);
  assert.equal(r.start, C.r2(500 - 96 + r.carriedIn));
});

test('retyping the balance restarts the running total from that figure', () => {
  const fresh = runAt(carryMoney(790, '2026-09-15'), '2026-09-15');
  assert.equal(fresh.start, 790);
  assert.equal(fresh.carried.length, 0);
  assert.equal(fresh.wasCarried, false);
  const later = runAt(carryMoney(790, '2026-09-15'), '2026-09-22');
  assert.equal(later.start, 694, '790 less the £96 energy bill, with no input');
});

test('no date recorded means no carry rather than a guess', () => {
  assert.equal(runAt(carryMoney(1000, null), '2026-09-24').wasCarried, false);
  assert.equal(runAt(carryMoney(1000, '2026-09-09'), '2026-09-24').staleDays, 15);
});

test('an overdraft is a legitimate balance', () => {
  const m = Object.assign(bills({ id: '1', name: 'Rent', amount: 780, dueDay: 20 }),
    { buffer: 300, balance: -420.5, balanceOn: '2026-09-08' });
  const p = { nextPayDay: '2026-09-25', nextIdx: 0, rows: [{ payday: '2026-09-25', net: 2691.53 }] };
  const r = C.runway(m, p, OPT, '2026-09-08');
  assert.equal(r.hasBal, true);
  assert.equal(r.start, -420.5);
  assert.equal(r.atPayday, -1200.5);
  assert.equal(r.shortfall, true);
  assert.equal(C.gbp(r.safe), '-£1,500.50');
});

/* ---------------------------------------------------- disposable periods -- */
test('4-weekly pay against monthly bills: some periods carry two, some none', () => {
  const p = { nextIdx: 0, nextPayDay: '2026-09-04',
    rows: [{ payday: '2026-09-04', net: 1800 }, { payday: '2026-10-02', net: 1800 }, { payday: '2026-10-30', net: 1800 }] };
  const m = bills({ id: 'r', name: 'Rent', amount: 600, dueDay: 1 });
  const f = C.periodFlows(m, p, EXACT, 2);
  assert.deepEqual(f.map(x => [x.from, x.to, x.events.length, x.disposable]),
    [['2026-09-04', '2026-10-01', 1, 1200], ['2026-10-02', '2026-10-29', 0, 1800]]);
});

test('shifting a bill across a pay day moves it between periods', () => {
  let sun = '2026-10-01';
  while (C.dow(sun) !== 0) sun = C.addDays(sun, 1);
  const payday = C.addDays(sun, 1);
  const p = { nextIdx: 1, nextPayDay: payday, rows: [
    { payday: C.addDays(payday, -28), net: 2000 }, { payday, net: 2000 }, { payday: C.addDays(payday, 28), net: 2000 }] };
  const m = bills({ id: 'x', name: 'Big one', amount: 500, dueDay: +sun.slice(8) });
  assert.equal(C.periodFlows(m, p, { shift: 'exact', bankHols: true }, 1)[0].disposable, 2000, 'exact: sits in the period before');
  assert.equal(C.periodFlows(m, p, { shift: 'next', bankHols: true }, 1)[0].disposable, 1500, 'next: lands on pay day, so in this period');
});

/* -------------------------------------------------------------- pay maths -- */
test('basic pay, hourly rate and the rolling pay-day anchor', () => {
  const p = C.payCalc(pay({ salary: 40000 }), '2026-09-10');
  assert.equal(p.basic, 3067.08, 'a weekly rate of £766.77, four times over');
  assert.equal(p.hourly, 21.91);
  assert.equal(p.nextPayDay, '2026-09-25', 'the stored anchor rolls forward in 28-day steps');
});

test('overtime and Sunday hours reach net pay', () => {
  const p = C.payCalc(pay({ salary: 40000, hours: { '2026-09-25': { ot: 10, sun: 4 } } }), '2026-09-10');
  const r = p.rows.find(x => x.payday === '2026-09-25');
  assert.deepEqual([r.ot, r.sun, r.otPay, r.sunPay], [10, 4, 219.1, 14.8]);
  assert.equal(r.taxable, 3300.98);
  assert.ok(r.net > 2300 && r.net < 2700, `net ${r.net} in a sane band`);
  assert.ok(r.extra > 0 && r.keep > 0.5 && r.keep < 1, 'you keep most, but not all, of the overtime');
});

test('a cleared tax rate cannot silently wipe the tax', () => {
  const base = C.payCalc(pay(), '2026-09-09');
  const good = base.rows[base.nextIdx];
  for (const k of ['basicRate', 'basicBand', 'personalAllowance', 'niMain', 'higherRate']) {
    const y = { from: '2026-04-06', personalAllowance: 12570, basicRate: .2, basicBand: 37700, higherRate: .4,
      higherBand: 125140, addRate: .45, niPT: 12570, niUEL: 50270, niMain: .08, niUpper: .02 };
    y[k] = null;
    const r = C.payCalc(pay({ taxYears: [y] }), '2026-09-09');
    const row = r.rows[r.nextIdx];
    assert.deepEqual([row.paye, row.ni, row.net], [good.paye, good.ni, good.net], `${k} cleared`);
  }
});

test('a blank in a later tax year inherits the earlier one', () => {
  const r = C.payCalc(pay({ taxYears: [
    { from: '2026-04-06', personalAllowance: 13000, basicRate: .2, basicBand: 37700, higherRate: .4, higherBand: 125140, addRate: .45, niPT: 12570, niUEL: 50270, niMain: .08, niUpper: .02 },
    { from: '2027-04-06', personalAllowance: null, basicRate: .2, basicBand: 37700, higherRate: .4, higherBand: 125140, addRate: .45, niPT: 12570, niUEL: 50270, niMain: .08, niUpper: .02 }] }), '2026-09-09');
  assert.equal(r.years[1].personalAllowance, 13000);
});

test('a pay rise with a backpay date pays the shortfall on that pay day', () => {
  const r = C.payCalc(pay({ salary: 40000,
    rises: [{ from: '2026-05-01', salary: 44000, arrearsOn: '2026-10-23', otBackpay: false }] }), '2026-09-10');
  const rise = r.rises[0];
  assert.ok(rise.periods > 0, 'periods between the effective date and the pay day');
  assert.ok(rise.total > 0, 'a shortfall is owed');
  const target = r.rows.find(x => x.payday === '2026-10-23');
  assert.equal(target.backpay, rise.total, 'and lands on the nominated pay day');
  const before = r.rows.find(x => x.payday === '2026-09-25');
  assert.equal(before.backpay, 0, 'earlier pay days keep their old figures');
});

/* ------------------------------------------------------------ money maths -- */
test('a bill that ended drops out of later months', () => {
  const m = C.moneyCalc({ buffer: 1000, debts: [], bills: [
      { name: 'A', amount: 500, started: '2026-01' },
      { name: 'B', amount: 250, started: '2026-01', ended: '2026-06' }],
    months: [{ month: '2026-05', earnings: 2000, saved: 300 }, { month: '2026-08', earnings: 2000, saved: 100 }] }, '2026-09-10');
  assert.deepEqual(m.months.map(x => x.outgoings), [750, 500]);
  assert.deepEqual(m.months.map(x => x.disposable), [1250, 1500]);
  assert.deepEqual(m.months.map(x => x.potential), [250, 500], 'after the buffer');
});

test('debt payoff, with and without interest', () => {
  assert.deepEqual(C.debtPayoff({ balance: 1000, repayment: 20, apr: 0.24 }, '2026-09-09'), { never: true },
    'a repayment equal to the interest never clears');
  const withApr = C.debtPayoff({ balance: 1000, repayment: 21, apr: 0.24 }, '2026-09-09');
  assert.ok(withApr.months > 100 && !withApr.naive);
  const noApr = C.debtPayoff({ balance: 1000, repayment: 100 }, '2026-09-09');
  assert.deepEqual([noApr.months, noApr.naive], [10, true]);
});

test('formatting', () => {
  assert.equal(C.gbp(1234.5), '£1,234.50');
  assert.equal(C.gbp(-1234.5), '-£1,234.50');
  assert.equal(C.gbp(null), '–');
  assert.equal(C.gbp(1234.5, 0), '£1,235');
  assert.equal(C.pct(0.5), '50%');
  assert.equal(C.fmtD('2026-09-09').replace(/\s/g, ' '), '9 Sep 2026');
  assert.equal(C.ord(1), '1st');
  assert.equal(C.ord(2), '2nd');
  assert.equal(C.ord(3), '3rd');
  assert.equal(C.ord(11), '11th');
  assert.equal(C.ord(21), '21st');
  assert.equal(C.ord(31), '31st');
});

/* ---------------------------------------------------------- price history -- */
test('a bill kept as history chains back into a price trajectory', () => {
  const h = C.priceHistory([
    { name: 'Octopus Energy', category: 'Utilities', amount: 82, started: '2025-01', ended: '2025-09' },
    { name: 'Octopus Energy', category: 'Utilities', amount: 96, started: '2025-10', ended: '2026-02' },
    { name: 'Octopus Energy', category: 'Utilities', amount: 110, started: '2026-03' },
    { name: 'Rent', category: 'Housing', amount: 780, started: '2024-01' }
  ]);
  assert.equal(h.length, 1, 'Rent never changed, so it is not listed');
  assert.equal(h[0].name, 'Octopus Energy');
  assert.equal(h[0].first, 82);
  assert.equal(h[0].current, 110);
  assert.equal(h[0].total, 28);
  assert.deepEqual(h[0].changes.map(c => [c.month, c.diff]), [['2025-10', 14], ['2026-03', 14]]);
  assert.equal(h[0].last.month, '2026-03');
});

test('price history ignores what it cannot read a price from', () => {
  assert.deepEqual(C.priceHistory([
    { name: 'Loans', link: 'Short-term', started: '2025-01' },
    { name: 'Loans', link: 'Short-term', started: '2026-01' }
  ]), [], 'linked bills follow the debts, not a price');
  assert.deepEqual(C.priceHistory([
    { name: 'Gym', amount: 30, started: '2025-01', ended: '2025-06' },
    { name: 'Gym', amount: 30, started: '2025-07' }
  ]), [], 'same amount twice is not a change');
  assert.deepEqual(C.priceHistory([{ name: 'Rent', amount: 780, started: '2024-01' }]), [], 'one row is no history');
  assert.deepEqual(C.priceHistory([{ name: '', amount: 10, started: '2025-01' }, { name: '', amount: 12, started: '2025-02' }]), [],
    'unnamed rows are not chained together');
});

test('a price drop is reported as a drop', () => {
  const h = C.priceHistory([
    { name: 'Car insurance', amount: 74, started: '2025-01', ended: '2025-12' },
    { name: 'Car insurance', amount: 62, started: '2026-01' }
  ]);
  assert.equal(h[0].total, -12);
  assert.ok(h[0].last.pct < 0);
});

test('a payment dated today counts as already gone', () => {
  const m = Object.assign(bills(
    { id: '1', name: 'Car Insurance', amount: 48.39, dueDay: 10, started: '2024-01' },
    { id: '2', name: 'Pet Insurance', amount: 36.53, dueDay: 14, started: '2024-01' }
  ), { buffer: 0, balance: -43.08, balanceOn: '2026-09-08' });
  const p = { nextPayDay: '2026-09-25', nextIdx: 0, rows: [{ payday: '2026-09-25', net: 3455.34 }] };
  const at = d => C.runway(m, p, OPT, d);

  const before = at('2026-09-09');
  assert.deepEqual(before.carried.map(e => e.name), [], 'not yet');
  assert.equal(before.start, -43.08);

  const today = at('2026-09-10');                       // the day it is due
  assert.deepEqual(today.carried.map(e => e.name), ['Car Insurance'], 'counted as cleared on the day');
  assert.equal(today.start, -91.47);
  assert.deepEqual(today.events.map(e => e.name), ['Pet Insurance'], 'no longer listed as still to come');

  const after = at('2026-09-11');
  assert.equal(after.start, -91.47, 'and it does not move again the next day');

  // the figure that matters must not drift as the boundary passes
  assert.deepEqual([before.atPayday, today.atPayday, after.atPayday], [-128, -128, -128]);
});

test('a balance typed today supersedes the same day\'s bills', () => {
  const m = Object.assign(bills({ id: '1', name: 'Car Insurance', amount: 48.39, dueDay: 10, started: '2024-01' }),
    { buffer: 0, balance: -43.08, balanceOn: '2026-09-10' });
  const p = { nextPayDay: '2026-09-25', nextIdx: 0, rows: [{ payday: '2026-09-25', net: 3455.34 }] };
  const r = C.runway(m, p, OPT, '2026-09-10');
  assert.equal(r.carried.length, 0, 'what you read off the bank wins');
  assert.equal(r.start, -43.08, 'not deducted a second time');
});

test('the pay day still being shown as coming is never also carried in', () => {
  const m = Object.assign(bills({ id: '1', name: 'Rent', amount: 100, dueDay: 1, started: '2024-01' }),
    { buffer: 0, balance: 500, balanceOn: '2026-09-20' });
  // a schedule that still calls today the next pay day: the pay row wins, or it is counted twice
  const p = { nextPayDay: '2026-09-25', nextIdx: 0, rows: [{ payday: '2026-09-25', net: 2000 }] };
  const r = C.runway(m, p, OPT, '2026-09-25');
  assert.equal(r.carriedIn, 0, 'not counted twice');
  assert.equal(r.net, 2000);
  assert.equal(r.afterPay, C.r2(r.atPayday + 2000));
});

test('pay day updates the balance on the day, not the day after', () => {
  const m = Object.assign(bills(), { buffer: 0, balance: 400, balanceOn: '2026-09-20' });
  const on = tod => C.runway(m, C.payCalc(pay(), tod), OPT, tod);

  const before = on('2026-09-24');
  assert.equal(before.carriedIn, 0, 'nothing has landed the day before');
  assert.equal(before.start, 400);
  assert.equal(before.to, '2026-09-25');

  const day = on('2026-09-25');                          // pay day itself
  assert.equal(day.carriedIn, 2545.35, 'BACS lands in the small hours, so it is in');
  assert.equal(day.start, 2945.35, 'and the balance says so from midnight');
  assert.equal(day.to, '2026-10-23', 'with the runway now to the next one');
  assert.equal(day.days, 28);
  assert.equal(day.paydayPassed, true, 'which is also the cue to check the bank and retype it');

  const after = on('2026-09-26');
  assert.equal(after.start, day.start, 'the day after changes nothing but the days left');
  assert.equal(after.days, 27);
});

test('a pay day that has been reads as paid, and the next one moves on', () => {
  const r = C.payCalc(pay(), '2026-09-25');
  assert.equal(r.nextPayDay, '2026-10-23');
  const today = r.rows.find(x => x.payday === '2026-09-25');
  assert.equal(today.past, true, 'today is paid, not still to come');
  assert.equal(today.next, false);
  assert.equal(r.rows[r.nextIdx].payday, '2026-10-23', 'and NEXT points at the one four weeks out');
});

/* ------------------------------------------------------------- overdraft -- */
const odMoney = overdraft => Object.assign(bills(
  { id: '1', name: 'A', amount: 120.50, dueDay: 20, started: '2024-01' },
  { id: '2', name: 'B', amount: 100, dueDay: 23, started: '2024-01' }
), { buffer: 0, overdraft, balance: -611.26, balanceOn: '2026-09-16' });
const odPay = { nextPayDay: '2026-09-25', nextIdx: 0, rows: [{ payday: '2026-09-25', net: 3455.34 }] };
const odRun = overdraft => C.runway(odMoney(overdraft), odPay, OPT, '2026-09-16');

test('an arranged overdraft is spendable room', () => {
  const none = odRun(0), some = odRun(1200);
  assert.equal(none.safe, -831.76, 'without one there is nothing free');
  assert.equal(some.safe, 368.24, 'with £1,200 there is £368.24 free');
  assert.equal(some.atPayday, none.atPayday, 'the projected balance itself is unchanged');
  assert.equal(some.headroom, 368.24, 'room left at the lowest point');
});

test('going under zero and going under the limit are different things', () => {
  const inside = odRun(1200);
  assert.equal(inside.intoOverdraft, true, 'dips into the overdraft');
  assert.equal(inside.shortfall, false, 'but does not bounce');

  const past = odRun(500);
  assert.equal(past.intoOverdraft, false, 'past the limit is not merely "into" it');
  assert.equal(past.shortfall, true, 'this one bounces');
  assert.equal(past.headroom, -331.76, 'and by how much');

  const none = odRun(0);
  assert.equal(none.shortfall, true, 'no overdraft means zero is the floor');
  assert.equal(none.intoOverdraft, false);
});

test('a positive balance with an overdraft still reads sensibly', () => {
  const m = Object.assign(bills({ id: '1', name: 'A', amount: 100, dueDay: 20, started: '2024-01' }),
    { buffer: 0, overdraft: 1000, balance: 500, balanceOn: '2026-09-16' });
  const r = C.runway(m, odPay, OPT, '2026-09-16');
  assert.equal(r.intoOverdraft, false, 'never goes under');
  assert.equal(r.shortfall, false);
  assert.equal(r.safe, 1400, '£400 of its own plus £1,000 of overdraft');
  assert.equal(r.headroom, 1400);
});

test('the overdraft is read as a limit however it is typed', () => {
  assert.equal(odRun(1200).overdraft, 1200);
  assert.equal(C.runway(Object.assign(odMoney(0), { overdraft: -1200 }), odPay, OPT, '2026-09-16').overdraft, 1200,
    'a limit typed as a negative still means the same limit');
  assert.equal(C.runway(Object.assign(odMoney(0), { overdraft: null }), odPay, OPT, '2026-09-16').overdraft, 0);
});

/* ------------------------------------------------------------------ AMEX -- */
const amexMoney = (amex, amexBefore) => Object.assign(bills(
  { id: '1', name: 'A', amount: 120.50, dueDay: 20, started: '2024-01' },
  { id: '2', name: 'B', amount: 100, dueDay: 23, started: '2024-01' }
), { buffer: 0, overdraft: 1200, balance: -611.26, balanceOn: '2026-09-16', amex, amexBefore });
const amexPay = { nextPayDay: '2026-09-25', nextIdx: 0, rows: [{ payday: '2026-09-25', net: 3455.34 }] };
const amexRun = (amex, before) => C.runway(amexMoney(amex, before), amexPay, OPT, '2026-09-16');

test('a card balance cleared on pay day leaves the pre-pay-day figures alone', () => {
  const without = amexRun(0, false), onPayDay = amexRun(900, false);
  assert.equal(onPayDay.safe, without.safe, 'what is free before pay day is unchanged');
  assert.equal(onPayDay.atPayday, without.atPayday);
  assert.equal(onPayDay.low.bal, without.low.bal, 'and it does not deepen the dip');
  assert.equal(onPayDay.afterPay, C.r2(without.afterPay - 900), 'but it does come off when pay lands');
  assert.equal(onPayDay.amexOnPay, 900);
  assert.equal(onPayDay.amexNow, 0);
});

test('ticking it takes the card off before pay day instead', () => {
  const before = amexRun(900, true);
  assert.equal(before.amexNow, 900);
  assert.equal(before.amexOnPay, 0);
  assert.equal(before.safe, -531.76, 'it eats into what is free now');
  assert.equal(before.atPayday, -1731.76);
  assert.equal(before.shortfall, true, 'and here it pushes past the overdraft limit');
});

test('the card gets paid either way — only the timing moves', () => {
  assert.equal(amexRun(900, false).afterPay, amexRun(900, true).afterPay,
    'balance after pay is the same whichever way the tick is set');
  assert.equal(amexRun(900, false).afterPay, 1723.58);
});

test('no card balance changes nothing', () => {
  const none = amexRun(0, false), zeroTicked = amexRun(0, true);
  assert.equal(none.afterPay, zeroTicked.afterPay);
  assert.equal(none.amex, 0);
  assert.equal(none.safe, zeroTicked.safe);
});

test('a card balance typed as a negative still means what is owed', () => {
  assert.equal(C.runway(Object.assign(amexMoney(0, true), { amex: -900 }), amexPay, OPT, '2026-09-16').amexNow, 900);
});

test('the projection shows the card coming off without touching stored figures', () => {
  const m = Object.assign(bills({ id: '1', name: 'A', amount: 120.50, dueDay: 20, started: '2024-01' }),
    { buffer: 0, overdraft: 1200, balance: -611.26, balanceOn: '2026-09-16', amex: 900, amexBefore: false });
  const before = C.runway(m, C.payCalc(pay(), '2026-09-16'), OPT, '2026-09-16');
  const after = C.runway(m, C.payCalc(pay(), '2026-09-26'), OPT, '2026-09-26');
  assert.equal(before.amexOnPay, 900, 'projected as coming off on pay day');
  assert.equal(after.paydayPassed, true, 'and once pay day has gone it says so');
  assert.equal(m.amex, 900, 'but nothing is applied behind your back');
  assert.equal(m.balance, -611.26);
});


/* --------------------------------------------------------------- savings -- */
const SAV = {
  balance: 2450, monthly: 150,
  goals: [
    { id: '1', name: 'Omega Seamaster', cost: 5600, got: null, paid: null },
    { id: '2', name: 'Holiday', cost: 800, got: null, paid: null },
    { id: '3', name: 'New bike', cost: 2200, got: null, paid: null },
    { id: '4', name: 'Headphones', cost: 250, got: '2026-08-02', paid: 230 }
  ]
};
const sav = (extra, debts) => C.savingsCalc(Object.assign({}, SAV, extra), debts || [], '2026-09-18', false);

test('one pot is measured against everything on the list', () => {
  const r = sav();
  assert.equal(r.balance, 2450, 'the pot is a single balance');
  assert.equal(r.wanted, 8600, 'the three things still wanted, not the one already got');
  assert.equal(r.toGo, 6150);
  assert.equal(r.spare, -6150, 'negative until the pot covers the lot');
  assert.equal(r.goals.length, 3, 'bought things drop off the list');
  assert.equal(r.got.length, 1);
  assert.equal(r.spent, 230, 'what actually came out of the pot, not the listed price');
});

test('each thing is priced against the whole pot, not a share of it', () => {
  const [holiday, bike, watch] = sav().goals;
  // £2,450 in the pot covers the £800 holiday and the £2,200 bike on their own
  assert.deepEqual([holiday.name, holiday.covered, holiday.short], ['Holiday', true, 0]);
  assert.deepEqual([bike.name, bike.covered, bike.short], ['New bike', true, 0]);
  assert.deepEqual([watch.name, watch.covered, watch.short], ['Omega Seamaster', false, 3150]);
  assert.equal(sav().affordable, 2, 'two of them could be bought today');
  assert.equal(sav().next.name, 'Omega Seamaster', 'the next one out of reach');
});

test('the list is ordered by what you can get soonest', () => {
  assert.deepEqual(sav().goals.map(g => g.name), ['Holiday', 'New bike', 'Omega Seamaster']);
});

test('what goes in each month says when the pot gets there', () => {
  const r = sav();
  assert.equal(r.goals[2].months, Math.ceil(3150 / 150), 'the watch on its own');
  assert.equal(r.goals[2].by, '2028-06-18');
  assert.equal(r.months, Math.ceil(6150 / 150), 'and the whole list');
  assert.equal(r.by, '2030-02-18');
  const stuck = sav({ monthly: null });
  assert.equal(stuck.goals[2].months, null, 'nothing going in, so it is not arriving');
  assert.equal(stuck.goals[2].stalled, true);
  assert.equal(stuck.months, null);
});

test('a pot past the whole list reports spare, and nothing over 100 per cent', () => {
  const r = sav({ balance: 10000 });
  assert.equal(r.toGo, 0);
  assert.equal(r.spare, 1400, '£10,000 against £8,600 of list');
  assert.ok(r.goals.every(g => g.covered && g.pct === 1), 'all covered, none over full');
  assert.equal(r.next, null, 'nothing out of reach');
  assert.equal(r.affordable, 3);
});

test('savings cope with nothing set up', () => {
  const empty = C.savingsCalc({}, [], '2026-09-18');
  assert.deepEqual([empty.balance, empty.wanted, empty.toGo, empty.goals.length, empty.got.length], [0, 0, 0, 0, 0]);
  assert.equal(empty.next, null);
  const blank = C.savingsCalc({ balance: 100, goals: [{ name: '' }] }, [], '2026-09-18');
  assert.equal(blank.goals[0].cost, 0);
  assert.equal(blank.goals[0].covered, false, 'no price is not the same as free');
  assert.equal(blank.goals[0].pct, null);
});

test('long-term debt is left out of the net unless asked for', () => {
  const debts = [
    { name: 'Card', type: 'Short-term', balance: 1850 },
    { name: 'Mortgage', type: 'Long-term', balance: 197572.08 }
  ];
  const without = C.savingsCalc(SAV, debts, '2026-09-18', false);
  assert.equal(without.longTotal, 197572.08);
  assert.equal(without.allTotal, 199422.08);
  assert.equal(without.debtTotal, 1850, 'only the card counts');
  assert.equal(without.net, C.r2(2450 - 1850));
  assert.equal(without.withLong, false);

  const withIt = C.savingsCalc(SAV, debts, '2026-09-18', true);
  assert.equal(withIt.debtTotal, 199422.08);
  assert.equal(withIt.net, C.r2(2450 - 199422.08));
  assert.equal(withIt.withLong, true);
});

test('a debt with no type counts \u2014 only an explicit Long-term is set aside', () => {
  assert.equal(C.savingsCalc({}, [{ balance: 500 }], '2026-09-18', false).debtTotal, 500);
  assert.equal(C.savingsCalc({}, [{ balance: 500, type: 'Short-term' }], '2026-09-18', false).debtTotal, 500);
  assert.equal(C.savingsCalc({}, [{ balance: 500, type: 'Long-term' }], '2026-09-18', false).debtTotal, 0);
});

test('with no long-term debt the two settings agree', () => {
  const debts = [{ type: 'Short-term', balance: 1850 }];
  assert.equal(C.savingsCalc({}, debts, '2026-09-18', false).net, C.savingsCalc({}, debts, '2026-09-18', true).net);
  assert.equal(C.savingsCalc({}, debts, '2026-09-18', false).longTotal, 0);
});

/* ------------------------------------------------- NI thresholds & taper -- */
test('the NI thresholds for four weeks are the year\'s, times 4/52, rounded up', () => {
  // £12,570 × 4/52 is £966.92, so £967; £50,270 × 4/52 is £3,866.92, so £3,867 — the figure a payslip prints
  // as NI-able pay up to the upper limit. Rounding the weekly figure up first (£242, £967) and taking four of
  // them gives £968 and £3,868, which takes 2p too little off everyone paid over the upper limit.
  const at = basic => C.payCalc(pay({ salary: basic * 13, weeksYear: 52, personalAllowance: 0 }), '2026-09-18')
    .rows.find(r => r.payday === '2026-08-28');
  assert.equal(C.r2(at(967).basic), 967, 'a period of exactly the threshold');
  assert.equal(C.r2(at(967).ni), 0, 'nothing is due at the threshold itself');
  assert.equal(C.r2(at(968).ni), 0.08, 'a pound over costs 8p');
  assert.equal(C.r2(at(3867).ni), 232, 'all main rate up to the upper limit: 8% of £2,900');
  assert.equal(C.r2(at(3868).ni), 232.02, 'the pound above it drops to 2%');
  assert.equal(C.r2(at(6000).ni), 274.66, '£232 and 2% of the £2,133 over');
});

test('it says when the personal allowance should have been cut back', () => {
  const low = C.payCalc(pay({ salary: 51400 }), '2026-09-18');
  assert.equal(low.paCheck.stale, false, 'nothing to say below £100,000');

  const high = C.payCalc(pay({ salary: 130000 }), '2026-09-18');
  assert.ok(high.totals.taxable > 100000);
  assert.equal(high.paCheck.stale, true, 'flagged, because the code on file is still the full allowance');
  assert.equal(high.paCheck.should, 0, 'gone entirely by £125,140');
  assert.equal(high.paCheck.allowance, 12570);

  // a code that has already been cut back is not nagged about
  const fixed = C.payCalc(pay({ salary: 110000, personalAllowance: 7570 }), '2026-09-18');
  assert.ok(fixed.totals.taxable > 100000);
  assert.equal(fixed.paCheck.stale, false);
});

/* --------------------------------------------------------- spending log -- */
const spendMoney = (log, extra) => Object.assign({
  buffer: 0, dueShift: 'next', bankHols: true, months: [], debts: [], pots: [], balanceLog: log,
  bills: [{ id: '1', name: 'Rent', category: 'Housing', amount: 700, dueDay: 8, started: '2024-01' }]
}, extra);

test('spending is whatever the bills and pay cannot account for', () => {
  const p = { rows: [{ payday: '2026-09-11', net: 2000 }] };
  const sp = C.spendLog(spendMoney([
    { on: '2026-09-01', balance: 1500, adj: 0 },
    { on: '2026-09-05', balance: 1300, adj: 0 },   // no bills, no pay: £200 spent
    { on: '2026-09-15', balance: 2200, adj: 0 }    // £700 rent out, £2,000 pay in
  ]), p, OPT, '2026-09-15');

  assert.equal(sp.readings, 3);
  assert.equal(sp.windows.length, 2);
  const [a, b] = sp.windows;
  assert.deepEqual([a.days, a.bills, a.pay, a.spent, a.perDay], [4, 0, 0, 200, 50]);
  assert.equal(b.bills, 700, 'the rent on the 8th falls in the second window');
  assert.equal(b.pay, 2000, 'so does the pay day');
  assert.equal(b.expected, 1300 - 700 + 2000);
  assert.equal(b.spent, 400, '£2,600 expected against £2,200 read');
  assert.equal(b.perDay, 40);
  assert.equal(b.hasPay, true);
  assert.equal(sp.last, a, 'the headline skips back past the pay day window');
  assert.equal(sp.perDay, 50, 'and so does the average: only the clean window counts');
  assert.equal(sp.list.length, 2, 'both are still listed');
  assert.equal(sp.since, 0, 'read today');
});

test('the average is over the days, not the mean of the windows', () => {
  const sp = C.spendLog(spendMoney([
    { on: '2026-09-01', balance: 1000, adj: 0 },
    { on: '2026-09-03', balance: 900, adj: 0 },     // 2 days, £50 a day
    { on: '2026-09-07', balance: 500, adj: 0 }      // 4 days, £100 a day
  ], { bills: [] }), { rows: [] }, OPT, '2026-09-07');
  assert.equal(sp.perDay, C.r2(500 / 6), 'weighted by length, so the long stretch counts for more');
  assert.notEqual(sp.perDay, 75, 'not the mean of 50 and 100');
});

test('an amount the app took off itself is not counted as spending', () => {
  const p = { rows: [] };
  const log = [
    { on: '2026-09-01', balance: 1500, adj: 0 },
    { on: '2026-09-02', balance: 600, adj: -900 }   // the card cleared, not a day out
  ];
  const sp = C.spendLog(spendMoney(log), p, OPT, '2026-09-02');
  assert.equal(sp.last.spent, 0, 'the £900 is explained');
  assert.equal(sp.last.adj, -900);

  // without the adjustment the same drop would read as a spree
  const naive = C.spendLog(spendMoney([log[0], { on: '2026-09-02', balance: 600, adj: 0 }]), p, OPT, '2026-09-02');
  assert.equal(naive.last.spent, 900);
});

test('a half-built log cannot break the spending figures', () => {
  const p = { rows: [] };
  assert.equal(C.spendLog(spendMoney([]), p, OPT, '2026-09-15').last, null);
  assert.equal(C.spendLog(spendMoney(null), p, OPT, '2026-09-15').readings, 0);
  const messy = C.spendLog(spendMoney([
    { on: '2026-09-05', balance: 1000 },            // no adj recorded
    { on: 'nonsense', balance: 900 },
    { on: '2026-09-05', balance: 950 },             // same day: no window from it
    { on: '2026-09-07', balance: 800, adj: null }
  ]), p, OPT, '2026-09-09');
  assert.equal(messy.readings, 3, 'the unparseable date is dropped');
  assert.ok(messy.windows.every(w => w.days > 0), 'no zero-length windows');
  assert.equal(messy.since, 2);
});

test('more money than expected reads as money in, not negative spending', () => {
  const sp = C.spendLog(spendMoney([
    { on: '2026-09-01', balance: 500, adj: 0 },
    { on: '2026-09-03', balance: 700, adj: 0 }
  ]), { rows: [] }, OPT, '2026-09-03');
  assert.equal(sp.last.spent, -200);
  assert.equal(sp.perDay, -100);
});

/* ------------------------------------------------ months off & debt carry -- */
test('a bill can have months it is not paid', () => {
  const ct = { id: '1', name: 'Council Tax', amount: 168, dueDay: 13, started: '2024-01', skip: [2, 3] };
  assert.equal(C.billDates(ct, '2027-02-01', '2027-03-31', OPT).length, 0, 'February and March are free');
  assert.equal(C.billDates(ct, '2027-04-01', '2027-04-30', OPT).length, 1, 'April is not');
  assert.equal(C.billDates(ct, '2027-01-01', '2027-12-31', OPT).length, 10, 'ten instalments a year');

  const m = bills(ct);
  m.months = [{ month: '2027-02', earnings: 3000 }, { month: '2027-04', earnings: 3000 }];
  const r = C.moneyCalc(m, '2027-04-20', OPT);
  assert.equal(r.months[0].outgoings, 0, 'and a free month costs nothing');
  assert.equal(r.months[1].outgoings, 168);
  assert.equal(r.bills[0].paidMonths, 10);
  assert.equal(r.bills[0].yearly, 1680, 'ten payments, not twelve');
  assert.equal(r.yearTotal, 1680);
  assert.equal(r.anySkips, true);
  assert.equal(r.activeTotal, 168, 'the monthly figure is still what leaves in a month you pay');
});

test('a bill with no months off behaves exactly as before', () => {
  const rent = { id: '1', name: 'Rent', amount: 780, dueDay: 1, started: '2024-01' };
  assert.equal(C.billDates(rent, '2027-01-01', '2027-12-31', OPT).length, 12);
  const r = C.moneyCalc(bills(rent), '2027-04-20', OPT);
  assert.equal(r.bills[0].paidMonths, 12);
  assert.equal(r.bills[0].yearly, 9360);
  assert.equal(r.anySkips, false);
});

const debt = extra => Object.assign({ id: 'd1', name: 'Card', type: 'Short-term',
  balance: 1850, repayment: 200, apr: 0.219, balanceOn: '2026-06-05' }, extra);
const cardBill = { id: 'b1', name: 'Credit cards', dueDay: 5, started: '2024-01', link: 'Short-term' };

test('a debt balance carries forward on its own', () => {
  const m = { bills: [cardBill], debts: [debt()], months: [] };
  const n = C.debtNow(debt(), m, '2026-09-19', OPT);
  assert.equal(n.typed, 1850);
  assert.equal(n.on, '2026-06-05');
  assert.equal(n.payments, 3, 'July, August and September have been and gone');
  assert.equal(n.paid, 600);
  assert.ok(n.interest > 90 && n.interest < 95, `interest of ${n.interest} at 21.9%`);
  assert.equal(n.balance, C.r2(1850 + n.interest - 600));
  assert.equal(n.carried, true);
  assert.equal(n.cleared, false);
  assert.equal(C.moneyCalc(m, '2026-09-19', OPT).debts[0].balance, n.balance, 'and the total uses it');
});

test('without a date the balance is taken as read, as it always was', () => {
  const m = { bills: [cardBill], debts: [], months: [] };
  const n = C.debtNow(debt({ balanceOn: null }), m, '2026-09-19', OPT);
  assert.deepEqual([n.balance, n.payments, n.carried], [1850, 0, false]);
  const today = C.debtNow(debt({ balanceOn: '2026-09-19' }), m, '2026-09-19', OPT);
  assert.equal(today.payments, 0, 'typed today, so nothing has happened since');
});

test('a debt cannot be paid past zero, and says when it is cleared', () => {
  const m = { bills: [cardBill], debts: [], months: [] };
  const n = C.debtNow(debt({ balance: 350, apr: null }), m, '2026-09-19', OPT);
  assert.equal(n.balance, 0);
  assert.equal(n.paid, 350, 'the last payment is only what was left');
  assert.equal(n.payments, 2, 'and it stops once there is nothing to pay');
  assert.equal(n.cleared, true);
});

test('with no bill funding it the repayment still lands monthly', () => {
  const n = C.debtNow(debt({ apr: null }), { bills: [], debts: [] }, '2026-09-19', OPT);
  assert.equal(n.payments, 3, 'the 5th of July, August and September');
  assert.equal(n.balance, 1250);
});

test('a repayment smaller than the interest never gets anywhere', () => {
  const n = C.debtNow(debt({ repayment: 10 }), { bills: [], debts: [] }, '2026-09-19', OPT);
  assert.ok(n.balance > 1850, 'it goes up, and the app says so rather than pretending');
});

test('a bill can ask to have its price checked once a year', () => {
  const ct = { id: '1', name: 'Council Tax', amount: 168, dueDay: 13, started: '2024-01', review: 4 };
  const due = tod => C.moneyCalc(bills(ct), tod, OPT).reviews.map(b => [b.name, b.dueReview]);
  assert.deepEqual(due('2027-03-31'), [], 'not before the month it changes');
  assert.deepEqual(due('2027-04-01'), [['Council Tax', '2027-04']], 'due the moment April arrives');
  assert.deepEqual(due('2027-09-01'), [['Council Tax', '2027-04']], 'and stays due until it is dealt with');

  const done = Object.assign({}, ct, { reviewedOn: '2027-04' });
  assert.deepEqual(C.moneyCalc(bills(done), '2027-09-01', OPT).reviews, [], 'checked, so quiet');
  assert.deepEqual(C.moneyCalc(bills(done), '2028-04-02', OPT).reviews.map(b => b.dueReview), ['2028-04'],
    'and asks again the next year');
  assert.deepEqual(C.moneyCalc(bills({ ...ct, review: null }), '2027-04-01', OPT).reviews, [],
    'a bill that never changes is never asked about');
});

test('a mortgage drops by far less than the repayment', () => {
  const mtg = { id: 'd3', name: 'Mortgage', type: 'Long-term', balance: 197572.08,
    repayment: 958.41, apr: 0.041, balanceOn: '2027-01-10' };
  const n = C.debtNow(mtg, { bills: [], debts: [] }, '2027-04-10', OPT);
  assert.equal(n.payments, 3);
  assert.equal(n.paid, C.r2(958.41 * 3), 'three payments went out');
  assert.equal(C.r2(n.interest), 2022.21, 'and interest went back on');
  assert.equal(n.balance, 196719.06);
  assert.equal(C.r2(197572.08 - n.balance), 853.02, 'so £853 came off the debt, not £2,875');
  assert.ok(n.balance > 197572.08 - n.paid, 'never the whole repayment');
  assert.equal(n.noRate, false);
});

test('a blank APR is flagged rather than treated as nought per cent', () => {
  const d = { id: 'd1', name: 'Loan', type: 'Long-term', balance: 10000, repayment: 200, balanceOn: '2027-01-10' };
  const blank = C.debtNow({ ...d, apr: null }, { bills: [], debts: [] }, '2027-04-10', OPT);
  assert.equal(blank.interest, 0);
  assert.equal(blank.balance, 9400, 'the whole repayment comes off');
  assert.equal(blank.noRate, true, 'and it says so, because that flatters a real debt');

  const zero = C.debtNow({ ...d, apr: 0 }, { bills: [], debts: [] }, '2027-04-10', OPT);
  assert.equal(zero.balance, 9400, 'a genuine 0% deal behaves the same');
  assert.equal(zero.noRate, false, 'but is not flagged, because it was typed on purpose');

  const m = { bills: [], debts: [{ ...d, apr: null }], months: [] };
  assert.equal(C.moneyCalc(m, '2027-04-10', OPT).noRateDebts.length, 1);
  assert.equal(C.debtNow({ ...d, apr: null, balanceOn: null }, m, '2027-04-10', OPT).noRate, false,
    'nothing is being carried, so there is nothing to flag');
});

test('a fixed rate running out is flagged the month it does', () => {
  const mtg = { id: 'd3', name: 'Mortgage', type: 'Long-term', balance: 197572.08,
    repayment: 958.41, apr: 0.041, balanceOn: '2027-01-10', rateEnds: '2027-09' };
  const due = tod => C.moneyCalc({ bills: [], debts: [mtg], months: [] }, tod, OPT).rateReviews.map(d => d.rateDue);
  assert.deepEqual(due('2027-08-31'), [], 'quiet while the fix is still running');
  assert.deepEqual(due('2027-09-01'), ['2027-09'], 'flagged the month it ends');
  assert.deepEqual(due('2028-02-01'), ['2027-09'], 'and stays flagged until it is dealt with');
  assert.deepEqual(C.moneyCalc({ bills: [], debts: [{ ...mtg, rateEnds: null }], months: [] }, '2027-09-01', OPT).rateReviews,
    [], 'a debt with no fixed term is never asked about');
});

/* --------------------------------------------------- the payslip figure -- */
test('a typed payslip net replaces the projection everywhere it is spent', () => {
  const proj = C.payCalc(pay(), '2026-09-22').rows.find(r => r.payday === '2026-09-25');
  assert.equal(proj.actual, null);
  assert.equal(proj.net, proj.projected, 'with nothing typed the two are the same');

  const p = C.payCalc(pay({ actual: { '2026-09-25': 2563.09 } }), '2026-09-22');
  const r = p.rows.find(x => x.payday === '2026-09-25');
  assert.equal(r.actual, 2563.09);
  assert.equal(r.net, 2563.09, 'the payslip is what gets spent');
  assert.equal(r.projected, proj.net, 'the projection is kept to compare against');
  assert.equal(r.diff, C.r2(2563.09 - proj.net));

  // the breakdown is what explains the number, so it is left exactly as worked out
  assert.equal(r.taxable, proj.taxable);
  assert.equal(r.paye, proj.paye);
  assert.equal(r.ni, proj.ni);

  // and it reaches the cash flow, three days before the money does
  const m = Object.assign(bills(), { buffer: 0, balance: 400, balanceOn: '2026-09-20' });
  assert.equal(C.runway(m, p, OPT, '2026-09-22').net, 2563.09, 'shown as the pay still to come');
  const onDay = C.payCalc(pay({ actual: { '2026-09-25': 2563.09 } }), '2026-09-25');
  assert.equal(C.runway(m, onDay, OPT, '2026-09-25').start, 2963.09, 'and carried into the balance on the day');
});

test('clearing the payslip figure goes back to the projection', () => {
  const projected = C.payCalc(pay(), '2026-09-22').rows.find(r => r.payday === '2026-09-25').net;
  [null, '', undefined].forEach(v => {
    const r = C.payCalc(pay({ actual: { '2026-09-25': v } }), '2026-09-22').rows.find(x => x.payday === '2026-09-25');
    assert.equal(r.actual, null, `${JSON.stringify(v)} is not a figure`);
    assert.equal(r.net, projected);
    assert.equal(r.diff, null);
  });
  const zero = C.payCalc(pay({ actual: { '2026-09-25': 0 } }), '2026-09-22').rows.find(x => x.payday === '2026-09-25');
  assert.equal(zero.actual, 0, 'but nought is, for an unpaid month');
  assert.equal(zero.net, 0);
});

test('the year keeps score of how the projection has done', () => {
  const bare = C.payCalc(pay(), '2026-09-22');
  assert.equal(bare.totals.actuals, 0);
  assert.equal(bare.totals.diff, 0);

  const p = C.payCalc(pay({ actual: { '2026-08-28': 2500, '2026-09-25': 2563.09 } }), '2026-09-22');
  assert.equal(p.totals.actuals, 2, 'two pay days off a payslip');
  const rows = p.rows.filter(r => r.actual !== null && r.taxYear === '2026-04-06');
  const summed = C.r2(rows.reduce((a, r) => a + r.diff, 0));
  assert.ok(Math.abs(p.totals.diff - summed) <= 0.01, `running difference ${p.totals.diff} against rows ${summed}`);
  assert.equal(p.totals.diff, C.r2(p.totals.net - p.totals.projected), 'it is the gap between the two year totals');
  assert.ok(p.totals.net !== p.totals.projected, 'which the payslips have moved');
});

test('a pay day still to come can take its payslip early', () => {
  const p = C.payCalc(pay({ actual: { '2026-12-18': 3100 } }), '2026-09-22');
  const r = p.rows.find(x => x.payday === '2026-12-18');
  assert.equal(r.past, false, 'months away');
  assert.equal(r.net, 3100, 'and still honoured');
});

test('the app asks for the payslip around pay day, then stops', () => {
  const asks = (tod, extra) => {
    const n = C.payCalc(pay(extra), tod).needsPayslip;
    return n ? n.payday + (n.past ? ' gone' : ' coming') : null;
  };
  assert.equal(asks('2026-09-20'), null, 'five days out is too early to have it');
  assert.equal(asks('2026-09-21'), '2026-09-25 coming', 'four days out, the default lead');
  assert.equal(asks('2026-09-24'), '2026-09-25 coming');
  assert.equal(asks('2026-09-25'), '2026-09-25 gone', 'pay day itself');
  assert.equal(asks('2026-09-28'), '2026-09-25 gone', 'and a few days after, if it was missed');
  assert.equal(asks('2026-09-29'), null, 'then it lets go rather than becoming wallpaper');

  assert.equal(asks('2026-09-24', { actual: { '2026-09-25': 2563.09 } }), null, 'quiet once the figure is in');
  assert.equal(asks('2026-09-19', { payslipLead: 7 }), '2026-09-25 coming', 'the lead is yours to set');
  assert.equal(asks('2026-09-24', { payslipLead: 0 }), null, 'set it to nought and it only asks after');
});

test('it asks about one pay day at a time, the nearest one', () => {
  // nothing typed all year, but only the pay day in hand is asked about
  const p = C.payCalc(pay(), '2026-09-25');
  assert.equal(p.rows.filter(r => r.actual === null).length > 10, true, 'plenty without a figure');
  assert.equal(p.needsPayslip.payday, '2026-09-25');
  assert.equal(C.payCalc(pay(), '2026-10-21').needsPayslip.payday, '2026-10-23', 'then the next one');
});

/* ------------------------------------------------- things that end on their own -- */
const EE = { id: 'e', name: 'EE Device', amount: 34.5, dueDay: 21, started: '2025-04', ended: '2027-03' };

test('a bill with its last payment still to come counts until then', () => {
  const r = C.moneyCalc(bills(EE), '2026-09-26', OPT);
  assert.equal(r.bills[0].finished, false, 'the end is in March, so it is live now');
  assert.equal(r.active.length, 1, 'and in the active total');
  assert.equal(r.activeTotal, 34.5);
  assert.equal(r.bills[0].left, 6, 'October to March');
});

test('and drops out on its own once its last month has gone', () => {
  const mar = C.moneyCalc(bills(EE), '2027-03-10', OPT);
  assert.equal(mar.bills[0].finished, false, 'still live in its final month');
  assert.equal(mar.bills[0].left, 1, 'with one payment to go');
  const apr = C.moneyCalc(bills(EE), '2027-04-10', OPT);
  assert.equal(apr.bills[0].finished, true);
  assert.equal(apr.active.length, 0, 'out of the total');
  assert.equal(C.billEvents(bills(EE), '2027-04-01', '2027-12-31', OPT).length, 0, 'and out of the cash flow');
});

test('a card that clears stops being paid for', () => {
  const m = { months: [], bills: [{ id: 'cc', name: 'Credit cards', dueDay: 5, started: '2024-01', link: 'Short-term' }],
    debts: [{ id: 'd1', name: 'Barclaycard', type: 'Short-term', balance: 1000, repayment: 200, apr: 0.219, balanceOn: '2026-09-26' }] };
  const ev = C.billEvents(m, '2026-09-27', '2027-12-31', OPT);
  assert.equal(ev.length, 6, 'six payments and no more');
  assert.deepEqual(ev.slice(0, 5).map(e => e.amount), [200, 200, 200, 200, 200]);
  assert.ok(ev[5].amount < 200 && ev[5].amount > 0, `the last one is only what was left: £${ev[5].amount}`);

  const r = C.moneyCalc(m, '2026-09-26', OPT);
  assert.equal(r.debts[0].payoff.months, 6);
  assert.equal(r.debts[0].payoff.date.slice(0, 7), '2027-03', 'expected clear in March');
  assert.equal(r.bills[0].clears.slice(0, 7), '2027-03', 'and the linked bill knows when it stops');

  const after = C.moneyCalc(m, '2027-04-10', OPT);
  assert.equal(after.debts[0].balance, 0, 'cleared by April');
  assert.equal(after.bills[0].amt, 0, 'so the bill costs nothing now');
  assert.equal(after.repayTotal, 0, 'and neither do the repayments');
});

test('a card without a date to carry from is paid in full, as before', () => {
  const m = { months: [], bills: [{ id: 'cc', name: 'Credit cards', dueDay: 5, started: '2024-01', link: 'Short-term' }],
    debts: [{ id: 'd1', name: 'Barclaycard', type: 'Short-term', balance: 1000, repayment: 200, apr: 0.219, balanceOn: null }] };
  assert.equal(C.billEvents(m, '2026-09-27', '2027-12-31', OPT).length, 15, 'every month, no end');
});

test('the expected clear date lands in the month the last payment really leaves', () => {
  // paid on the 28th: from the 26th the next payment is two days away, not a month
  const m = { months: [], bills: [{ id: 'cc', name: 'Card', dueDay: 28, started: '2024-01', link: 'Short-term' }],
    debts: [{ id: 'd1', name: 'Card', type: 'Short-term', balance: 400, repayment: 200, apr: 0, balanceOn: '2026-09-26' }] };
  const r = C.moneyCalc(m, '2026-09-26', OPT);
  assert.equal(r.debts[0].payoff.months, 2);
  assert.equal(r.debts[0].payoff.date.slice(0, 7), '2026-10', '28 Sep and 28 Oct, so October, not November');
});

/* ---------------------------------------------------- pay: review fixes -- */
test('an old year of holiday pay kept for the record is not paid again', () => {
  const p = C.payCalc(pay({ hpaHistory: { 2024: 1200, 2025: 1500 } }), '2026-09-26');
  assert.deepEqual(p.rows.filter(r => r.hpaPay).map(r => [r.payday, r.hpaPay]), [['2026-03-13', 1500]],
    '2024 was paid in March 2025, before the schedule starts');
});

test('recording last year\'s holiday pay in March keeps the whole tax year', () => {
  const h = { '2026-10-23': { ot: 20 } };
  const before = C.payCalc(pay({ hours: h }), '2027-03-13'), after = C.payCalc(pay({ hours: h, hpaHistory: { 2026: 50 } }), '2027-03-13');
  assert.equal(after.rows.filter(r => r.taxYear === '2026-04-06').length, 13, 'all thirteen pay days of 2026/27');
  assert.equal(after.totals.ot, 20, 'the October overtime is still in the year');
  // only the holiday pay itself moves, from the estimate to the £50 typed
  assert.ok(Math.abs(after.totals.net - before.totals.net) < 15, `${before.totals.net} → ${after.totals.net}`);
});

test('two backdated rises each pay only their own step', () => {
  const p = C.payCalc(pay({ salary: 40000, rises: [
    { from: '2026-04-01', salary: 42000, arrearsOn: '2026-10-23' },
    { from: '2026-07-01', salary: 44000, arrearsOn: '2026-10-23' }] }), '2026-09-26');
  assert.deepEqual(p.rises.map(r => r.total), [942.08, 443.64]);
  assert.equal(p.rows.find(r => r.payday === '2026-10-23').backpay, 1385.72, 'not £1,829.34');
});

test('the rises list finds each rise however they were typed in', () => {
  const R = [{ from: '2026-07-01', salary: 44000, arrearsOn: '2026-10-23' }, { from: '2025-04-01', salary: 42000, arrearsOn: '2025-07-04' }];
  const p = C.payCalc(pay({ salary: 40000, rises: R }), '2026-09-26');
  assert.deepEqual(R.map((x, i) => p.rises.find(c => c.idx === i).from), ['2026-07-01', '2025-04-01']);
});

test('the hourly rate and basic are the ones being paid now, rises included', () => {
  const p = C.payCalc(pay({ salary: 40000, rises: [{ from: '2026-04-01', salary: 52000 }] }), '2026-09-26');
  assert.equal(p.hourly, 28.48);
  assert.equal(p.basic, 3987.24, '£52,000 over 313/6 weeks is £996.81 a week');
  assert.equal(p.basic, p.rows[p.nextIdx].basic);
});

test('a cleared pay setting falls back instead of breaking the figures', () => {
  const noDay = C.payCalc(pay({ nextPayDay: null }), '2026-09-26');
  assert.ok(noDay.rows.length > 0 && noDay.nextPayDay > '2026-09-26', 'no pay day still gives a schedule');
  assert.equal(C.payCalc(pay({ nextPayDay: '2026-13-01' }), '2026-09-26').rows.length > 0, true, 'nor does a nonsense one throw');
  const noHours = C.payCalc(pay({ hoursWeek: null }), '2026-09-26');
  assert.ok(isFinite(noHours.hourly) && isFinite(noHours.rows[noHours.nextIdx].net), 'no hours is not Infinity');
  const noEnd = C.payCalc(pay({ periodEndDays: '' }), '2026-09-26'), six = C.payCalc(pay(), '2026-09-26');
  assert.equal(noEnd.rows[noEnd.nextIdx].end, six.rows[six.nextIdx].end, 'a blank period end is the default six days');
  assert.doesNotThrow(() => C.payCalc(pay({ rises: [null], fixed: [null], taxYears: [null] }), '2026-09-26'));
});

test('a fourteenth pay day in one tax year is taxed on its own four weeks', () => {
  const f = x => C.payCalc(pay(x), '2026-09-26').rows.find(r => r.payday === '2030-04-05');
  assert.equal(f().taxYear, '2029-04-06', '6 Apr 2029 to 5 Apr 2030 holds fourteen');
  assert.equal(f().paye, f({ nonCumulative: true }).paye, 'week 56 is week 1 basis');
  assert.equal(f().paye, 438.2, '£3,159.12 less four weeks of free pay at £241.92, the pound below, at 20%');
});

test('an item with an amount counts whether or not it has a name yet', () => {
  assert.equal(C.payCalc(pay({ fixed: [{ name: '', amount: 50, treatment: 'Sacrifice' }] }), '2026-09-26').rows[0].sacr, 50);
});

test('an item dated to part of a period is charged by the day', () => {
  const p = C.payCalc(pay({ fixed: [{ name: 'Pension', amount: 280, treatment: 'Sacrifice', from: '2026-10-01' }] }), '2026-09-26');
  const r = p.rows.find(x => x.start < '2026-10-01' && x.end >= '2026-10-01');
  const days = C.daysBetween('2026-10-01', r.end) + 1;
  assert.equal(r.sacr, C.r2(280 * days / 28), `${days} of the 28 days`);
});

test('hours add up without floating-point crumbs', () => {
  const p = C.payCalc(pay({ hours: { '2026-10-23': { ot: 2.2 }, '2026-11-20': { ot: 4.4 } } }), '2026-09-26');
  assert.equal(p.totals.ot, 6.6);
});

test('the personal allowance defaults to the tax code\'s number × 10 + 9', () => {
  const p = C.payCalc(pay({ taxYears: [{ from: '2026-04-06', basicRate: 0.2 }] }), '2026-09-26');
  assert.equal(p.years[0].personalAllowance, 12579, '1257L');
});

/* -------------------------------------------------- money: review fixes -- */
const payOn = (payday, net = 2500) => ({ nextPayDay: payday, nextIdx: 0, rows: [{ payday, net }, { payday: C.addDays(payday, 28), net }] });

test('a bill dated pay day comes out of the pay, not before it', () => {
  const m = { buffer: 0, balance: 100, balanceOn: '2026-09-21', debts: [],
    bills: [{ name: 'Rent', amount: 780, dueDay: 25, started: '2024-01' }] };
  const r = C.runway(m, payOn('2026-09-25'), OPT, '2026-09-21');
  assert.equal(r.shortfall, false, 'pay lands in the same early batch the rent leaves in');
  assert.equal(r.safe, 100);
  assert.deepEqual(r.events, [], 'nothing leaves before pay day');
  assert.deepEqual(r.onPay.map(e => e.name), ['Rent']);
  assert.equal(r.afterPay, 1820, '100 + 2,500 - 780');
  assert.deepEqual(C.periodFlows(m, payOn('2026-09-25'), OPT, 1)[0].events.map(e => e.name), ['Rent'],
    'and the period starting that day counts it, once');
});

test('the clear date is the day the last payment really leaves', () => {
  const card = extra => ({ bills: [Object.assign({ name: 'Card', dueDay: 5, started: '2020-01', link: 'Short-term' }, extra)], debts: [] });
  const debt = (balance, balanceOn) => ({ type: 'Short-term', balance, repayment: 200, apr: 0, balanceOn });
  const clear = (m, d, tod, opt) => C.moneyCalc(Object.assign(m, { debts: [d] }), tod, opt || EXACT).debts[0].payoff.date;
  // the 31st moved off a Saturday into November, and the one after lands on the 30th
  assert.equal(C.moneyCalc({ bills: [{ name: 'Card', dueDay: 31, started: '2020-01', link: 'Short-term' }],
    debts: [{ type: 'Short-term', balance: 100, repayment: 50, apr: 0, balanceOn: '2026-10-20' }] }, '2026-10-20', OPT).debts[0].payoff.date, '2026-11-30');
  assert.equal(clear({ bills: [], debts: [] }, debt(400, '2026-08-28'), '2026-09-26'), '2026-10-28', 'monthly from the statement with no bill');
  assert.equal(clear(card({ skip: [12] }), debt(1000, '2026-09-26'), '2026-09-26'), '2027-03-05', 'December off pushes it into March');
  assert.equal(clear(card(), debt(400, '2026-10-10'), '2026-09-26'), '2026-12-05', 'nothing leaves before a statement dated ahead');
});

test('a debt with no type is short-term everywhere at once', () => {
  const m = { bills: [{ name: 'Cards', dueDay: 5, started: '2020-01', link: 'Short-term' }],
    debts: [{ name: 'Old loan', balance: 1000, repayment: 100, apr: 0, balanceOn: '2026-06-01' }] };
  const r = C.moneyCalc(m, '2026-09-26', EXACT);
  assert.equal(r.debts[0].balance, 600, 'paid down on the card bill\'s dates');
  assert.equal(r.bills[0].amt, 100, 'and the bill that pays it charges for it');
  assert.equal(C.billEvents(m, '2026-10-01', '2026-10-31', EXACT).length, 1, 'so the cash flow does too');
});

test('bill months that are not months cannot stop the sums', () => {
  assert.equal(C.moneyCalc({ bills: [{ name: 'Phone', amount: 30, dueDay: 5, ended: '2027-3' }] }, '2026-09-26').activeTotal, 30);
  assert.equal(C.billDates({ dueDay: 5, started: '2026-13', ended: 'soon' }, '2026-10-01', '2026-10-31', EXACT).length, 1);
});

test('a long bill counts every payment, not the first eighty months', () => {
  assert.equal(C.moneyCalc({ bills: [{ name: 'Mortgage', amount: 958.41, dueDay: 1, started: '2020-01', ended: '2050-12' }] },
    '2026-09-26', EXACT).bills[0].left, 291);
  const d = { type: 'Long-term', balance: 150000, repayment: 900, apr: 0.03, balanceOn: '2019-01-15' };
  const withBill = C.debtNow(d, { bills: [{ name: 'M', dueDay: 15, started: '2010-01', link: 'Long-term' }] }, '2026-09-26', EXACT);
  const monthly = C.debtNow(d, { bills: [] }, '2026-09-26', EXACT);
  assert.equal(withBill.payments, monthly.payments, 'the funding bill\'s dates run as long as the monthly ones');
});

test('a last payment moved into the next month is still counted, then it finishes', () => {
  const m = { bills: [{ name: 'X', amount: 30, dueDay: 31, started: '2025-01', ended: '2026-10' }] };
  assert.equal(C.moneyCalc(m, '2026-10-20', OPT).bills[0].left, 1, 'Sat 31 Oct goes on Mon 2 Nov');
  assert.equal(C.moneyCalc(m, '2026-11-01', OPT).bills[0].finished, false, 'so it is live until then');
  assert.equal(C.moneyCalc(m, '2026-11-03', OPT).bills[0].finished, true);
});

test('an undated bill with an end has no payments to count, only an end', () => {
  const b = C.moneyCalc({ bills: [{ name: 'X', amount: 30, started: '2025-01', ended: '2027-03' }] }, '2026-09-26').bills[0];
  assert.equal(b.left, null);
  assert.equal(b.finished, false);
});

test('a bill that has not started yet is not in the total yet', () => {
  const r = C.moneyCalc({ bills: [{ name: 'Car finance', amount: 300, dueDay: 5, started: '2027-01' }] }, '2026-09-26');
  assert.equal(r.activeTotal, 0);
  assert.equal(r.bills[0].notYet, true);
  assert.equal(C.moneyCalc({ bills: [{ name: 'Car finance', amount: 300, dueDay: 5, started: '2027-01' }] }, '2027-01-02').activeTotal, 300);
});

test('a linked bill ends when the debts still owing clear', () => {
  const m = { bills: [{ name: 'C', dueDay: 5, started: '2020-01', link: 'Short-term' }], debts: [
    { type: 'Short-term', balance: 100, repayment: 100, apr: 0, balanceOn: '2026-06-01' },
    { type: 'Short-term', balance: 600, repayment: 200, apr: 0, balanceOn: '2026-09-26' }] };
  assert.equal(C.moneyCalc(m, '2026-09-26', EXACT).bills[0].clears, '2026-12-05', 'the one already cleared has no say');
});

test('what came out of the pot is what the got list adds up, even nothing', () => {
  assert.equal(C.savingsCalc({ balance: 0, goals: [{ name: 'Bike', cost: 500, got: '2026-09-01', paid: 0 }] }, [], '2026-09-26').spent, 0);
  assert.equal(C.savingsCalc({ balance: 0, goals: [{ name: 'Bike', cost: 500, got: '2026-09-01', paid: null }] }, [], '2026-09-26').spent, 500,
    'with no figure recorded the price stands in');
});

test('something with no price yet is never the next thing to save for', () => {
  const s = C.savingsCalc({ balance: 2450, goals: [{ name: 'Thing', cost: null }, { name: 'Watch', cost: 5600 }] }, [], '2026-09-26');
  assert.equal(s.next.name, 'Watch');
  assert.deepEqual(s.goals.map(g => g.name), ['Watch', 'Thing'], 'priced things first');
});

test('the saving rate compares savings with the earnings of the same months', () => {
  const r = C.moneyCalc({ bills: [], months: [{ month: '2026-07', earnings: 2000, saved: 200 },
    { month: '2026-08', earnings: 2000, saved: 200 }, { month: '2026-09', earnings: null, saved: 600 }] }, '2026-09-26');
  assert.equal(r.yearRow.rate, 0.1, 'not £1,000 over £4,000');
  assert.equal(r.yearRow.saved, 1000, 'though every pound saved is still counted');
});

test('a December price check is still asked about in January, then lets go', () => {
  const b = { name: 'Gym', amount: 30, dueDay: 1, started: '2024-01', review: 12 };
  const asks = tod => C.moneyCalc({ bills: [b] }, tod).reviews.length;
  assert.deepEqual(['2026-12-31', '2027-01-01', '2027-05-31', '2027-06-01'].map(asks), [1, 1, 1, 0]);
  assert.equal(C.moneyCalc({ bills: [{ ...b, started: '2027-01' }] }, '2027-01-10').reviews.length, 0,
    'a bill added after the change has the new price already');
});

test('a bill that has finished altogether drops out of price changes', () => {
  const gym = [{ name: 'Gym', amount: 30, started: '2024-01', ended: '2025-01' }, { name: 'Gym', amount: 45, started: '2025-02', ended: '2025-06' }];
  assert.equal(C.priceHistory(gym, '2026-09-26').length, 0);
  assert.equal(C.priceHistory(gym, '2025-05-10').length, 1, 'while it was running it counted');
});

test('the last card payment is the same penny in the cash flow and on the debt', () => {
  const m = { bills: [{ name: 'C', dueDay: 5, started: '2020-01', link: 'Short-term' }],
    debts: [{ type: 'Short-term', balance: 140, repayment: 200, apr: 0.219, balanceOn: '2026-09-01' }] };
  assert.equal(C.billEvents(m, '2026-09-02', '2026-10-31', EXACT)[0].amount, C.debtNow(m.debts[0], m, '2026-10-31', EXACT).paid);
});

test('nothing owed or nothing paid has no payoff', () => {
  assert.equal(C.debtPayoff({ balance: 1000, repayment: -200, apr: 0.2 }, '2026-09-26'), null);
  assert.equal(C.debtPayoff({ balance: -50, repayment: 200, apr: 0.2 }, '2026-09-26'), null);
});

test('the spending log is the same worked in one pass', () => {
  const m = { buffer: 0, debts: [], bills: [{ name: 'Rent', amount: 780, dueDay: 1, started: '2024-01' },
    { name: 'Gym', amount: 30, dueDay: 15, started: '2024-01' }],
    balanceLog: Array.from({ length: 40 }, (_, i) => ({ on: C.addDays('2026-01-05', i * 6), balance: 2000 - (i % 7) * 150, adj: i % 5 ? 0 : -50 })) };
  const p = C.payCalc(pay(), '2026-09-26');
  const sp = C.spendLog(m, p, OPT, '2026-09-26');
  // every window agrees with the bills worked out for that window alone
  sp.windows.forEach(w => assert.equal(w.bills, C.r2(C.billEvents(m, C.addDays(w.from, 1), w.to, OPT).reduce((a, e) => a + e.amount, 0)), w.from));
});

test('a date never splits across two lines', () => {
  // every space inside a formatted date is a non-breaking one
  for (const s of [C.fmtD('2027-03-12'), C.fmtDM('2027-03-12'), C.fmtDow('2027-03-12'), C.fmtM('2027-03'), C.fmtMs('2027-03')])
    assert.ok(!s.includes(' ') && / /.test(s), JSON.stringify(s));
  assert.equal(C.fmtD('2027-03-12'), '12 Mar 2027');
});

/* ------------------------------------------- London weighting in pay rises -- */
const dec = x => pay(Object.assign({ salary: 56351, london: 178.80, personalAllowance: 12139 }, x));

test('a pay rise carries the London weighting, back-paid with the salary', () => {
  const p = C.payCalc(dec({ rises: [{ from: '2026-04-01', salary: 58379.64, london: 185.24, arrearsOn: '2026-10-23' }] }), '2026-10-03');
  const r = p.rises[0];
  assert.equal(r.basic, 955.6);
  assert.equal(r.londonBack, 39.56, '£6.44 a period from 1 April: four days of the March period, then six whole ones');
  assert.equal(r.total, 995.16);
  const row = d => p.rows.find(x => x.payday === d);
  assert.deepEqual([row('2026-09-25').london, row('2026-10-23').london], [178.8, 185.24], 'the new figure in normal pay from the arrears pay day');
  assert.equal(row('2026-10-23').backpay, 995.16);
  assert.equal(r.sameLondon, 185.24, 'the same 3.6% as the salary, offered');
});

test('a change to the London weighting alone leaves the salary where it is', () => {
  const p = C.payCalc(dec({ rises: [{ from: '2026-04-01', salary: null, london: 185.24, arrearsOn: '2026-10-23' }] }), '2026-10-03');
  assert.equal(p.rises[0].basic, 0);
  assert.equal(p.rises[0].londonBack, 39.56);
  assert.equal(p.rows.find(x => x.payday === '2026-11-20').basic, 4320.84);
});

test('London weighting is taxed like pay but is not part of overtime or holiday pay', () => {
  const hours = { '2026-10-23': { ot: 10 } };
  const withL = C.payCalc(dec({ hours }), '2026-10-03'), without = C.payCalc(dec({ hours, london: null }), '2026-10-03');
  const a = withL.rows.find(x => x.payday === '2026-10-23'), b = without.rows.find(x => x.payday === '2026-10-23');
  assert.equal(C.r2(a.taxable - b.taxable), 178.8, 'in the taxable pay');
  assert.equal(a.otPay, b.otPay, 'not in the overtime rate');
  assert.equal(withL.hourly, without.hourly);
  assert.deepEqual(withL.hpa.map(y => y.qualifying), without.hpa.map(y => y.qualifying), 'and not in holiday pay');
});

test('a pay change starts from the figures in force before its date', () => {
  const p = pay({ salary: 56351, london: 178.8, rises: [
    { from: '2025-04-01', salary: 54000, london: 170 }, { from: '2026-04-01', salary: 58379.64, london: null }] });
  assert.deepEqual(C.payBefore(p, '2026-04-01', 1), { salary: 54000, london: 170 }, 'the 2025 change, not the base or itself');
  assert.deepEqual(C.payBefore(p, '2025-04-01', 0), { salary: 56351, london: 178.8 }, 'nothing earlier: the base figures');
  assert.deepEqual(C.payBefore(p, '', 2), { salary: 58379.64, london: 170 }, 'no date yet: after every change');
});

/* ----------------------------------------------- found in the second review -- */
test('payments left are counted to the penny, the way the balance is carried', () => {
  const left = (balance, repayment, apr) => C.debtPayoff({ balance, repayment, apr }, '2026-11-13');
  assert.equal(left(1199.88, 99.99, 0).months, 12, 'twelve payments to the penny, not thirteen');
  assert.equal(left(2399.76, 99.99, 0).months, 24);
  assert.equal(left(204.12, 1.89, 0).months, 108);
  assert.equal(left(1000.01, 100, 0).months, 11, 'a penny over is one more payment');
  // the count is the carry: that many payments clear it, and one fewer leaves something owing
  for (const d of [{ balance: 5000, repayment: 150, apr: 0.199, balanceOn: '2026-01-01' },
    { balance: 742.13, repayment: 61.5, apr: 0.349, balanceOn: '2026-03-15' },
    { balance: 180000, repayment: 958.12, apr: 0.0439, balanceOn: '2026-02-01' }]) {
    const n = C.debtPayoff(d, d.balanceOn).months, after = k => C.debtNow(d, { bills: [], debts: [d] }, C.addMonths(d.balanceOn, k), EXACT);
    assert.deepEqual([after(n).balance, after(n).payments], [0, n], JSON.stringify(d));
    assert.ok(after(n - 1).balance > 0, 'not a payment sooner');
  }
});

test('a debt that would take over a century is not given a clear date', () => {
  assert.deepEqual(C.debtPayoff({ balance: 50000, repayment: 0.01, apr: 0 }, '2026-11-13'), { never: true });
  assert.equal(C.debtPayoff({ balance: 120000, repayment: 100, apr: 0 }, '2026-11-13').months, 1200, 'a hundred years to the month still is');
  assert.deepEqual(C.debtPayoff({ balance: 120100, repayment: 100, apr: 0 }, '2026-11-13'), { never: true });
  // and the bills list says so rather than failing on a date that cannot be written
  const m = C.moneyCalc({ bills: [{ name: 'C', dueDay: 5, started: '2020-01', link: 'Short-term' }],
    debts: [{ type: 'Short-term', balance: 50000, repayment: 0.01, apr: 0, balanceOn: '2026-11-13' }] }, '2026-11-13', EXACT);
  assert.equal(m.bills[0].clears, undefined);
});

test('pay that landed before the schedule on show still counts toward an old balance', () => {
  // with last year's holiday pay recorded, the schedule on show starts in January
  const p = C.payCalc(pay({ hpaHistory: { 2026: 500 } }), '2027-04-10');
  assert.equal(p.rows[0].payday, '2027-01-15');
  assert.ok(p.allRows.some(r => r.payday === '2026-12-18' && r.warm), 'the pay days worked out for the tax are still there');
  const fl = C.runway({ ...bills(), balance: 100, balanceOn: '2026-12-01' }, p, OPT, '2027-04-10');
  assert.deepEqual(fl.carriedPays.map(r => r.payday), ['2026-12-18', '2027-01-15', '2027-02-12', '2027-03-12', '2027-04-09']);
  assert.equal(fl.carriedIn, C.r2(fl.carriedPays.reduce((a, r) => a + r.net, 0)));
  // the spending log sees that pay day too, instead of calling the pay unexplained money
  const sp = C.spendLog({ buffer: 0, debts: [], bills: [{ name: 'Rent', amount: 700, dueDay: 8, started: '2024-01' }],
    balanceLog: [{ on: '2026-12-01', balance: 1000, adj: 0 }, { on: '2026-12-30', balance: 2500, adj: 0 }] }, p, OPT, '2027-04-10');
  assert.equal(sp.windows[0].hasPay, true);
  assert.equal(sp.windows[0].spent, C.r2(1000 - 700 + sp.windows[0].pay - 2500));
});

test('a balance reading that is not a day, or has not happened yet, is left out', () => {
  const p = C.payCalc(pay(), '2026-09-02');
  const good = [{ on: '2026-08-01', balance: 2000, adj: 0 }, { on: '2026-08-20', balance: 1100, adj: 0 }];
  const clean = C.spendLog(spendMoney(good), p, OPT, '2026-09-02');
  const t0 = Date.now();
  const odd = C.spendLog(spendMoney([...good, { on: '9999-12-31', balance: 50, adj: 0 }, { on: '2026-13-45', balance: 1, adj: 0 },
    { on: '2026-09-03', balance: 5, adj: 0 }, { on: 20260801, balance: 5, adj: 0 }]), p, OPT, '2026-09-02');
  assert.ok(Date.now() - t0 < 3000, 'a reading dated the year 9999 used to walk eight thousand years of bills');
  assert.deepEqual(odd.windows, clean.windows);
});

test('a window of thousands of years costs a moment, not the screen', () => {
  const t0 = Date.now();
  assert.ok(C.billDates({ dueDay: 1 }, '2026-01-01', '9999-12-31', EXACT).length <= 1500);
  const m = { bills: [{ name: 'Card', dueDay: 5, started: '2020-01', link: 'Short-term' }, { name: 'Rent', amount: 700, dueDay: 8 }],
    debts: [{ type: 'Short-term', balance: 5000, repayment: 10, apr: 0.02, balanceOn: '2026-09-01' }] };
  const ev = C.billEvents(m, '2026-09-02', '9999-12-31', EXACT);
  assert.ok(ev.length > 1500 && ev.length <= 3000);
  assert.ok(Date.now() - t0 < 3000);
  // a real window is untouched by the cap: thirty years of a monthly bill is 360 payments
  assert.equal(C.billDates({ dueDay: 31 }, '2026-01-01', '2055-12-31', EXACT).length, 360);
});

test('a linked bill stepped through its dates is the bill worked out one date at a time', () => {
  const m = { bills: [{ name: 'Cards', dueDay: 28, started: '2020-01', link: 'Short-term', skip: [2] },
    { name: 'Mortgage', dueDay: 1, started: '2020-01', link: 'Long-term' }],
    debts: [{ type: 'Short-term', balance: 900, repayment: 250, apr: 0.219, balanceOn: '2026-09-10' },
      { type: 'Short-term', balance: 2400, repayment: 120, apr: 0, balanceOn: '2026-11-02' },      // typed part-way through the window
      { type: 'Short-term', balance: 300, repayment: 0, apr: 0.3, balanceOn: '2026-09-10' },       // nothing being paid
      { type: 'Long-term', balance: 180000, repayment: 958.12, apr: 0.0439, balanceOn: '2026-08-15' }] };
  const all = C.billEvents(m, '2026-09-01', '2028-12-31', OPT);
  // each payment again, asked for on its own day: the carry from the statement, afresh every time
  all.forEach(e => assert.deepEqual(C.billEvents(m, e.date, e.date, OPT).filter(x => x.name === e.name), [e], e.name + ' ' + e.date));
  const cards = all.filter(e => e.name === 'Cards');
  assert.ok(cards.some(e => e.amount === 370) && cards.some(e => e.amount === 120), 'both cards, then the one left');
  assert.ok(cards.some(e => e.amount > 120 && e.amount < 370 && e.amount !== 250), 'the last part-payment of the first card');
  assert.ok(cards[cards.length - 1].date < '2028-12-01', 'and nothing once both are clear');
});

test('a bill or a category can be called anything, even a word JavaScript keeps for itself', () => {
  const hist = C.priceHistory([{ name: 'constructor', amount: 10, started: '2024-01', ended: '2025-01' }, { name: 'constructor', amount: 12, started: '2025-02' },
    { name: '__proto__', amount: 5, started: '2024-01', ended: '2025-06' }, { name: '__proto__', amount: 6, started: '2025-07' }], '2026-11-13');
  assert.deepEqual(hist.map(h => [h.name, h.current]).sort(), [['__proto__', 6], ['constructor', 12]]);
  const m = C.moneyCalc({ bills: [{ name: 'A', category: 'constructor', amount: 10, dueDay: 1, started: '2024-01' },
    { name: 'B', category: '__proto__', amount: 5, dueDay: 2, started: '2024-01' }, { name: 'C', category: 'Housing', amount: 100, dueDay: 3, started: '2024-01' }] }, '2026-11-13');
  assert.deepEqual({ ...m.byCat }, { constructor: 10, Housing: 100, ['__proto__']: 5 });
  assert.equal(m.activeTotal, 115);
});

test('National Insurance is a whole number of pence each pay day, rounded the way HMRC rounds it', () => {
  // 8% of (3,159.12 - 967) is 175.3696: the third decimal is 9, so up
  const up = C.payCalc(pay(), '2026-09-09').rows.find(r => r.payday === '2026-09-25');
  assert.deepEqual([up.taxable, up.ni], [3159.12, 175.37]);
  // 5p less taxable makes it 175.3656: the third decimal is 5, which HMRC takes down, not up
  const down = C.payCalc(pay({ fixed: [{ name: 'x', amount: 0.05, treatment: 'Sacrifice' }] }), '2026-09-09').rows.find(r => r.payday === '2026-09-25');
  assert.deepEqual([down.taxable, down.ni], [3159.07, 175.36]);
  // so every pay day is pounds and pence, and the year's totals are the pay days added up
  const p = C.payCalc(dec({ hours: { '2026-07-03': { ot: 11.5, sun: 7 }, '2026-08-28': { ot: 3, sun: 12.5 } } }), '2026-11-13');
  const pence = x => Math.abs(x * 100 - Math.round(x * 100)) < 1e-6;
  p.allRows.forEach(r => assert.ok(pence(r.ni) && pence(r.net) && pence(r.paye) && pence(r.projected), r.payday));
  const yr = p.allRows.filter(r => r.taxYear === '2026-04-06'), add = k => C.r2(yr.reduce((a, r) => a + r[k], 0));
  assert.deepEqual([C.r2(p.totals.ni), C.r2(p.totals.net), C.r2(p.totals.paye)], [add('ni'), add('net'), add('paye')]);
  assert.equal(C.r2(p.totals.taxable - p.totals.paye - p.totals.ni - yr.reduce((a, r) => a + r.after, 0)), C.r2(p.totals.net), 'and they add across as well as down');
});

test('a figure that is not a number counts as nought, whatever it says', () => {
  assert.deepEqual(['Infinity', '-Infinity', '1e999', 'abc', {}, null, undefined, '', NaN, Infinity].map(C.num), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(['12.5', 12.5, '-3', 0, '1e3'].map(C.num), [12.5, 12.5, -3, 0, 1000]);
  // one such figure in a restored file used to stop every screen that touches pay
  const p = C.payCalc(pay({ periodEndDays: '1e999', hours: { '2026-09-25': { ot: 'Infinity', sun: 4 } } }), '2026-09-09');
  const r = p.rows.find(x => x.payday === '2026-09-25');
  assert.deepEqual([r.ot, r.sun, r.end], [0, 4, '2026-09-25']);
});

test('a date is a real day in a year somebody could mean', () => {
  assert.deepEqual(['2026-02-28', '1900-01-01', '2199-12-31', '1985-07-13'].map(C.isDate), [true, true, true, true]);
  assert.deepEqual(['2026-02-31', '2026-13-01', '0002-08-08', '1899-12-31', '2200-01-01', '9999-12-31', '20266-08-08', '2026-8-8', 20260808, null].map(C.isDate),
    [false, false, false, false, false, false, false, false, false, false]);
  assert.deepEqual(['2026-01', '1900-01', '2199-12'].map(C.isMonth), [true, true, true]);
  assert.deepEqual(['2026-13', '2026-00', '0002-08', '1899-12', '2200-01', '9999-12', '2026-1', null].map(C.isMonth), [false, false, false, false, false, false, false, false]);
});

/* ------------------------------------- what six real payslips showed up -- */
test('free pay is the tax code\'s weekly figure rounded up, times the week, not the year shared out', () => {
  // 1257L: two 500s at £96.16 and (257 × 10 + 9) / 52 = £49.596, up to £49.60: £241.92 a week, £967.68 over four.
  // A straight share of £12,579 is £967.62, and £3,967.65 of pay then lands on the other side of a pound.
  const one = C.payCalc(pay({ nonCumulative: true, personalAllowance: 12579, fixed: [{ name: 'x', amount: 808.53, treatment: 'Allowance' }] }), '2026-09-09')
    .rows.find(r => r.payday === '2026-09-25');
  assert.deepEqual([one.taxable, one.paye], [3967.65, 619.6], '£2,999 taxable: £2,900 at 20% and £99 at 40%, where the shared-out figure made it £3,000 and £620');
  // cumulatively, the seventh pay day is week 28: £22,113.84 less 28 × £241.92 is £15,340 taxable, so £3,068 so far
  const yr = C.payCalc(pay(), '2026-09-26').allRows.filter(r => r.taxYear === '2026-04-06').slice(0, 7);
  assert.equal(yr[6].payday, '2026-09-25');
  assert.equal(C.r2(yr.reduce((a, r) => a + r.paye, 0)), 3068);
  // a code of 500 or less is not split, and no allowance is no free pay
  const tax = pa => C.payCalc(pay({ nonCumulative: true, personalAllowance: pa }), '2026-09-09').rows.find(r => r.payday === '2026-09-25').paye;
  assert.equal(tax(5009), 554.6, '500: £96.33 a week, so £3,159.12 less £385.32 is £2,773');
  assert.equal(tax(5019), 554.6, '501: £96.16 and 37p, £386.12 over four');
  assert.equal(tax(4999), 554.8, '499: £96.14 a week, £384.56, so £2,774');
  assert.equal(tax(0), 683.6, 'nothing free: £2,900 at 20% and the other £259 at 40%');
});

test('basic pay is four weekly rates, each to the penny, over 313/6 weeks', () => {
  const basic = x => C.payCalc(pay(x), '2026-09-09').basic;
  // £52,000 over 313/6 weeks is £996.805 a week: £996.81, and four of them
  assert.equal(basic({ salary: 52000 }), 3987.24);
  assert.equal(C.r2(52000 / (313 / 6) * 4), 3987.22, 'which is not the year divided straight down to four weeks');
  // 52.1667 is that fraction cut short, however many places it was typed to
  assert.deepEqual([52.1667, 52.16667, 52.166667, 313 / 6].map(weeksYear => basic({ salary: 52000, weeksYear })), [3987.24, 3987.24, 3987.24, 3987.24]);
  assert.equal(basic({ salary: 52000, weeksYear: 52 }), 4000, 'any other figure is used as typed');
  assert.equal(C.weeksOf({ weeksYear: 52.18 }), 52.18);
});

test('a Sunday premium that is a share of the hourly rate rises and is back-paid with the pay', () => {
  const hours = { '2026-08-28': { ot: 10, sun: 8 }, '2026-09-25': { ot: 0, sun: 12 } };
  const rise = [{ from: '2026-08-23', salary: 44000, arrearsOn: '2026-10-23', otBackpay: true }];     // from the first day of a pay period
  const p = C.payCalc(pay({ salary: 40000, sundayPct: 12, hours, rises: rise }), '2026-10-03');
  const row = d => p.allRows.find(r => r.payday === d);
  // £21.91 an hour makes the premium £2.63; £24.10 makes it £2.89
  assert.deepEqual([row('2026-08-28').hourly, row('2026-08-28').sunRate, row('2026-08-28').sunPay], [21.91, 2.63, 21.04]);
  assert.deepEqual([row('2026-10-23').hourly, row('2026-10-23').sunRate], [24.1, 2.89]);
  assert.equal(p.sunRate, 2.89, 'and the settings can say what an hour of Sunday is worth now');
  const r = p.rises[0];
  assert.deepEqual([r.sunWas, r.sunNow], [2.63, 2.89]);
  assert.deepEqual([r.periods, r.basic, r.ot, r.sun], [1, 306.72, 0, 3.12], 'one pay day at the old rate since: 12 Sunday hours at 26p');
  assert.equal(row('2026-10-23').backpay, 309.84);
  assert.equal(row('2026-10-23').backpayOt, 3.12, 'pay for hours worked, so it counts towards holiday pay');
  // a flat figure an hour stays flat: nothing to back-pay on Sundays
  const flat = C.payCalc(pay({ salary: 40000, sundayRate: 2.63, hours, rises: rise }), '2026-10-03');
  assert.deepEqual([flat.rises[0].sun, flat.rises[0].sunNow, flat.allRows.find(x => x.payday === '2026-10-23').sunRate], [0, 2.63, 2.63]);
  // and Sunday hours paid at plain time are back-paid at the difference in the hourly rate, as before
  const atT = C.payCalc(pay({ salary: 40000, sundayAtT: true, hours, rises: rise }), '2026-10-03');
  assert.deepEqual([atT.rises[0].ot, atT.rises[0].sun], [0, 26.28]);
});

test('each fixed line is its own penny amount, the way a payslip prints it', () => {
  // a deduction that changes nine days into a period: £32.15 at the old figure and £74.66 at the new, so £106.81
  const fixed = [{ name: 'Pension', amount: 100.01, treatment: 'Sacrifice', to: '2026-08-31' }, { name: 'Pension', amount: 110.02, treatment: 'Sacrifice', from: '2026-09-01' }];
  const r = C.payCalc(pay({ fixed }), '2026-09-09').rows.find(x => x.payday === '2026-09-25');
  assert.deepEqual([r.start, r.end], ['2026-08-23', '2026-09-19']);
  assert.equal(r.sacr, 106.81);
  assert.equal(C.r2(100.01 * 9 / 28 + 110.02 * 19 / 28), 106.8, 'not the fractions added up and rounded once');
});

test('the year to date off a payslip is where the next pay day\'s tax starts from', () => {
  const on = ytd => C.payCalc(pay({ ytd }), '2026-09-09').allRows;
  const own = on({}), row = (rows, d) => rows.find(r => r.payday === d);
  assert.deepEqual([row(own, '2026-09-25').paye, row(own, '2026-09-25').ytdFrom], [438.4, null], 'this app\'s own running total');
  // the August payslip says £20,000 taxable and £2,700 tax so far: week 28 is then £23,159.12 less £6,773.76, £16,385 at 20%
  const rows = on({ '2026-08-28': { taxable: 20000, paye: 2700 } });
  assert.deepEqual([row(rows, '2026-09-25').paye, row(rows, '2026-09-25').ytdFrom], [577, '2026-08-28']);
  assert.equal(row(rows, '2026-08-28').paye, row(own, '2026-08-28').paye, 'the pay day it was typed against stays as worked');
  assert.equal(row(rows, '2026-10-23').ytdFrom, '2026-08-28', 'and every pay day after it carries on from there');
  assert.equal(row(rows, '2026-10-23').paye, row(own, '2026-10-23').paye, 'a later pay day in the same band costs what it always did');
  assert.equal(row(rows, '2027-04-09').ytdFrom, null, 'until the tax year turns and the running total starts again');
  // half a pair is not a year to date
  assert.equal(row(on({ '2026-08-28': { taxable: 20000, paye: null } }), '2026-09-25').paye, 438.4);
  assert.equal(row(on({ '2026-08-28': { taxable: '', paye: 2700 } }), '2026-09-25').paye, 438.4);
});

/* ----------------------------------------- a payment that left early -- */
const early = (gone, extra) => Object.assign(bills(
  { id: 'gym', name: 'Gym', category: 'Other', amount: 30, dueDay: 23, started: '2024-01', gone },
  { id: 'rent', name: 'Rent', category: 'Housing', amount: 700, dueDay: 25, started: '2024-01' }), extra);

test('a payment ticked as gone already sits on the day it had left by', () => {
  const m = early({ '2026-09': '2026-09-21' });
  const ev = C.billEvents(m, '2026-08-01', '2026-10-31', EXACT).filter(e => e.name === 'Gym');
  assert.deepEqual(ev.map(e => e.date), ['2026-08-23', '2026-09-21', '2026-10-23'], 'that month only: the ones either side are where they were');
  assert.deepEqual([ev[1].early, ev[1].due, ev[1].id, ev[1].mk], [true, '2026-09-23', 'gym', '2026-09']);
  assert.deepEqual([ev[0].early, ev[0].due, ev[0].mk], [false, '2026-08-23', '2026-08']);
  // the day it was expected is the working day the setting moves it to
  assert.equal(C.billEvents(early({ '2026-08': '2026-08-20' }), '2026-08-01', '2026-08-31', OPT).find(e => e.name === 'Gym').due, '2026-08-24', '23 Aug 2026 is a Sunday');
  assert.equal(C.billEvents(early({ '2026-09': 'soon' }), '2026-09-01', '2026-09-30', EXACT)[0].date, '2026-09-23', 'a date that is not one is no tick');
});

test('a bill that has gone already is not taken off the balance a second time', () => {
  const p = C.payCalc(pay(), '2026-09-21');                       // pay day 25 Sep
  const plain = C.runway(early(undefined, { balance: 1000, balanceOn: '2026-09-21' }), p, EXACT, '2026-09-21');
  assert.deepEqual([plain.events.map(e => e.name), plain.outgoings, plain.safe, plain.gone.length], [['Gym'], 30, 970, 0]);
  // ticked on the day the balance was read: out of what is still to leave, and that much more is free
  const ticked = C.runway(early({ '2026-09': '2026-09-21' }, { balance: 1000, balanceOn: '2026-09-21' }), p, EXACT, '2026-09-21');
  assert.deepEqual([ticked.events.length, ticked.outgoings, ticked.start, ticked.safe], [0, 0, 1000, 1000]);
  assert.deepEqual(ticked.gone.map(e => [e.name, e.amount, e.due, e.id, e.mk]), [['Gym', 30, '2026-09-23', 'gym', '2026-09']], 'still on show, so the tick can come back off');
  // a balance read two days ago that already had it: nothing is carried off it
  const old = C.runway(early({ '2026-09': '2026-09-19' }, { balance: 1000, balanceOn: '2026-09-19' }), p, EXACT, '2026-09-21');
  assert.deepEqual([old.start, old.carriedOut, old.safe], [1000, 0, 1000]);
  // but one that left after that reading does come off the estimate, once
  const since = C.runway(early({ '2026-09': '2026-09-20' }, { balance: 1000, balanceOn: '2026-09-19' }), p, EXACT, '2026-09-21');
  assert.deepEqual([since.start, since.carriedOut, since.events.length, since.safe], [970, 30, 0, 970]);
  // a bill due on pay day itself comes out of the pay; gone early, it does not
  const onPay = C.runway(early(undefined, { balance: 1000, balanceOn: '2026-09-21' }), p, EXACT, '2026-09-21');
  const rentGone = early(undefined, { balance: 1000, balanceOn: '2026-09-21' }); rentGone.bills[1].gone = { '2026-09': '2026-09-21' };
  const r = C.runway(rentGone, p, EXACT, '2026-09-21');
  assert.deepEqual([onPay.onPayOut, r.onPayOut, C.r2(r.afterPay - onPay.afterPay)], [700, 0, 700]);
  assert.deepEqual(r.gone.map(e => e.name), ['Rent']);
  // once the day it was expected has been, there is nothing left to show
  assert.equal(C.runway(early({ '2026-09': '2026-09-21' }, { balance: 1000, balanceOn: '2026-09-21' }), C.payCalc(pay(), '2026-09-24'), EXACT, '2026-09-24').gone.length, 0);
});

test('a payment that left early is still counted once, where it left', () => {
  const p = C.payCalc(pay(), '2026-09-27');
  const m = early({ '2026-09': '2026-09-21' }, { balanceLog: [{ on: '2026-09-15', balance: 1000, adj: 0 }, { on: '2026-09-21', balance: 950, adj: 0 }, { on: '2026-09-24', balance: 940, adj: 0 }] });
  const sp = C.spendLog(m, p, EXACT, '2026-09-27');
  // the £30 is in the stretch it really left in, so that one's spending is £20 and the next is not short of a bill
  assert.deepEqual(sp.windows.map(w => [w.from, w.bills, w.spent]), [['2026-09-15', 30, 20], ['2026-09-21', 0, 10]]);
  const flat = C.spendLog(early(undefined, { balanceLog: m.balanceLog }), p, EXACT, '2026-09-27');
  assert.deepEqual(flat.windows.map(w => [w.bills, w.spent]), [[0, 50], [30, -20]], 'where without the tick it reads as a spree and then a windfall');
  // and across a year every payment is there exactly once
  assert.equal(C.billEvents(m, '2026-01-01', '2026-12-31', EXACT).filter(e => e.name === 'Gym').length, 12);
});
